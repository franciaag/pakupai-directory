const BASE=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGIN='https://franciaag.github.io';
const SITE=ORIGIN+'/pakupai-directory';
const enc=new TextEncoder();
const hex=(b:ArrayBuffer|Uint8Array)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const rnd=(n:number,p:string)=>p+'_'+hex(crypto.getRandomValues(new Uint8Array(n)));
const clip=(s:any,n:number)=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
Deno.serve(async req=>{
 const u=new URL(req.url),path=u.pathname.replace(/^\/pakupai\b|^\/functions\/v1\/pakupai\b/,''),method=req.method;
 const origin=req.headers.get('origin');
 const headers={'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'content-type,authorization,apikey','access-control-allow-methods':'GET,POST,OPTIONS','vary':'Origin','cache-control':'no-store','x-robots-tag':'noindex','x-content-type-options':'nosniff'};
 const J=(obj:any,status=200)=>new Response(JSON.stringify(obj),{status,headers:{...headers,'content-type':'application/json'}});
 if(origin&&origin!==ORIGIN)return J({error:'origin_not_allowed'},403);
 if(method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
 if(path==='/health'&&method==='GET'){
  const r=await fetch(BASE+'/rest/v1/pakupai_profiles?select=user_id&limit=1',{headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE}});
  return J({ok:r.ok},r.ok?200:503);
 }
 if(path==='/api/account/methods'||path==='/api/account/add-username'){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');
  const H=async(p:string,method:string,b?:any)=>{const r=await fetch(BASE+'/auth/v1/'+p,{method,headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:b?JSON.stringify(b):undefined});let d:any={};try{d=await r.json()}catch{}return {ok:r.ok,d}};
  const R=async(name:string,op:string,args:any)=>{const r=await fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op,args})});if(!r.ok)throw Error('database');return r.json()};
  const ur=await fetch(BASE+'/auth/v1/user',{headers:{apikey:SERVICE,authorization:'Bearer '+token}});if(!ur.ok)return J({error:'sign_in_required'},401);const user=await ur.json();
  const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(!(await R('pakupai_manual_rpc','session_valid',{user_id:user.id,session_id:claims.session_id})).ok)return J({error:'sign_in_required'},401);
  if(path==='/api/account/methods'&&method==='GET')return J(await R('pakupai_methods_rpc','methods',{user_id:user.id}));
  if(path!=='/api/account/add-username'||method!=='POST')return J({error:'not_found'},404);
  const raw=await req.text();if(raw.length>4096)return J({error:'request_failed'},400);let b:any;try{b=JSON.parse(raw)}catch{return J({error:'request_failed'},400)}
  const username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
  if(!/^[a-z0-9_]{3,30}$/.test(username)||!(password.length>=12&&password.length<=128&&/[a-z]/.test(password)&&/[A-Z]/.test(password)&&/[0-9]/.test(password)&&/[^A-Za-z0-9]/.test(password)))return J({error:'password_rules'},400);
  if(!(await R('pakupai_manual_rpc','limit',{bucket:'add:'+user.id,limit:5,seconds:3600})).allowed)return J({error:'try_later'},429);
  const lease=rnd(24,'lease'),code=rnd(32,'recovery');
  if(!(await R('pakupai_methods_rpc','reserve_add',{username,user_id:user.id,email:user.email,lease})).ok)return J({error:'method_or_username_unavailable'},409);
  const updated=await H('admin/users/'+user.id,'PUT',{password});if(!updated.ok){await R('pakupai_methods_rpc','cancel_add',{user_id:user.id,lease});return J({error:'request_failed'},400)}
  if(!(await R('pakupai_methods_rpc','finish_add',{user_id:user.id,lease,hash:await sha(code)})).ok)return J({error:'request_failed'},500);
  const signed=await H('token?grant_type=password','POST',{email:user.email,password});
  return J({ok:true,recovery_code:code,...(signed.ok?{access_token:signed.d.access_token,refresh_token:signed.d.refresh_token}:{})},201);
 }
 if(path.startsWith('/api/manual/')){
  if(method!=='POST')return J({error:'not_found'},404);
  const raw=await req.text();if(raw.length>4096)return J({error:'request_failed'},400);
  let b:any;try{b=JSON.parse(raw)}catch{return J({error:'request_failed'},400)}
  const username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
  if(!/^[a-z0-9_]{3,30}$/.test(username))return J({error:'request_failed'},400);
  const M=async(op:string,args:any)=>{const r=await fetch(BASE+'/rest/v1/rpc/pakupai_manual_rpc',{method:'POST',headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op,args})});if(!r.ok)throw Error('database');return r.json()};
  const H=async(p:string,method:string,b?:any)=>{const r=await fetch(BASE+'/auth/v1/'+p,{method,headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:b?JSON.stringify(b):undefined});let d:any={};try{d=await r.json()}catch{}return {ok:r.ok,d}};
  const action=path.split('/').pop();if(!['signup','login','reset'].includes(action||''))return J({error:'not_found'},404);
  const ip=await sha('manual-ip:'+String(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim());
  const limit=async(bucket:string,n:number,s:number)=>(await M('limit',{bucket,limit:n,seconds:s})).allowed;
  if(!await limit(action+':ip:'+ip,action==='signup'?5:12,action==='signup'?3600:300)||!await limit(action+':username:'+await sha(username),action==='signup'?3:8,900))return J({error:'try_later'},429);
  const strong=password.length>=12&&password.length<=128&&/[a-z]/.test(password)&&/[A-Z]/.test(password)&&/[0-9]/.test(password)&&/[^A-Za-z0-9]/.test(password);
  if(action!=='login'&&!strong)return J({error:'password_rules'},400);
  if(action==='signup'){
   const lease=rnd(24,'lease'),email=rnd(24,'manual')+'@manual.pakupai.invalid',code=rnd(32,'recovery');
   const reserved=await M('reserve',{username,email,lease});if(!reserved.ok)return J({error:'request_failed'},400);
   let id='';try{
    const created=await H('admin/users','POST',{email,password,email_confirm:true,app_metadata:{pakupai_account_type:'manual'}});if(!created.ok)throw Error('create');id=created.d.id;
    const saved=await M('finish_signup',{username,id,lease,hash:await sha(code)});if(!saved.ok)throw Error('save');
    return J({ok:true,recovery_code:code},201);
   }catch{if(id)await H('admin/users/'+id,'DELETE');await M('cancel_signup',{username,lease});return J({error:'request_failed'},400)}
  }
  if(action==='login'){
   const a=await M('lookup',{username});const current=a.id?await H('admin/users/'+a.id,'GET'):null;const email=current?.ok?current.d.email:rnd(24,'absent')+'@manual.pakupai.invalid';
   const r=await H('token?grant_type=password','POST',{email,password});if(!r.ok||!a.id||r.d.user?.id!==a.id)return J({error:'request_failed'},400);
   // Recovery may have started while the Auth password request was running.
   const again=await M('lookup',{username});if(again.id!==a.id)return J({error:'request_failed'},400);
   return J({access_token:r.d.access_token,refresh_token:r.d.refresh_token});
  }
  const code=String(b.code||''),lease=rnd(24,'lease'),next=rnd(32,'recovery');if(code.length>160)return J({error:'request_failed'},400);
  const a=await M('begin_reset',{username,hash:await sha(code),lease});if(!a.id)return J({error:'request_failed'},400);
  const r=await H('admin/users/'+a.id,'PUT',{password});if(!r.ok){await M('abort_reset',{username,lease});return J({error:'request_failed'},400)}
  const finished=await M('finish_reset',{username,lease,hash:await sha(next)});if(!finished.ok)return J({error:'request_failed'},500);
  return J({ok:true,recovery_code:next});
 }
 // New private workspaces use Supabase Auth, separately from legacy sessions.
 if(path.startsWith('/api/workspace/')||path.startsWith('/api/workspace-agent/')||path==='/api/workspace-join'){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');
  let body:any={};if(method==='POST'){const raw=await req.text();if(raw.length>12000)return J({error:'too_large'},413);try{body=JSON.parse(raw||'{}')}catch{return J({error:'bad_request'},400)}}
  const W=async(op:string,args:any)=>{const r=await fetch(BASE+'/rest/v1/rpc/pakupai_workspace_rpc',{method:'POST',headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op,args})});if(!r.ok)throw new Error('database');return r.json()};
  const result=(r:any)=>{if(r.error==='rate_limited')return new Response(JSON.stringify(r),{status:429,headers:{...headers,'content-type':'application/json','retry-after':String(r.retry_after_seconds||60)}});return J(r,r.error==='unauthorized'?401:r.error==='not_found'?404:r.error?403:200)};
  if(path==='/api/workspace-join'&&method==='POST'){
   const invite=clip(body.invite,200),name=clip(body.name,60);if(!invite||!name)return J({error:'invite_and_name_required'},400);
   const key=rnd(24,'wk'),id=crypto.randomUUID(),r=await W('join',{id,name,role:clip(body.role,120),key_hash:await sha(key),invite_hash:await sha(invite)});
   return r.error?result(r):J({...r,api_key:key},201);
  }
  if(path.startsWith('/api/workspace-agent/')){
   if(!token)return J({error:'unauthorized'},401);const hash=await sha(token);
   if(path==='/api/workspace-agent/me'&&method==='GET')return result(await W('agent_me',{hash}));
   if(path==='/api/workspace-agent/check'&&method==='GET')return result(await W('agent_check',{hash,after:Math.max(0,Number(u.searchParams.get('after'))||0)}));
   if(path==='/api/workspace-agent/messages'&&method==='GET')return result(await W('agent_messages',{hash,after:Math.max(0,Number(u.searchParams.get('after'))||0)}));
   if(path==='/api/workspace-agent/read'&&method==='POST'){const ids=body.message_ids;if(!Array.isArray(ids)||ids.length>100||ids.some((id:any)=>!Number.isSafeInteger(id)||id<1))return J({error:'invalid_message_ids'},400);return result(await W('agent_read',{hash,message_ids:ids}))}
   if(path==='/api/workspace-agent/files'&&method==='GET')return result(await W('agent_files',{hash}));
   if(path==='/api/workspace-agent/post'&&method==='POST'){const text=clip(body.text,6000);if(!text)return J({error:'text_required'},400);const reply=body.reply_to_message_id;if(reply!==undefined&&(!Number.isSafeInteger(reply)||reply<1))return J({error:'invalid_reply_to'},400);return result(await W('agent_post',{hash,text,reply_to_message_id:reply}))}
   return J({error:'not_found'},404);
  }
  const ur=await fetch(BASE+'/auth/v1/user',{headers:{apikey:SERVICE,authorization:'Bearer '+token}});
  if(!ur.ok)return J({error:'sign_in_required'},401);const user=await ur.json();
  const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));const sr=await fetch(BASE+'/rest/v1/rpc/pakupai_manual_rpc',{method:'POST',headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op:'session_valid',args:{session_id:claims.session_id,user_id:user.id}})});if(!sr.ok||!(await sr.json()).ok)return J({error:'sign_in_required'},401);
  if(path==='/api/workspace/invites'&&method==='GET')return result(await W('invites',{user_id:user.id}));
  if(path==='/api/workspace/invites'&&method==='POST'){
   const invite=rnd(24,'wi'),id=crypto.randomUUID(),hours=Math.max(1,Math.min(168,Number(body.hours)||24));
   const r=await W('invite',{user_id:user.id,id,hours,hash:await sha(invite),label:clip(body.label,60)});
   return r.error?result(r):J({...r,invite,join_url:SITE+'/account/#join='+encodeURIComponent(invite)},201);
  }
  let match;
  if(method==='POST'&&(match=/^\/api\/workspace\/invites\/([a-f0-9-]{36})\/revoke$/.exec(path)))return result(await W('revoke_invite',{user_id:user.id,id:match[1]}));
  if(method==='POST'&&(match=/^\/api\/workspace\/agents\/([a-f0-9-]{36})\/(approve|decline|revoke)$/.exec(path)))return result(await W('transition',{user_id:user.id,id:match[1],action:match[2]}));
  return J({error:'not_found'},404);
 }
 return J({error:'legacy_workspace_retired',message:'Sign in to your profile to use your new Room and Library.'},410);
 }catch{return J({error:'server_error'},500)}
});
