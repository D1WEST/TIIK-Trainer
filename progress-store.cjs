const fs=require('node:fs/promises'),path=require('node:path');
function valid(p){return !!p&&p.version===1&&Array.isArray(p.attempts)&&Array.isArray(p.sessions)&&Array.isArray(p.bookmarks)&&Number.isFinite(p.updatedAt);}
function createStore(directory){
  const file=path.join(directory,'progress.json'),backup=path.join(directory,'progress.previous.json');let queue=Promise.resolve();
  async function read(){await queue.catch(()=>{});for(const candidate of [file,backup])try{const data=JSON.parse(await fs.readFile(candidate,'utf8'));if(valid(data))return data;}catch{}return null;}
  function write(data){
    if(!valid(data))return Promise.reject(Error('Invalid progress'));
    const payload=JSON.stringify(data,null,2);
    queue=queue.catch(()=>{}).then(async()=>{
      await fs.mkdir(directory,{recursive:true});
      try{const current=JSON.parse(await fs.readFile(file,'utf8'));if(valid(current))await fs.copyFile(file,backup);}catch{}
      const tmp=file+'.tmp';const handle=await fs.open(tmp,'w');try{await handle.writeFile(payload,'utf8');await handle.sync();}finally{await handle.close();}
      await fs.rename(tmp,file);
    });return queue;
  }
  return {read,write};
}
function api(store){return async function(req,res){
  const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const host=req.headers.host||'',origin=req.headers.origin;
  const safeHost=/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  if(!local||!safeHost){res.writeHead(403);return res.end(JSON.stringify({available:false}));}
  try{
    if(req.method==='GET'){res.writeHead(200);return res.end(JSON.stringify({available:true,progress:await store.read()}));}
    if(req.method!=='PUT'){res.writeHead(405);return res.end('{}');}
    if((origin&&origin!=='http://'+host)||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403);return res.end('{}');}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024){res.writeHead(413);return res.end('{}');}chunks.push(chunk);}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{res.writeHead(400);return res.end('{}');}
    if(!valid(data)){res.writeHead(400);return res.end('{}');}
    await store.write(data);res.writeHead(200);res.end('{"saved":true}');
  }catch(error){res.writeHead(500);res.end('{"error":"Progress backup unavailable"}');}
};}
module.exports={createStore,api};
