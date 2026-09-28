/* Service worker do app instalável (PWA).

   Guarda em cache SÓ a "casca" do app, que é pública: arquivos do build
   (/assets/*, com hash no nome), ícones, manifesto e a página inicial. Dados
   NUNCA passam por aqui: as chamadas à API vão para outra origem (o Worker da
   Cloudflare) e são ignoradas, assim como qualquer rota /api/ — dados de
   colaboradores não ficam gravados no aparelho por este cache.

   - Página (navegação): rede primeiro, para sempre abrir a versão publicada
     mais nova; sem rede, cai na última cópia guardada.
   - /assets/*: cache primeiro (o hash no nome muda a cada build, então um
     arquivo guardado nunca fica desatualizado).
   - Demais arquivos estáticos da mesma origem: rede primeiro, cache de reserva.

   Trocar CACHE_VERSION descarta os caches antigos na próxima ativação. */
const CACHE_VERSION = "gg-pwa-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(["./", "./manifest.webmanifest", "./favicon.png", "./icons/icon-192.png", "./icons/icon-512.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.includes("/api/")) return false;
  return true;
}

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(fallbackKey || request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(fallbackKey || request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isCacheable(request, url)) return;

  if (request.mode === "navigate") {
    /* SPA com hash history: toda navegação é a mesma página inicial. */
    event.respondWith(networkFirst(request, "./"));
    return;
  }
  if (url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
