// Flex service worker.
//
// Scope, deliberately small:
//  1. Cache the app shell (this page + icon + manifest) and the hashed build
//     assets it needs, so the app still opens offline. It does NOT cache
//     /api/plan responses — POST requests aren't cacheable via the Cache API,
//     and more importantly, caching a plan response here would risk silently
//     serving a stale journey as if it were fresh. The last successful plan is
//     instead cached explicitly, client-side, in localStorage (see
//     src/lib/offline/cache.ts) with its own visible "as of" timestamp and
//     staleness warning — the shell cache below is unrelated to that and only
//     covers the empty app frame.
//  2. Receive Web Push events and show a notification. This is the "bounded
//     attempt" at real closed-app delivery described in the brief — it only
//     fires for a real push event from the server (see
//     src/app/api/push/test/route.ts), never a fake drawn notification.
//
// Bump SHELL_CACHE to evict everything a previous version stored; `activate`
// deletes every cache that doesn't match the current name.
const SHELL_CACHE = "flex-shell-v2";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Hashed /_next/static/** filenames are immutable, so serving them from the
// cache is always correct. Only a 200 is ever stored: a 404 resolves the fetch
// promise like any other response, and caching one would pin a broken asset
// for the life of the cache.
async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, event) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)));
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Only a navigation may fall back to the app shell. Handing the shell HTML
    // back for a stylesheet or script request makes the browser reject it for
    // having the wrong MIME type, which renders the page completely unstyled —
    // an asset that can't be fetched has to fail as an asset.
    if (request.mode === "navigate") {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch API POSTs

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // map tiles etc. stay on the network
  if (url.pathname.startsWith("/api/")) return; // API GETs stay live, not shell-cached

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, event));
});

self.addEventListener("push", (event) => {
  let payload = { title: "Flex", body: "Your trip conditions changed.", synthetic: false };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* keep default payload */
  }
  const title = payload.synthetic ? `[Test] ${payload.title}` : payload.title;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "flex-trip-update",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
