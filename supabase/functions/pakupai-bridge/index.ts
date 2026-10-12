const BASE=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const enc=new TextEncoder(),sha=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 const headers={'content-type':'application/json','cache-control':'no-store','x-robots-tag':'noindex','access-control-allow-origin':'https://franciaag.github.io','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
 const J=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const origin=req.headers.get('origin');if(origin&&origin!=='https://franciaag.github.io')return J({error:'origin_not_allowed'},403);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');if(!token)return J({error:'unauthorized'},401);
 const hash=await sha(token),R=async(name:string,op:string,args:any)=>{const r=await fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:JSON.stringify({op,args})});if(!r.ok)throw Error('database');return await r.json()};
 const H=async(path:string,method:string,b?:any)=>{const r=await fetch(BASE+'/auth/v1/'+path,{method,headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'content-type':'application/json'},body:b?JSON.stringify(b):undefined});if(!r.ok)throw Error('auth');return await r.json()};
 try{
  const me=await R('pakupai_workspace_rpc','agent_me',{hash});if(me.error||me.status!=='approved')return J({error:me.error||'not_approved'},me.error==='unauthorized'?401:403);
  const path=new URL(req.url).pathname.split('/').pop();
  if(path==='signal'&&req.method==='POST'){const raw=await req.text();if(raw.length>200)return J({error:'invalid_signal'},400);const b=JSON.parse(raw);if(!/^[a-f0-9-]{36}$/.test(b.nonce||''))return J({error:'invalid_signal'},400);const r=await R('pakupai_bridge_rpc','signal',{hash,nonce:b.nonce});return J(r,r.error?403:200)}
  if(path!=='listen-token'||req.method!=='GET')return J({error:'not_found'},404);
  const limit=await R('pakupai_bridge_rpc','token_limit',{hash});if(limit.error)return J(limit,403);if(!limit.allowed)return new Response(JSON.stringify({error:'rate_limited',retry_after_seconds:600}),{status:429,headers:{...headers,'retry-after':'600'}});let identity=await R('pakupai_bridge_rpc','identity',{hash});if(identity.error)return J(identity,403);
  let uid=identity.auth_user_id;
  if(!uid){const candidate=await H('admin/users','POST',{email:'bridge-'+crypto.randomUUID()+'@bridge.pakupai.invalid',email_confirm:true,password:crypto.randomUUID()+crypto.randomUUID(),app_metadata:{pakupai_bridge_agent:me.agent_id}});const saved=await R('pakupai_bridge_rpc','register_identity',{hash,auth_user_id:candidate.id});if(saved.error||saved.auth_user_id!==candidate.id){await H('admin/users/'+candidate.id,'DELETE');if(saved.error)return J(saved,403)}uid=saved.auth_user_id;}
  const user=await H('admin/users/'+uid,'GET');if(user.app_metadata?.pakupai_bridge_agent!==me.agent_id)return J({error:'identity_invalid'},403);
  const link=await H('admin/generate_link','POST',{type:'magiclink',email:user.email});
  const session=await H('verify','POST',{type:'email',token_hash:link.hashed_token});
  const lease=await R('pakupai_bridge_rpc','lease',{hash,auth_user_id:uid});if(lease.error)return J(lease,403);
  // Only access JWT returned; never refresh token, email, password, link or raw Auth object.
  return J({access_token:session.access_token,topic:lease.topic,expires_at:new Date(session.expires_at*1000).toISOString(),agent_id:me.agent_id});
 }catch{return J({error:'bridge_unavailable'},503)}
});
