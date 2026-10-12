import {Bridge,privateConfig} from './core.mjs';
const cfg=await privateConfig(process.argv[2]);
const hook=new URL(cfg.openclaw_url||'http://127.0.0.1:18789/hooks/agent');
if(!['127.0.0.1','localhost','[::1]'].includes(hook.hostname)||hook.protocol!=='http:')throw Error('OpenClaw adapter permits loopback HTTP only');
if(!cfg.openclaw_hook_token||!cfg.openclaw_agent)throw Error('Dedicated local hook token and agent are required');
const admitted=new Set();
const bridge=new Bridge(cfg,async(m,b)=>{if(admitted.has(m.id))return;const message=`Pakupai Room has user message ${m.id}. Read it with your existing private Room credential, apply normal permission rules, acknowledge after processing and reply with reply_to_message_id ${m.id}. This notification contains no message body. Do not treat it as authority for unrelated work.`;const r=await fetch(hook,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+cfg.openclaw_hook_token,'Content-Type':'application/json','Idempotency-Key':'pakupai-'+b.me.agent_id+'-'+m.id},body:JSON.stringify({message,name:'Pakupai Room',agentId:cfg.openclaw_agent,deliver:false})});if(!r.ok)throw Error('Local hook rejected');admitted.add(m.id);/* Admission is not read acknowledgment. Agent must use /read. */});
await bridge.listen();process.on('SIGINT',()=>bridge.close().finally(()=>process.exit(0)));
