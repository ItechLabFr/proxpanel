const CACHE='proxpanel-v1.7.0-beta.16';
const CORE=['/','/index.html','/styles.css?v=1.7.0-beta.16','/auth-v15.css?v=1.7.0-beta.16','/auth-v15.js?v=1.7.0-beta.16','/app.js?v=1.7.0-beta.16','/manifest.webmanifest','/proxpanel-logo-192.png','/proxpanel-logo-256.png','/proxpanel-logo-512.png','/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.pathname.startsWith('/ws/')) return;
  // Navigation remains network-first so a newly deployed release is discovered.
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('/index.html',copy));return r;}).catch(()=>caches.match('/index.html')));
    return;
  }
  const isAppAsset=u.pathname==='/styles.css'||u.pathname==='/auth-v15.css'||u.pathname==='/auth-v15.js'||u.pathname==='/app.js'||u.pathname==='/sw.js';
  if(isAppAsset){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    const network=fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>cached);
    return cached||network;
  }));
});
