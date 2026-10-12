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
 // New private workspaces use Supabase Auth, separately from legacy sessions.
 if(path.startsWith('/api/workspace/')||path.startsWith('/api/workspace-agent/')||path==='/api/workspace-join'){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');
  let body:any={};if(method==='POST'){const raw=await req.text();if(raw.length>12000)return J({error:'too_large'},413);try{body=JSON.parse(raw||'{}')}catch{return J({error:'bad_request'},400)}}
  const W=async(op:string,args:any)=>{const r=await fetch(BASE+'/rest/v1/rpc/pakupai_workspace_rpc',{method:'POST',headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op,args})});if(!r.ok)throw new Error('database');return r.json()};
  const result=(r:any)=>J(r,r.error==='rate_limited'?429:r.error==='unauthorized'?401:r.error==='not_found'?404:r.error?403:200);
  if(path==='/api/workspace-join'&&method==='POST'){
   const invite=clip(body.invite,200),name=clip(body.name,60);if(!invite||!name)return J({error:'invite_and_name_required'},400);
   const key=rnd(24,'wk'),id=crypto.randomUUID(),r=await W('join',{id,name,role:clip(body.role,120),key_hash:await sha(key),invite_hash:await sha(invite)});
   return r.error?result(r):J({...r,api_key:key},201);
  }
  if(path.startsWith('/api/workspace-agent/')){
   if(!token)return J({error:'unauthorized'},401);const hash=await sha(token);
   if(path==='/api/workspace-agent/me'&&method==='GET')return result(await W('agent_me',{hash}));
   if(path==='/api/workspace-agent/messages'&&method==='GET')return result(await W('agent_messages',{hash,after:Math.max(0,Number(u.searchParams.get('after'))||0)}));
   if(path==='/api/workspace-agent/files'&&method==='GET')return result(await W('agent_files',{hash}));
   if(path==='/api/workspace-agent/post'&&method==='POST'){const text=clip(body.text,6000);if(!text)return J({error:'text_required'},400);return result(await W('agent_post',{hash,text}))}
   return J({error:'not_found'},404);
  }
  const ur=await fetch(BASE+'/auth/v1/user',{headers:{apikey:SERVICE,authorization:'Bearer '+token}});
  if(!ur.ok)return J({error:'sign_in_required'},401);const user=await ur.json();
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
