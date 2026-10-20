/* tools/build_bank.py derives CACHE from all application resources. */
const CACHE = 'tiik-2f69886816c52ae6';
async function notify(type) { for (const client of await self.clients.matchAll({includeUncontrolled:true})) client.postMessage({type}); }
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try {
    const response=await fetch('./precache.json',{cache:'no-store'});
    if(!response.ok)throw Error('Manifest not available');
    const files=await response.json();
    // Small batches avoid overwhelming mobile browsers with 2000 simultaneous requests.
    for(let i=0;i<files.length;i+=12) await Promise.all(files.slice(i,i+12).map(async file=>{
      const url=new URL(file,self.registration.scope).href;
      const response=await fetch(url,{cache:'reload'});if(!response.ok)throw Error(file);
      await cache.put(url,response);
    }));
    await cache.put(new URL('./offline-ready',self.registration.scope),new Response('ready'));
    await self.skipWaiting();
  } catch(error) {await cache.delete(new URL('./offline-ready',self.registration.scope));await notify('offline-error');throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys()) if(name.startsWith('tiik-')&&name!==CACHE) await caches.delete(name);
  await self.clients.claim();await notify('offline-ready');
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),url=new URL(event.request.url);
    const cached=await cache.match(event.request);
    if(cached)return cached;
    if(event.request.mode==='navigate')return (await cache.match(new URL('./index.html',self.registration.scope)))||fetch(event.request);
    return fetch(event.request);
  })());
});
