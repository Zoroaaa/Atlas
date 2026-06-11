const CACHE_VERSION = 'v1.0.2';
const STATIC_CACHE_NAME = `codeseek-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `codeseek-dynamic-${CACHE_VERSION}`;
const API_CACHE_NAME = `codeseek-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo.png'
];

const API_CACHE_CONFIG = {
  '/api/search': { strategy: 'network-first', maxAge: 5 * 60 * 1000 },
  '/api/sources': { strategy: 'stale-while-revalidate', maxAge: 30 * 60 * 1000 },
  '/api/config': { strategy: 'stale-while-revalidate', maxAge: 60 * 60 * 1000 },
  '/api/user': { strategy: 'network-first', maxAge: 0 }
};

function getApiCacheConfig(url) {
  const pathname = new URL(url).pathname;
  for (const [path, config] of Object.entries(API_CACHE_CONFIG)) {
    if (pathname.startsWith(path)) {
      return config;
    }
  }
  return null;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('离线状态，资源不可用', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('离线状态，无可用缓存', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetchPromise;
    if (networkResponse) {
      return networkResponse;
    }
  } catch (error) {
    // 网络请求失败
  }
  
  return new Response('离线状态', { 
    status: 503,
    statusText: 'Service Unavailable'
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('codeseek-') && name !== STATIC_CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (request.method !== 'GET') {
    return;
  }
  
  if (url.origin !== location.origin) {
    return;
  }
  
  if (url.pathname.startsWith('/api/')) {
    const config = getApiCacheConfig(request.url);
    if (config) {
      if (config.strategy === 'network-first') {
        event.respondWith(networkFirst(request, API_CACHE_NAME));
      } else {
        event.respondWith(staleWhileRevalidate(request, API_CACHE_NAME));
      }
    } else {
      event.respondWith(networkFirst(request, API_CACHE_NAME));
    }
    return;
  }
  
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname === asset + '/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE_NAME));
    return;
  }
  
  if (request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'font' ||
      request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE_NAME));
    return;
  }
  
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      networkFirst(request, DYNAMIC_CACHE_NAME)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE_NAME));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => caches.delete(name))
        );
      })
    );
  }
});
