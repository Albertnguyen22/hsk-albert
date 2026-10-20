/* Albert reminders 1.0.0. Shared by the page and the service worker.
 * This module never reads credentials, calls translation APIs or edits course data. */
(function (root) {
  'use strict';
  const VERSION = '1.1.0';
  const INTERVALS = [5,10,15,30,60,120,180,360,720,1440];
  const DEFAULTS = {enabled:false,interval:5,quiet:true,scope:'learned',kind:'word',mode:'local',pool:'',owner:'guest',timezone:'Asia/Ho_Chi_Minh',updatedAt:0};
  const clean = (x,n=4000) => String(x == null ? '' : x).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
  function config(value) {
    const v = value || {};
    return { ...DEFAULTS, enabled:v.enabled===true, interval:INTERVALS.includes(Number(v.interval))?Number(v.interval):5,
      quiet:v.quiet!==false, scope:v.scope==='all'?'all':'learned', kind:['word','grammar','mix'].includes(v.kind)?v.kind:'word',
      mode:v.mode==='push'?'push':'local', pool:/^(2|3)\.0:hsk[1-6]$/.test(v.pool||'')?v.pool:'',
      owner:clean(v.owner||'guest',100), timezone:validZone(v.timezone), updatedAt:Number(v.updatedAt)||0 };
  }
  function validZone(zone) {try {new Intl.DateTimeFormat('en-US',{timeZone:zone||'Asia/Ho_Chi_Minh'}).format();return zone||'Asia/Ho_Chi_Minh';} catch (_) {return 'Asia/Ho_Chi_Minh';}}
  function clock(ms,zone) {
    const parts = new Intl.DateTimeFormat('en-GB',{timeZone:validZone(zone),hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ms));
    const get=k=>Number(parts.find(p=>p.type===k)?.value||0);
    return {h:get('hour')%24,m:get('minute'),s:get('second')};
  }
  function quiet(ms,cfg) {if(!cfg.quiet)return false;const {h}=clock(ms,cfg.timezone);return h>=22||h<7;}
  function afterQuiet(ms,cfg) {
    let next=ms;
    // Calculate the local morning boundary; re-check for time-zone/DST transitions.
    for(let i=0;i<4&&quiet(next,cfg);i++) {
      const {h,m,s}=clock(next,cfg.timezone),minutes=((7-h+24)%24)*60-m;
      next+=Math.max(60,minutes*60-s)*1000;
    }
    return next;
  }
  const nextDue=(ms,cfg)=>afterQuiet(ms+cfg.interval*60000,cfg);
  function eligible(pool,cfg,kind) {
    if(!pool||(pool.owner&&pool.owner!==cfg.owner))return [];
    const learned=new Set((pool.learned||[]).map(Number));
    const seen=new Set();
    return ((kind==='grammar'?pool.grammar:pool.words)||[]).filter(x=>{
      if(!x||!x.front||!x.meaning||!(Number(x.lesson)>0))return false;
      if(cfg.scope==='learned'&&!learned.has(Number(x.lesson)))return false;
      const key=x.front+'|'+x.meaning;
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function pick(pool,cfg,runtime={},forceKind) {
    let kind=forceKind||cfg.kind;
    const words=eligible(pool,cfg,'word'),grammar=eligible(pool,cfg,'grammar');
    if(kind==='mix')kind=runtime.lastKind==='word'?'grammar':'word';
    if((forceKind||cfg.kind)==='mix') {
      if(kind==='word'&&!words.length)kind='grammar';
      if(kind==='grammar'&&!grammar.length)kind='word';
    }
    const entries=kind==='grammar'?grammar:words;
    if(!entries.length)return null;
    const signature=[cfg.pool,cfg.scope,kind].join('|');
    const cursors={...(runtime.cursors||{})};
    const at=(Number(cursors[signature]??-1)+1)%entries.length;
    cursors[signature]=at;
    return {item:{...entries[at],kind,course:pool.key,courseTitle:pool.title},runtime:{...runtime,cursors,lastKind:kind}};
  }
  function short(s,n) {s=clean(s).replace(/\s+/g,' ');return s.length<=n?s:s.slice(0,n-1).trimEnd()+'\u2026';}
  function notification(item) {
    const head=item.kind==='grammar'?'Ng\u1eef ph\u00e1p':'T\u1eeb v\u1ef1ng';
    return {title:short(item.front,78)+' \u00b7 '+head,
      body:[item.py?short(item.py,90):'',short(item.meaning,160),item.example?short(item.example,95):'',item.courseTitle+' \u00b7 B\u00e0i '+(item.lessonDisplay||item.lesson)].filter(Boolean).join('\n')};
  }
  function databaseName(base) {return 'albert-reminders-v1:'+new URL(base).pathname;}
  function store(name) {
    let pending=null;
    function open() {
      if(pending)return pending;
      pending=new Promise((resolve,reject)=>{
        let req;try{req=indexedDB.open(name,1);}catch(e){reject(e);return;}
        let abandoned=false;const timer=setTimeout(()=>{abandoned=true;reject(new Error('REMINDER_STORAGE_TIMEOUT'));},6000);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('kv'))req.result.createObjectStore('kv');};
        req.onsuccess=()=>{clearTimeout(timer);const db=req.result;if(abandoned){db.close();return;}db.onversionchange=()=>{db.close();pending=null;};resolve(db);};
        req.onerror=()=>{clearTimeout(timer);pending=null;reject(req.error);};
        req.onblocked=()=>{abandoned=true;clearTimeout(timer);pending=null;reject(new Error('REMINDER_STORAGE_BLOCKED'));};
      });
      pending.catch(()=>{pending=null;});return pending;
    }
    async function read(keys) {
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('kv','readonly'),out={};
        for(const key of keys){const rq=tx.objectStore('kv').get(key);rq.onsuccess=()=>{out[key]=rq.result;};}
        tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage read aborted'));
      });
    }
    async function mutate(keys,fn) {
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('kv','readwrite'),s=tx.objectStore('kv'),out={};let left=keys.length,result;
        const apply=()=>{try{const r=fn(out)||{};result=r.result;for(const [k,v]of Object.entries(r.write||{}))s.put(v,k);for(const k of r.remove||[])s.delete(k);}catch(e){reject(e);tx.abort();}};
        if(!left)apply();
        for(const key of keys){const rq=s.get(key);rq.onsuccess=()=>{out[key]=rq.result;if(--left===0)apply();};}
        tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage write aborted'));
      });
    }
    const set=(key,value)=>mutate([],()=>({write:{[key]:value},result:value}));
    return {read,mutate,set};
  }
  async function withDeliveryLease(db,fn){
    const token=Date.now()+':'+Math.random().toString(36).slice(2),now=Date.now();
    const acquired=await db.mutate(['delivery-lease'],r=>{
      const old=r['delivery-lease'];if(old&&old.until>now)return {result:false};
      return {write:{'delivery-lease':{token,until:now+35000}},result:true};
    });
    if(!acquired)return {ok:false,code:'BUSY'};
    try{return await fn();}finally{await db.mutate(['delivery-lease'],r=>r['delivery-lease']?.token===token?{remove:['delivery-lease']}:{}).catch(()=>{});}
  }
  const api={withDeliveryLease,VERSION,INTERVALS,DEFAULTS,clean,config,clock,quiet,afterQuiet,nextDue,eligible,pick,notification,short,databaseName,store};
  root.AlbertReminderCore=Object.freeze(api);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
