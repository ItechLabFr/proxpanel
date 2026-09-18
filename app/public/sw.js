const CACHE='proxpanel-v1.7.1-beta.6';
const CORE=[
  '/',
  '/index.html',
  '/styles.css?v=1.7.1-beta.6',
  '/auth-v15.css?v=1.7.1-beta.6',
  '/auth-v15.js?v=1.7.1-beta.6',
  '/app.js?v=1.7.1-beta.6',
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
        if(response.ok)await cache.put(url,response.clone());
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

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

async function putCache(key,response){
  if(!response?.ok)return response;
  const cache=await caches.open(CACHE);
  await cache.put(key,response.clone());
  return response;
}

async function networkFirst(request,cacheKey=request,{preload=null}={}){
  try{
    const preloaded=await preload;
    if(preloaded?.ok)return await putCache(cacheKey,preloaded);
  }catch{}
  try{
    const response=await fetch(request,{cache:'no-cache'});
    if(response?.ok)return await putCache(cacheKey,response);
  }catch{}
  return (await caches.match(cacheKey))||(await caches.match(request))||null;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/ws/'))return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const response=await networkFirst(request,'/index.html',{preload:event.preloadResponse});
      return response||new Response('ProxPanel indisponible hors ligne.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })());
    return;
  }

  const criticalAsset=['/styles.css','/auth-v15.css','/auth-v15.js','/app.js','/sw.js','/manifest.webmanifest'].includes(url.pathname);
  if(criticalAsset){
    event.respondWith((async()=>{
      const response=await networkFirst(request,request);
      return response||Response.error();
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    try{
      const response=await fetch(request);
      if(response?.ok)return await putCache(request,response);
      return response;
    }catch{
      return Response.error();
    }
  })());
});
