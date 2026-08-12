const CACHE="duopilot-v300-dark-dashboard";
const ASSETS=[
  "./",
  "./index.html",
  "./styles.css?v=3.0.0",
  "./app.js?v=3.0.0",
  "./manifest.json",
  "./config.js?v=3.0.0",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/sonki-lion.png",
  "./assets/sonka-elephant.jpg"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isCore =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/styles.css");

  if (isCore) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?event.data.json():{}}
  catch{payload={body:event.data?event.data.text():"Une échéance approche."}}
  const title=payload.title||"DuoPilot";
  event.waitUntil(self.registration.showNotification(title,{
    body:payload.body||"Une échéance approche.",
    icon:"./assets/icon-192.png",
    badge:"./assets/icon-192.png",
    tag:payload.tag||`duopilot-${Date.now()}`,
    data:{url:payload.url||"./",taskId:payload.taskId||null}
  }));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification.data?.url||"./";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if("focus" in client){client.navigate(target).catch(()=>{});return client.focus()}
    }
    return clients.openWindow?clients.openWindow(target):null;
  }));
});
