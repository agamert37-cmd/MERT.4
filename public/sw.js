// ═══════════════════════════════════════════════════════════════
//  MERT.4 Service Worker — Uygulama Kabuğu Önbelleği + Arka Plan Sync
//  v1.0
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'isleyen-et-v1';
const OFFLINE_URL = '/';

// Önbelleğe alınacak statik dosyalar (uygulama kabuğu)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
];

// ── Install: uygulama kabuğunu önbelleğe al ─────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: eski önbellekleri temizle ─────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: ağ önce, başarısız olursa önbellekten ─────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // CouchDB, API, veri istekleri → sadece ağdan
  if (
    url.pathname.startsWith('/couchdb') ||
    url.pathname.startsWith('/api') ||
    request.method !== 'GET'
  ) {
    return; // SW geçmez — normal fetch
  }

  // HTML navigasyonu: çevrimdışıysa önbellekten sun
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(r => r || Response.error())
      )
    );
    return;
  }

  // Statik assetler: önce ağdan, başarısız olursa önbellekten
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Başarılı yanıtı önbelleğe ekle
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Background Sync: çevrimdışı dönemde biriken yazmaları tetikle ─
self.addEventListener('sync', (event) => {
  if (event.tag === 'mert-db-sync') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'BACKGROUND_SYNC_TRIGGERED' });
  }
}

// ── Push Bildirimleri (gelecek kullanım için) ────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'İŞLEYEN ET', {
        body: data.body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: data.tag || 'mert-push',
        data: { url: data.url || '/' },
      })
    );
  } catch {}
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
