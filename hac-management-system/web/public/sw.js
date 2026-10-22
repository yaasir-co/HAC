/* Public assets only. Manifest and icons use the network first so installed branding can update. */
const CACHE='hac-public-shell-v4';
const PUBLIC_ASSETS=['/offline.html','/branding/hac-original-v4-192.png','/branding/hac-original-v4-512.png','/branding/hac-original-apple-v4.png','/branding/hac-wordmark.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC_ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('hac-public-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname==='/manifest.webmanifest'){event.respondWith(fetch(new Request(request,{cache:'no-store'})));return;}
  if(PUBLIC_ASSETS.includes(url.pathname)){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match(request)));return;}
  if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));
});
