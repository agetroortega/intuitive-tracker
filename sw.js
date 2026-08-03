/* Bump CACHE when you change any file — old caches are dropped on activate. */
const CACHE = "intuitive-tracker-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./vendor/preact.js",
  "./vendor/hooks.js",
  "./vendor/htm.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate: instant offline launch, updates land on next open. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  /* A share-target launch arrives as ./index.html?title=…&text=… — that exact
     URL was never cached, so offline it would 404. Serve the cached shell and
     let the page read its own query string. */
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match("./index.html", { ignoreSearch: true }).then(
          (hit) => hit || caches.match("./")
        )
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fresh = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});
