/* Pakupai motion finesse: additive layer. Layout, data and colors untouched.
   Reveals, springs, shared-logo morphs, cascades, spotlight. Off under prefers-reduced-motion. */
(()=>{const rm=matchMedia("(prefers-reduced-motion: reduce)");if(typeof window.render!=="function")return;
const vt=typeof document.startViewTransition==="function",root=document.documentElement;
const SP="linear(0,.09 2.2%,.34 5.4%,.64 9.3%,.86 13.4%,1.0 17.5%,1.07 21%,1.09 24%,1.07 28%,1.03 33%,.995 40%,.985 46%,.99 54%,1 66%,1)";
const EASE="cubic-bezier(.2,.7,.2,1)",ok=()=>!rm.matches&&vt;
const slugOf=el=>{const h=(el.getAttribute("href")||"");const m=h.match(/#\/agent\/([^/?#]+)/);return m&&m[1]};
const name=(el,n)=>{if(el)el.style.viewTransitionName=n};
const clear=()=>document.querySelectorAll("[style*=view-transition-name]").forEach(e=>e.style.viewTransitionName="");
function intro(){if(!ok())return;
 const h=document.querySelector(".home-title h1,.page-title h1");
 if(h&&!h.dataset.fz){h.dataset.fz=1;h.animate([{opacity:0,filter:"blur(10px)",transform:"translateY(8px)"},{opacity:1,filter:"blur(0)",transform:"none"}],{duration:560,easing:EASE,fill:"backwards"})}
 const rows=[...document.querySelectorAll(".il-row")];
 rows.slice(0,14).forEach((r,i)=>{const d=60+i*32;
  r.animate([{opacity:0,transform:"translateX(-14px)"},{opacity:1,transform:"none"}],{duration:520,delay:d,easing:SP,fill:"backwards"});
  const lg=r.querySelector(".icon");lg&&lg.animate([{transform:"scale(.7)"},{transform:"none"}],{duration:560,delay:d,easing:SP,fill:"backwards"});
  r.querySelectorAll(".il-strip > *").forEach((ic,j)=>ic.animate([{opacity:0,transform:"scale(.4)"},{opacity:1,transform:"none"}],{duration:300,delay:d+160+j*40,easing:SP,fill:"backwards"}))});
 const pf=document.querySelector(".pf");
 if(pf){[...pf.querySelectorAll(".back,.pf-id,.pf-hero ~ *")].slice(0,8).forEach((e,i)=>e.animate([{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"none"}],{duration:460,delay:120+i*60,easing:SP,fill:"backwards"}))}}
const orig=window.render;let last=location.hash,pendingLogo=null,active=null,serial=0;
function segNames(){document.querySelectorAll(".nseg").forEach((g,i)=>{const a=g.querySelector("button.active,button[aria-pressed=true]");name(a,"hop"+i)})}
window.render=function(keep){
 if(!ok()||!vt||document.hidden){last=location.hash;const cat=document.activeElement?.dataset.category,r=orig.apply(this,arguments);if(cat!==undefined)document.querySelector(`[data-category="${cat}"]`)?.focus({preventScroll:true});requestAnimationFrame(intro);return r}
 const route=location.hash!==last;last=location.hash;
 const first=!document.querySelector("main")?.children.length;
 if(first){const cat=document.activeElement?.dataset.category,r=orig.apply(this,arguments);if(cat!==undefined)document.querySelector(`[data-category="${cat}"]`)?.focus({preventScroll:true});requestAnimationFrame(intro);return r}
 if(active)active.skipTransition();const token=++serial;clear();root.classList.add("fz-vt");root.dataset.fz=route?"route":"filter";
 const oldRow=pendingLogo;pendingLogo=null;
 if(route){const prof=document.querySelector(".pf-hero .icon");if(prof&&!oldRow){name(prof,"agent-logo");pendingLogo=null}else if(oldRow)name(oldRow,"agent-logo")}
 else{document.querySelectorAll(".il-row").forEach(r=>{const s=slugOf(r);if(s)name(r,"r-"+s)});segNames()}
 const focused=document.activeElement,cat=focused?.dataset.category;
 const t=document.startViewTransition(()=>{orig.call(window,keep);
  if(cat!==undefined)document.querySelector(`[data-category="${cat}"]`)?.focus({preventScroll:true});
  if(route)document.querySelector("main")?.focus({preventScroll:true});
  if(route){const prof=document.querySelector(".pf-hero .icon");
   if(prof)name(prof,"agent-logo");
   else{const a=document.querySelector(".il-row");/* back: match row from previous profile */const s=(window.__fzBack||"");const row=s&&[...document.querySelectorAll(".il-row")].find(r=>slugOf(r)===s);name(row&&row.querySelector(".icon"),"agent-logo")}}
  else{document.querySelectorAll(".il-row").forEach(r=>{const s=slugOf(r);if(s)name(r,"r-"+s)});segNames()}});
 active=t;t.ready.catch(()=>{});t.finished.then(()=>{if(token!==serial)return;active=null;clear();root.classList.remove("fz-vt");delete root.dataset.fz},()=>{});
 return t};
/* remember where we came from for the back morph */
document.addEventListener("click",e=>{const a=e.target.closest&&e.target.closest(".il-row");if(a){pendingLogo=a.querySelector(".icon");window.__fzBack=slugOf(a)}},true);
/* dark/light: circular reveal from the toggle */
let relay=false;
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("#theme-toggle");if(!b||relay||!ok()||!vt)return;
 e.stopImmediatePropagation();e.preventDefault();const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,R=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
 root.classList.add("fz-theme");const t=document.startViewTransition(()=>{relay=true;b.click();relay=false});
 t.ready.then(()=>root.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${R}px at ${x}px ${y}px)`]},{duration:720,easing:"cubic-bezier(.5,0,.2,1)",pseudoElement:"::view-transition-new(root)"})).catch(()=>{});
 t.finished.then(()=>root.classList.remove("fz-theme"),()=>root.classList.remove("fz-theme"))},true);
/* soft spotlight on rows (hover devices only) */
if(matchMedia("(hover:hover)").matches)document.addEventListener("pointermove",e=>{const r=e.target.closest&&e.target.closest(".il-row");if(!r||!ok())return;const b=r.getBoundingClientRect();r.style.setProperty("--fx",e.clientX-b.left+"px");r.style.setProperty("--fy",e.clientY-b.top+"px")},{passive:true});
rm.addEventListener("change",()=>{if(!ok())document.getAnimations().forEach(a=>a.finish())});
requestAnimationFrame(intro);
})();
