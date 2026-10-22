
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
function readJSON(key,fallback={}){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(_){return fallback;}}
function exampleList(sources){const out=[],seen=new Set();for(const source of sources){for(const x of source||[]){const e=typeof x==='string'?{zh:plain(x)}:{zh:plain(x?.zh||x?.example),vi:plain(x?.vi||x?.translation),py:plain(x?.py||x?.pinyin)};if(!e.zh)continue;const k=e.zh+'|'+(e.vi||'');if(seen.has(k))continue;seen.add(k);out.push(e);}}return out;}
function displayLesson(l){return Number(l.disp)||Number(l.lessonDisplay)||Number(l.id);}
function lessonTitle(l){return plain(l.vi||l.titleVi||l.zh||l.titleZh||l.title||'');}
function word(w,l){
 if(!w?.zh||!w.vi)return null;
 const examples=exampleList([w.examples,w.example?[w.example]:[]]),e=examples[0]||{};
 return {kind:'word',front:plain(w.zh),py:plain(w.py||w.pinyin||'').replace(/\u0261/g,'g'),meaning:plain(w.vi),lesson:Number(l.id),lessonDisplay:displayLesson(l),lessonTitle:lessonTitle(l),example:e.zh||'',exampleVi:e.vi||'',examplePy:e.py||'',examples};
}
function grammar(g,l,guide){
 if(!g||typeof g==='string')return null;
 const examples=exampleList([guide?.examples,g.examples,...(g.senses||[]).map(s=>s.examples)]),ex=examples[0]||{};
 const front=plain(g.pattern||g.title||g.full||''),meaning=plain(guide?.meaning||g.explainVi||g.explanation||g.note||g.vi||'');
 if(!front||!meaning)return null;
 const fromTitle=/[\uff08(]([a-z\u00c0-\u024f\u01cd-\u01dc\s]+)[)\uff09]/i.exec(g.full||'');
 return {kind:'grammar',front,py:plain(guide?.titlePy||g.py||fromTitle?.[1]||''),meaning,lesson:Number(l.id),lessonDisplay:displayLesson(l),lessonTitle:lessonTitle(l),formula:plain(g.formula||(guide?.formulas||[]).join('\n')),example:ex.zh||'',exampleVi:ex.vi||'',examplePy:ex.py||'',examples};
}
function getSources(){
 const s=window.HSKDictionaryLessonSources||{},out=[];
 if(Array.isArray(s.hsk1))out.push(['2.0:hsk1',s.hsk1]);
 if(Array.isArray(window.HSK3_LESSONS))out.push(['2.0:hsk3',window.HSK3_LESSONS]);
 if(Array.isArray(window.HSK4_STUDY_DATA?.lessons))out.push(['2.0:hsk4',window.HSK4_STUDY_DATA.lessons]);
 if(Array.isArray(s.hsk5))out.push(['2.0:hsk5',s.hsk5]);
 for(const [key,a]of [['3.0:hsk2',window.AlbertHSK30],['3.0:hsk3',window.AlbertHSK303]]){const list=a?.getSourceData?.();if(Array.isArray(list))out.push([key,list,a.getGrammarGuides?.()||{}]);}
 return out;
}
function storedLearned(key,lessons,who){
 const valid=new Set(lessons.map(l=>Number(l.id))),out=new Set();
 const add=n=>{n=Number(n);if(valid.has(n))out.add(n);};
 if(key.startsWith('2.0:')){
  const course=key.split(':')[1],saved=readJSON(course==='hsk4'?'hsk_albert_course_state_v4_hsk4':'hsk_albert_course_state_v3_'+course);
  for(const n of saved.completedLessons||[])add(n);
  if(course==='hsk5')for(const n of readJSON('hsk5_app_v2').completedLessons||[])add(n);
  // The current in-memory course may have just changed; only read its own state.
  if(currentCourse()===key)try{if(typeof STATE!=='undefined')for(const n of STATE.completedLessons||[])add(n);}catch(_){}
 }else{
  const prefix=key==='3.0:hsk3'?'albert_hsk303_hsk3_v1__':'albert_hsk30_hsk2_v1__';
  const saved=readJSON(prefix+who);
  for(const [n,record]of Object.entries(saved.lessons||{})){
   const values=record.values||{};
   const studied=Object.entries(values).some(([k,r])=>{
    const value=r?.value;
    if(/^(done-|known-|listen-)/.test(k))return value===true;
    if(/^(goal-|grade:|assessment:|wbcheck:)/.test(k))return false;
    return typeof value==='string'&&value.trim().length>0;
   });
   if(studied)add(n);
  }
 }
 return [...out];
}
function buildCatalog(key,lessons,guides){
 const words=[],grams=[],lessonList=[],missing=[];
 for(const l of lessons){if(!(Number(l.id)>0))continue;
  const stat={id:Number(l.id),display:displayLesson(l),title:lessonTitle(l),words:0,grammar:0};lessonList.push(stat);
  for(const w of l.vocab||[]){const it=word(w,l);if(it){words.push(it);stat.words++;}else missing.push({lesson:stat.id,kind:'word',front:plain(w?.zh),reason:'missing-front-or-meaning'});}
  const gs=key==='2.0:hsk3'&&window.HSK3_OFFICIAL_GRAMMAR?.[l.id]?.points|| (l.grammarDetail?.length?l.grammarDetail:l.grammar||[]);
  for(let i=0;i<gs.length;i++){const g=gs[i],it=grammar(g,l,guides?.[l.id+'-'+(g.id||i+1)]);if(it){grams.push(it);stat.grammar++;}else missing.push({lesson:stat.id,kind:'grammar',front:plain(typeof g==='string'?g:g?.pattern||g?.title),reason:'missing-front-or-meaning'});}
 }
 lessonList.sort((a,b)=>a.display-b.display||a.id-b.id);
 return {key,title:courseTitle(key),words,grammar:grams,lessons:lessonList,missing,catalogVersion:2};
}
async function collect(force=false){
 if(collecting){await collecting;if(!force)return;}
 if(!force&&Date.now()-collectedAt<12000)return;
 const who=owner();
 collecting=(async()=>{
  const active=currentCourse(),opened=currentLesson(),raw=await db.read(['config','poolKeys']),cfg=C.config(raw.config);
  const keys=[];
  for(const [key,lessons,guides]of getSources()){
   if(who!==owner())return;
   const canonical=buildCatalog(key,lessons,guides),valid=new Set(canonical.lessons.map(l=>l.id)),automatic=storedLearned(key,lessons,who);
   const sig=JSON.stringify(canonical);keys.push(key);
   await db.mutate(['pool:'+key],r=>{
    if(who!==owner())return {};
    const old=r['pool:'+key],owned=old?.owner===who;
    const included=owned?(old.included||[]):[],excluded=owned?(old.excluded||[]):[];
    // Preserve old explicit choices/opened lessons. Never infer "all before current".
    const visited=new Set(owned?(old.visited||old.learned||[]):[]);
    if(key===active&&opened&&!gateBlocking())visited.add(opened);
    const learned=new Set([...visited,...included,...automatic].map(Number).filter(n=>valid.has(n)&&!excluded.includes(n)));
    const list=[...learned].sort((a,b)=>a-b),vis=[...visited].filter(n=>valid.has(Number(n))).sort((a,b)=>a-b);
    if(fingerprints.get(key)===sig&&owned&&JSON.stringify(old.learned)===JSON.stringify(list)&&JSON.stringify(old.visited)===JSON.stringify(vis))return {};
    return {write:{['pool:'+key]:{...canonical,learned:list,visited:vis,included,excluded,owner:who}},result:true};
   });
   fingerprints.set(key,sig);
  }
  if(who!==owner())return;
  await db.set('poolKeys',keys);
  if(!cfg.pool&&keys.length)await db.mutate(['config'],r=>({write:{config:{...C.config(r.config),pool:keys.includes(active)?active:keys[0],owner:who,timezone:zone(),updatedAt:Date.now()}}}));
  await db.mutate(['runtime','history'],r=>{
   const rt=r.runtime||{};if(rt.rotationVersion===2)return {};
   const recentItems=(r.history||[]).filter(x=>x.owner===who);
   return {write:{runtime:{...rt,rotationVersion:2,cycles:rt.cycles||{},recentItems}}};
  });
  collectedAt=Date.now();
 })().finally(()=>{collecting=null;});return collecting;
}
async function toggleLearned(poolKey,lesson){
 await db.mutate(['pool:'+poolKey],r=>{
  const p=r['pool:'+poolKey];if(!p||p.owner!==owner())return {};
  const learned=new Set(p.learned||[]),included=new Set(p.included||[]),excluded=new Set(p.excluded||[]);
  if(learned.has(lesson)){learned.delete(lesson);included.delete(lesson);excluded.add(lesson);}
  else{learned.add(lesson);included.add(lesson);excluded.delete(lesson);}
  return {write:{['pool:'+poolKey]:{...p,learned:[...learned].sort((a,b)=>a-b),included:[...included],excluded:[...excluded]}}};
 });
}
async function state(){const r=await db.read(['config','runtime','previewRuntime','poolKeys','history']);const keys=r.poolKeys||[];const p=await db.read(keys.map(k=>'pool:'+k));return {config:C.config(r.config),runtime:r.runtime||{},previewRuntime:r.previewRuntime||{},pools:keys.map(k=>p['pool:'+k]).filter(Boolean),history:(r.history||[]).filter(x=>x.owner===owner())};}
let workerProblem='',workerRetryAt=0,lastProbe=null,diagnosticBusy=false;
function timeout(p,ms,message){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);Promise.resolve(p).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
async function ensureWorker(force=false){
 if(!isSecureContext||!/^https?:$/.test(location.protocol))throw new Error('M\u1edf app b\u1eb1ng \u0111\u1ecba ch\u1ec9 HTTPS, kh\u00f4ng m\u1edf file HTML tr\u1ef1c ti\u1ebfp t\u1eeb m\u00e1y.');
 if(!('serviceWorker'in navigator))throw new Error('Tr\u00ecnh duy\u1ec7t kh\u00f4ng h\u1ed7 tr\u1ee3 b\u1ed9 g\u1eedi th\u00f4ng b\u00e1o n\u1ec1n.');
 if(force){registration=null;workerRetryAt=0;}
 if(registration?.active)return registration;if(registering)return registering;
 if(Date.now()<workerRetryAt)throw new Error(workerProblem);
 registering=(async()=>{
  try{
   const url=new URL('sw.js?v=1.2.0',ASSETS).href;
   const r=await timeout(navigator.serviceWorker.register(url,{scope:ASSETS.href,updateViaCache:'none'}),12000,'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c albert-notify/sw.js. Ki\u1ec3m tra th\u01b0 m\u1ee5c \u0111\u00e3 \u0111\u01b0\u1ee3c \u0111\u0103ng l\u00ean GitHub.');
   await new Promise((resolve,reject)=>{
    let done=false;const watched=new Set();let timer=0;
    const finish=err=>{if(done)return;done=true;clearTimeout(timer);r.removeEventListener('updatefound',inspect);for(const w of watched)w.removeEventListener('statechange',inspect);err?reject(err):resolve();};
    function inspect(){
     if(r.active?.state==='activated'&&r.active.scriptURL===url){finish();return;}
     for(const w of [r.installing,r.waiting,r.active])if(w&&!watched.has(w)){watched.add(w);w.addEventListener('statechange',inspect);}
     if(!r.installing&&!r.waiting&&!r.active)finish(new Error('B\u1ed9 g\u1eedi th\u00f4ng b\u00e1o kh\u00f4ng h\u1ee3p l\u1ec7.'));
    }
    timer=setTimeout(()=>finish(new Error('Ch\u01b0a k\u00edch ho\u1ea1t \u0111\u01b0\u1ee3c b\u1ed9 g\u1eedi m\u1edbi. H\u00e3y c\u1eadp nh\u1eadt to\u00e0n b\u1ed9 th\u01b0 m\u1ee5c albert-notify.')),12000);
    r.addEventListener('updatefound',inspect);inspect();
   });
   await new Promise((resolve,reject)=>{
    const channel=new MessageChannel();let done=false;
    const finish=err=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();err?reject(err):resolve();};
    const timer=setTimeout(()=>finish(new Error('B\u1ed9 nh\u1eafc h\u1ecdc ch\u01b0a ph\u1ea3n h\u1ed3i phi\u00ean b\u1ea3n. C\u1eadp nh\u1eadt th\u01b0 m\u1ee5c albert-notify.')),6000);
    channel.port1.onmessage=e=>finish(e.data?.ok&&e.data.version===C.VERSION?null:new Error('B\u1ed9 nh\u1eafc h\u1ecdc n\u1ec1n c\u00f2n c\u0169. C\u1eadp nh\u1eadt c\u1ea3 index.html v\u00e0 th\u01b0 m\u1ee5c albert-notify l\u00ean c\u00f9ng phi\u00ean b\u1ea3n '+C.VERSION+'.'));
    try{r.active.postMessage({type:'ALBERT_REMINDER_PING'},[channel.port2]);}catch(e){finish(e);}
   });
   registration=r;workerProblem='';workerRetryAt=0;return r;
  }catch(e){workerProblem=String(e.message||e);workerRetryAt=Date.now()+60000;throw e;}
 })().finally(()=>{registering=null;});return registering;
}
function showPageNotification(title,options){
 if(permission()!=='granted')return Promise.reject(new Error('Ch\u01b0a c\u00f3 quy\u1ec1n th\u00f4ng b\u00e1o.'));
 return new Promise((resolve,reject)=>{
  let n,settled=false;
  const timer=setTimeout(()=>{if(settled)return;settled=true;reject(new Error('Tr\u00ecnh duy\u1ec7t ch\u01b0a x\u00e1c nh\u1eadn hi\u1ec3n th\u1ecb. Ki\u1ec3m tra quy\u1ec1n trang v\u00e0 th\u00f4ng b\u00e1o Windows.'));},7000);
  try{const opts={...options};delete opts.actions;n=new Notification(title,opts);}catch(e){clearTimeout(timer);reject(new Error('Kh\u00f4ng g\u1eedi \u0111\u01b0\u1ee3c th\u00f4ng b\u00e1o tr\u1ef1c ti\u1ebfp. C\u1ea7n \u0111\u1ee7 albert-notify/sw.js v\u00e0 core.js. '+String(e.message||e)));return;}
  n.onshow=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve({ok:true,delivery:'page',browserAccepted:true});};
  n.onerror=()=>{if(settled)return;settled=true;clearTimeout(timer);reject(new Error('Tr\u00ecnh duy\u1ec7t b\u00e1o l\u1ed7i hi\u1ec3n th\u1ecb th\u00f4ng b\u00e1o. Ki\u1ec3m tra quy\u1ec1n trang / Windows.'));};
  n.onclick=()=>{window.focus();n.close();if(options.data?.albertProbe)open();else if(options.data?.id)showCard(options.data.id);};
 });
}
async function pageDeliver(action,extra={}){
 if(action==='PROBE')return showPageNotification('HSK Albert \u00b7 Ki\u1ec3m tra th\u00f4ng b\u00e1o',{
  body:'Th\u00f4ng b\u00e1o th\u1eed t\u1eeb trang h\u1ecdc HSK. B\u1ea5m \u0111\u1ec3 m\u1edf Nh\u1eafc h\u1ecdc.',
  tag:'albert-probe:'+Date.now(),requireInteraction:true,icon:D.querySelector('link[rel=icon]')?.href,data:{albertProbe:1}});
 return C.withDeliveryLease(db,async()=>{
  const now=Date.now(),s=await state(),cfg=s.config,r=s.runtime,manual=action==='TEST'||action==='NEXT';
  if(!manual&&!cfg.enabled)return {ok:false,code:'OFF'};
  if(!manual&&cfg.mode!=='local')return {ok:false,code:'OTHER_MODE'};
  if(!manual&&C.quiet(now,cfg))return {ok:false,code:'QUIET'};
  if(!manual&&(!r.nextAt||now<r.nextAt))return {ok:false,code:'NOT_DUE'};
  if(permission()!=='granted')return {ok:false,code:'PERMISSION'};
  const choice=C.pick(s.pools.find(p=>p.key===cfg.pool),cfg,r,extra.kind);if(!choice)return {ok:false,code:'EMPTY'};
  const id=crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),item={...choice.item,id,owner:cfg.owner,createdAt:now,reason:manual?'test':'local'};
  const latest=C.config((await db.read(['config'])).config);
  if(latest.owner!==cfg.owner||latest.updatedAt!==cfg.updatedAt||(!manual&&!latest.enabled))return {ok:false,code:'CHANGED'};
  const msg=C.notification(item);const result=await showPageNotification(msg.title,{body:msg.body,tag:'albert-study:'+new URL(BASE).pathname,renotify:true,requireInteraction:manual,icon:D.querySelector('link[rel=icon]')?.href,lang:'vi',data:{id}});
  await db.mutate(['config','runtime','history'],rows=>{
   if(C.config(rows.config).owner!==cfg.owner)return {};
   const next={...C.commitPick(rows.runtime||{},choice),lastSentAt:now,lastError:'',delivery:'page'};
   if(!manual)next.nextAt=C.nextDue(now,cfg);
   return {write:{runtime:next,history:[item,...(rows.history||[])].slice(0,40)}};
  });
  return {...result,id,item};
 });
}
async function rpc(action,extra={}){
 let r;
 try{r=await ensureWorker();}catch(e){
  // Desktop-only Notifications fallback. Never masquerades as closed-tab Push.
  if(['TEST','TICK','NEXT','PROBE'].includes(action)&&isSecureContext&&'Notification'in window){return pageDeliver(action,extra);}
  throw e;
 }
 // Once posted, a timeout is not retried via another transport: it could duplicate a toast.
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel();let settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);channel.port1.close();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>done(new Error('B\u1ed9 g\u1eedi kh\u00f4ng ph\u1ea3n h\u1ed3i. C\u1eadp nh\u1eadt th\u01b0 m\u1ee5c albert-notify r\u1ed3i t\u1ea3i l\u1ea1i trang.')),15000);
  channel.port1.onmessage=e=>done(null,e.data);channel.port1.onmessageerror=()=>done(new Error('Ph\u1ea3n h\u1ed3i th\u00f4ng b\u00e1o kh\u00f4ng h\u1ee3p l\u1ec7.'));
  try{r.active.postMessage({type:'ALBERT_REMINDER_'+action,version:C.VERSION,...extra},[channel.port2]);}catch(e){done(e);}
 });
}
function reminderError(result){const m={VERSION_MISMATCH:'C\u1eadp nh\u1eadt index.html v\u00e0 albert-notify c\u00f9ng phi\u00ean b\u1ea3n.',UNKNOWN:'B\u1ed9 th\u00f4ng b\u00e1o tr\u00ean web c\u00f2n c\u0169. C\u1eadp nh\u1eadt to\u00e0n b\u1ed9 th\u01b0 m\u1ee5c albert-notify r\u1ed3i t\u1ea3i l\u1ea1i.',EMPTY:T.empty,PERMISSION:'Ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5p quy\u1ec1n th\u00f4ng b\u00e1o.',BUSY:'M\u1ed9t tab kh\u00e1c \u0111ang g\u1eedi. Ch\u1edd v\u00e0i gi\u00e2y r\u1ed3i th\u1eed l\u1ea1i.',CHANGED:'C\u00e0i \u0111\u1eb7t ho\u1eb7c t\u00e0i kho\u1ea3n v\u1eeba thay \u0111\u1ed5i. Th\u1eed l\u1ea1i.'};return m[result?.code]||result?.message||result?.code||'Kh\u00f4ng g\u1eedi \u0111\u01b0\u1ee3c th\u00f4ng b\u00e1o.';}
async function rememberError(e){const message=String(e?.message||e);await db.mutate(['runtime'],r=>({write:{runtime:{...(r.runtime||{}),lastError:message,lastErrorAt:Date.now()}}})).catch(()=>{});return message;}
function probeWindows(){
 if(busy)return;const req=requestPermission();lastProbe=null;
 return run(async()=>{
  if(await req!=='granted')throw new Error('B\u1ea1n ch\u01b0a cho ph\u00e9p th\u00f4ng b\u00e1o.');
  notice('\u0110ang g\u1eedi th\u00f4ng b\u00e1o th\u1eed cho Windows...');
  const result=await rpc('PROBE');if(!result?.ok)throw new Error(reminderError(result));
  lastProbe={...result,at:Date.now(),seen:null};await refresh();
  notice('Tr\u00ecnh duy\u1ec7t \u0111\u00e3 nh\u1eadn y\u00eau c\u1ea7u. H\u00e3y ki\u1ec3m tra banner / trung t\u00e2m th\u00f4ng b\u00e1o Windows v\u00e0 ch\u1ecdn \u0110\u00e3 th\u1ea5y ho\u1eb7c Ch\u01b0a th\u1ea5y.');
 });
}
async function diagnose(){
 if(diagnosticBusy)return;diagnosticBusy=true;
 try{await collect(true);await ensureWorker(true);const r=await rpc('PING');if(!r?.ok)throw new Error(reminderError(r));workerProblem='';await db.mutate(['runtime'],x=>({write:{runtime:{...(x.runtime||{}),lastError:''}}}));}
 catch(e){await rememberError(e);}
 finally{diagnosticBusy=false;await refresh();}
}
function diagnosticPanel(s){
 const cfg=s.config,p=s.pools.find(x=>x.key===cfg.pool),test=C.pick(p,cfg,s.runtime),box=node('section',{class:'rn-diagnostics rn-section','aria-label':'Ki\u1ec3m tra th\u00f4ng b\u00e1o'});
 const h=node('h3');h.innerHTML=icon('shield')+'Ki\u1ec3m tra th\u00f4ng b\u00e1o Windows';box.appendChild(h);
 const rows=[
  ['Quy\u1ec1n tr\u00ecnh duy\u1ec7t',permission()==='granted'?'\u0110\u00e3 cho ph\u00e9p':permission()==='denied'?'\u0110ang b\u1ecb ch\u1eb7n':'Ch\u01b0a cho ph\u00e9p'],
  ['B\u1ed9 g\u1eedi',registration?.active?'Service worker s\u1eb5n s\u00e0ng':workerProblem?'Ch\u01b0a t\u1ea3i \u0111\u01b0\u1ee3c; c\u00f3 th\u1eed g\u1eedi tr\u1ef1c ti\u1ebfp khi gi\u1eef tab m\u1edf':'Ch\u01b0a ki\u1ec3m tra'],
  ['D\u1eef li\u1ec7u nh\u1eafc',test?'C\u00f3 n\u1ed9i dung trong ph\u1ea1m vi ch\u1ecdn':'Ch\u01b0a c\u00f3 - ch\u1ecdn C\u1ea3 gi\u00e1o tr\u00ecnh ho\u1eb7c b\u00e0i c\u1ee5 th\u1ec3'],
  ['L\u1ecbch',cfg.enabled?'\u0110ang b\u1eadt: '+cfg.interval+' ph\u00fat':'\u0110ang t\u1eaft; g\u1eedi th\u1eed kh\u00f4ng b\u1eadt l\u1ecbch'],
  ['Gi\u1edd y\u00ean l\u1eb7ng',C.quiet(Date.now(),cfg)?'\u0110ang t\u1ea1m ng\u1eebng 22:00-07:00; v\u1eabn g\u1eedi th\u1eed \u0111\u01b0\u1ee3c':cfg.quiet?'Kh\u00f4ng \u1edf khung 22:00-07:00':'\u0110\u00e3 t\u1eaft gi\u1edd y\u00ean l\u1eb7ng'],
  ['Banner Windows',lastProbe?.seen===true?'B\u1ea1n \u0111\u00e3 x\u00e1c nh\u1eadn nh\u00ecn th\u1ea5y':lastProbe?.seen===false?'B\u1ea1n ch\u01b0a nh\u00ecn th\u1ea5y - ki\u1ec3m tra Windows / quy\u1ec1n trang':'Trang web kh\u00f4ng t\u1ef1 x\u00e1c minh \u0111\u01b0\u1ee3c banner']
 ];
 const dl=node('dl');for(const [label,value]of rows){dl.append(node('dt',{},label),node('dd',{},value));}box.appendChild(dl);
 if(workerProblem)note(box,'L\u1ed7i b\u1ed9 g\u1eedi: '+workerProblem,'rn-warning');
 const actions=node('div',{class:'rn-actions'});actions.appendChild(button('Ki\u1ec3m tra th\u00f4ng b\u00e1o Windows',probeWindows,'bell',true,{'data-rn-probe':''}));actions.appendChild(button('Ki\u1ec3m tra l\u1ea1i b\u1ed9 g\u1eedi',diagnose,'refresh',false,{'data-rn-diagnose':''}));box.appendChild(actions);
 note(box,'N\u00fat ki\u1ec3m tra Windows kh\u00f4ng c\u1ea7n b\u00e0i \u0111\u00e3 h\u1ecdc v\u00e0 kh\u00f4ng \u0111\u1ed5i l\u1ecbch. B\u1ea3n nh\u1eafc '+C.VERSION+'.');
 if(lastProbe){const a=node('div',{class:'rn-actions'});a.append(button('\u0110\u00e3 th\u1ea5y',()=>{lastProbe.seen=true;refresh();},'check',false,{'data-rn-seen':'yes'}),button('Ch\u01b0a th\u1ea5y',()=>{lastProbe.seen=false;refresh();},'question',false,{'data-rn-seen':'no'}));box.appendChild(a);}
 if(lastProbe?.seen===false){note(box,'Windows: Settings > System > Notifications. B\u1eadt Notifications v\u00e0 th\u00f4ng b\u00e1o cho Edge/Chrome/HSK Albert; ki\u1ec3m tra Do not disturb/Focus assist. Trong quy\u1ec1n trang c\u1ea1nh thanh \u0111\u1ecba ch\u1ec9, ch\u1ecdn Notifications = Allow. M\u00e1y c\u00f4ng ty b\u1ecb ch\u1eb7n c\u1ea7n IT h\u1ed7 tr\u1ee3; kh\u00f4ng t\u1eaft b\u1ea3o m\u1eadt.','rn-warning');}
 return box;
}
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
 await collect(true);const current=C.config((await db.read(['config'])).config),next=C.config({...current,...patch,owner:owner(),timezone:zone(),updatedAt:Date.now()});
 if(next.enabled){const p=(await db.read(['pool:'+next.pool]))['pool:'+next.pool];if(!C.pick(p,next))throw new Error(T.empty);if(permission()!=='granted')throw new Error('Ch\u01b0a c\u00f3 quy\u1ec1n th\u00f4ng b\u00e1o.');}
 if(next.mode==='push'&&next.enabled){const p=(await db.read(['pool:'+next.pool]))['pool:'+next.pool];if(!C.pick(p,next))throw new Error(T.empty);const reg=await ensureWorker(),sub=await reg.pushManager.getSubscription();if(!sub)throw new Error('K\u1ebft n\u1ed1i Push \u0111\u00e3 h\u1ebft h\u1ea1n. B\u1ea5m K\u1ebft n\u1ed1i Web Push l\u1ea1i.');await remote('subscribe',{subscription:sub.toJSON(),settings:serverSettings(next)});}
 await db.mutate(['runtime'],r=>({write:{config:next,runtime:{...(r.runtime||{}),nextAt:next.enabled?(!current.enabled||current.interval!==next.interval||current.mode!==next.mode?C.nextDue(Date.now(),next):(r.runtime?.nextAt||C.nextDue(Date.now(),next))):0,lastError:''}}}));
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
 run(async()=>{const p=await permissionPromise;if(p!=='granted')throw new Error('B\u1ea1n ch\u01b0a cho ph\u00e9p th\u00f4ng b\u00e1o.');await commit(patch);});
}
function run(fn){if(busy)return Promise.resolve();busy=true;return Promise.resolve().then(fn).catch(async e=>{await rememberError(e);await refresh().catch(()=>{});notice(String(e.message||e));}).finally(()=>{busy=false;});}
function sendTest(){if(busy)return;const requested=requestPermission();return run(async()=>{
 if(await requested!=='granted')throw new Error('B\u1ea1n ch\u01b0a cho ph\u00e9p th\u00f4ng b\u00e1o.');
 await reconcileOwner();await collect(true);const r=await rpc('TEST');if(!r?.ok)throw new Error(reminderError(r));
 await refresh();notice('\u0110\u00e3 chuy\u1ec3n m\u1ee5c nh\u1eafc cho tr\u00ecnh duy\u1ec7t; trang web kh\u00f4ng x\u00e1c minh \u0111\u01b0\u1ee3c banner Windows. L\u1ecbch nh\u1eafc kh\u00f4ng thay \u0111\u1ed5i.');
});}
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
async function localMode(){let reg;try{reg=await ensureWorker();}catch(_){}const sub=await reg?.pushManager?.getSubscription();if(sub){try{await remote('unsubscribe',{endpoint:sub.endpoint});}catch(_){}await sub.unsubscribe();}await commit({mode:'local'});}
let scheduling=false;
async function schedule(){
 clearTimeout(heartbeat);if(scheduling)return;scheduling=true;
 try{await reconcileOwner();await collect();const raw=await db.read(['config']);const cfg=C.config(raw.config);updateLauncher(cfg);
  if(cfg.enabled&&cfg.mode==='local'&&permission()==='granted'){
   const r=await rpc('TICK');
   if(!r?.ok&&!['OFF','OTHER_MODE','QUIET','NOT_DUE','CHANGED','BUSY'].includes(r?.code))throw new Error(reminderError(r));
  }else if(cfg.enabled&&cfg.mode==='push'&&permission()==='granted')await touchPush();
  else if(cfg.enabled&&permission()!=='granted')throw new Error('Quy\u1ec1n th\u00f4ng b\u00e1o \u0111\u00e3 b\u1ecb t\u1eeb ch\u1ed1i ho\u1eb7c thu h\u1ed3i.');
 }catch(e){await rememberError(e);}finally{scheduling=false;heartbeat=setTimeout(schedule,30000);}
}
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
 panel.innerHTML='<div class="rn-head">'+icon('bell')+'<div><h2 id="rn-title">'+esc(title)+'</h2><small>HSK Albert \u00b7 Nh\u1eafc h\u1ecdc 1.2.0 \u00b7 Windows / tr\u00ecnh duy\u1ec7t</small></div></div><div class="rn-body"></div>';
 const b=button(T.close,close,'close');b.className='rn-close';b.setAttribute('aria-label',T.close);b.querySelector('span:last-child').hidden=true;panel.querySelector('.rn-head').appendChild(b);
 if(!panel.open){lastFocus=D.activeElement;D.querySelector('#adw-modal[open]')?.close();D.getElementById('af-drawer-scrim')?.click();panel.showModal();}
 return panel.querySelector('.rn-body');
}
function section(parent,label,name){const e=node('section',{class:'rn-section'}),h=node('h3');h.innerHTML=icon(name)+esc(label);e.appendChild(h);parent.appendChild(e);return e;}
function note(parent,text,cls='rn-muted'){parent.appendChild(node('p',{class:cls},text));}
function segment(parent,label,opts,selected,onPick,columns){const wrap=node('div',{class:'rn-seg',role:'group','aria-label':label,style:'--cols:'+(columns||opts.length)});for(const [v,t,i]of opts){wrap.appendChild(button(t,()=>onPick(v),i,false,{'aria-pressed':String(v===selected),'data-rn-value':v}));}parent.appendChild(wrap);}
function itemCard(item){const e=node('article',{class:'rn-card'});if(!item){note(e,T.empty);return e;}
 e.innerHTML='<div class="rn-card-kicker">'+icon(item.kind==='grammar'?'grammar':'cards')+esc(item.kind==='grammar'?T.grammar:T.word)+'</div><div class="rn-front" lang="zh-CN">'+esc(item.front)+'</div>'+(item.py?'<p class="rn-py" lang="zh-Latn">'+esc(item.py)+'</p>':'')+'<div class="rn-meaning">'+esc(item.meaning)+'</div>'+(item.formula?'<p class="rn-muted">'+esc(item.formula)+'</p>':'')+(item.example?'<div class="rn-example"><span lang="zh-CN">'+esc(item.example)+'</span>'+(item.examplePy?'<small lang="zh-Latn">'+esc(item.examplePy)+'</small>':'')+(item.exampleVi?'<small>'+esc(item.exampleVi)+'</small>':'')+'</div>':'')+'<div class="rn-source">'+esc(item.courseTitle||courseTitle(item.course))+' \u00b7 B\u00e0i '+(item.lessonRefs?.length>1?item.lessonRefs.map(l=>l.display).join(', '):(item.lessonDisplay||item.lesson))+'</div>';return e;}
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
 const actions=node('div',{class:'rn-actions'});actions.appendChild(button(ready?T.test:T.allow,ready?sendTest:probeWindows,'bell',true));if(cfg.enabled)actions.appendChild(button('D\u1eebng nh\u1eafc',()=>run(disable),'stop'));status.appendChild(actions);left.appendChild(status);left.appendChild(diagnosticPanel(s));if(s.runtime.lastError)note(left,s.runtime.lastError,'rn-warning');
 if(!isSecureContext||location.protocol==='file:')note(left,'M\u1edf app b\u1eb1ng \u0111\u1ecba ch\u1ec9 HTTPS tr\u00ean GitHub \u0111\u1ec3 d\u00f9ng th\u00f4ng b\u00e1o.','rn-warning');
 let sec=section(left,T.source,'book');const sel=node('select',{'aria-label':T.source,id:'rn-course'});for(const p of s.pools){const o=node('option',{value:p.key},p.title);o.selected=p.key===cfg.pool;sel.appendChild(o);}sel.onchange=()=>change({pool:sel.value});sec.appendChild(sel);
 if(pool)note(sec,pool.words.length+' t\u1eeb \u00b7 '+pool.grammar.length+' m\u1eabu ng\u1eef ph\u00e1p \u00b7 '+pool.learned.length+' b\u00e0i trong ph\u1ea1m vi \u0111\u00e3 h\u1ecdc.');
 sec=section(left,T.scope,'filter');segment(sec,T.scope,[['learned',T.learned],['all',T.all]],cfg.scope,v=>change({scope:v}));
 note(sec,'L\u1ea5y ti\u1ebfn \u0111\u1ed9 \u0111\u00e3 l\u01b0u c\u1ee7a gi\u00e1o tr\u00ecnh \u0111\u01b0\u1ee3c ch\u1ecdn, k\u1ec3 c\u1ea3 khi b\u1ea1n \u0111ang m\u1edf gi\u00e1o tr\u00ecnh kh\u00e1c. Bao g\u1ed3m b\u00e0i \u0111\u00e3 ho\u00e0n th\u00e0nh, b\u00e0i \u0111\u00e3 m\u1edf/l\u00e0m v\u00e0 c\u00e1c b\u00e0i b\u1ea1n ch\u1ecdn th\u00eam. C\u1ea3 gi\u00e1o tr\u00ecnh kh\u00f4ng y\u00eau c\u1ea7u m\u1edf t\u1eebng b\u00e0i.');
 if(pool){const d=node('details'),summary=node('summary',{},'Ch\u1ecdn th\u00eam b\u00e0i d\u00f9ng \u0111\u1ec3 nh\u1eafc');d.appendChild(summary);const list=node('div',{class:'rn-lesson-list'});for(const l of pool.lessons){const selected=pool.learned.includes(l.id);list.appendChild(button('B\u00e0i '+(l.display||l.id),()=>run(async()=>{await toggleLearned(pool.key,l.id);await refresh();panel.querySelector('.rn-section details').open=true;}),null,false,{'aria-pressed':String(selected),title:l.title}));}d.appendChild(list);note(d,'L\u1ef1a ch\u1ecdn n\u00e0y ch\u1ec9 \u0111\u1ed5i ph\u1ea1m vi nh\u1eafc, kh\u00f4ng s\u1eeda \u0111i\u1ec3m hay ti\u1ebfn \u0111\u1ed9 b\u00e0i h\u1ecdc.');sec.appendChild(d);}
 sec=section(left,T.kind,'grammar');segment(sec,T.kind,[['word',T.word,'cards'],['grammar',T.grammar,'grammar'],['mix',T.mix,'sync']],cfg.kind,v=>change({kind:v}));
 const counts={word:C.eligible(pool,cfg,'word').length,grammar:C.eligible(pool,cfg,'grammar').length};note(sec,counts.word+' t\u1eeb / '+counts.grammar+' m\u1eabu \u0111ang s\u1eb5n s\u00e0ng trong ph\u1ea1m vi ch\u1ecdn.');
 if(!(cfg.kind==='word'?counts.word:cfg.kind==='grammar'?counts.grammar:counts.word+counts.grammar))note(sec,T.empty,'rn-warning');
 const progress=C.coverage(pool,cfg,s.runtime),meter=node('div',{class:'rn-coverage','data-rn-coverage':''});
 meter.innerHTML='<div class="rn-coverage-head"><b>V\u00f2ng nh\u1eafc '+progress.cycle+'</b><span>'+progress.covered+' / '+progress.total+' m\u1ee5c</span></div><progress max="'+(progress.total||1)+'" value="'+progress.covered+'" aria-label="Ti\u1ebfn \u0111\u1ed9 ph\u1ee7 n\u1ed9i dung"></progress>';
 note(meter,'\u0110\u00e3 nh\u1eafc '+progress.coveredWords+'/'+progress.words+' t\u1eeb v\u1ef1ng, '+progress.coveredGrammar+'/'+progress.grammar+' m\u1eabu ng\u1eef ph\u00e1p. C\u00f2n '+progress.remaining+' m\u1ee5c ch\u01b0a nh\u1eafc trong v\u00f2ng n\u00e0y.');
 note(meter,'Lu\u00e2n phi\u00ean gi\u1eefa c\u00e1c b\u00e0i; nh\u1eafc h\u1ebft n\u1ed9i dung trong ph\u1ea1m vi r\u1ed3i m\u1edbi l\u1eb7p l\u1ea1i. Ch\u1ebf \u0111\u1ed9 Xen k\u1ebd kh\u00f4ng l\u1eb7p ng\u1eef ph\u00e1p \u0111\u00e3 nh\u1eafc khi v\u1eabn c\u00f2n t\u1eeb ch\u01b0a nh\u1eafc.');sec.appendChild(meter);
 if(pool?.missing?.length)note(sec,pool.missing.length+' m\u1ee5c ngu\u1ed3n ch\u01b0a \u0111\u1ee7 n\u1ed9i dung/gi\u1ea3i ngh\u0129a; kh\u00f4ng t\u1ef1 sinh n\u1ed9i dung thay th\u1ebf.','rn-warning');
 if(pool){const detail=node('details',{'data-rn-scope-detail':''});detail.appendChild(node('summary',{},'N\u1ed9i dung \u0111\u01b0\u1ee3c nh\u1eafc theo b\u00e0i'));const groups=node('div',{class:'rn-scope-summary'});
  for(const l of pool.lessons.filter(l=>cfg.scope==='all'||pool.learned.includes(l.id)))note(groups,'B\u00e0i '+l.display+' \u00b7 '+l.words+' t\u1eeb \u00b7 '+l.grammar+' m\u1eabu');
  detail.appendChild(groups);note(detail,'M\u1ee5c tr\u00f9ng n\u1ed9i dung gi\u1eefa nhi\u1ec1u b\u00e0i ch\u1ec9 nh\u1eafc m\u1ed9t l\u1ea7n trong m\u1ed7i v\u00f2ng, v\u1eabn gi\u1eef c\u00e1c b\u00e0i ngu\u1ed3n.');sec.appendChild(detail);}

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
 sec=section(right,T.preview,'cards');const chosen=C.pick(pool,cfg,s.previewRuntime),it=chosen?.item;sec.appendChild(itemCard(it));const pa=node('div',{class:'rn-actions'});
 if(it){pa.appendChild(button(T.next,()=>run(async()=>{await db.mutate(['previewRuntime'],r=>({write:{previewRuntime:C.commitPick(r.previewRuntime||{},chosen)}}));await refresh();}),'sync'));pa.appendChild(button('Nghe',()=>speak(it),'speaker'));}sec.appendChild(pa);
 note(sec,'Xem th\u1ebb v\u00e0 b\u1ea5m M\u1ee5c kh\u00e1c kh\u00f4ng l\u00e0m b\u1ecf qua n\u1ed9i dung trong l\u1ecbch th\u00f4ng b\u00e1o. Th\u1ebb trong app, kh\u00f4ng ph\u1ea3i widget ghim tr\u00ean Desktop. Th\u00f4ng b\u00e1o Windows ch\u1ec9 hi\u1ec7n b\u1ea3n ng\u1eafn; b\u1ea5m \u0111\u1ec3 xem \u0111\u1ea7y \u0111\u1ee7.');
 sec=section(right,T.history,'clock');const hist=node('div',{class:'rn-history'});if(!s.history.length)note(hist,'Ch\u01b0a g\u1eedi th\u00f4ng b\u00e1o n\u00e0o.');for(const h of s.history.slice(0,8))hist.appendChild(button(h.front+' \u00b7 '+dateLabel(h.createdAt),()=>showCard(h.id),h.kind==='grammar'?'grammar':'cards'));sec.appendChild(hist);
 sec=section(right,'C\u00e0i app web','download');sec.appendChild(button('C\u00e0i HSK Albert',install,'download'));note(sec,'Kh\u00f4ng c\u1ea7n EXE, CMD hay PowerShell. C\u00e0i app web kh\u00f4ng t\u1ef1 b\u1eadt l\u1ecbch khi \u0111\u00f3ng tab.');
 const help=node('details');help.appendChild(node('summary',{},'Kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c th\u00f4ng b\u00e1o?'));note(help,'1. M\u1edf HTTPS, kh\u00f4ng m\u1edf file t\u1eeb m\u00e1y.\n2. Cho ph\u00e9p Th\u00f4ng b\u00e1o trong quy\u1ec1n c\u1ee7a trang.\n3. Windows: Settings > System > Notifications, b\u1eadt th\u00f4ng b\u00e1o cho Edge/Chrome/HSK Albert v\u00e0 ki\u1ec3m tra Do not disturb.\n4. Ch\u1ecdn gi\u00e1o tr\u00ecnh/ph\u1ea1m vi c\u00f3 d\u1eef li\u1ec7u.\n5. Ki\u1ec3m tra gi\u1edd y\u00ean l\u1eb7ng v\u00e0 chu k\u1ef3 nh\u1eafc.','rn-note');sec.appendChild(help);
 body.appendChild(node('div',{class:'rn-footer'},'T\u00f9y ch\u1ecdn l\u01b0u ri\u00eang tr\u00ean tr\u00ecnh duy\u1ec7t n\u00e0y; kh\u00f4ng t\u1ef1 sao ch\u00e9p t\u1eeb APK. \u0110\u0103ng xu\u1ea5t s\u1ebd d\u1eebng nh\u1eafc. Ch\u1ec9 d\u00f9ng n\u1ed9i dung c\u00f3 s\u1eb5n trong app, kh\u00f4ng t\u1ef1 sinh ng\u1eef ph\u00e1p hay b\u1ea3n d\u1ecbch.'));
 panel.scrollTop=previous;updateLauncher(cfg);let restore=focusId?panel.querySelector('#'+CSS.escape(focusId)):null;if(!restore&&focusInterval!=null)restore=panel.querySelector('[data-rn-interval="'+CSS.escape(focusInterval)+'"]');if(!restore&&focusKey!=null&&focusGroup)restore=panel.querySelector('[aria-label="'+CSS.escape(focusGroup)+'"] [data-rn-value="'+CSS.escape(focusKey)+'"]');restore?.focus({preventScroll:true});
}
async function refresh(){if(panel?.open&&viewMode==='settings')render(await state());}
async function open(){try{await reconcileOwner();await collect(true);render(await state());ensureWorker().then(()=>refresh()).catch(e=>{workerProblem=String(e.message||e);refresh().catch(()=>{});});}catch(e){const b=shell();note(b,String(e.message||e),'rn-warning');}}
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
 await db.mutate(['config','runtime','history'],()=>({write:{config:{...cfg,enabled:false,mode:'local',owner:who,updatedAt:Date.now()},runtime:{nextAt:0},previewRuntime:{},history:[]}}));
 for(const key of s.poolKeys||[])await db.mutate(['pool:'+key],r=>{const p=r['pool:'+key];return p?{write:{['pool:'+key]:{...p,owner:who,learned:[],excluded:[],visited:[],included:[]}}}:{};});
 fingerprints.clear();collectedAt=0;
 }seenOwner=who;}
function addLauncher(){const foot=D.getElementById('adw-side-foot');if(foot&&!D.getElementById('adw-reminder-launcher')){const b=button(T.shortTitle,open,'bell',false,{id:'adw-reminder-launcher',title:T.title,'aria-haspopup':'dialog','aria-label':T.title});foot.insertBefore(b,foot.firstChild);} }
async function init(){
 addLauncher();try{await reconcileOwner();await collect(true);const s=await state();if(s.config.enabled)schedule();updateLauncher(s.config);}catch(e){console.warn('Albert reminders:',e.message);}
 if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(!e.source?.scriptURL?.startsWith(ASSETS.href))return;const m=e.data||{};if(m.type==='ALBERT_REMINDER_OPEN')showCard(m.id).catch(()=>{});if(m.type==='ALBERT_REMINDER_CHANGED')refresh().catch(()=>{});});
 const queueCollect=()=>{clearTimeout(collectTimer);collectTimer=setTimeout(()=>collect(true).catch(()=>{}),1200);};
 D.addEventListener('click',e=>{if(!e.target.closest?.('#albert-reminders'))queueCollect();},true);
 D.addEventListener('change',e=>{if(!e.target.closest?.('#albert-reminders'))queueCollect();},true);
 window.addEventListener('albert-sync-applied',queueCollect);
 window.addEventListener('albert-lesson-completion',queueCollect);
 window.addEventListener('storage',queueCollect);
 window.addEventListener('focus',()=>{reconcileOwner().then(()=>refresh()).catch(()=>{});schedule();});
 D.addEventListener('visibilitychange',()=>{if(!D.hidden){collect().catch(()=>{});schedule();}});
 watchAuth();
 const u=new URL(location.href);if(u.searchParams.has('albertNotice')){pendingCard=u.searchParams.get('albertNotice');u.searchParams.delete('albertNotice');try{history.replaceState(history.state,'',u.href);}catch(_){} }
 if(u.searchParams.has('albertReminders'))open();
 setInterval(()=>{addLauncher();reconcileOwner().catch(()=>{});if(pendingCard&&!gateBlocking()){const id=pendingCard;pendingCard=null;showCard(id).catch(()=>{});}},2500);
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
window.AlbertReminders=Object.freeze({version:C.VERSION,open,close,state,collect,showCard,ensureWorker,test:sendTest,probe:probeWindows,diagnose,tick:schedule,core:C,assetURL:ASSETS.href});
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',()=>setTimeout(init,1200));else setTimeout(init,1200);
})();

