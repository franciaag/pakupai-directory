(()=>{
'use strict';
const $=(s,e=document)=>e.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
const IC={
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
 dl:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
 hist:'<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2"/>',
 link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
 back:'<path d="M15 5l-7 7 7 7"/>',
 spark:'<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
 home:'<path d="M4 11l8-7 8 7v9H4z"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 check:'<path d="M5 12l5 5 9-10"/>'
};
const ico=n=>`<svg viewBox="0 0 24 24">${IC[n]}</svg>`;
const ib=(n,t,a='')=>`<button class="ib" title="${t}" aria-label="${t}" ${a}>${ico(n)}</button>`;

/* ---------- defaults ---------- */
const DEFAULTS=[
['AGENTS.md','How agents should work with me','# Working rules\n\n## How to work\n- Ask before big changes.\n- Show a short plan first, then do the work.\n- Say what you are unsure about.\n\n## What done looks like\n- The thing works and I can check it.\n- You tell me what changed in plain words.\n\n## Do not\n- Do not delete things without asking.\n- Do not guess when you can check.\n'],
['SOUL.md','Tone and personality','# Tone\n\n## Voice\n- Plain and direct.\n- Short sentences.\n- No filler and no hype.\n\n## When you disagree\n- Tell me, politely, with a reason.\n\n## Length\n- Short by default. Longer only when I ask.\n'],
['USER.md','Who I am and what I like','# About me\n\n## Basics\n- Name to use: (write what you want agents to call you)\n- Time zone: \n- Language: \n\n## What I do\n- (one or two lines about your work)\n\n## Preferences\n- (formats, units, dates, anything you keep repeating)\n'],
['TOOLS.md','My tools and stack','# Tools\n\n## Tools I use\n- (apps, languages, services)\n\n## Where things live\n- (folders, repos, docs)\n\n## Rules for tools\n- Never paste passwords or keys into these files.\n'],
['IDENTITY.md','What to call the agent','# Identity\n\n## Name\n- (a name for your agent)\n\n## Role\n- (what it is here to do for you)\n\n## Signature\n- (how it signs off, if at all)\n'],
['MEMORY.md','Things to remember','# Memory\n\n## Standing facts\n- (things that stay true)\n\n## Decisions\n- (choices made, with the date)\n\n## Lessons\n- (mistakes not to repeat)\n']
];
const PRESETS=[
 {id:'claude',label:'Claude',file:'CLAUDE.md'},{id:'gemini',label:'Gemini',file:'GEMINI.md'},
 {id:'codex',label:'Codex / OpenAI',file:'AGENTS.md'},{id:'cursor',label:'Cursor',file:'.cursorrules'},
 {id:'copilot',label:'GitHub Copilot',file:'.github/copilot-instructions.md'},{id:'windsurf',label:'Windsurf',file:'.windsurfrules'},
 {id:'other',label:'Other',file:'AGENTS.md'}
];
function fresh(){
 const files=DEFAULTS.map(([name,desc,body])=>({id:uid(),name,desc,body,updated:Date.now()}));
 return {rev:0,files,versions:{},bundles:[{id:uid(),name:'Everything',fileIds:files.map(f=>f.id)}],agents:[],links:[]};
}

/* ---------- storage (swappable) ---------- */
const EMBED=/[?&]embed=1/.test(location.search);
let S=null,MODE='local',TOKEN='',SETUP=false;
const enc=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('agent-library:'+s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const Local={
 async load(){const r=localStorage.getItem('al-state');return r?JSON.parse(r):null},
 async save(st){localStorage.setItem('al-state',JSON.stringify(st))}
};
const api=async(path,opt={})=>{
 const r=await window.pakupaiFetch(path,{...opt,headers:{'content-type':'application/json',...(TOKEN?{authorization:'Bearer '+TOKEN}:{}),...(opt.headers||{})}});
 let j=null;try{j=await r.json()}catch{}
 return {ok:r.ok,status:r.status,j};
};
const Remote={
 async load(){const r=await api('/api/library/state');if(r.status===401)throw new Error('auth');return r.j&&r.j.state||null},
 async save(st){const r=await api('/api/library/state',{method:'PUT',body:JSON.stringify(st)});
  if(r.status===409)throw new Error('conflict');if(!r.ok)throw new Error('save');S.rev=r.j.rev}
};
const store=()=>MODE==='remote'?Remote:Local;
let saveT=null;
function persist(){clearTimeout(saveT);return new Promise(res=>{saveT=setTimeout(async()=>{
 try{await store().save(S);res(true)}catch(e){toast(e.message==='conflict'?'Changed on another device. Reload.':'Could not save');res(false)}},0)})}
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}

/* ---------- helpers ---------- */
const fileById=id=>S.files.find(f=>f.id===id);
const preset=id=>PRESETS.find(p=>p.id===id)||PRESETS[6];
function compose(fileIds){return fileIds.map(fileById).filter(Boolean).map(f=>`<!-- ${f.name} -->\n${f.body.trim()}\n`).join('\n---\n\n')}
const SECRET=[
 [/-----BEGIN [A-Z ]*PRIVATE KEY-----/,'a private key'],[/\bAKIA[0-9A-Z]{16}\b/,'an AWS key'],[/\bsk-[A-Za-z0-9_-]{20,}/,'an API key (sk-...)'],
 [/\bgh[pousr]_[A-Za-z0-9]{30,}/,'a GitHub token'],[/\bxox[abprs]-[A-Za-z0-9-]{10,}/,'a Slack token'],[/\bAIza[0-9A-Za-z_-]{30,}/,'a Google API key'],
 [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,'a login token (JWT)'],
 [/\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{8,}/i,'a password, key or token value'],
 [/\b[0-9a-f]{40,}\b/i,'a long secret-looking string']
];
function scan(text){const out=[];text.split('\n').forEach((l,i)=>{for(const[re,w]of SECRET)if(re.test(l)){out.push(`Line ${i+1}: looks like ${w}`);break}});return out}
function md(src){
 const lines=esc(src).replace(/&lt;!--[\s\S]*?--&gt;/g,'').split('\n');let h='',list=null,code=false;
 const inl=s=>s.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*]+)\*/g,'<i>$1</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
 const close=()=>{if(list){h+=`</${list}>`;list=null}};
 for(const l of lines){
  if(l.startsWith('```')){close();h+=code?'</code></pre>':'<pre><code>';code=!code;continue}
  if(code){h+=l+'\n';continue}
  let m;
  if(m=l.match(/^(#{1,3})\s+(.*)/)){close();h+=`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`}
  else if(m=l.match(/^\s*[-*]\s+(.*)/)){if(list!=='ul'){close();h+='<ul>';list='ul'}h+=`<li>${inl(m[1])}</li>`}
  else if(m=l.match(/^\s*\d+\.\s+(.*)/)){if(list!=='ol'){close();h+='<ol>';list='ol'}h+=`<li>${inl(m[1])}</li>`}
  else if(m=l.match(/^&gt;\s?(.*)/)){close();h+=`<blockquote>${inl(m[1])}</blockquote>`}
  else if(!l.trim()){close()}
  else{close();h+=`<p>${inl(l)}</p>`}
 }
 close();return h
}
function sections(body){ // split by "## "
 const parts=body.split(/\n(?=## )/);const head=parts[0].match(/^# .*/)?parts.shift():'';
 return {head:head.trim(),secs:parts.map(p=>{const i=p.indexOf('\n');return {title:p.slice(3,i<0?undefined:i).trim(),text:i<0?'':p.slice(i+1).trim()}})}
}
function join({head,secs}){return [head,...secs.map(s=>`## ${s.title}\n${s.text}`)].filter(Boolean).join('\n\n')+'\n'}
function diff(a,b){
 const A=a.split('\n'),B=b.split('\n'),n=A.length,m=B.length;
 const L=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=A[i]===B[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
 let i=0,j=0,o=[];while(i<n&&j<m){if(A[i]===B[j]){o.push(['s',A[i]]);i++;j++}else if(L[i+1][j]>=L[i][j+1])o.push(['r',A[i++]]);else o.push(['a',B[j++]])}
 while(i<n)o.push(['r',A[i++]]);while(j<m)o.push(['a',B[j++]]);return o
}
async function copy(t){try{await navigator.clipboard.writeText(t);toast('Copied')}catch{const x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();document.execCommand('copy');x.remove();toast('Copied')}}
function download(name,text,type='text/markdown'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name.split('/').pop();a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function snapshot(f){(S.versions[f.id]=S.versions[f.id]||[]).unshift({t:Date.now(),body:f.body});S.versions[f.id]=S.versions[f.id].slice(0,50)}
async function saveFile(f,body){
 const bad=scan(body);if(bad.length){return bad}
 if(body!==f.body){snapshot(f);f.body=body;f.updated=Date.now();await persist()}return null
}
const ago=t=>{const s=(Date.now()-t)/1000;if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+' min ago';if(s<86400)return Math.floor(s/3600)+' h ago';return new Date(t).toLocaleDateString()}
const origin=()=>location.origin;
const linkUrl=l=>`${window.PAKUPAI.base}/library/l/${l.token}`;
async function makeLink(type,ref){
 if(MODE!=='remote'){toast('Short links need cloud storage');return null}
 const ex=S.links.find(l=>l.type===type&&l.ref===ref);if(ex)return ex;
 const l={token:uid()+uid(),type,ref};S.links.push(l);await persist();return l
}

/* ---------- views ---------- */
const root=$('#lib');
function shell(inner,{back}={}){
 const h=location.hash||'#/';const on=k=>({files:/^#\/($|f|h|b|ai)/,agents:/^#\/(agents|a\/)/,prompt:/^#\/(new|reset)/,settings:/^#\/settings/}[k].test(h))?' active':'';
 root.innerHTML=`<div class="lib-head">${back?`<a class="back" href="${back}">&larr; Back</a>`:'<p class="overline">Library</p>'}
 <nav class="filters lib-tabs" aria-label="Library"><button data-go="#/" class="${on('files')}">Files</button><button data-go="#/agents" class="${on('agents')}">Agents</button><button data-go="#/new" class="${on('prompt')}">Prompts</button><button data-go="#/settings" class="${on('settings')}">Settings</button></nav></div><div class="lib-body">${inner}</div>`;
 root.querySelectorAll('[data-go]').forEach(e=>e.onclick=()=>{location.hash=e.dataset.go});
}
function home(){
 shell(`<h1>Your files</h1><p class="muted small" style="margin-top:-6px">Write how you work once. Copy or link it into any AI agent.</p>
 <div class="grid">${S.files.map(f=>`<div class="card" data-go="#/f/${f.id}"><div class="t"><span>${esc(f.name)}</span><span class="tag">${ago(f.updated)}</span></div><div class="d">${esc(f.desc||'')}</div></div>`).join('')}</div>
 <h2>Bundles</h2><div class="grid">${S.bundles.map(b=>`<div class="card" data-go="#/b/${b.id}"><div class="t"><span>${esc(b.name)}</span><span class="tag">${b.fileIds.length} files</span></div><div class="d">${b.fileIds.map(i=>fileById(i)?.name).filter(Boolean).join(', ')}</div></div>`).join('')}
 <div class="card" data-go="#/b/new"><div class="t"><span>New bundle</span>${ico('plus').replace('<svg','<svg width="16" height="16"')}</div><div class="d">Pick which files go together.</div></div></div>
 <h2>Agents</h2><div class="grid">${S.agents.map(a=>`<div class="card" data-go="#/a/${a.id}"><div class="t"><span>${esc(a.name)}</span><span class="tag">${esc(preset(a.preset).file)}</span></div><div class="d">${esc(S.bundles.find(b=>b.id===a.bundleId)?.name||'No bundle')}</div></div>`).join('')}
 <div class="card" data-go="#/a/new"><div class="t"><span>Add an agent</span></div><div class="d">Choose a bundle and a file name for it.</div></div></div>`);
 root.querySelectorAll('.card[data-go]').forEach(e=>e.onclick=()=>{location.hash=e.dataset.go});
}
function fileView(id,mode='view'){
 const f=fileById(id);if(!f)return home();
 const m=mode;
 const tabs=`<div class="tabs">${['view','raw','form'].map(x=>`<button data-m="${x}" class="${m===x?'on':''}">${{view:'Read',raw:'Raw',form:'Form'}[x]}</button>`).join('')}</div>`;
 let body='';
 if(m==='view')body=`<div class="md">${md(f.body)}</div>`;
 if(m==='raw')body=`<textarea class="raw" id="raw" spellcheck="false">${esc(f.body)}</textarea><div id="err"></div>`;
 if(m==='form'){const p=sections(f.body);body=`<div id="form">${p.head?`<div class="sec"><label>Title line</label><input type="text" id="head" value="${esc(p.head)}"></div>`:''}${p.secs.map((s,i)=>`<div class="sec"><label>${esc(s.title)}</label><textarea data-i="${i}">${esc(s.text)}</textarea></div>`).join('')}</div><div id="err"></div>`}
 shell(`<div class="row" style="margin-bottom:10px"><h1 style="margin:0">${esc(f.name)}</h1><span class="sp"></span>${tabs}</div>
 <div class="row" style="margin-bottom:10px">
  ${m!=='view'?'<button class="btn p" id="save">Save</button>':''}
  ${ib('copy','Copy','id="cp"')}${ib('dl','Download','id="dl"')}${ib('link','Short link','id="ln"')}${ib('hist','History','id="hs"')}${ib('spark','AI edit','id="ai"')}
  <span class="sp"></span><span class="muted small">${esc(f.desc||'')}</span></div>${body}`,{back:'#/'});
 root.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>fileView(id,b.dataset.m));
 $('#cp').onclick=()=>copy(f.body);$('#dl').onclick=()=>download(f.name,f.body);
 $('#hs').onclick=()=>location.hash='#/h/'+id;$('#ai').onclick=()=>location.hash='#/ai/'+id;
 $('#ln').onclick=async()=>{const l=await makeLink('file',id);if(l){copy(linkUrl(l))}};
 const sv=$('#save');if(sv)sv.onclick=async()=>{
  let nb;if(m==='raw')nb=$('#raw').value;else{const p=sections(f.body);if($('#head'))p.head=$('#head').value;root.querySelectorAll('#form textarea').forEach(t=>p.secs[+t.dataset.i].text=t.value.trim());nb=join(p)}
  const bad=await saveFile(f,nb);
  if(bad)$('#err').innerHTML=`<div class="msg bad"><b>Not saved.</b> This looks like it has a secret in it. Remove it and save again. These files should never hold passwords or keys.<br>${bad.map(esc).join('<br>')}</div>`;
  else{toast('Saved');fileView(id,'view')}};
}
function history(id){
 const f=fileById(id);if(!f)return home();const vs=S.versions[id]||[];
 shell(`<h1>History: ${esc(f.name)}</h1>${vs.length?`<div class="list">${vs.map((v,i)=>`<div class="item"><div><div>${new Date(v.t).toLocaleString()}</div><div class="muted small">${esc(v.body.split('\n').find(l=>l.trim())||'')}</div></div><span class="sp"></span><button class="btn" data-v="${i}">Restore</button></div>`).join('')}</div>`:'<p class="muted">No older versions yet. Each save keeps the one before it.</p>'}`,{back:'#/f/'+id});
 root.querySelectorAll('[data-v]').forEach(b=>b.onclick=async()=>{const v=vs[+b.dataset.v];snapshot(f);f.body=v.body;f.updated=Date.now();await persist();toast('Restored');location.hash='#/f/'+id});
}
function bundleView(id){
 const isNew=id==='new';const b=isNew?{id:uid(),name:'',fileIds:[]}:S.bundles.find(x=>x.id===id);if(!b)return home();
 shell(`<h1>${isNew?'New bundle':'Bundle'}</h1><div class="sec"><label>Name</label><input type="text" id="bn" value="${esc(b.name)}" placeholder="For example: Coding"></div>
 <h2>Files in it</h2>${S.files.map(f=>`<label class="chk"><input type="checkbox" value="${f.id}" ${b.fileIds.includes(f.id)?'checked':''}> ${esc(f.name)}</label>`).join('')}
 <div class="row" style="margin-top:12px"><button class="btn p" id="sv">Save</button>${isNew?'':`<button class="btn" id="cp">Copy all</button><button class="btn" id="dl">Download</button><button class="btn" id="ln">Short link</button><button class="btn" id="rm">Delete</button>`}</div>
 ${isNew?'':`<h2>Preview</h2><pre class="raw">${esc(compose(b.fileIds))}</pre>`}`,{back:'#/'});
 $('#sv').onclick=async()=>{const n=$('#bn').value.trim();if(!n)return toast('Add a name');b.name=n;b.fileIds=[...root.querySelectorAll('.chk input:checked')].map(i=>i.value);if(isNew)S.bundles.push(b);await persist();location.hash='#/'};
 if(!isNew){$('#cp').onclick=()=>copy(compose(b.fileIds));$('#dl').onclick=()=>download('bundle.md',compose(b.fileIds));
  $('#ln').onclick=async()=>{const l=await makeLink('bundle',b.id);if(l)copy(linkUrl(l))};
  $('#rm').onclick=async()=>{if(!confirm('Delete this bundle? Files stay.'))return;S.bundles=S.bundles.filter(x=>x!==b);S.agents.forEach(a=>{if(a.bundleId===b.id)a.bundleId=''});await persist();location.hash='#/'}}
}
function agentsView(){
 shell(`<h1>Agents</h1><p class="muted small" style="margin-top:-6px">Each agent gets a bundle, saved under the file name that agent reads.</p><div class="list">${S.agents.map(a=>`<div class="item" style="cursor:pointer" data-go="#/a/${a.id}"><div><b>${esc(a.name)}</b><div class="muted small">${esc(preset(a.preset).file)} - ${esc(S.bundles.find(b=>b.id===a.bundleId)?.name||'No bundle')}</div></div></div>`).join('')||'<p class="muted">No agents yet.</p>'}</div><div style="margin-top:12px"><button class="btn p" data-go="#/a/new">Add an agent</button></div>`,{back:'#/'});
 root.querySelectorAll('.item[data-go]').forEach(e=>e.onclick=()=>location.hash=e.dataset.go);
}
function agentView(id){
 const isNew=id==='new';const a=isNew?{id:uid(),name:'',preset:'claude',bundleId:S.bundles[0]?.id||''}:S.agents.find(x=>x.id===id);if(!a)return agentsView();
 shell(`<h1>${isNew?'Add an agent':esc(a.name)}</h1>
 <div class="sec"><label>Name</label><input type="text" id="an" value="${esc(a.name)}" placeholder="For example: Claude Code"></div>
 <div class="sec"><label>Type (sets the file name)</label><select id="ap">${PRESETS.map(p=>`<option value="${p.id}" ${p.id===a.preset?'selected':''}>${p.label} - ${p.file}</option>`).join('')}</select></div>
 <div class="sec"><label>Bundle</label><select id="ab">${S.bundles.map(b=>`<option value="${b.id}" ${b.id===a.bundleId?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>
 <div class="row"><button class="btn p" id="sv">Save</button>${isNew?'':`<button class="btn" id="cp">Copy file</button><button class="btn" id="dl">Download ${esc(preset(a.preset).file.split('/').pop())}</button><button class="btn" id="ln">Short link</button><button class="btn" id="np">New agent prompt</button><button class="btn" id="rp">Reset prompt</button><button class="btn" id="rm">Delete</button>`}</div>`,{back:'#/agents'});
 $('#sv').onclick=async()=>{const n=$('#an').value.trim();if(!n)return toast('Add a name');a.name=n;a.preset=$('#ap').value;a.bundleId=$('#ab').value;if(isNew)S.agents.push(a);await persist();location.hash='#/agents'};
 if(!isNew){const b=S.bundles.find(x=>x.id===a.bundleId);const text=b?compose(b.fileIds):'';
  $('#cp').onclick=()=>copy(text);$('#dl').onclick=()=>download(preset(a.preset).file,text);
  $('#ln').onclick=async()=>{const l=await makeLink('agent',a.id);if(l)copy(linkUrl(l))};
  $('#np').onclick=()=>location.hash='#/new/'+a.id;$('#rp').onclick=()=>location.hash='#/reset/'+a.id;
  $('#rm').onclick=async()=>{if(!confirm('Delete this agent?'))return;S.agents=S.agents.filter(x=>x!==a);await persist();location.hash='#/agents'}}
}
function promptFor(kind,a,inline){
 const b=a&&S.bundles.find(x=>x.id===a.bundleId);const fileIds=b?b.fileIds:S.files.map(f=>f.id);
 const l=a&&S.links.find(l=>l.type==='agent'&&l.ref===a.id);
 const where=l?`Read my working files here: ${linkUrl(l)}`:inline?`My working files are below.\n\n${compose(fileIds)}`:'My working files are pasted below.';
 const name=a?preset(a.preset).file:'AGENTS.md';
 if(kind==='new')return `You are joining my work. Before you do anything else, read my working files and follow them.\n\n${where}\n\nThen:\n1. Save them in this project as ${name} so you read them every time.\n2. Reply with three short bullets: how I like to work, what to never do, and what you will call me.\n3. Ask me about anything that is missing or unclear.\n\nDo not store passwords or keys in these files. Never ask me to paste them.`;
 return `Reset yourself. Forget any earlier guesses about how I work. Start again from my working files only.\n\n${where}\n\nThen:\n1. Replace your saved copy (${name}) with the new version.\n2. Reply with three short bullets showing what changed from before.\n3. Ask me if two files disagree.`;
}
function promptView(kind,aid){
 const a=S.agents.find(x=>x.id===aid);const t=kind==='new'?'New agent prompt':'Reset agent prompt';
 let inline=!(a&&S.links.find(l=>l.type==='agent'&&l.ref===a.id));
 const draw=()=>{
  const p=promptFor(kind,a,inline);
  shell(`<h1>${t}</h1><p class="muted small" style="margin-top:-6px">Paste this into the agent chat. Check it first.</p>
  <div class="row" style="margin-bottom:10px"><select id="sa" style="max-width:260px"><option value="">Any agent</option>${S.agents.map(x=>`<option value="${x.id}" ${a&&x.id===a.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
  <label class="chk" style="padding:0"><input type="checkbox" id="in" ${inline?'checked':''} ${a&&S.links.find(l=>l.type==='agent'&&l.ref===a.id)?'':'disabled checked'}> Include the files in the text</label><span class="sp"></span><button class="btn p" id="cp">Copy prompt</button></div>
  <pre class="raw">${esc(p)}</pre>`,{back:'#/'});
  $('#sa').onchange=e=>location.hash=`#/${kind}/${e.target.value}`;$('#cp').onclick=()=>copy(p);
  $('#in').onchange=e=>{inline=e.target.checked;draw()};
 };draw();
}
function settingsView(){
 shell(`<h1>Settings</h1>
 <h2>Storage</h2><div class="msg">${MODE==='remote'?'Cloud storage is on. Your files sync across devices and short links work.':'Files are stored only in this browser. Short links and syncing need cloud storage.'}</div>
 <h2>Your data</h2><div class="row"><button class="btn" id="ex">Export all (JSON)</button><button class="btn" id="exm">Export Markdown files</button><button class="btn" id="im">Import JSON</button><input type="file" id="imf" accept=".json" hidden></div>
 <p class="muted small">Your files are plain Markdown. Nothing here is locked in.</p>
 <h2>Short links</h2>${S.links.length?`<div class="list">${S.links.map(l=>`<div class="item"><div><div>${esc(l.type)}: ${esc(l.type==='file'?fileById(l.ref)?.name:l.type==='bundle'?S.bundles.find(b=>b.id===l.ref)?.name:S.agents.find(a=>a.id===l.ref)?.name||'')}</div><div class="muted small">${esc(linkUrl(l))}</div></div><span class="sp"></span><button class="btn" data-c="${l.token}">Copy</button><button class="btn" data-x="${l.token}">Turn off</button></div>`).join('')}</div>`:'<p class="muted small">None yet. Open a file, bundle or agent and tap the link icon.</p>'}
 <h2>Reset</h2><button class="btn" id="rs">Reset everything to the six starter files</button>
 <h2>Safety</h2><p class="muted small">Saving is blocked if text looks like a password, key or token. Short links are unguessable but anyone who has one can read that file, so do not share them in public.</p>`,{back:'#/'});
 $('#ex').onclick=()=>download('agent-library.json',JSON.stringify(S,null,2),'application/json');
 $('#exm').onclick=()=>{S.files.forEach((f,i)=>setTimeout(()=>download(f.name,f.body),i*250))};
 $('#im').onclick=()=>$('#imf').click();
 $('#imf').onchange=async e=>{try{const j=JSON.parse(await e.target.files[0].text());if(!j.files)throw 0;j.rev=S.rev;S=j;await persist();toast('Imported');home()}catch{toast('Not a valid export')}};
 root.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>copy(linkUrl({token:b.dataset.c})));
 root.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{S.links=S.links.filter(l=>l.token!==b.dataset.x);await persist();settingsView()});
 $('#rs').onclick=async()=>{if(!confirm('This replaces everything with the starter files.'))return;const r=S.rev;S=fresh();S.rev=r;await persist();location.hash='#/'};
}
function aiView(id){
 const f=fileById(id);if(!f)return home();
 shell(`<h1>AI edit: ${esc(f.name)}</h1><p class="muted small" style="margin-top:-6px">Say what to change. You see the changes first and choose to accept.</p>
 <div class="sec"><textarea id="ask" style="min-height:70px" placeholder="For example: make this shorter and add a rule about never deleting files"></textarea></div>
 <div class="row"><button class="btn p" id="go">Propose changes</button></div><div id="out"></div>`,{back:'#/f/'+id});
 $('#go').onclick=async()=>{
  const ask=$('#ask').value.trim();if(!ask)return;$('#out').innerHTML='<p class="muted">Working...</p>';
  const r=await api('/api/library/ai',{method:'POST',body:JSON.stringify({file:f.name,body:f.body,ask})});
  if(!r.ok){$('#out').innerHTML=`<div class="msg bad">${esc(r.j&&r.j.error||'AI editor is not set up yet.')}</div>`;return}
  const nb=r.j.body;const d=diff(f.body,nb);
  $('#out').innerHTML=`<h2>Proposed changes</h2><div class="diff">${d.filter(x=>x[0]!=='s'||true).map(([k,l])=>`<div class="${k==='s'?'':k}">${k==='a'?'+ ':k==='r'?'- ':'  '}${esc(l)}</div>`).join('')}</div><div id="err"></div><div class="row" style="margin-top:10px"><button class="btn p" id="ac">Accept</button><button class="btn" id="rj">Discard</button></div>`;
  $('#rj').onclick=()=>aiView(id);
  $('#ac').onclick=async()=>{const bad=await saveFile(f,nb);if(bad)$('#err').innerHTML=`<div class="msg bad"><b>Not saved.</b> The proposal has something that looks like a secret.<br>${bad.map(esc).join('<br>')}</div>`;else{toast('Saved');location.hash='#/f/'+id}};
 };
}
function login(msg=''){
 root.innerHTML=`<div class="lib-login"><p class="overline">Library</p><h1>${SETUP?'Welcome back':'Set a passphrase'}</h1><p class="muted">${SETUP?'Enter your passphrase to open your files.':'First time here. Choose a passphrase of at least 8 characters. You will need it on every device. It cannot be recovered.'}</p><div class="sec"><input type="password" id="pw" placeholder="Passphrase" autocomplete="${SETUP?'current-password':'new-password'}" autofocus></div>${msg?`<div class="msg bad">${esc(msg)}</div>`:''}<button class="btn p" id="ok">${SETUP?'Open':'Create'}</button></div>`;
 const go=async()=>{const pw=$('#pw').value;if(pw.length<8)return login('Use at least 8 characters.');TOKEN=await enc(pw);
  try{const r=await api('/api/library/state');if(r.status===401)return login('Wrong passphrase.');if(r.status===429)return login('Too many tries. Wait 15 minutes.');
   if(!SETUP){await api('/api/library/setup',{method:'POST'});SETUP=true}
   sessionStorage.setItem('al-tok',TOKEN);await boot2(r.j&&r.j.state)}catch{login('Could not connect.')}};
 $('#ok').onclick=go;$('#pw').onkeydown=e=>{if(e.key==='Enter')go()};
}
function route(){
 if(!S)return;const h=location.hash||'#/';const p=h.slice(2).split('/');window.scrollTo(0,0);
 try{
 switch(p[0]){
  case'':return home();case'f':return fileView(p[1]);case'h':return history(p[1]);case'b':return bundleView(p[1]);
  case'agents':return agentsView();case'a':return agentView(p[1]);case'new':return promptView('new',p[1]);case'reset':return promptView('reset',p[1]);
  case'settings':return settingsView();case'ai':return aiView(p[1]);default:return home()}
 }catch(e){console.error(e);home()}
}
async function boot2(remoteState){
 S=MODE==='remote'?remoteState:await Local.load();
 if(!S){S=fresh();await persist()}
 window.onhashchange=route;route();
}
async function boot(){
  let ping=null;try{const r=await window.pakupaiFetch('/api/library/ping');if(r.ok&&(r.headers.get('content-type')||'').includes('json'))ping=await r.json()}catch{}
 if(ping&&ping.ok){MODE='remote';SETUP=ping.setup;TOKEN=sessionStorage.getItem('al-tok')||'';
  // One sign-in: the Room session cookie opens the Library too (no token header sent).
  try{const r=await api('/api/library/state');if(r.ok&&r.j&&r.j.state)return boot2(r.j.state)}catch{}
  if(TOKEN){try{const r=await api('/api/library/state');if(r.ok)return boot2(r.j.state)}catch{}}
  if(EMBED)return root.innerHTML='<div class="lib-login"><h1>Sign in</h1><p class="muted">Open the Room and sign in first.</p></div>';
  return login()}
 MODE='local';boot2();
}
boot();
})();
