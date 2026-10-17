/* Albert web reminders. Optional Web Push uses the user's existing Supabase project.
 * No permission prompt at startup. No hidden audio, wake-lock or timer keepalive hacks. */
(function(){
'use strict';
if(window.AlbertReminders||!window.AlbertReminderCore)return;
const C=window.AlbertReminderCore,D=document;
const script=D.currentScript,ASSETS=new URL('./',script?.src||new URL('albert-notify/client.js',D.baseURI)),BASE=new URL('../',ASSETS).href;
const db=C.store(C.databaseName(BASE));
let registration=null,registering=null,panel=null,lastFocus=null,heartbeat=0,busy=false,collecting=null,collectedAt=0,seenOwner=null,pendingCard=null,installEvent=null,viewMode='settings',authWatcher=null,collectTimer=0;
const fingerprints=new Map();
const T={title:'Nh\u1eafc h\u1ecdc t\u1eeb v\u1ef1ng & ng\u1eef ph\u00e1p',shortTitle:'Nh\u1eafc h\u1ecdc',close:'\u0110\u00f3ng',source:'L\u1ea5y n\u1ed9i dung t\u1eeb',scope:'Ph\u1ea1m vi',learned:'C\u00e1c b\u00e0i \u0111\u00e3 h\u1ecdc',all:'C\u1ea3 gi\u00e1o tr\u00ecnh',kind:'Th\u00f4ng b\u00e1o nh\u1eafc',word:'T\u1eeb v\u1ef1ng',grammar:'Ng\u1eef ph\u00e1p',mix:'Xen k\u1ebd',interval:'Bao l\u00e2u nh\u1eafc m\u1ed9t l\u1ea7n',off:'T\u1eaft',on:'B\u1eadt',quiet:'Kh\u00f4ng nh\u1eafc ban \u0111\u00eam (22:00 - 07:00)',test:'G\u1eedi th\u1eed m\u1ed9t th\u00f4ng b\u00e1o',allow:'Cho ph\u00e9p th\u00f4ng b\u00e1o',preview:'Th\u1ebb \u00f4n nhanh',next:'M\u1ee5c kh\u00e1c',openLesson:'M\u1edf b\u00e0i h\u1ecdc',history:'L\u1ecbch s\u1eed nh\u1eafc',empty:'Ch\u01b0a c\u00f3 n\u1ed9i dung ph\u00f9 h\u1ee3p. M\u1edf b\u00e0i h\u1ecdc, ch\u1ecdn b\u00e0i d\u00f9ng \u0111\u1ec3 nh\u1eafc ho\u1eb7c ch\u1ecdn C\u1ea3 gi\u00e1o tr\u00ecnh.',saved:'\u0110\u00e3 l\u01b0u',minute:' ph\u00fat',hour:' gi\u1edd',day:'1 ng\u00e0y'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=s=>{if(typeof s!=='string')return '';return C.clean(s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&'));};
function node(tag,attrs={},text){const e=D.createElement(tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
function icon(name,filled=false){
 window.AlbertFluentAssets?.request?.(name);const a=window.AlbertFluentIcons?.[name]||window.AlbertFluentIcons?.bell,pair=a?.sizes?.['20']||a;
 const source=pair?.[filled?'filled':'regular']||'',rootTag=/^<svg[^>]*>/.exec(source)?.[0]||'',fill=/\bfill="([^"]+)"/.exec(rootTag)?.[1];
 const fillStyle=fill==='none'?' style="fill:none"':'';
 return '<span class="rn-icon" aria-hidden="true">'+source.replace('<svg','<svg'+fillStyle+' class="adw-svg" data-adw-family="'+name+'" data-adw-filled="'+(filled?'1':'0')+'" focusable="false"')+'</span>';
}
function button(text,fn,name,primary=false,attrs={}){const b=node('button',{type:'button',...attrs});b.innerHTML=(name?icon(name):'')+'<span>'+esc(text)+'</span>';if(primary)b.className='rn-primary';b.onclick=fn;return b;}
function notice(message){window.AlbertDesktop?.toast?.(message);const box=panel?.querySelector('.rn-inline-error');if(box)box.textContent=message;}
let knownOwner=window.hskCurrentUser?.id||null;
function cachedOwner(){try{const r=JSON.parse(localStorage.getItem(window.ALBERT_SHARED_AUTH_STORAGE_KEY||'sb-pdsxreonrlrfcotszblj-auth-token')||'null');return r?.user?.id||r?.currentSession?.user?.id||'guest';}catch(_){return 'guest';}}
function owner(){return knownOwner||window.hskCurrentUser?.id||cachedOwner();}
function watchAuth(){const a=window.hskSupabase?.auth;if(!a||authWatcher)return;authWatcher=true;a.onAuthStateChange((event,session)=>{knownOwner=session?.user?.id||'guest';setTimeout(()=>{reconcileOwner().then(()=>collect(true)).catch(()=>{});},0);});}

function zone(){return Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Ho_Chi_Minh';}
function currentCourse(){if(D.body.classList.contains('hsk303-edition'))return '3.0:hsk3';if(D.body.classList.contains('hsk30-edition'))return '3.0:hsk2';return '2.0:'+(window.CURRENT_COURSE||'hsk5');}
function courseTitle(key){return 'HSK '+key.split('hsk')[1]+' \u00b7 b\u1ea3n '+key.split(':')[0];}
function permission(){return 'Notification'in window?Notification.permission:'unsupported';}
function gateBlocking(){return ['albert-wgate','approval-gate','albert-gate'].some(id=>{const e=D.getElementById(id);return e&&e.getClientRects().length&&getComputedStyle(e).display!=='none';});}
function currentLesson(){try{const c=currentCourse();if(c.startsWith('3.0')){const a=c.endsWith('hsk3')?window.AlbertHSK303:window.AlbertHSK30;const x=a?.getLocation?.();return x&&x.view!=='home'&&x.view!=='lessons'?Number(x.lessonId)||0:0;}const detail=D.getElementById('lesson-detail-view');if(detail&&detail.getClientRects().length){return Number(D.getElementById('lesson-selector')?.value)||0;}}catch(_){}return 0;}
function oneExample(g){let ex=(g.examples||[]).find(x=>typeof x==='object'&&x?.zh);if(!ex)for(const s of g.senses||[]){ex=(s.examples||[]).find(x=>x?.zh);if(ex)break;}return ex||{};}
function word(w,l){if(!w?.zh||!w.vi)return null;const e=(w.examples||[])[0];return {kind:'word',front:plain(w.zh),py:plain(w.py||w.pinyin||'').replace(/\u0261/g,'g'),meaning:plain(w.vi),lesson:Number(l.id),lessonTitle:plain(l.vi||l.titleVi||l.zh||l.title),example:plain(typeof e==='string'?e:e?.zh||w.example||''),exampleVi:plain(e?.vi||''),examplePy:plain(e?.py||'')};}
function grammar(g,l,guide){if(!g||typeof g==='string')return null;const ex=oneExample(guide||g),front=plain(g.pattern||g.title||g.full||''),meaning=plain(guide?.meaning||g.explainVi||g.explanation||g.note||g.vi||'');if(!front||!meaning)return null;const fromTitle=/[\uff08(]([a-z\u00c0-\u024f\u01cd-\u01dc\s]+)[)\uff09]/i.exec(g.full||'');return {kind:'grammar',front,py:plain(guide?.titlePy||g.py||fromTitle?.[1]||''),meaning,lesson:Number(l.id),lessonTitle:plain(l.vi||l.titleVi||l.zh||l.title),formula:plain(g.formula||(guide?.formulas||[]).join('\n')),example:plain(ex.zh||''),exampleVi:plain(ex.vi||''),examplePy:plain(ex.py||'')};}
function getSources(){
 const s=window.HSKDictionaryLessonSources||{},out=[];
 if(Array.isArray(s.hsk1))out.push(['2.0:hsk1',s.hsk1]);
 if(Array.isArray(window.HSK3_LESSONS))out.push(['2.0:hsk3',window.HSK3_LESSONS]);
 if(Array.isArray(window.HSK4_STUDY_DATA?.lessons))out.push(['2.0:hsk4',window.HSK4_STUDY_DATA.lessons]);
 if(Array.isArray(s.hsk5))out.push(['2.0:hsk5',s.hsk5]);
 for(const [key,a]of [['3.0:hsk2',window.AlbertHSK30],['3.0:hsk3',window.AlbertHSK303]]){const list=a?.getSourceData?.();if(Array.isArray(list))out.push([key,list,a.getGrammarGuides?.()||{}]);}
 return out;
}
async function collect(force=false){
 if(collecting)return collecting;if(!force&&Date.now()-collectedAt<12000)return;
 collecting=(async()=>{
  const active=currentCourse(),opened=currentLesson();
  const raw=await db.read(['config','poolKeys']);const cfg=C.config(raw.config),who=owner();
  // Owner changes are handled before collecting; no previous user's learned markers are inherited.
  const keys=[];
  for(const [key,lessons,guides] of getSources()){
   const words=[],grams=[],lessonList=[];
   for(const l of lessons){if(!Number(l.id))continue;lessonList.push({id:Number(l.id),title:plain(l.vi||l.titleVi||l.zh||l.title||'')});
    for(const w of l.vocab||[]){const it=word(w,l);if(it)words.push(it);}
    let gs=l.grammarDetail?.length?l.grammarDetail:l.grammar||[];
    if(key==='2.0:hsk3'&&window.HSK3_OFFICIAL_GRAMMAR?.[l.id]?.points)gs=window.HSK3_OFFICIAL_GRAMMAR[l.id].points;
    for(let i=0;i<gs.length;i++){const g=gs[i],it=grammar(g,l,guides?.[l.id+'-'+(g.id||i+1)]);if(it)grams.push(it);}
   }
   const canonical={key,title:courseTitle(key),words,grammar:grams,lessons:lessonList};
   const sig=JSON.stringify(canonical);keys.push(key);
   await db.mutate(['pool:'+key],r=>{
    const old=r['pool:'+key],learned=new Set(old?.owner===who?(old.learned||[]):[]),excluded=old?.owner===who?(old.excluded||[]):[];
    if(key===active){try{if(key.startsWith('2.0')&&typeof STATE!=='undefined')for(const n of STATE.completedLessons||[])if(Number(n)&&!excluded.includes(Number(n)))learned.add(Number(n));}catch(_){}
      if(opened&&!gateBlocking()&&!excluded.includes(opened))learned.add(opened);
    }
    const list=[...learned].sort((a,b)=>a-b);
    if(fingerprints.get(key)===sig&&old?.owner===who&&JSON.stringify(old.learned)===JSON.stringify(list))return {};
    fingerprints.set(key,sig);return {write:{['pool:'+key]:{...canonical,learned:list,excluded,owner:who}}};
   });
  }
  await db.set('poolKeys',keys);
  if(!cfg.pool&&keys.length)await db.mutate(['config'],r=>({write:{config:{...C.config(r.config),pool:keys.includes(active)?active:keys[0],owner:who,timezone:zone(),updatedAt:Date.now()}}}));
  collectedAt=Date.now();
 })().finally(()=>{collecting=null;});return collecting;
}
async function state(){const r=await db.read(['config','runtime','poolKeys','history']);const keys=r.poolKeys||[];const p=await db.read(keys.map(k=>'pool:'+k));return {config:C.config(r.config),runtime:r.runtime||{},pools:keys.map(k=>p['pool:'+k]).filter(Boolean),history:(r.history||[]).filter(x=>x.owner===owner())};}
async function ensureWorker(){
 if(!isSecureContext||!/^https?:$/.test(location.protocol))throw new Error('H\u00e3y m\u1edf app t\u1eeb trang HTTPS tr\u00ean GitHub, kh\u00f4ng m\u1edf file HTML b\u1eb1ng nh\u1ea5p \u0111\u00fap.');
 if(!('serviceWorker'in navigator))throw new Error('Tr\u00ecnh duy\u1ec7t ch\u01b0a h\u1ed7 tr\u1ee3 th\u00f4ng b\u00e1o n\u1ec1n.');
 if(registration?.active)return registration;if(registering)return registering;
 registering=(async()=>{
  const r=await navigator.serviceWorker.register(new URL('sw.js',ASSETS).href,{scope:ASSETS.href,updateViaCache:'none'});
  if(!r.active)await new Promise((resolve,reject)=>{const w=r.installing||r.waiting;if(!w){reject(new Error('Worker ch\u01b0a s\u1eb5n s\u00e0ng.'));return;}const timer=setTimeout(()=>reject(new Error('Kh\u00f4ng kh\u1edfi \u0111\u1ed9ng \u0111\u01b0\u1ee3c th\u00f4ng b\u00e1o. Ki\u1ec3m tra \u0111\u00e3 t\u1ea3i c\u1ea3 th\u01b0 m\u1ee5c albert-notify l\u00ean GitHub.')),12000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(timer);resolve();}if(w.state==='redundant'){clearTimeout(timer);reject(new Error('Worker kh\u00f4ng h\u1ee3p l\u1ec7.'));}});});
  registration=r;return r;
 })().finally(()=>{registering=null;});return registering;
}
async function rpc(action,extra={}){const r=await ensureWorker();return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('Th\u00f4ng b\u00e1o ch\u01b0a ph\u1ea3n h\u1ed3i. Th\u1eed t\u1ea3i l\u1ea1i trang.')),15000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};r.active.postMessage({type:'ALBERT_REMINDER_'+action,...extra},[channel.port2]);});}
function requestPermission(){
 if(permission()==='unsupported')return Promise.reject(new Error('Tr\u00ecnh duy\u1ec7t n\u00e0y ch\u01b0a h\u1ed7 tr\u1ee3 th\u00f4ng b\u00e1o. Tr\u00ean iPhone, th\u00eam app v\u00e0o M\u00e0n h\u00ecnh ch\u00ednh r\u1ed3i m\u1edf t\u1eeb bi\u1ec3u t\u01b0\u1ee3ng.'));
 if(permission()==='denied')return Promise.reject(new Error('Th\u00f4ng b\u00e1o \u0111ang b\u1ecb ch\u1eb7n. M\u1edf quy\u1ec1n c\u1ee7a trang c\u1ea1nh thanh \u0111\u1ecba ch\u1ec9, \u0111\u1eb7t Th\u00f4ng b\u00e1o = Cho ph\u00e9p, r\u1ed3i t\u1ea3i l\u1ea1i.'));
 if(permission()==='granted')return Promise.resolve('granted');
 // This call must be directly inside the user's click, before any storage/network awaits.
 return Notification.requestPermission();
}
function remoteURL(){const base=window.HSK_SUPABASE_URL;if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(base||''))throw new Error('Ch\u01b0a c\u1ea5u h\u00ecnh Supabase c\u1ee7a app.');return base.replace(/\/$/,'')+'/functions/v1/hsk-web-push';}
async function remote(action,body={}){
 const sb=window.hskSupabase;if(!sb)throw new Error('C\u1ea7n \u0111\u0103ng nh\u1eadp \u0111\u1ec3 b\u1eadt nh\u1eafc khi \u0111\u00f3ng tab.');
 const {data,error}=await sb.auth.getSession();if(error||!data?.session?.access_token)throw new Error('H\u00e3y \u0111\u0103ng nh\u1eadp tr\u01b0\u1edbc khi k\u1ebft n\u1ed1i Web Push.');
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),16000);
 try{const r=await fetch(remoteURL(),{method:'POST',headers:{'Content-Type':'application/json','apikey':window.HSK_SUPABASE_KEY||'','Authorization':'Bearer '+data.session.access_token},body:JSON.stringify({action,...body}),signal:ctl.signal,cache:'no-store'});if(!r.ok){if(r.status===404)throw new Error('Ch\u01b0a c\u00e0i m\u00e1y ch\u1ee7 Web Push. Xem th\u01b0 m\u1ee5c CAI_DAT_PUSH_TUY_CHON trong g\u00f3i t\u1ea3i. Ch\u1ebf \u0111\u1ed9 gi\u1eef tab m\u1edf v\u1eabn d\u00f9ng \u0111\u01b0\u1ee3c.');const e=await r.json().catch(()=>({}));throw new Error(e.error||'Web Push: HTTP '+r.status);}return await r.json();}finally{clearTimeout(timer);}
}
function serverSettings(c){return {enabled:c.enabled,interval:c.interval,quiet:c.quiet,timezone:c.timezone};}
async function commit(patch){
 const current=C.config((await db.read(['config'])).config),next=C.config({...current,...patch,owner:owner(),timezone:zone(),updatedAt:Date.now()});
 if(next.mode==='push'&&next.enabled){const p=(await db.read(['pool:'+next.pool]))['pool:'+next.pool];if(!C.pick(p,next))throw new Error(T.empty);const reg=await ensureWorker(),sub=await reg.pushManager.getSubscription();if(!sub)throw new Error('K\u1ebft n\u1ed1i Push \u0111\u00e3 h\u1ebft h\u1ea1n. B\u1ea5m K\u1ebft n\u1ed1i Web Push l\u1ea1i.');await remote('subscribe',{subscription:sub.toJSON(),settings:serverSettings(next)});}
 await db.mutate(['runtime'],r=>({write:{config:next,runtime:{...(r.runtime||{}),nextAt:next.enabled?C.nextDue(Date.now(),next):0,lastError:''}}}));
 await refresh();schedule();return next;
}
async function disable(){
 // Always stop locally, even if the network or worker is unavailable.
 await db.mutate(['config','runtime'],r=>({write:{config:{...C.config(r.config),enabled:false,mode:'local',updatedAt:Date.now()},runtime:{...(r.runtime||{}),nextAt:0}}}));
 try{const reg=await ensureWorker(),sub=await reg.pushManager?.getSubscription();if(sub){try{await remote('unsubscribe',{endpoint:sub.endpoint});}catch(_){}await sub.unsubscribe();}await rpc('STOP');}catch(_){}
 await refresh();schedule();
}
function change(patch,needsPermission=false){
 if(busy)return;const permissionPromise=needsPermission?requestPermission():Promise.resolve('granted');
 run(async()=>{const p=await permissionPromise;if(p!=='granted')throw new Error('B\u1ea1n ch\u01b0a cho ph\u00e9p th\u00f4ng b\u00e1o.');if(needsPermission)await ensureWorker();await commit(patch);});
}
function run(fn){if(busy)return;busy=true;fn().catch(e=>notice(String(e.message||e))).finally(()=>{busy=false;});}
function sendTest(){if(busy)return;const requested=requestPermission();run(async()=>{if(await requested!=='granted')throw new Error('B\u1ea1n ch\u01b0a cho ph\u00e9p th\u00f4ng b\u00e1o.');await collect(true);const r=await rpc('TEST');if(!r.ok)throw new Error(r.code==='EMPTY'?T.empty:(r.message||r.code));await refresh();notice('\u0110\u00e3 chuy\u1ec3n th\u00f4ng b\u00e1o cho tr\u00ecnh duy\u1ec7t. N\u1ebfu ch\u01b0a th\u1ea5y, ki\u1ec3m tra Th\u00f4ng b\u00e1o / Kh\u00f4ng l\u00e0m phi\u1ec1n c\u1ee7a Windows.');});}
function pushConnect(){if(busy)return;const requested=requestPermission();run(async()=>{
 if(await requested!=='granted')throw new Error('B\u1ea1n ch\u01b0a cho ph\u00e9p th\u00f4ng b\u00e1o.');await collect(true);
 const cfg=C.config((await db.read(['config'])).config),info=await remote('info');if(!info.publicKey)throw new Error('M\u00e1y ch\u1ee7 ch\u01b0a c\u00f3 kh\u00f3a VAPID.');
 const reg=await ensureWorker();if(!reg.pushManager)throw new Error('Tr\u00ecnh duy\u1ec7t ch\u01b0a h\u1ed7 tr\u1ee3 Web Push.');
 let sub=await reg.pushManager.getSubscription();const raw=atob(info.publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-info.publicKey.length%4)%4)),key=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(sub?.options?.applicationServerKey){const old=new Uint8Array(sub.options.applicationServerKey);if(old.length!==key.length||old.some((x,i)=>x!==key[i])){await sub.unsubscribe();sub=null;}}
 let made=false;try{if(!sub){sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});made=true;}
 const next=C.config({...cfg,mode:'push',enabled:true,owner:owner(),timezone:zone(),updatedAt:Date.now()});
 const pool=(await db.read(['pool:'+next.pool]))['pool:'+next.pool];if(!C.pick(pool,next))throw new Error(T.empty);
 await remote('subscribe',{subscription:sub.toJSON(),settings:serverSettings(next)});
 await db.mutate(['runtime'],r=>({write:{config:next,runtime:{...(r.runtime||{}),nextAt:C.nextDue(Date.now(),next),lastError:''}}}));
 }catch(e){if(made&&sub)await sub.unsubscribe().catch(()=>{});throw e;}
 await refresh();schedule();notice('\u0110\u00e3 k\u1ebft n\u1ed1i Web Push. Ch\u1ecdn G\u1eedi th\u1eed qua m\u00e1y ch\u1ee7 \u0111\u1ec3 ki\u1ec3m tra.');
});}
async function localMode(){const reg=await ensureWorker(),sub=await reg.pushManager?.getSubscription();if(sub){try{await remote('unsubscribe',{endpoint:sub.endpoint});}catch(_){}await sub.unsubscribe();}await commit({mode:'local'});}
async function schedule(){clearTimeout(heartbeat);try{const raw=await db.read(['config']);const s={config:C.config(raw.config)};updateLauncher(s.config);if(s.config.enabled&&s.config.mode==='local'&&permission()==='granted')await rpc('TICK');else if(s.config.enabled&&s.config.mode==='push'&&permission()==='granted')await touchPush();}catch(_){}heartbeat=setTimeout(schedule,30000);}
async function touchPush(){
 const r=(await db.read(['runtime'])).runtime||{};
 if(Date.now()-(r.lastPushTouch||0)<86400000||Date.now()-(r.lastPushTouchTry||0)<300000)return;
 await db.mutate(['runtime'],x=>({write:{runtime:{...(x.runtime||{}),lastPushTouchTry:Date.now()}}}));
 try{const sub=await(await ensureWorker()).pushManager.getSubscription();if(!sub)return;await remote('touch',{endpoint:sub.endpoint});await db.mutate(['runtime'],x=>({write:{runtime:{...(x.runtime||{}),lastPushTouch:Date.now()}}}));}catch(_){}
}
function updateLauncher(cfg){const b=D.getElementById('adw-reminder-launcher');if(b)b.dataset.on=String(cfg.enabled);}
function close(){if(panel?.open)panel.close();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
function shell(title=T.title){
 if(!panel){panel=node('dialog',{id:'albert-reminders','aria-labelledby':'rn-title'});D.body.appendChild(panel);panel.addEventListener('click',e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});panel.addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});}
 panel.innerHTML='<div class="rn-head">'+icon('bell')+'<div><h2 id="rn-title">'+esc(title)+'</h2><small>HSK Albert \u00b7 Windows / tr\u00ecnh duy\u1ec7t</small></div></div><div class="rn-body"></div>';
 const b=button(T.close,close,'close');b.className='rn-close';b.setAttribute('aria-label',T.close);b.querySelector('span:last-child').hidden=true;panel.querySelector('.rn-head').appendChild(b);
 if(!panel.open){lastFocus=D.activeElement;D.querySelector('#adw-modal[open]')?.close();D.getElementById('af-drawer-scrim')?.click();panel.showModal();}
 return panel.querySelector('.rn-body');
}
function section(parent,label,name){const e=node('section',{class:'rn-section'}),h=node('h3');h.innerHTML=icon(name)+esc(label);e.appendChild(h);parent.appendChild(e);return e;}
function note(parent,text,cls='rn-muted'){parent.appendChild(node('p',{class:cls},text));}
function segment(parent,label,opts,selected,onPick,columns){const wrap=node('div',{class:'rn-seg',role:'group','aria-label':label,style:'--cols:'+(columns||opts.length)});for(const [v,t,i]of opts){wrap.appendChild(button(t,()=>onPick(v),i,false,{'aria-pressed':String(v===selected),'data-rn-value':v}));}parent.appendChild(wrap);}
function itemCard(item){const e=node('article',{class:'rn-card'});if(!item){note(e,T.empty);return e;}
 e.innerHTML='<div class="rn-card-kicker">'+icon(item.kind==='grammar'?'grammar':'cards')+esc(item.kind==='grammar'?T.grammar:T.word)+'</div><div class="rn-front" lang="zh-CN">'+esc(item.front)+'</div>'+(item.py?'<p class="rn-py" lang="zh-Latn">'+esc(item.py)+'</p>':'')+'<div class="rn-meaning">'+esc(item.meaning)+'</div>'+(item.formula?'<p class="rn-muted">'+esc(item.formula)+'</p>':'')+(item.example?'<div class="rn-example"><span lang="zh-CN">'+esc(item.example)+'</span>'+(item.examplePy?'<small lang="zh-Latn">'+esc(item.examplePy)+'</small>':'')+(item.exampleVi?'<small>'+esc(item.exampleVi)+'</small>':'')+'</div>':'')+'<div class="rn-source">'+esc(item.courseTitle||courseTitle(item.course))+' \u00b7 B\u00e0i '+item.lesson+'</div>';return e;}
function dateLabel(ms){return ms?new Date(ms).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}):'';}
function render(s){
 viewMode='settings';const active=D.activeElement,focusId=active?.id,focusKey=active?.dataset?.rnValue,focusInterval=active?.dataset?.rnInterval,focusGroup=active?.parentElement?.getAttribute('aria-label');
 const previous=panel?.scrollTop||0,body=shell(),cfg=s.config,pool=s.pools.find(p=>p.key===cfg.pool),left=node('div',{class:'rn-main'}),right=node('aside',{class:'rn-side'});body.append(left,right);
 const ready=permission()==='granted',status=node('div',{class:'rn-status','data-status':cfg.enabled&&ready?'on':'off'});
 let title=cfg.enabled&&ready?'\u0110ang b\u1eadt nh\u1eafc h\u1ecdc':ready?'\u0110\u00e3 c\u00f3 quy\u1ec1n th\u00f4ng b\u00e1o \u00b7 l\u1ecbch \u0111ang t\u1eaft':'Ch\u01b0a b\u1eadt th\u00f4ng b\u00e1o';
 if(permission()==='denied')title='Tr\u00ecnh duy\u1ec7t \u0111ang ch\u1eb7n th\u00f4ng b\u00e1o';
 status.innerHTML='<b>'+icon(cfg.enabled&&ready?'bell':'info')+title+'</b>';
 note(status,cfg.mode==='push'?'Ch\u1ebf \u0111\u1ed9 Web Push: l\u1ecbch g\u1eedi do m\u00e1y ch\u1ee7 x\u1eed l\u00fd.':'Ch\u1ebf \u0111\u1ed9 tr\u1ef1c ti\u1ebfp: gi\u1eef m\u1ed9t tab ho\u1eb7c c\u1eeda s\u1ed5 app \u0111ang ch\u1ea1y.');
 if(cfg.enabled&&s.runtime.nextAt)note(status,'L\u1ea7n nh\u1eafc d\u1ef1 ki\u1ebfn: '+dateLabel(s.runtime.nextAt)+' \u00b7 '+cfg.timezone);
 const actions=node('div',{class:'rn-actions'});actions.appendChild(button(ready?T.test:T.allow,sendTest,'bell',true));if(cfg.enabled)actions.appendChild(button('D\u1eebng nh\u1eafc',()=>run(disable),'stop'));status.appendChild(actions);left.appendChild(status);
 if(!isSecureContext||location.protocol==='file:')note(left,'M\u1edf app b\u1eb1ng \u0111\u1ecba ch\u1ec9 HTTPS tr\u00ean GitHub \u0111\u1ec3 d\u00f9ng th\u00f4ng b\u00e1o.','rn-warning');
 let sec=section(left,T.source,'book');const sel=node('select',{'aria-label':T.source,id:'rn-course'});for(const p of s.pools){const o=node('option',{value:p.key},p.title);o.selected=p.key===cfg.pool;sel.appendChild(o);}sel.onchange=()=>change({pool:sel.value});sec.appendChild(sel);
 if(pool)note(sec,pool.words.length+' t\u1eeb \u00b7 '+pool.grammar.length+' m\u1eabu ng\u1eef ph\u00e1p \u00b7 '+pool.learned.length+' b\u00e0i trong ph\u1ea1m vi \u0111\u00e3 h\u1ecdc.');
 sec=section(left,T.scope,'filter');segment(sec,T.scope,[['learned',T.learned],['all',T.all]],cfg.scope,v=>change({scope:v}));
 note(sec,'B\u00e0i \u0111\u00e3 m\u1edf ho\u1eb7c \u0111\u00e3 \u0111\u00e1nh d\u1ea5u ho\u00e0n th\u00e0nh. Kh\u00f4ng t\u1ef1 coi m\u1ecdi b\u00e0i tr\u01b0\u1edbc b\u00e0i hi\u1ec7n t\u1ea1i l\u00e0 \u0111\u00e3 h\u1ecdc.');
 if(pool){const d=node('details'),summary=node('summary',{},'Ch\u1ecdn th\u00eam b\u00e0i d\u00f9ng \u0111\u1ec3 nh\u1eafc');d.appendChild(summary);const list=node('div',{class:'rn-lesson-list'});for(const l of pool.lessons){const selected=pool.learned.includes(l.id);list.appendChild(button('B\u00e0i '+l.id,()=>run(async()=>{await db.mutate(['pool:'+pool.key],r=>{const p=r['pool:'+pool.key],learned=new Set(p.learned);if(learned.has(l.id))learned.delete(l.id);else learned.add(l.id);return{write:{['pool:'+pool.key]:{...p,learned:[...learned].sort((a,b)=>a-b),excluded:learned.has(l.id)?(p.excluded||[]).filter(x=>x!==l.id):[...new Set([...(p.excluded||[]),l.id])]}}};});await refresh();panel.querySelector('.rn-section details').open=true;}),null,false,{'aria-pressed':String(selected),title:l.title}));}d.appendChild(list);note(d,'L\u1ef1a ch\u1ecdn n\u00e0y ch\u1ec9 \u0111\u1ed5i ph\u1ea1m vi nh\u1eafc, kh\u00f4ng s\u1eeda \u0111i\u1ec3m hay ti\u1ebfn \u0111\u1ed9 b\u00e0i h\u1ecdc.');sec.appendChild(d);}
 sec=section(left,T.kind,'grammar');segment(sec,T.kind,[['word',T.word,'cards'],['grammar',T.grammar,'grammar'],['mix',T.mix,'sync']],cfg.kind,v=>change({kind:v}));
 const counts={word:C.eligible(pool,cfg,'word').length,grammar:C.eligible(pool,cfg,'grammar').length};note(sec,counts.word+' t\u1eeb / '+counts.grammar+' m\u1eabu \u0111ang s\u1eb5n s\u00e0ng trong ph\u1ea1m vi ch\u1ecdn.');
 if(!(cfg.kind==='word'?counts.word:cfg.kind==='grammar'?counts.grammar:counts.word+counts.grammar))note(sec,T.empty,'rn-warning');
 sec=section(left,T.interval,'clock');const every=node('div',{class:'rn-interval',role:'group','aria-label':T.interval});for(const n of [0,...C.INTERVALS]){const label=!n?T.off:n<60?n+T.minute:n<1440?(n/60)+T.hour:T.day;const pressed=cfg.enabled?n===cfg.interval:n===0;every.appendChild(button(label,()=>!n?run(disable):change({interval:n,enabled:true},true),null,false,{'aria-pressed':String(pressed),'data-rn-interval':n}));}sec.appendChild(every);
 sec=section(left,T.quiet,'clock');segment(sec,T.quiet,[['on',T.on],['off',T.off]],cfg.quiet?'on':'off',v=>change({quiet:v==='on'}));
 note(sec,'Theo m\u00fai gi\u1edd thi\u1ebft b\u1ecb: '+cfg.timezone+'. N\u00fat g\u1eedi th\u1eed v\u1eabn ho\u1ea1t \u0111\u1ed9ng trong gi\u1edd y\u00ean l\u1eb7ng.');
 sec=section(left,'C\u00e1ch nh\u1eadn th\u00f4ng b\u00e1o','globe');
 segment(sec,'C\u00e1ch nh\u1eadn',[['local','Gi\u1eef tab m\u1edf'],['push','Khi \u0111\u00f3ng tab']],cfg.mode,v=>v==='local'?run(localMode):pushConnect());
 note(sec,'Gi\u1eef tab m\u1edf: c\u00f3 th\u1ec3 chuy\u1ec3n sang Word, Excel ho\u1eb7c tab kh\u00e1c. Nh\u1eafc c\u00f3 th\u1ec3 tr\u1ec5 n\u1ebfu tab b\u1ecb cho ng\u1ee7; \u0111\u00f3ng h\u1ebft tab/app s\u1ebd d\u1eebng l\u1ecbch.','rn-note');
 const advanced=node('details');advanced.appendChild(node('summary',{},'K\u1ebft n\u1ed1i Web Push \u0111\u1ec3 nh\u1eafc khi \u0111\u00f3ng tab'));
 note(advanced,'C\u1ea7n c\u00e0i h\u00e0m hsk-web-push v\u00e0 l\u1ecbch Cron tr\u00ean Supabase m\u1ed9t l\u1ea7n. Ch\u01b0a c\u00e0i m\u00e1y ch\u1ee7 th\u00ec ch\u1ebf \u0111\u1ed9 n\u00e0y ch\u01b0a ho\u1ea1t \u0111\u1ed9ng.');
 note(advanced,'Khi k\u1ebft n\u1ed1i, m\u00e1y ch\u1ee7 nh\u1eadn m\u00e3 t\u00e0i kho\u1ea3n, \u0111\u1ecba ch\u1ec9 nh\u1eadn Push v\u00e0 l\u1ecbch nh\u1eafc. T\u1eeb v\u1ef1ng, ng\u1eef ph\u00e1p v\u00e0 c\u00e2u tr\u1ea3 l\u1eddi kh\u00f4ng \u0111\u01b0\u1ee3c g\u1eedi l\u00ean m\u00e1y ch\u1ee7 nh\u1eafc.');
 const advActions=node('div',{class:'rn-actions'});advActions.appendChild(button(cfg.mode==='push'?'K\u1ebft n\u1ed1i l\u1ea1i Web Push':'K\u1ebft n\u1ed1i Web Push',pushConnect,'cloud'));
 if(cfg.mode==='push')advActions.appendChild(button('G\u1eedi th\u1eed qua m\u00e1y ch\u1ee7',()=>run(async()=>{const sub=await(await ensureWorker()).pushManager.getSubscription();if(!sub)throw new Error('Ch\u01b0a c\u00f3 \u0111\u0103ng k\u00fd Push.');await remote('test',{endpoint:sub.endpoint});notice('M\u00e1y ch\u1ee7 \u0111\u00e3 g\u1eedi. Ki\u1ec3m tra th\u00f4ng b\u00e1o tr\u00ean thi\u1ebft b\u1ecb.');}),'send'));
 advanced.appendChild(advActions);note(advanced,'\u0110\u00f3ng ho\u00e0n to\u00e0n tr\u00ecnh duy\u1ec7t, m\u1ea5t m\u1ea1ng, m\u00e1y ng\u1ee7/t\u1eaft ho\u1eb7c Kh\u00f4ng l\u00e0m phi\u1ec1n c\u00f3 th\u1ec3 l\u00e0m th\u00f4ng b\u00e1o tr\u1ec5/kh\u00f4ng hi\u1ec7n. Web kh\u00f4ng ph\u1ea3i b\u00e1o th\u1ee9c h\u1eb9n gi\u1edd ch\u00ednh x\u00e1c.');note(advanced,'M\u1edf l\u1ea1i app \u00edt nh\u1ea5t m\u1ed9t l\u1ea7n trong 30 ng\u00e0y \u0111\u1ec3 gia h\u1ea1n nh\u1eafc.');sec.appendChild(advanced);
 const er=node('p',{class:'rn-inline-error',role:'status','aria-live':'polite'});left.appendChild(er);
 if(s.runtime.lastError)er.textContent=s.runtime.lastError;
 sec=section(right,T.preview,'cards');const chosen=C.pick(pool,cfg,s.runtime),it=chosen?.item;sec.appendChild(itemCard(it));const pa=node('div',{class:'rn-actions'});
 if(it){pa.appendChild(button(T.next,()=>run(async()=>{await db.mutate(['runtime'],r=>({write:{runtime:{...(r.runtime||{}),cursors:chosen.runtime.cursors,lastKind:chosen.runtime.lastKind}}}));await refresh();}),'sync'));pa.appendChild(button('Nghe',()=>speak(it),'speaker'));}sec.appendChild(pa);
 note(sec,'Th\u1ebb trong app, kh\u00f4ng ph\u1ea3i widget ghim tr\u00ean Desktop. Th\u00f4ng b\u00e1o Windows ch\u1ec9 hi\u1ec7n b\u1ea3n ng\u1eafn; b\u1ea5m \u0111\u1ec3 xem \u0111\u1ea7y \u0111\u1ee7.');
 sec=section(right,T.history,'clock');const hist=node('div',{class:'rn-history'});if(!s.history.length)note(hist,'Ch\u01b0a g\u1eedi th\u00f4ng b\u00e1o n\u00e0o.');for(const h of s.history.slice(0,8))hist.appendChild(button(h.front+' \u00b7 '+dateLabel(h.createdAt),()=>showCard(h.id),h.kind==='grammar'?'grammar':'cards'));sec.appendChild(hist);
 sec=section(right,'C\u00e0i app web','download');sec.appendChild(button('C\u00e0i HSK Albert',install,'download'));note(sec,'Kh\u00f4ng c\u1ea7n EXE, CMD hay PowerShell. C\u00e0i app web kh\u00f4ng t\u1ef1 b\u1eadt l\u1ecbch khi \u0111\u00f3ng tab.');
 const help=node('details');help.appendChild(node('summary',{},'Kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c th\u00f4ng b\u00e1o?'));note(help,'1. M\u1edf HTTPS, kh\u00f4ng m\u1edf file t\u1eeb m\u00e1y.\n2. Cho ph\u00e9p Th\u00f4ng b\u00e1o trong quy\u1ec1n c\u1ee7a trang.\n3. Windows: Settings > System > Notifications, b\u1eadt th\u00f4ng b\u00e1o cho Edge/Chrome/HSK Albert v\u00e0 ki\u1ec3m tra Do not disturb.\n4. Ch\u1ecdn gi\u00e1o tr\u00ecnh/ph\u1ea1m vi c\u00f3 d\u1eef li\u1ec7u.\n5. Ki\u1ec3m tra gi\u1edd y\u00ean l\u1eb7ng v\u00e0 chu k\u1ef3 nh\u1eafc.','rn-note');sec.appendChild(help);
 body.appendChild(node('div',{class:'rn-footer'},'T\u00f9y ch\u1ecdn l\u01b0u ri\u00eang tr\u00ean tr\u00ecnh duy\u1ec7t n\u00e0y; kh\u00f4ng t\u1ef1 sao ch\u00e9p t\u1eeb APK. \u0110\u0103ng xu\u1ea5t s\u1ebd d\u1eebng nh\u1eafc. Ch\u1ec9 d\u00f9ng n\u1ed9i dung c\u00f3 s\u1eb5n trong app, kh\u00f4ng t\u1ef1 sinh ng\u1eef ph\u00e1p hay b\u1ea3n d\u1ecbch.'));
 panel.scrollTop=previous;updateLauncher(cfg);let restore=focusId?panel.querySelector('#'+CSS.escape(focusId)):null;if(!restore&&focusInterval!=null)restore=panel.querySelector('[data-rn-interval="'+CSS.escape(focusInterval)+'"]');if(!restore&&focusKey!=null&&focusGroup)restore=panel.querySelector('[aria-label="'+CSS.escape(focusGroup)+'"] [data-rn-value="'+CSS.escape(focusKey)+'"]');restore?.focus({preventScroll:true});
}
async function refresh(){if(panel?.open&&viewMode==='settings')render(await state());}
async function open(){try{await reconcileOwner();await collect(true);render(await state());ensureWorker().catch(e=>notice(e.message));}catch(e){const b=shell();note(b,String(e.message||e),'rn-warning');}}
function speak(item){const text=item.kind==='grammar'?(item.example||item.front):item.front;if(window.speechSynthesis){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.onerror=()=>notice('Ch\u01b0a ph\u00e1t \u0111\u01b0\u1ee3c gi\u1ecdng \u0111\u1ecdc.');speechSynthesis.speak(u);}}
async function showCard(id){
 if(gateBlocking()){pendingCard=id;return;}
 const s=await state(),it=s.history.find(x=>x.id===id);if(!it){await open();notice('M\u1ee5c n\u00e0y kh\u00f4ng c\u00f2n trong l\u1ecbch s\u1eed tr\u00ean thi\u1ebft b\u1ecb.');return;}
 viewMode='card';const b=shell(it.kind==='grammar'?T.grammar:T.word),wrap=node('div',{class:'rn-full'});wrap.appendChild(itemCard(it));const a=node('div',{class:'rn-actions'});a.append(button('Nghe',()=>speak(it),'speaker'),button(T.openLesson,()=>goLesson(it),'openBook',true),button('C\u00e0i \u0111\u1eb7t nh\u1eafc',open,'settings'));wrap.appendChild(a);b.appendChild(wrap);
}
function goLesson(it){close();if(it.course.startsWith('3.0')){const level=it.course.endsWith('hsk3')?'3':'2';window.AlbertHSK30Courses?.choose?.(level);setTimeout(()=>{const a=level==='3'?window.AlbertHSK303:window.AlbertHSK30;a?.openLesson?.(it.lesson);setTimeout(()=>a?.selectSection?.(it.kind==='grammar'?'grammar':'vocab'),100);},120);}else{D.querySelector('[data-hsk-edition="2.0"]')?.click();const course=it.course.split(':')[1];if(window.CURRENT_COURSE!==course){const s=D.getElementById('course-selector');if(s){s.value=course;s.dispatchEvent(new Event('change',{bubbles:true}));}}setTimeout(()=>{window.showPage?.('lessons');window.loadLesson?.(it.lesson);setTimeout(()=>{const selector=it.kind==='grammar'?'grammar':'vocab';const tab=[...D.querySelectorAll('#lesson-tabs button,#lesson-tabs .tab')].find(x=>(x.dataset.tab||x.getAttribute('onclick')||'').includes(selector));tab?.click();},180);},180);}}
function install(){if(installEvent){const e=installEvent;installEvent=null;e.prompt();return;}notice('Edge/Chrome: m\u1edf menu tr\u00ecnh duy\u1ec7t > C\u00e0i \u0111\u1eb7t \u1ee9ng d\u1ee5ng / Install app. iPhone: Chia s\u1ebb > Th\u00eam v\u00e0o M\u00e0n h\u00ecnh ch\u00ednh.');}
async function reconcileOwner(){watchAuth();const who=owner();if(who===seenOwner)return;const s=await db.read(['config','poolKeys']),cfg=C.config(s.config);if(cfg.owner!==who){
 if(cfg.enabled){try{await rpc('STOP');}catch(_){} }
 await db.mutate(['config','runtime','history'],()=>({write:{config:{...cfg,enabled:false,mode:'local',owner:who,updatedAt:Date.now()},runtime:{nextAt:0},history:[]}}));
 for(const key of s.poolKeys||[])await db.mutate(['pool:'+key],r=>{const p=r['pool:'+key];return p?{write:{['pool:'+key]:{...p,owner:who,learned:[],excluded:[]}}}:{};});
 fingerprints.clear();collectedAt=0;
 }seenOwner=who;}
function addLauncher(){const foot=D.getElementById('adw-side-foot');if(foot&&!D.getElementById('adw-reminder-launcher')){const b=button(T.shortTitle,open,'bell',false,{id:'adw-reminder-launcher',title:T.title,'aria-haspopup':'dialog','aria-label':T.title});foot.insertBefore(b,foot.firstChild);} }
async function init(){
 addLauncher();try{await reconcileOwner();await collect(true);const s=await state();if(s.config.enabled){await ensureWorker();schedule();}updateLauncher(s.config);}catch(e){console.warn('Albert reminders:',e.message);}
 if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(!e.source?.scriptURL?.startsWith(ASSETS.href))return;const m=e.data||{};if(m.type==='ALBERT_REMINDER_OPEN')showCard(m.id).catch(()=>{});if(m.type==='ALBERT_REMINDER_CHANGED')refresh().catch(()=>{});});
 const queueCollect=()=>{clearTimeout(collectTimer);collectTimer=setTimeout(()=>collect(true).catch(()=>{}),1200);};
 D.addEventListener('click',e=>{if(!e.target.closest?.('#albert-reminders'))queueCollect();},true);
 D.addEventListener('change',e=>{if(!e.target.closest?.('#albert-reminders'))queueCollect();},true);
 window.addEventListener('focus',()=>{reconcileOwner().then(()=>refresh()).catch(()=>{});schedule();});
 D.addEventListener('visibilitychange',()=>{if(!D.hidden){collect().catch(()=>{});schedule();}});
 watchAuth();
 const u=new URL(location.href);if(u.searchParams.has('albertNotice')){pendingCard=u.searchParams.get('albertNotice');u.searchParams.delete('albertNotice');try{history.replaceState(history.state,'',u.href);}catch(_){} }
 if(u.searchParams.has('albertReminders'))open();
 setInterval(()=>{addLauncher();reconcileOwner().catch(()=>{});if(pendingCard&&!gateBlocking()){const id=pendingCard;pendingCard=null;showCard(id).catch(()=>{});}},2500);
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
window.AlbertReminders=Object.freeze({version:C.VERSION,open,close,state,collect,showCard,ensureWorker,test:sendTest,core:C,assetURL:ASSETS.href});
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',()=>setTimeout(init,1200));else setTimeout(init,1200);
})();
