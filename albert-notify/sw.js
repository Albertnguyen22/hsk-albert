/* Notification-only service worker. Intentionally NO fetch handler and NO timers.
 * It does not replace the app's caching/authentication service worker.
 * Local schedules are woken by an open tab; closed-tab schedules require Web Push. */
'use strict';
importScripts('./core.js?v=1.2.0');
const C=AlbertReminderCore;
const BASE=new URL('../',self.location.href).href;
const DB=C.store(C.databaseName(BASE));
const TAG='albert-study:'+new URL(BASE).pathname;
let queue=Promise.resolve();
const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
self.addEventListener('install',()=>self.skipWaiting());
// Do not claim unrelated pages. The worker has a private /albert-notify/ scope.
async function notifyPages(message) {
  const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of all)if(client.url.startsWith(BASE))client.postMessage(message);
}
async function snapshot() {
  const raw=await DB.read(['config','runtime','poolKeys','history']);
  return {...raw,config:C.config(raw.config),runtime:raw.runtime||{},poolKeys:raw.poolKeys||[],history:raw.history||[]};
}
function deliver(reason,options={}) {return C.withDeliveryLease(DB,()=>deliverOne(reason,options));}
async function deliverOne(reason,options={}) {
  const now=Date.now(),s=await snapshot(),cfg=s.config,r=s.runtime;
  const manual=reason==='test'||reason==='next';
  if(!manual&&!cfg.enabled)return {ok:false,code:'OFF'};
  if(!manual&&((reason==='local'&&cfg.mode!=='local')||(reason==='push'&&cfg.mode!=='push')))return {ok:false,code:'OTHER_MODE'};
  if(!manual&&C.quiet(now,cfg))return {ok:false,code:'QUIET'};
  if(!manual&&reason==='local'&&(!r.nextAt||now<r.nextAt))return {ok:false,code:'NOT_DUE'};
  if(options.id&&(options.id===r.lastPushId||(r.deliveredPushIds||[]).includes(options.id)))return {ok:false,code:'DUPLICATE'};
  if(reason==='push'&&options.expiresAt&&now>Number(options.expiresAt))return {ok:false,code:'EXPIRED'};
  if(Notification.permission!=='granted')return {ok:false,code:'PERMISSION'};
  const got=await DB.read(['pool:'+cfg.pool]);
  const choice=C.pick(got['pool:'+cfg.pool],cfg,r,options.kind);
  if(!choice)return {ok:false,code:'EMPTY'};
  const id=(typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')),item={...choice.item,id,owner:cfg.owner,createdAt:now,reason};
  const msg=C.notification(item);
  const data={albertReminder:1,id,base:BASE,owner:cfg.owner};
  const actions=[{action:'open',title:'Xem chi ti\u1ebft'},{action:'next',title:'M\u1ee5c kh\u00e1c'}];
  // Re-check preferences after async storage reads, before showing a scheduled toast.
  const latest=C.config((await DB.read(['config'])).config);
  if(latest.updatedAt!==cfg.updatedAt||(!manual&&!latest.enabled))return {ok:false,code:'CHANGED'};
  if(manual&&latest.owner!==cfg.owner)return {ok:false,code:'CHANGED'};
  await self.registration.showNotification(msg.title,{body:msg.body,icon:new URL('icon-192.png',self.location.href).href,
    badge:new URL('badge-96.png',self.location.href).href,lang:'vi',dir:'auto',tag:TAG,renotify:true,
    requireInteraction:manual,data,actions});
  await DB.mutate(['config','runtime','history'],rows=>{
    const active=C.config(rows.config),old=rows.runtime||{};
    if(active.owner!==cfg.owner)return {};
    const history=[item,...(rows.history||[])].slice(0,40);
    const next={...C.commitPick(old,choice),lastSentAt:now,lastError:''};
    if(options.id){next.lastPushId=options.id;next.deliveredPushIds=[options.id,...(old.deliveredPushIds||[])].filter((id,i,a)=>a.indexOf(id)===i).slice(0,128);}
    // A test is not opt-in and never changes the user's schedule.
    if(!manual){next.nextAt=C.nextDue(now,active);next.lastPushId=options.id||old.lastPushId;}
    return {write:{runtime:next,history}};
  });
  await notifyPages({type:'ALBERT_REMINDER_CHANGED'});
  return {ok:true,id,item,delivery:'service-worker',browserAccepted:true};
}
async function stop() {
  await DB.mutate(['config','runtime'],r=>({write:{config:{...C.config(r.config),enabled:false,mode:'local',updatedAt:Date.now()},runtime:{...(r.runtime||{}),nextAt:0}}}));
  const sub=await self.registration.pushManager?.getSubscription();if(sub)await sub.unsubscribe();
  const old=await self.registration.getNotifications({tag:TAG});old.forEach(n=>n.close());
  await notifyPages({type:'ALBERT_REMINDER_CHANGED'});return {ok:true};
}
async function openCard(id,owner) {
  const cfg=C.config((await DB.read(['config'])).config);
  if(owner&&cfg.owner!==owner)return;
  const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(BASE)&&!c.url.includes('/albert-notify/'));
  windows.sort((a,b)=>Number(b.focused)-Number(a.focused));
  if(windows.length){await windows[0].focus();windows[0].postMessage({type:'ALBERT_REMINDER_OPEN',id});}
  else {const url=new URL('index.html',BASE);url.searchParams.set('albertNotice',id);await self.clients.openWindow(url.href);}
}
async function probe(){
 if(Notification.permission!=='granted')return {ok:false,code:'PERMISSION'};
 const tag='albert-probe:'+Date.now();
 await self.registration.showNotification('HSK Albert \u00b7 Ki\u1ec3m tra th\u00f4ng b\u00e1o',{
  body:'Th\u00f4ng b\u00e1o th\u1eed t\u1eeb trang h\u1ecdc HSK. B\u1ea5m \u0111\u1ec3 m\u1edf Nh\u1eafc h\u1ecdc.',lang:'vi',
  tag,icon:new URL('icon-192.png',self.location.href).href,requireInteraction:true,
  data:{albertProbe:1,base:BASE}
 });
 let registered=null;try{registered=(await self.registration.getNotifications({tag})).length>0;}catch(_){}
 return {ok:true,delivery:'service-worker',browserAccepted:true,registered,version:C.VERSION};
}
self.addEventListener('message',event=>{
  const m=event.data||{},source=event.source;
  if(!source?.url?.startsWith(BASE)||!String(m.type||'').startsWith('ALBERT_REMINDER_'))return;
  const job=serial(async()=>{
    if(m.version&&m.version!==C.VERSION)return {ok:false,code:'VERSION_MISMATCH',version:C.VERSION};
    if(m.type==='ALBERT_REMINDER_PROBE')return probe();
    if(m.type==='ALBERT_REMINDER_TICK')return deliver('local');
    if(m.type==='ALBERT_REMINDER_TEST')return deliver('test',{kind:['word','grammar','mix'].includes(m.kind)?m.kind:undefined});
    if(m.type==='ALBERT_REMINDER_NEXT')return deliver('next',{kind:['word','grammar','mix'].includes(m.kind)?m.kind:undefined});
    if(m.type==='ALBERT_REMINDER_STOP')return stop();
    if(m.type==='ALBERT_REMINDER_PING')return {ok:true,version:C.VERSION};
    return {ok:false,code:'UNKNOWN'};
  });
  event.waitUntil(job.then(result=>event.ports?.[0]?.postMessage(result)).catch(async e=>{
    try{await DB.mutate(['runtime'],r=>({write:{runtime:{...(r.runtime||{}),lastError:String(e.message||e),nextAt:Date.now()+60000}}}));}catch(_){}
    event.ports?.[0]?.postMessage({ok:false,code:'ERROR',message:String(e.message||e)});
  }));
});
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch(_){}
  // Content is selected from this device, not accepted from an arbitrary push payload.
  if(payload.type!=='albert-study')return;
  event.waitUntil(serial(async()=>{
    const result=await deliver(payload.test===true?'test':'push',payload);
    if(!result.ok&&result.code==='EMPTY'&&Notification.permission==='granted'){
      // An emptied local scope must not cause repeated invisible pushes.
      await stop();
      await self.registration.showNotification('HSK Albert',{
        body:'Ch\u01b0a c\u00f3 n\u1ed9i dung nh\u1eafc. M\u1edf app, ch\u1ecdn l\u1ea1i gi\u00e1o tr\u00ecnh/ph\u1ea1m vi v\u00e0 b\u1eadt nh\u1eafc.',
        tag:TAG,icon:new URL('icon-192.png',self.location.href).href,
        data:{albertReminder:1,id:'',base:BASE,owner:C.config((await DB.read(['config'])).config).owner}
      });
    }
  }).catch(async e=>{ 
    await DB.mutate(['runtime'],r=>({write:{runtime:{...(r.runtime||{}),lastError:String(e.message||e)}}}));
  }));
});
self.addEventListener('notificationclick',event=>{
  const data=event.notification.data||{};
  if(data.albertProbe===1&&data.base===BASE){event.notification.close();event.waitUntil(self.clients.openWindow(new URL('../index.html?albertReminders=1',self.location.href).href));return;}
  if(data.albertReminder!==1||data.base!==BASE)return;
  event.notification.close();
  event.waitUntil(serial(async()=>{
    const cfg=C.config((await DB.read(['config'])).config);if(cfg.owner!==data.owner)return;
    if(event.action==='next'){const result=await deliver('next');if(!result.ok)await openCard(data.id,data.owner);}
    else await openCard(data.id,data.owner);
  }));
});
self.addEventListener('pushsubscriptionchange',event=>{
  // Re-subscription may need fresh user authentication. Do not store auth tokens here.
  event.waitUntil(DB.mutate(['config','runtime'],r=>({write:{config:{...C.config(r.config),enabled:false,mode:'local',updatedAt:Date.now()},runtime:{...(r.runtime||{}),nextAt:0,lastError:'PUSH_SUBSCRIPTION_CHANGED'}}})).then(()=>notifyPages({type:'ALBERT_REMINDER_CHANGED'})));
});
