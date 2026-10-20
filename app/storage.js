/* Redundant browser storage; optional portable-server backup for this computer. */
(function(root){
  'use strict';
  const KEY='tiik-progress-v1';let database=null,pending=null,sending=null,serverAvailable=false;
  const copy=value=>JSON.parse(JSON.stringify(value));
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      const request=indexedDB.open('tiik-progress',1);
      const timer=setTimeout(()=>reject(Error('Storage open timeout')),2000);
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>{clearTimeout(timer);resolve(request.result);};request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);reject(Error('Storage blocked'));};
    });return database;
  }
  async function indexedRead(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),request=tx.objectStore('state').get(KEY);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function indexedWrite(value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function remoteRead(){
    if(!/^https?:$/.test(location.protocol))return null;
    const response=await fetch('./api/progress',{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return null;
    const data=await response.json();if(data.available!==true)return null;
    serverAvailable=true;return data.progress;
  }
  async function drain(){
    if(sending)return sending;
    sending=(async()=>{while(pending){const payload=pending;pending=null;try{
      const response=await fetch('./api/progress',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:JSON.stringify(payload).length<60000});
      if(!response.ok)throw Error('Disk backup failed');
    }catch(error){window.dispatchEvent(new CustomEvent('tiik-storage-error',{detail:'Не удалось обновить файл прогресса. Копия в браузере сохранена.'}));}}})();
    try{await sending;}finally{sending=null;if(pending)await drain();}
  }
  async function load(validate){
    const candidates=[];let invalidLocal=false;
    let raw;try{raw=localStorage.getItem(KEY);}catch{}
    if(raw)try{const value=JSON.parse(raw);if(validate(value))candidates.push(value);else invalidLocal=true;}catch{invalidLocal=true;}
    const results=await Promise.allSettled([indexedRead(),remoteRead()]);
    for(const result of results)if(result.status==='fulfilled'&&result.value&&validate(result.value))candidates.push(result.value);
    const timestamp=p=>Number(p.updatedAt)||Math.max(0,...p.attempts.map(a=>Date.parse(a.at)||0),...p.sessions.map(s=>Date.parse(s.endedAt||s.startedAt)||0));
    candidates.sort((a,b)=>timestamp(b)-timestamp(a)||b.attempts.length-a.attempts.length);
    const best=candidates[0]||null;
    if(best)best.updatedAt=timestamp(best)||Date.now();
    if(best){try{localStorage.setItem(KEY,JSON.stringify(best));}catch{}await indexedWrite(copy(best)).catch(()=>{});}
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
    return {progress:best,corrupt:invalidLocal&&!best,serverAvailable};
  }
  async function save(value){
    const snapshot=copy(value);let local=false;
    try{localStorage.setItem(KEY,JSON.stringify(snapshot));local=true;}catch{}
    const indexed=await indexedWrite(snapshot).then(()=>true,()=>false);
    if(serverAvailable){pending=snapshot;await drain();}
    if(!local&&!indexed&&!serverAvailable)throw Error('No persistent storage available');
  }
  root.TIIK_STORAGE={load,save,flush:drain,get serverAvailable(){return serverAvailable;}};
})(window);
