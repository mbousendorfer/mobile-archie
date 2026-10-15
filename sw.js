// Archie's service worker — what makes the PWA open offline.
//
// Three kinds of request, three strategies:
//   • a navigation (the HTML)       → network first, so a deploy shows up on the
//                                     next open; offline, the cached shell.
//   • our own assets with ?v=N      → cache first. `npm run bump` gives every
//                                     module and stylesheet a new URL, so a
//                                     versioned URL never changes content; the
//                                     entries of older versions are purged.
//   • everything else (the DS on jsDelivr, images, fonts, the manifest)
//                                    → stale-while-revalidate: instant from the
//                                     cache, refreshed behind.
//
// What works offline is what has been opened once online: the static graph
// from the first load, and each lazily imported screen once visited.
//
// Bump SHELL when this file's strategy changes (activate drops other caches).

const SHELL = "archie-shell-v1";
const RUNTIME = "archie-runtime";
const SHELL_URLS = [
  "./",
  "./index.html",
  "./frame.html",
  "./manifest.webmanifest",
  "./assets/pwa/icon-192.png",
  "./assets/pwa/icon-512.png",
  "./assets/pwa/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.origin === self.location.origin && url.searchParams.has("v")) {
    event.respondWith(cacheFirst(request, url.searchParams.get("v")));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, request));
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(request, { ignoreSearch: true })) || (await cache.match("./index.html")) || Response.error()
    );
  }
}

// The newest app version seen; versioned entries of any other version go.
let currentVersion = 0;

async function cacheFirst(request, version) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    if (Number(version) > currentVersion) {
      currentVersion = Number(version);
      purgeOtherVersions(cache, version);
    }
  }
  return response;
}

async function purgeOtherVersions(cache, version) {
  for (const key of await cache.keys()) {
    const v = new URL(key.url).searchParams.get("v");
    if (v && v !== version) cache.delete(key);
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      // Opaque (cross-origin, no CORS) responses are cached too: they are the
      // DS's fonts and icons on jsDelivr, which the app needs offline.
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit || Response.error());
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return refresh;
}
