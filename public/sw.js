// Cache only this self-contained build. No stock API, analytics or remote assets.
const VERSION='index-flight-__BUILD__';
const ASSETS=/*__PRECACHE__*/ ['./','./data/sse_composite_daily.json'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('index-flight-')&&k!==VERSION).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;if(new URL(event.request.url).pathname.endsWith('/build-info.json'))return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();void caches.open(VERSION).then(cache=>cache.put(event.request,clone));}return response;}).catch(()=>caches.match(event.request).then(hit=>hit||Response.error())));});
