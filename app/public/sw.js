const CACHE='proxpanel-v1.7.1-beta.5';
const CORE=[
  '/',
  '/index.html',
  '/styles.css?v=1.7.1-beta.5',
  '/auth-v15.css?v=1.7.1-beta.5',
  '/auth-v15.js?v=1.7.1-beta.5',
  '/app.js?v=1.7.1-beta.5',
  '/manifest.webmanifest',
  '/proxpanel-logo-192.png',
  '/proxpanel-logo-256.png',
  '/proxpanel-logo-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(CORE.map(async url=>{
      try{
        const response=await fetch(url,{cache:'reload'});
        if(response.ok)await cache.put(url,response);
      }catch{}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await Promise.all((await caches.keys()).filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    if(self.registration.navigationPreload)await self.registration.navigationPreload.enable().catch(()=>{});
    await self.clients.claim();
  })());
});

function refreshInBackground(request,cacheKey=request){
  return fetch(request).then(async response=>{
    if(response&&response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(cacheKey,response.clone());
    }
    return response;
  }).catch(()=>null);
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/ws/'))return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cached=await caches.match('/index.html');
      const networkPromise=(async()=>{
        try{
          const preloaded=await event.preloadResponse;
          if(preloaded&&preloaded.ok){
            const cache=await caches.open(CACHE);
            await cache.put('/index.html',preloaded.clone());
            return preloaded;
          }
        }catch{}
        return refreshInBackground(request,'/index.html');
      })();
      if(cached){
        event.waitUntil(networkPromise);
        return cached;
      }
      return (await networkPromise)||new Response('ProxPanel indisponible hors ligne.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })());
    return;
  }

  const isVersionedAppAsset=['/styles.css','/auth-v15.css','/auth-v15.js','/app.js'].includes(url.pathname);
  if(isVersionedAppAsset){
    event.respondWith((async()=>{
      const cached=await caches.match(request);
      if(cached){
        event.waitUntil(refreshInBackground(request));
        return cached;
      }
      return (await refreshInBackground(request))||Response.error();
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached){
      event.waitUntil(refreshInBackground(request));
      return cached;
    }
    return (await refreshInBackground(request))||Response.error();
  })());
});
