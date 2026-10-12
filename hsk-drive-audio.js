/* Albert Drive audio transport: public, read-only JSONP from the owner's Apps Script.
 * Receives original bytes; verifies SHA-256 locally before creating an audio Blob.
 * No raw Drive download URLs, iframe player, arbitrary file IDs or third-party proxy.
 */
(function(global){
'use strict';
const PROTOCOL='albert-hsk2-workbook-drive-v1';
const EXPECTED={"lesson-01":{"sourceName":"\u7b2c1\u8bfe.mp3","bytes":8867630,"sha256":"84ffe23599d89e23a65e80a08f1894d93c8c76027b4280f14c78ddc128385f10","duration":542.968067},"lesson-02":{"sourceName":"\u7b2c2\u8bfe.mp3","bytes":9152858,"sha256":"f2efc3cf2ecb390d14df3f2f411b01d438987813ca4c8d38f43a813918359879","duration":560.794813},"lesson-03":{"sourceName":"\u7b2c3\u8bfe.mp3","bytes":8961038,"sha256":"18d28ccaa69ac7fb4ed47785d629a8c3f0da38000c3cbf1416e0f6972310e7d8","duration":548.806067},"lesson-04":{"sourceName":"\u7b2c4\u8bfe.mp3","bytes":9256691,"sha256":"606a83a81219ebfb9325ba3fe496b716adc97bd6435f12c84297e8867c297c61","duration":567.284378},"lesson-05":{"sourceName":"\u7b2c5\u8bfe.mp3","bytes":9101567,"sha256":"ce610309721699b6fb3ecece74d5e7518327cd210ab5ad56148a973022e8d01e","duration":557.589125},"lesson-06":{"sourceName":"\u7b2c6\u8bfe.mp3","bytes":9041102,"sha256":"866a241dd5b72fb8a9fdd8f2271622420e57424cb11590656977bf21bc5375a4","duration":553.810067},"lesson-07":{"sourceName":"\u7b2c7\u8bfe.mp3","bytes":8849282,"sha256":"5651784def848427dcf2e4c19ace0830055989face8ab4b5ce81a0959b4cca2d","duration":541.821313},"lesson-08":{"sourceName":"\u7b2c8\u8bfe.mp3","bytes":9378038,"sha256":"7ebc7dbf48651fdacb3e3d174c575c4375b177fabdddb841ba2d6ed093b87a80","duration":574.868567},"lesson-09":{"sourceName":"\u7b2c9\u8bfe.mp3","bytes":9504806,"sha256":"794b97eda8e4a94bd25ec59d08c3a250e3606715863ec508c1f8f97c8cb0e474","duration":582.791567},"lesson-10":{"sourceName":"\u7b2c10\u8bfe.mp3","bytes":8725016,"sha256":"cf0689509219a4f1fadd9b2225788c9e6a619a99a42e44de9956045b086a3151","duration":534.054689},"lesson-11":{"sourceName":"\u7b2c11\u8bfe.mp3","bytes":9243764,"sha256":"acd0b771fc6c1d290e4c64f2c6f53d07622c503532002d872ed66d7b7d8c0c3d","duration":566.476438},"lesson-12":{"sourceName":"\u7b2c12\u8bfe.mp3","bytes":9419321,"sha256":"7b4ef06e76bc4db4aca419f93963ddec121277f513632d0fa32ae6c94b18e0bb","duration":577.448756},"lesson-13":{"sourceName":"\u7b2c13\u8bfe.mp3","bytes":9454766,"sha256":"9f284f273ac60115696576cdc08efbe4accd7bb361540fa6dc0735503dbbfed6","duration":579.664067},"lesson-14":{"sourceName":"\u7b2c14\u8bfe.mp3","bytes":9233339,"sha256":"1cee8b87ac3a59a0caa22256c02337cd4e63c0d97a6bcdb2e24110bdf9313a50","duration":565.824878},"lesson-15":{"sourceName":"\u7b2c15\u8bfe.mp3","bytes":9184550,"sha256":"53e4e2402e460d5c2e2efd69de5bd4aa6427105be29df042043b5cbb264dfb5f","duration":562.775567},"mock":{"sourceName":"\u6a21\u62df\u6d4b\u8bd5 HSK(\u4e8c\u7ea7)\u6a21\u62df\u8bd5\u5377.mp3","bytes":17993675,"sha256":"1955a77e29c1db389afbd85d4ed42fce54686149279aef38f4eb7000d324b609","duration":1113.345878}};
const ALLOWED=new Set(["182gBm5dSRaaSDSuVzSf7mOr4EkBB9TwS", "15B-hGVm5vgSujsY5L438T_3qat6sc-oC", "19Qlic050faWesflff-bQlwhVSxAUV8f4", "1ILD7xPLoj3t5OFQRq3F2KRCM7fttsKGt", "1GLqlziZCh4j1koVgCYlCbrTSiPV6PyTN", "1Hr_laAYIhmSbkItk3yJOQxkdNUegV4WQ", "1P8CFhSyJwfF7NaQtMNpPGmp1nA0k2b79", "1Z9Skyw5TTe3ipkbtyXPewj9NrvQYPLt1", "1tJjIfQpUtMyejxFvq03M5D2_CvurFtw-", "1VJ1D7IYe3YNRXOpZIHdX86bh3jBSOcmX", "1NztfEbGYWiaJbom47t--GeCXBKFMfZ3Q", "18XmAMIOCh2DNK1jTgN9HwheiWvpv9pyl", "1BSepiUQ1WKCzq6Romw-YSHgLhAKa39J7", "1BkdG17lSD_3MrWqIYy4U36u4G3oQZMI5", "1UFhf5AILRhxD7dhS3_Zyip2s8WoJWe5y", "19IhSVjmEDra2ENhihgwKyLejCzyZmCaK"]);
const cache=new Map(), pending=new Map();
let manifestPromise=null,endpointOverride='',serial=0,queue=Promise.resolve();
function endpoint(){
 const raw=endpointOverride || global.HSK_DRIVE_AUDIO_CONFIG?.endpoint || '';
 if(!raw)return '';
 const url=new URL(String(raw).trim());
 if(url.protocol!=='https:' || url.hostname!=='script.google.com' || url.username || url.password || url.port ||
    !/^\/macros\/s\/[A-Za-z0-9_-]{20,}\/(?:exec)$/.test(url.pathname))
   throw new Error('C\u1ea7n URL tri\u1ec3n khai Google Apps Script d\u1ea1ng https://script.google.com/macros/s/.../exec.');
 if(url.search || url.hash)throw new Error('D\u00e1n URL /exec nguy\u00ean g\u1ed1c, kh\u00f4ng k\u00e8m tham s\u1ed1 ho\u1eb7c #.');
 return url.href;
}
function requireEndpoint(){const url=endpoint();if(!url)throw new Error('Ch\u01b0a c\u1ea5u h\u00ecnh ngu\u1ed3n Drive. Ch\u1ee7 app c\u1ea7n t\u1ea1o hsk-drive-config.js b\u1eb1ng trang CAU_HINH_AUDIO.html.');return url;}
function request(params,timeout){
 const url=new URL(requireEndpoint());
 return new Promise((resolve,reject)=>{
  const callback='albertHskAudio_'+Date.now().toString(36)+'_'+(++serial);
  const tag=document.createElement('script');let timer,done=false;
  function finish(error,data){
   if(done)return;done=true;clearTimeout(timer);tag.remove();
   // A response to a removed script can arrive late; leave a temporary no-op.
   global[callback]=function(){};setTimeout(()=>{delete global[callback];},Math.max(timeout,30000));
   if(error)reject(error);else resolve(data);
  }
  global[callback]=data=>{
   if(!data || data.protocol!==PROTOCOL)return finish(new Error('Ph\u1ea3n h\u1ed3i kh\u00f4ng \u0111\u00fang b\u1ea3n k\u1ebft n\u1ed1i Workbook.'));
   if(data.ok!==true){
    const details=Array.isArray(data.errors)?data.errors.map(x=>x.message).slice(0,3).join(' / '):'';
    return finish(new Error(String(data.error||details||'Ngu\u1ed3n Drive ch\u01b0a s\u1eb5n s\u00e0ng.')));
   }
   finish(null,data);
  };
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  url.searchParams.set('callback',callback);
  tag.src=url.href;tag.async=true;tag.referrerPolicy='no-referrer';
  tag.onerror=()=>finish(new Error('Kh\u00f4ng k\u1ebft n\u1ed1i \u0111\u01b0\u1ee3c Apps Script. Ki\u1ec3m tra URL /exec, quy\u1ec1n Anyone v\u00e0 k\u1ebft n\u1ed1i m\u1ea1ng.'));
  timer=setTimeout(()=>finish(new Error('Ngu\u1ed3n Drive ph\u1ea3n h\u1ed3i qu\u00e1 l\u00e2u. H\u00e3y th\u1eed l\u1ea1i; b\u00e0i l\u00e0m kh\u00f4ng b\u1ecb m\u1ea5t.')),timeout);
  document.head.appendChild(tag);
 });
}
function validateManifest(data){
 if(data.complete!==true || !Array.isArray(data.entries) || data.entries.length!==16)throw new Error('Ch\u01b0a nh\u1eadn \u0111\u1ee7 16 MP3 t\u01b0\u01a1ng \u1ee9ng.');
 const seenKeys=new Set(),seenIds=new Set();
 for(const item of data.entries){
  const expected=EXPECTED[item.key];
  if(!expected || !ALLOWED.has(item.id) || seenKeys.has(item.key) || seenIds.has(item.id) ||
     item.bytes!==expected.bytes || item.expectedSha256!==expected.sha256)
    throw new Error('Danh s\u00e1ch Drive b\u1ecb tr\u00f9ng, thi\u1ebfu ho\u1eb7c kh\u00f4ng kh\u1edbp b\u1ed9 Workbook g\u1ed1c.');
  seenKeys.add(item.key);seenIds.add(item.id);
 }
 return data;
}
async function manifest(fresh=false){
 if(fresh)manifestPromise=null;
 if(!manifestPromise)manifestPromise=request({mode:'manifest',refresh:fresh?'1':'0'},120000).then(validateManifest).catch(err=>{manifestPromise=null;throw err;});
 return manifestPromise;
}
function decode(base64,size){
 if(typeof base64!=='string' || base64.length!==Math.ceil(size/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
   throw new Error('D\u1eef li\u1ec7u MP3 kh\u00f4ng h\u1ee3p l\u1ec7 ho\u1eb7c ch\u01b0a t\u1ea3i \u0111\u1ee7.');
 const bytes=new Uint8Array(size);let offset=0;
 for(let i=0;i<base64.length;i+=65536){
  const raw=atob(base64.slice(i,i+65536));
  for(let j=0;j<raw.length;j++)bytes[offset++]=raw.charCodeAt(j);
 }
 if(offset!==size)throw new Error('K\u00edch th\u01b0\u1edbc MP3 sau khi gi\u1ea3i m\u00e3 kh\u00f4ng kh\u1edbp.');
 return bytes;
}
async function loadNow(key,onStatus){
 const want=EXPECTED[key];if(!want)throw new Error('B\u00e0i kh\u00f4ng h\u1ee3p l\u1ec7.');
 onStatus?.('\u0110ang \u0111\u1ed1i chi\u1ebfu danh s\u00e1ch MP3 tr\u00ean Drive\u2026');
 const list=await manifest();
 const entry=list.entries.find(x=>x.key===key);
 onStatus?.('\u0110ang t\u1ea3i MP3 t\u1eeb Drive\u2026 L\u1ea7n \u0111\u1ea7u c\u1ea7n ch\u1edd t\u1ea3i xong b\u1ea3n thu.');
 const data=await request({mode:'audio',track:key},240000);
 if(data.key!==key || data.id!==entry.id || data.bytes!==want.bytes || data.sha256!==want.sha256 || data.verified!==true)
   throw new Error('MP3 nh\u1eadn v\u1ec1 kh\u00f4ng \u0111\u00fang file g\u1ed1c c\u1ee7a b\u00e0i.');
 onStatus?.('\u0110ang ki\u1ec3m tra to\u00e0n v\u1eb9n MP3\u2026');
 const bytes=decode(data.base64,want.bytes);delete data.base64;
 if(!global.crypto?.subtle)throw new Error('C\u1ea7n m\u1edf app b\u1eb1ng HTTPS \u0111\u1ec3 ki\u1ec3m tra MP3 an to\u00e0n.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==want.sha256)throw new Error('MP3 kh\u00f4ng kh\u1edbp m\u00e3 SHA-256 c\u1ee7a b\u1ea3n g\u1ed1c.');
 const result={key,id:entry.id,name:entry.name,blob:new Blob([bytes],{type:'audio/mpeg'}),sha256:hash,verified:true};
 cache.set(key,result);while(cache.size>2)cache.delete(cache.keys().next().value);
 return result;
}
async function load(key,onStatus){
 requireEndpoint();
 if(cache.has(key)){const item=cache.get(key);cache.delete(key);cache.set(key,item);return item;}
 if(pending.has(key))return pending.get(key);
 // Serialize downloads to avoid reading several large Drive files simultaneously.
 const task=queue.catch(()=>{}).then(()=>loadNow(key,onStatus));
 queue=task.catch(()=>{});pending.set(key,task);
 try{return await task;}finally{pending.delete(key);}
}
function configure(value){
 if(pending.size)throw new Error('\u0110\u1ee3i ki\u1ec3m tra MP3 hi\u1ec7n t\u1ea1i xong r\u1ed3i \u0111\u1ed5i URL.');
 const previous=endpointOverride;endpointOverride=String(value||'').trim();
 try{requireEndpoint();}catch(e){endpointOverride=previous;throw e;}
 manifestPromise=null;cache.clear();return endpoint();
}
global.AlbertDriveAudio=Object.freeze({endpoint,configure,manifest,load,
 getExpected:()=>JSON.parse(JSON.stringify(EXPECTED)),getIds:()=>Array.from(ALLOWED),
 clearCache:()=>cache.clear(),protocol:PROTOCOL});
})(window);
