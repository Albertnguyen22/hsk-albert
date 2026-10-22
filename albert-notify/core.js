
/* Albert reminders 1.2.0. Shared by the page and the service worker.
 * This module never reads credentials, calls translation APIs or edits course data. */
(function (root) {
  'use strict';
  const VERSION = '1.2.0';
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
  // Stable, content-based identities; indices change when pools grow or reorder.
  const normalized = x => clean(x,12000).normalize('NFC').replace(/\s+/g,' ').trim();
  function itemKey(x,kind=x?.kind||'word') {
    return JSON.stringify([kind,normalized(x?.front),normalized(x?.py).toLowerCase(),normalized(x?.meaning),kind==='grammar'?normalized(x?.formula):'']);
  }
  function eligible(pool,cfg,kind) {
    if(!pool||(pool.owner&&pool.owner!==cfg.owner))return [];
    const learned=new Set((pool.learned||[]).map(Number)),byKey=new Map();
    for(const x of (kind==='grammar'?pool.grammar:pool.words)||[]) {
      if(!x||!normalized(x.front)||!normalized(x.meaning)||!(Number(x.lesson)>0))continue;
      if(cfg.scope==='learned'&&!learned.has(Number(x.lesson)))continue;
      const contentId=itemKey(x,kind),ref={id:Number(x.lesson),display:Number(x.lessonDisplay)||Number(x.lesson),title:clean(x.lessonTitle)};
      if(byKey.has(contentId)) {
        const old=byKey.get(contentId);
        if(!old.lessonRefs.some(l=>l.id===ref.id))old.lessonRefs.push(ref);
        for(const ex of x.examples||[])if(!old.examples.some(e=>normalized(e.zh)===normalized(ex.zh)&&normalized(e.vi)===normalized(ex.vi)))old.examples.push({...ex});
      } else byKey.set(contentId,{...x,kind,contentId,lessonRefs:[ref],examples:(x.examples||[]).map(e=>({...e}))});
    }
    return [...byKey.values()];
  }
  function selectionKey(cfg,forceKind) {
    const kind=['word','grammar','mix'].includes(forceKind)?forceKind:cfg.kind;
    return JSON.stringify([cfg.owner||'guest',cfg.pool,cfg.scope,kind]);
  }
  function selectionItems(pool,cfg,forceKind) {
    const kind=['word','grammar','mix'].includes(forceKind)?forceKind:cfg.kind;
    return [...(kind!=='grammar'?eligible(pool,cfg,'word'):[]),...(kind!=='word'?eligible(pool,cfg,'grammar'):[])];
  }
  function rotationState(pool,cfg,runtime={},forceKind) {
    const key=selectionKey(cfg,forceKind),saved=runtime.cycles?.[key];
    if(saved&&saved.version===2)return {key,state:saved};
    // Old builds only retained 40 real deliveries. Recover those, not the old
    // numeric cursor (which could have been advanced by merely previewing).
    const history=(runtime.recentItems||[]).filter(x=>x.owner===cfg.owner&&x.course===cfg.pool);
    return {key,state:{version:2,cycle:1,seen:[...new Set(history.map(x=>x.contentId||itemKey(x)))],lastKind:history[0]?.kind||'',lastLesson:Number(history[0]?.lesson)||0,lastContent:history[0]?(history[0].contentId||itemKey(history[0])):'',lastAt:0}};
  }
  function hash(s) {let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function coverage(pool,cfg,runtime={},forceKind) {
    const entries=selectionItems(pool,cfg,forceKind),{state}=rotationState(pool,cfg,runtime,forceKind),seen=new Set(state.seen||[]);
    const sent=entries.filter(x=>seen.has(x.contentId)),refs=items=>new Set(items.flatMap(x=>x.lessonRefs.map(l=>l.id)));
    return {cycle:Math.max(1,Number(state.cycle)||1),total:entries.length,covered:sent.length,remaining:entries.length-sent.length,
      lessons:refs(entries).size,coveredLessons:refs(sent).size,
      words:entries.filter(x=>x.kind==='word').length,grammar:entries.filter(x=>x.kind==='grammar').length,
      coveredWords:sent.filter(x=>x.kind==='word').length,coveredGrammar:sent.filter(x=>x.kind==='grammar').length};
  }
  function pick(pool,cfg,runtime={},forceKind) {
    const mode=['word','grammar','mix'].includes(forceKind)?forceKind:cfg.kind,entries=selectionItems(pool,cfg,mode);
    if(!entries.length)return null;
    const {key,state:previous}=rotationState(pool,cfg,runtime,mode),valid=new Set(entries.map(x=>x.contentId));
    let seen=new Set((previous.seen||[]).filter(id=>valid.has(id))),cycle=Math.max(1,Number(previous.cycle)||1),remaining=entries.filter(x=>!seen.has(x.contentId));
    if(!remaining.length){cycle++;seen=new Set();remaining=entries.slice();}
    // Avoid an identical item across the boundary between two full rounds.
    if(remaining.length>1&&remaining.some(x=>x.contentId!==previous.lastContent))remaining=remaining.filter(x=>x.contentId!==previous.lastContent);
    let kind=mode==='mix'?(previous.lastKind==='word'?'grammar':'word'):mode;
    if(!remaining.some(x=>x.kind===kind))kind=kind==='word'?'grammar':'word';
    const candidates=remaining.filter(x=>x.kind===kind);
    const lessonRefs=[...new Map(candidates.flatMap(x=>x.lessonRefs.map(l=>[l.id,l]))).values()].sort((a,b)=>a.display-b.display||a.id-b.id);
    const allRefs=[...new Map(entries.flatMap(x=>x.lessonRefs.map(l=>[l.id,l]))).values()].sort((a,b)=>a.display-b.display||a.id-b.id);
    const last=allRefs.find(x=>x.id===Number(previous.lastLesson));
    const selectedLesson=lessonRefs.find(x=>!last||x.display>last.display||(x.display===last.display&&x.id>last.id))||lessonRefs[0];
    const choices=candidates.filter(x=>x.lessonRefs.some(l=>l.id===selectedLesson.id));
    choices.sort((a,b)=>hash(key+'|'+cycle+'|'+a.contentId)-hash(key+'|'+cycle+'|'+b.contentId)||a.contentId.localeCompare(b.contentId));
    const selected=choices[0];seen.add(selected.contentId);
    const ex=selected.examples?.length?selected.examples[(cycle-1)%selected.examples.length]:null;
    const item={...selected,owner:cfg.owner,lesson:selectedLesson.id,lessonDisplay:selectedLesson.display,lessonTitle:selectedLesson.title,
      course:pool.key,courseTitle:pool.title,...(ex?{example:ex.zh||'',exampleVi:ex.vi||'',examplePy:ex.py||''}:{})};
    const state={version:2,cycle,seen:[...seen],lastKind:kind,lastLesson:selectedLesson.id,lastContent:selected.contentId,lastAt:Date.now()};
    return {item,key,runtime:{...runtime,cycles:{...(runtime.cycles||{}),[key]:state},lastKind:kind}};
  }
  function commitPick(runtime,choice) {
    const x=choice.item,recent={contentId:x.contentId,owner:x.owner,course:x.course,kind:x.kind,lesson:x.lesson};
    return {...runtime,cycles:{...(runtime.cycles||{}),[choice.key]:choice.runtime.cycles[choice.key]},lastKind:x.kind,recentItems:[recent,...(runtime.recentItems||[])].slice(0,40)};
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
  const api={withDeliveryLease,VERSION,INTERVALS,DEFAULTS,clean,config,clock,quiet,afterQuiet,nextDue,itemKey,selectionKey,selectionItems,coverage,commitPick,eligible,pick,notification,short,databaseName,store};
  root.AlbertReminderCore=Object.freeze(api);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

