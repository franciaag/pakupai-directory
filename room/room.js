(function(){
var R=document.getElementById('r'),last=0,evs=[],timer=null,busy=false;
var $=function(s,e){return (e||document).querySelector(s)};
var h=function(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
var api=function(p,o){o=o||{};o.credentials='same-origin';o.headers=Object.assign({'content-type':'application/json'},o.headers||{});if(o.method&&o.method!=='GET')o.headers['x-room']='1';return window.pakupaiFetch(p,o).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{s:r.status,j:j}})})};
var CONFIGURED=true;
function login(msg){clearInterval(timer);R.textContent='';var w=h('div','pr-login');w.appendChild(h('h1',0,'Your room'));w.appendChild(h('p','sub',CONFIGURED?'Private to the owner. Sign in to continue.':'First time here. Choose a passphrase (10+ characters) to protect your room.'));
 var f=h('form'),i=h('input');i.type='password';i.placeholder='Passphrase';i.autocomplete=CONFIGURED?'current-password':'new-password';i.setAttribute('aria-label','Passphrase');var er=h('div','pr-err',msg||''),b=h('button','btn p',CONFIGURED?'Sign in':'Set passphrase');b.type='submit';f.append(i,er,b);
 f.onsubmit=function(e){e.preventDefault();b.disabled=true;api(CONFIGURED?'/api/owner/login':'/api/owner/setup',{method:'POST',body:JSON.stringify({passphrase:i.value})}).then(function(r){if(r.s===200){start()}else{b.disabled=false;er.textContent=r.s===429?'Too many tries. Wait 10 minutes.':r.s===503?'Sign-in is not set up yet.':'Wrong passphrase.'}})};
 w.appendChild(f);R.appendChild(w);i.focus()}

var ui={},ONLINE_MS=90000,KEEP_MS=600000,lastAgents=[],lastNow=0,LIB=null,LIBERR=false,openSheet=null;
var MAXMSG=6000;
function ago(ms){var s=Math.max(0,Math.round(ms/1000));if(s<60)return s+'s';var m=Math.round(s/60);if(m<60)return m+'m';var hr=Math.round(m/60);return hr<48?hr+'h':Math.round(hr/24)+'d'}
function seenAge(x,now){return x.last_seen?now-x.last_seen:null}
function isLive(x,now){if(x.status==='pending')return true;if(x.status!=='approved')return false;var a=seenAge(x,now);return a==null?(now-(x.approved_at||0))<KEEP_MS:a<=KEEP_MS}
function time(t){return new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
function toast(t){var d=h('div','toast',t);document.body.appendChild(d);setTimeout(function(){d.remove()},1800)}
function act(path,btn){if(btn)btn.disabled=true;return api(path,{method:'POST'}).then(function(r){load();return r})}
/* ---- Library (same origin; the Room session also opens it) ---- */
function libLoad(){return window.pakupaiFetch('/api/library/state',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(j){LIB=j&&j.state||null;LIBERR=!LIB;return LIB},function(){LIBERR=true;return null})}
function libSave(mut){return libLoad().then(function(st){if(!st)throw new Error('lib');mut(st);return window.pakupaiFetch('/api/library/state',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(st)}).then(function(r){if(r.status===409)throw new Error('conflict');if(!r.ok)throw new Error('save');return r.json()}).then(function(j){st.rev=j.rev;LIB=st;return st})})}
var SECRET=[/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/\bAKIA[0-9A-Z]{16}\b/,/\bsk-[A-Za-z0-9_-]{20,}/,/\bgh[pousr]_[A-Za-z0-9]{30,}/,/\bxox[abprs]-[A-Za-z0-9-]{10,}/,/\bAIza[0-9A-Za-z_-]{30,}/,/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,/\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{8,}/i,/\b[0-9a-f]{40,}\b/i];
function hasSecret(t){return SECRET.some(function(r){return r.test(t)})}
function fileByName(n){n=(n||'').trim().toLowerCase();return LIB&&LIB.files.filter(function(f){return f.name.toLowerCase()===n})[0]||null}
function bundleText(b){return b.fileIds.map(function(id){return LIB.files.filter(function(f){return f.id===id})[0]}).filter(Boolean).map(function(f){return '<!-- '+f.name+' -->\n'+f.body.trim()+'\n'}).join('\n---\n\n')}
function sendText(t){if(t.length>MAXMSG){toast('Too long to send ('+t.length+' of '+MAXMSG+' characters)');return Promise.resolve(false)}return api('/api/owner/post',{method:'POST',body:JSON.stringify({text:t})}).then(function(r){if(r.s!==201){toast('Could not send');return false}load();return true})}
/* ---- bottom sheet ---- */
function sheet(title,build,opts){closeSheet();opts=opts||{};var sc=h('div','pr-scrim'),sh=h('div','pr-sheet'+(opts.tall?' tall':''));sc.onclick=closeSheet;
 var hd=h('div','pr-shh');hd.appendChild(h('b',0,title));var x=h('button','pr-x','\u00d7');x.setAttribute('aria-label','Close');x.onclick=closeSheet;hd.appendChild(x);sh.appendChild(hd);var body=h('div','pr-shb');sh.appendChild(body);build(body);document.body.append(sc,sh);openSheet=[sc,sh];document.body.style.overflow='hidden'}
function closeSheet(){if(openSheet){openSheet.forEach(function(e){e.remove()});openSheet=null;document.body.style.overflow='';if(/^#(files|agent)/.test(location.hash))history.replaceState(null,'',location.pathname)}}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSheet()});
function rowBtn(title,meta,fn,extra){var r=h('div','pr-ln');var b=h('button','pr-lnb');b.type='button';b.appendChild(h('b',0,title));if(meta)b.appendChild(h('span','m',meta));b.onclick=fn;r.appendChild(b);if(extra)r.appendChild(extra);return r}
function mini(label,fn,cls){var b=h('button','btn sm'+(cls?' '+cls:''),label);b.type='button';b.onclick=function(e){e.stopPropagation();fn(b)};return b}
/* ---- files sheet: send or open ---- */
function filesSheet(route){libLoad().then(function(){sheet('Files',function(b){
 if(!LIB){b.appendChild(h('div','pr-empty',LIBERR?'Files are not available right now.':'No files yet.'));return}
 var top=h('div','pr-row2');top.appendChild(mini('Open editor',function(){editor('#/')},'p'));b.appendChild(top);
 b.appendChild(h('div','pr-h','Files'));var bx=h('div','pr-box');
 LIB.files.forEach(function(f){bx.appendChild(rowBtn(f.name,f.desc||'',function(){editor('#/f/'+f.id)},mini('Send',function(){closeSheet();sendText('[file: '+f.name+']\n'+f.body.trim())})))});b.appendChild(bx);
 b.appendChild(h('div','pr-h','Bundles'));var b2=h('div','pr-box');
 LIB.bundles.forEach(function(bd){b2.appendChild(rowBtn(bd.name,bd.fileIds.length+' files',function(){editor('#/b/'+bd.id)},mini('Send',function(){closeSheet();sendText('[bundle: '+bd.name+']\n'+bundleText(bd))})))});if(!LIB.bundles.length)b2.appendChild(h('div','pr-empty','No bundles.'));b.appendChild(b2)},{tall:true});
 if(route)editor(route)})}
function editor(route){sheet('Library',function(b){var f=document.createElement('iframe');f.className='pr-if';f.src='../library/?embed=1'+(route||'#/');f.title='Library';b.appendChild(f);b.className+=' flush'},{tall:true});
 var x=openSheet[1].querySelector('.pr-x');x.onclick=function(){closeSheet();libLoad().then(function(){drawFeed()})}}
/* ---- agent sheet: status + what it reads ---- */
function agentSheet(a){libLoad().then(function(){var now=lastNow,age=seenAge(a,now);sheet(a.name,function(b){
 var st=a.status==='pending'?'Asks to join':a.status==='approved'?(age!=null&&age<=ONLINE_MS?'Online \u00b7 seen '+ago(age)+' ago':age==null?'Connected \u00b7 not seen yet':'Idle \u00b7 last seen '+ago(age)+' ago'):a.status==='revoked'?'Removed':'Declined';
 b.appendChild(h('div','pr-sub2',(a.role?a.role+' \u00b7 ':'')+st));
 if(a.status==='pending'){var r=h('div','pr-row2');r.append(mini('Approve',function(x){act('/api/owner/agents/'+a.id+'/approve',x).then(closeSheet)},'p'),mini('Decline',function(x){act('/api/owner/agents/'+a.id+'/decline',x).then(closeSheet)}));b.appendChild(r);return}
 if(a.status==='approved'){
  b.appendChild(h('div','pr-h','Reads'));
  if(!LIB){b.appendChild(h('div','pr-empty','Files are not available right now.'))}else{
   var map=LIB.roomAgents||{},cur=map[a.id]||'',sel=h('select');var o0=h('option',0,'No bundle');o0.value='';sel.appendChild(o0);LIB.bundles.forEach(function(bd){var o=h('option',0,bd.name);o.value=bd.id;if(bd.id===cur)o.selected=true;sel.appendChild(o)});
   sel.onchange=function(){libSave(function(s){s.roomAgents=s.roomAgents||{};if(sel.value)s.roomAgents[a.id]=sel.value;else delete s.roomAgents[a.id]}).then(function(){agentSheet(a)},function(){toast('Could not save')})};b.appendChild(sel);
   var bd=LIB.bundles.filter(function(x){return x.id===cur})[0];
   if(bd){var bx=h('div','pr-box');LIB.files.forEach(function(f){var on=bd.fileIds.indexOf(f.id)>=0,t=h('button','pr-tgl'+(on?'':' off'));t.type='button';t.setAttribute('aria-pressed',on);t.setAttribute('aria-label',f.name);
     t.onclick=function(){libSave(function(s){var q=s.bundles.filter(function(x){return x.id===bd.id})[0];var i=q.fileIds.indexOf(f.id);if(i>=0)q.fileIds.splice(i,1);else q.fileIds.push(f.id)}).then(function(){agentSheet(a)},function(){toast('Could not save')})};
     var r=h('div','pr-ln');r.appendChild(h('b','pr-lnt',f.name));r.appendChild(t);bx.appendChild(r)});b.appendChild(bx);
     var r2=h('div','pr-row2');r2.append(mini('Send to chat',function(){closeSheet();sendText('[bundle: '+bd.name+']\n'+bundleText(bd))},'p'),mini('Copy all',function(){var t=bundleText(bd);(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){toast('Copied')},function(){toast('Copy not allowed here')})}),mini('Edit files',function(){editor('#/b/'+bd.id)}));b.appendChild(r2)}}
  var rm=h('div','pr-row2 pr-danger');rm.appendChild(mini('Remove agent',function(x){if(confirm('Remove '+a.name+'? Its key stops working.'))act('/api/owner/agents/'+a.id+'/revoke',x).then(closeSheet)}));b.appendChild(rm)}
 else b.appendChild(h('div','pr-empty','Archived. Its key no longer works.'))})})}
/* ---- invite + archive sheet ---- */
function inviteSheet(){sheet('Invite an agent',function(b){
 var lab=h('input');lab.type='text';lab.placeholder='Label (optional)';lab.maxLength=40;lab.setAttribute('aria-label','Invite label');
 var hr=h('input');hr.type='number';hr.min=1;hr.max=168;hr.value=24;hr.setAttribute('aria-label','Hours until it expires');
 var row=h('div','pr-irow');row.append(lab,hr,h('span','pr-unit','h'));var gb=h('button','btn p','Create invite'),out=h('div');
 gb.onclick=function(){gb.disabled=true;api('/api/owner/invites',{method:'POST',body:JSON.stringify({label:lab.value,hours:+hr.value||24})}).then(function(r){gb.disabled=false;out.textContent='';if(r.s!==201){out.appendChild(h('div','pr-err','Could not create the invite.'));return}
  var txt='Read '+r.j.join_url+' and follow the instructions to join my room.';out.appendChild(h('p','sub','Single use. Expires in '+r.j.expires_in_hours+' h. Copy and give it to one agent:'));var l=h('div','pr-link',txt);out.appendChild(l);var cb=h('button','btn','Copy');cb.onclick=function(){(navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){cb.textContent='Copied'},function(){var s=window.getSelection(),rg=document.createRange();rg.selectNodeContents(l);s.removeAllRanges();s.addRange(rg);cb.textContent='Select and copy'})};out.appendChild(cb);load()})};
 b.append(row,gb,out);
 var inv=lastInv.filter(function(i){return !i.used_at&&!i.revoked_at&&i.expires_at>lastNow});
 if(inv.length){b.appendChild(h('div','pr-h','Open invites'));inv.forEach(function(i){var d=h('div','pr-ln');d.appendChild(h('b','pr-lnt',(i.label||'Invite')+' \u00b7 '+Math.max(1,Math.round((i.expires_at-lastNow)/36e5))+' h left'));d.appendChild(mini('Revoke',function(x){act('/api/owner/invites/'+i.id+'/revoke',x).then(closeSheet)}));b.appendChild(d)})}
 var off=lastAgents.filter(function(x){return !isLive(x,lastNow)}).sort(function(p,q){return (q.last_seen||q.created_at||0)-(p.last_seen||p.created_at||0)});
 if(off.length){b.appendChild(h('div','pr-h','Archived ('+off.length+')'));var bx=h('div','pr-box');off.slice(0,50).forEach(function(x){var d=h('div','pr-ln off');d.appendChild(h('i','pr-dot '+x.status));d.appendChild(h('b','pr-lnt',x.name));d.appendChild(h('span','m',x.status==='revoked'?'removed':x.status==='approved'?'offline '+ago(lastNow-(x.last_seen||x.approved_at||x.created_at))+' ago':x.status));bx.appendChild(d)});b.appendChild(bx);if(off.length>50)b.appendChild(h('div','pr-empty','+ '+(off.length-50)+' older'))}
 })}
var lastInv=[];
/* ---- shell ---- */
function shell(){R.textContent='';ui={};
 var top=h('div','pr-top'),l=h('div','pr-tl');l.appendChild(h('h1',0,'Room'));ui.sub=h('span','pr-pres','');l.appendChild(ui.sub);
 var r=h('div','pr-tr');var fb=h('button','pr-link-btn','Files');fb.onclick=function(){filesSheet()};var so=h('button','pr-link-btn','Sign out');so.onclick=function(){api('/api/owner/logout',{method:'POST'}).then(function(){login()})};r.append(fb,so);top.append(l,r);R.appendChild(top);
 ui.chips=h('div','pr-chips');R.appendChild(ui.chips);
 var c3=h('section','pr-card pr-chat');ui.feed=h('div','pr-feed');ui.feed.setAttribute('role','log');c3.appendChild(ui.feed);
 ui.sug=h('div','pr-sug');ui.sug.hidden=true;c3.appendChild(ui.sug);
 var f=h('form','pr-form'),pl=h('button','pr-plus','+');pl.type='button';pl.setAttribute('aria-label','Send a file');pl.onclick=function(){filesSheet()};
 var mi=h('input');mi.type='text';mi.placeholder='Message, or / for a file';mi.maxLength=2000;mi.autocomplete='off';mi.setAttribute('aria-label','Message the room');var mb=h('button','pr-send','\u2191');mb.type='submit';mb.setAttribute('aria-label','Send');f.append(pl,mi,mb);ui.in=mi;
 mi.oninput=function(){var v=mi.value;if(v.charAt(0)!=='/'){ui.sug.hidden=true;return}var q=v.slice(1).toLowerCase();libLoad().then(function(){if(!LIB||mi.value.charAt(0)!=='/')return;ui.sug.textContent='';
  var items=LIB.bundles.map(function(x){return{n:x.name,k:'bundle',t:function(){return '[bundle: '+x.name+']\n'+bundleText(x)}}}).concat(LIB.files.map(function(x){return{n:x.name,k:'file',t:function(){return '[file: '+x.name+']\n'+x.body.trim()}}})).filter(function(i){return i.n.toLowerCase().indexOf(q)>=0}).slice(0,6);
  items.forEach(function(i){var b=h('button','pr-sugi');b.type='button';b.appendChild(h('b',0,i.n));b.appendChild(h('span','m',i.k));b.onclick=function(){mi.value='';ui.sug.hidden=true;sendText(i.t())};ui.sug.appendChild(b)});ui.sug.hidden=!items.length})};
 f.onsubmit=function(e){e.preventDefault();var t=mi.value.trim();if(!t||t.charAt(0)==='/')return;mi.value='';sendText(t)};c3.appendChild(f);R.appendChild(c3)}
function chip(a,now){var age=seenAge(a,now),cls=a.status==='approved'?(age!=null&&age<=ONLINE_MS?'live':'idle'):a.status;var c=h('button','pr-chip'+(a.status==='pending'?' pend':''));c.type='button';c.appendChild(h('i','pr-dot '+cls));c.appendChild(h('span',0,a.name+(a.status==='pending'?' \u00b7 approve':'')));c.onclick=function(){agentSheet(a)};return c}
function drawAgents(a,now){lastAgents=a;lastNow=now;ui.chips.textContent='';
 var live=a.filter(function(x){return isLive(x,now)}).sort(function(p,q){return (p.status==='pending'?0:1)-(q.status==='pending'?0:1)||(q.last_seen||0)-(p.last_seen||0)});
 live.forEach(function(x){ui.chips.appendChild(chip(x,now))});
 var off=a.length-live.length,ad=h('button','pr-chip add','+ Invite'+(off?' \u00b7 '+off+' archived':''));ad.type='button';ad.onclick=inviteSheet;ui.chips.appendChild(ad);
 var on=a.filter(function(x){return x.status==='approved'&&seenAge(x,now)!=null&&seenAge(x,now)<=ONLINE_MS}).length,pend=a.filter(function(x){return x.status==='pending'}).length;
 ui.sub.textContent=(on?on+' online':'none online')+(pend?' \u00b7 '+pend+' waiting':'')}
/* ---- feed: text, file cards, edit proposals ---- */
function diffLines(a,b){var A=a.split('\n'),B=b.split('\n'),n=A.length,m=B.length;if(n*m>250000)return null;var L=[];for(var i=0;i<=n;i++)L.push(new Uint16Array(m+1));
 for(i=n-1;i>=0;i--)for(var j=m-1;j>=0;j--)L[i][j]=A[i]===B[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
 var o=[];i=0;j=0;while(i<n&&j<m){if(A[i]===B[j]){i++;j++}else if(L[i+1][j]>=L[i][j+1])o.push(['r',A[i++]]);else o.push(['a',B[j++]])}while(i<n)o.push(['r',A[i++]]);while(j<m)o.push(['a',B[j++]]);return o}
function resolved(id){for(var i=evs.length-1;i>=0;i--){var e=evs[i];if(e.kind!=='owner')continue;var m=/^(Accepted|Declined) edit #(\d+)\b/.exec(e.text);if(m&&+m[2]===id)return m[1]}return null}
function cardFile(m,kind,name,body){var c=h('div','pr-fc');var t=h('div','pr-fct');t.appendChild(h('b',0,name));t.appendChild(h('span','m',kind==='bundle'?'bundle':'file'));c.appendChild(t);var p=h('div','pr-fcp',body.trim().split('\n').filter(function(l){return l.trim()&&!/^<!--/.test(l)}).slice(0,2).join(' ').slice(0,140));c.appendChild(p);
 var full=h('pre','pr-fcb',body.trim());full.hidden=true;c.appendChild(full);c.onclick=function(){full.hidden=!full.hidden;p.hidden=!full.hidden};m.appendChild(c)}
function cardEdit(m,e,name,body){var c=h('div','pr-fc ed'),f=fileByName(name),res=resolved(e.id);var t=h('div','pr-fct');t.appendChild(h('b',0,name));t.appendChild(h('span','m',res?res.toLowerCase():f?'edit proposed':'new file proposed'));c.appendChild(t);
 var d=f?diffLines(f.body.trim(),body.trim()):null;var bx=h('div','pr-dif');
 if(!f){body.trim().split('\n').slice(0,6).forEach(function(l){bx.appendChild(h('div','a','+ '+l))})}
 else if(!d){bx.appendChild(h('div',0,'Large change. Use Review.'))}
 else if(!d.length){bx.appendChild(h('div',0,'No difference from the current file.'))}
 else{d.slice(0,8).forEach(function(x){bx.appendChild(h('div',x[0],(x[0]==='a'?'+ ':'- ')+x[1]))});if(d.length>8)bx.appendChild(h('div','m','+ '+(d.length-8)+' more changes'))}
 c.appendChild(bx);
 if(!res){var r=h('div','pr-row2');
  r.appendChild(mini('Accept',function(btn){if(hasSecret(body)){toast('Not saved: it looks like it has a secret in it');return}btn.disabled=true;
   libSave(function(s){var q=s.files.filter(function(x){return x.name.toLowerCase()===name.toLowerCase()})[0],nb=body.trim()+'\n';
    if(q){if(nb!==q.body){(s.versions[q.id]=s.versions[q.id]||[]).unshift({t:Date.now(),body:q.body});s.versions[q.id]=s.versions[q.id].slice(0,50);q.body=nb;q.updated=Date.now()}}
    else{s.files.push({id:Math.random().toString(36).slice(2,10),name:name,desc:'',body:nb,updated:Date.now()})}}).then(function(){return sendText('Accepted edit #'+e.id+' to '+name+'.')},function(){btn.disabled=false;toast('Could not save, try again')})},'p'));
  r.appendChild(mini('Review',function(){if(f)editor('#/f/'+f.id);else filesSheet()}));
  r.appendChild(mini('Decline',function(btn){btn.disabled=true;sendText('Declined edit #'+e.id+' to '+name+'.')}));c.appendChild(r)}
 m.appendChild(c)}
function drawFeed(){var f=ui.feed,stick=f.scrollTop+f.clientHeight>=f.scrollHeight-40;f.textContent='';
 if(!evs.length){f.appendChild(h('div','pr-empty c','Nothing yet. Messages from connected agents appear here.'))}
 var prev=null;
 evs.forEach(function(e){if(e.kind==='sys'||e.kind==='request'){f.appendChild(h('div','pr-sys',e.text+' \u00b7 '+time(e.ts)));prev=null;return}
  var who=e.kind==='owner'?'You':(e.agent||'Agent'),m=h('div','pr-m'+(e.kind==='owner'?' o':'')+(prev===who?' same':''));
  if(prev!==who)m.appendChild(h('small',0,who+' \u00b7 '+time(e.ts)));
  var fm=e.kind==='owner'&&/^\[(file|bundle): ([^\]\n]{1,80})\]\n([\s\S]*)$/.exec(e.text),em=e.kind==='msg'&&/^\[edit: ([^\]\n]{1,80})\]\n([\s\S]*)$/.exec(e.text);
  if(fm)cardFile(m,fm[1],fm[2],fm[3]);else if(em)cardEdit(m,e,em[1],em[2]);else m.appendChild(h('div',0,e.text));
  f.appendChild(m);prev=who});
 if(stick)f.scrollTop=f.scrollHeight}
function load(){if(busy)return;busy=true;api('/api/owner/state?after='+last).then(function(r){busy=false;if(r.s===401){login();return}if(r.s!==200)return;var j=r.j;lastInv=j.invites;
 drawAgents(j.agents,j.now);if(j.events.length){evs=evs.concat(j.events).slice(-300);last=evs[evs.length-1].id;drawFeed()}else if(!evs.length)drawFeed()},function(){busy=false})}
document.addEventListener("visibilitychange",function(){if(!document.hidden&&typeof load==="function"&&timer)load()});
function route(){var m=/^#files(?:\/(.*))?$/.exec(location.hash);if(m){filesSheet(m[1]?'#/'+m[1]:null);return}var a=/^#agent=(.+)$/.exec(location.hash);if(a){var n=decodeURIComponent(a[1]).toLowerCase(),x=lastAgents.filter(function(y){return y.name.toLowerCase()===n})[0];if(x)agentSheet(x)}else if(location.hash==='#invite')inviteSheet()}
function start(){evs=[];last=0;shell();libLoad().then(function(){load();setTimeout(route,400)});clearInterval(timer);timer=setInterval(function(){if(!document.hidden)load()},10000)}
api('/api/owner/state').then(function(r){if(r.s===200)start();else api('/api/owner/status').then(function(q){CONFIGURED=q.j.configured!==false;login()})},function(){login('Could not reach the server.')});
})();
