/* Static app + loopback-only progress backup. Data files are never served. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createStore,api}=require('./progress-store.cjs');
const progressAPI=api(createStore(process.env.TIIK_DATA_DIR||path.join(__dirname,'data')));
const root=path.join(__dirname,'app'),port=Number(process.env.PORT||8765);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.sqlite':'application/vnd.sqlite3'};
const server=http.createServer((req,res)=>{
  if(req.url.split('?')[0]==='/api/progress')return progressAPI(req,res);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.includes('\0'))throw Error('Bad path');}catch{res.writeHead(400);return res.end();}
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
  });
});
server.on('error',e=>{if(e.code==='EADDRINUSE')console.error('Port '+port+' is already in use. Open http://localhost:'+port+' or set PORT to another value.');else console.error(e.message);process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>{
  const url='http://localhost:'+port;
  console.log('\n TIIK Trainer / 529 tasks\n\n Computer: '+url+'\n');
  for(const list of Object.values(os.networkInterfaces())) for(const net of list||[]) if(net.family==='IPv4'&&!net.internal)console.log(' Phone (same Wi-Fi): http://'+net.address+':'+port);
  console.log('\n Keep this window open. Ctrl+C to stop.\n Phone installation requires HTTPS; see README.md.');
  if(process.argv.includes('--open')&&process.platform==='win32')spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true}).unref();
});
