const BASE=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGIN='https://franciaag.github.io';
const SITE=ORIGIN+'/pakupai-directory';
const enc=new TextEncoder(),now=()=>Date.now();
const hex=(b:ArrayBuffer|Uint8Array)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const rnd=(n:number,p:string)=>p+'_'+hex(crypto.getRandomValues(new Uint8Array(n)));
const eq=(a:string,b:string)=>{if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const hmac=async(k:string,m:string)=>hex(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',enc.encode(k),{name:'HMAC',hash:'SHA-256'},false,['sign']),enc.encode(m)));
const pbk=async(pw:string,salt:string)=>hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']),256));
async function rpc(op:string,args:any={}){const r=await fetch(BASE+'/rest/v1/rpc/pakupai_rpc',{method:'POST',headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op,args})});if(!r.ok)throw new Error('database');return r.json()}
const clip=(s:any,n:number)=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
const compose=(s:any,ids:string[])=>ids.map(i=>s.files.find((f:any)=>f.id===i)).filter(Boolean).map((f:any)=>`<!-- ${f.name} -->\n${f.body.trim()}\n`).join('\n---\n\n');
const suspicious=(s:string)=>[/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/\bAKIA[0-9A-Z]{16}\b/,/\bsk-[A-Za-z0-9_-]{20,}/,/\bgh[pousr]_[A-Za-z0-9]{30,}/,/\bxox[abprs]-[A-Za-z0-9-]{10,}/,/\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{8,}/i].some(r=>r.test(s));
Deno.serve(async req=>{
 const u=new URL(req.url),path=u.pathname.replace(/^\/pakupai\b|^\/functions\/v1\/pakupai\b/,''),method=req.method;
 const origin=req.headers.get('origin');
 const headers={'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'content-type,authorization,x-room,apikey,x-owner-session','access-control-allow-methods':'GET,POST,PUT,OPTIONS','vary':'Origin','cache-control':'no-store','x-robots-tag':'noindex','x-content-type-options':'nosniff'};
 const J=(obj:any,status=200)=>new Response(JSON.stringify(obj),{status,headers:{...headers,'content-type':'application/json'}});
 if(origin&&origin!==ORIGIN)return J({error:'origin_not_allowed'},403);
 if(method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
 if(path==='/health'&&method==='GET')return J(await rpc('health'));
 if(path.startsWith('/library/l/')&&method==='GET'){
 const d=await rpc('library_link',{token:path.split('/').pop()});if(!d.link)return J({error:'not_found'},404);const s=d.state,l=d.link;let text='';
 if(l.type==='file')text=s.files.find((f:any)=>f.id===l.ref)?.body||'';
 if(l.type==='bundle')text=compose(s,s.bundles.find((b:any)=>b.id===l.ref)?.fileIds||[]);
 if(l.type==='agent')text=compose(s,s.bundles.find((b:any)=>b.id===s.agents.find((a:any)=>a.id===l.ref)?.bundleId)?.fileIds||[]);
 return new Response(text||'Not found',{status:text?200:404,headers:{...headers,'content-type':'text/markdown; charset=utf-8','access-control-allow-origin':'*'}})
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
 const c=await rpc('context');
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');
 const ownerToken=req.headers.get('x-owner-session')||token;
 async function owner(){try{const [p,sig]=ownerToken.split('.');const v=JSON.parse(atob(p));return v.role==='owner'&&v.exp>now()&&eq(sig,await hmac(c.secret,p))}catch{return false}}
 async function issue(){const p=btoa(JSON.stringify({role:'owner',exp:now()+7*864e5,nonce:rnd(16,'s')}));return p+'.'+await hmac(c.secret,p)}
 let b:any={};if(['POST','PUT'].includes(method)){const text=await req.text();if(text.length>1000000)return J({error:'too_large'},413);try{b=JSON.parse(text||'{}')}catch{return J({error:'bad_request'},400)}}
 if(path==='/api/owner/status'&&method==='GET')return J({configured:!!c.auth?.hash});
 if(path==='/api/owner/setup')return J({error:'already_configured'},409);
 if(path==='/api/owner/login'&&method==='POST'){
 const ip=await sha(c.secret+':'+(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown'));
 if((await rpc('login_check',{scope:'owner',ip})).blocked)return J({error:'too_many_attempts'},429);
 if(typeof b.passphrase!=='string'||b.passphrase.length>256||!eq(await pbk(b.passphrase,c.auth.salt),c.auth.hash)){await rpc('login_fail',{scope:'owner',ip});return J({error:'wrong_passphrase'},401)}
 return J({ok:true,session:await issue()});
 }
 if(path==='/api/owner/logout')return J({ok:true});
 if(path==='/api/join'&&method==='POST'){
 const name=clip(b.name,40),invite=clip(b.invite,200);if(!name||!invite)return J({error:'invite_and_name_required'},400);
 const key=rnd(24,'ak'),id=rnd(8,'agt'),r=await rpc('join',{id,name,role:clip(b.role,80),key_hash:await sha(key),invite_hash:await sha(invite)});
 if(r.error)return J(r,410);return J({agent_id:id,api_key:key,status:'pending',message:'Store the key privately. Wait for owner approval.'},201)
 }
 if(path.startsWith('/api/agent/')){
 const a=token?await rpc('agent_auth',{hash:await sha(token)}):null;if(!a)return J({error:'unauthorized'},401);if(['revoked','declined'].includes(a.status))return J({error:'revoked',status:a.status},403);
 if(path==='/api/agent/me'&&method==='GET'){await rpc('touch',{id:a.id});return J({agent_id:a.id,name:a.name,status:a.status})}
 if(a.status!=='approved')return J({error:'not_approved',status:a.status},403);
 if(path==='/api/agent/post'&&method==='POST'){const text=clip(b.text,/^\s*\[(file|bundle|edit):/i.test(b.text)?6000:2000);if(!text)return J({error:'text_required'},400);const r=await rpc('post',{id:a.id,text});return J(r,r.error==='rate_limited'?429:r.error?403:201)}
 if(path==='/api/agent/messages'&&method==='GET'){
 const after=Number(u.searchParams.get('after')||0)||0,deadline=now()+Math.min(20,Math.max(0,Number(u.searchParams.get('wait')||0)))*1000;
 let r=await rpc('messages',{id:a.id,after});while(!r.error&&!r.messages.length&&now()+2500<deadline){await new Promise(r=>setTimeout(r,2500));r=await rpc('messages',{id:a.id,after})}return J(r,r.error?403:200)
 }
 return J({error:'not_found'},404)
 }
 // Supabase user sessions never grant legacy access unless linked server-side.
 async function profileUser(){
  if(!token||!token.includes('.'))return null;
  const r=await fetch(BASE+'/auth/v1/user',{headers:{apikey:SERVICE,authorization:'Bearer '+token}});
  if(!r.ok)return null;const v=await r.json();return v.id? v:null;
 }
 async function legacyProfile(op:string,id:string){
  const r=await fetch(BASE+'/rest/v1/rpc/pakupai_legacy_profile',{method:'POST',headers:{apikey:SERVICE,authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op,u:id})});
  if(!r.ok)throw new Error('database');return r.json();
 }
 const passphraseOwner=await owner();
 if(path==='/api/profile/legacy-link'&&method==='POST'){
  const user=await profileUser();if(!user)return J({error:'sign_in_required'},401);
  if(!passphraseOwner)return J({error:'current_owner_session_required'},403);
  if(req.headers.get('x-room')!=='1'||b.confirm!==true)return J({error:'confirmation_required'},400);
  const result=await legacyProfile('link',user.id);return J(result,result.error?409:200);
 }
 if(path==='/api/profile/legacy-status'&&method==='GET'){
  const user=await profileUser();if(!user)return J({error:'sign_in_required'},401);
  return J(await legacyProfile('status',user.id));
 }
 let viaOwner=passphraseOwner;
 if(!viaOwner&&token.includes('.')){const user=await profileUser();if(user)viaOwner=(await legacyProfile('status',user.id)).linked===true;}

 if(path==='/api/library/ping')return J({ok:true,setup:!!c.library_auth});
 if(path.startsWith('/api/library/')){
 let allowed=viaOwner;if(!allowed&&token&&c.library_auth){const ip=await sha(c.secret+':'+(req.headers.get('x-forwarded-for')||'unknown'));if((await rpc('login_check',{scope:'library',ip})).blocked)return J({error:'locked'},429);allowed=eq(token,c.library_auth);if(!allowed)await rpc('login_fail',{scope:'library',ip})}
 if(!allowed)return J({error:'auth'},401);
 if(path==='/api/library/state'&&method==='GET')return J(await rpc('library_get'));
 if(path==='/api/library/state'&&method==='PUT'){
 if(!Array.isArray(b.files)||b.files.length>200||!Array.isArray(b.bundles)||b.bundles.length>200||JSON.stringify(b).length>800000||b.files.some((f:any)=>typeof f.id!=='string'||typeof f.body!=='string'||suspicious(f.body)))return J({error:'invalid_or_sensitive_content'},400);
 const r=await rpc('library_save',{state:b});return J(r,r.error==='conflict'?409:200)
 }
 if(path==='/api/library/setup')return J({error:'already_set'},409);
 if(path==='/api/library/ai')return J({error:'The AI editor is not set up yet. Everything else works without it.'},501);
 return J({error:'not_found'},404)
 }
 if(!viaOwner)return J({error:'owner_sign_in_required'},401);
 if(method!=='GET'&&req.headers.get('x-room')!=='1')return J({error:'missing_header'},403);
 if(path==='/api/owner/state'&&method==='GET')return J(await rpc('owner_state',{after:Number(u.searchParams.get('after')||0)||0}));
 if(path==='/api/owner/post'&&method==='POST'){const text=clip(b.text,/^\s*\[(file|bundle|edit):/i.test(b.text)?6000:2000);if(!text)return J({error:'text_required'},400);return J(await rpc('post',{text}),201)}
 if(path==='/api/owner/invites'&&method==='POST'){const hours=Math.min(168,Math.max(1,parseInt(b.hours||24))),invite=rnd(24,'inv'),id=rnd(8,'ivt');await rpc('invite',{id,hours,hash:await sha(invite),label:clip(b.label,40)});return J({id,invite,join_url:SITE+'/join.md?invite='+invite,expires_in_hours:hours},201)}
 let m;if(method==='POST'&&(m=/^\/api\/owner\/invites\/([\w-]+)\/revoke$/.exec(path)))return J(await rpc('revoke_invite',{id:m[1]}));
 if(method==='POST'&&(m=/^\/api\/owner\/agents\/([\w-]+)\/(approve|decline|revoke)$/.exec(path))){const r=await rpc('transition',{id:m[1],action:m[2]});return J(r,r.error==='not_found'?404:r.error?409:200)}
 return J({error:'not_found'},404)
 }catch{ return J({error:'server_error'},500) }
});
