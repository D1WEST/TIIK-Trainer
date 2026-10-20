const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
(async()=>{
 const prefix=path.join(os.tmpdir(),'tiik-progress-test-'),dir=await fs.mkdtemp(prefix),url='http://127.0.0.1:18765/api/progress';let child;
 async function start(){child=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{env:{...process.env,PORT:'18765',TIIK_DATA_DIR:dir},windowsHide:true,stdio:'ignore'});for(let i=0;i<50;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Test server not ready');}
 async function stop(){const closed=once(child,'exit');child.kill();await closed;child=null;}
 async function put(p,headers={}){return fetch(url,{method:'PUT',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(p)});}
 try{
  await start();assert.equal((await(await fetch(url)).json()).progress,null);
  const initial={version:1,attempts:[{taskId:1,sessionId:'test',answers:['1','2','3'],correct:true,at:'2026-10-21T00:00:00Z'}],sessions:[{id:'test',taskIds:[1],startedAt:'2026-10-21T00:00:00Z',endedAt:null}],bookmarks:[2],active:{sessionId:'test',ids:[1],index:0,orders:{}},updatedAt:Date.now()};
  assert.equal((await put(initial)).status,200);assert.deepEqual((await(await fetch(url)).json()).progress,initial);
  await stop();await start();assert.deepEqual((await(await fetch(url)).json()).progress,initial,'full process restart');
  assert.equal((await put(initial,{Origin:'https://unrelated.example'})).status,403);
  assert.equal((await put({version:1})).status,400);
  assert.equal((await fetch('http://127.0.0.1:18765/data/progress.json')).status,404);
  const next={...initial,bookmarks:[2,3],updatedAt:initial.updatedAt+1};assert.equal((await put(next)).status,200);
  await fs.writeFile(path.join(dir,'progress.json'),'damaged');
  assert.deepEqual((await(await fetch(url)).json()).progress,initial,'previous copy recovery');
  assert.equal((await put(next)).status,200);await stop();await start();assert.deepEqual((await(await fetch(url)).json()).progress,next);
  console.log('PASS: disk writes, complete server restart, active quiz + answers + bookmarks, backup recovery, invalid input and remote-origin rejection.');
 } finally {if(child)await stop();assert.ok(path.resolve(dir).startsWith(path.resolve(prefix)));for(const file of await fs.readdir(dir))await fs.unlink(path.join(dir,file));await fs.rmdir(dir);}
})().catch(e=>{console.error(e);process.exitCode=1;});
