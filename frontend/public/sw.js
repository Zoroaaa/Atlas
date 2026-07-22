const CACHE_VERSION = '__SW_CACHE_VERSION__';
const STATIC_CACHE_NAME = `codeseek-static-${CACHE_VERSION}`;
const ASSETS_CACHE_NAME = `codeseek-assets-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `codeseek-dynamic-${CACHE_VERSION}`;
const API_CACHE_NAME = `codeseek-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo.svg',
  '/og-image.png'
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

// 用于 HTML 等页面资源的标准缓存优先（只检查状态码）
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
    return new Response('离线状态，资源不可用', { status: 503, statusText: 'Service Unavailable' });
  }
}

// 用于 Vite 构建 assets（/assets/*.js、*.css）的缓存优先
// 关键：_redirects 对不存在路径返回 index.html（200 OK + text/html）
// 必须校验 Content-Type，防止把 HTML 当 JS 缓存导致 SyntaxError
async function assetCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse && isValidAsset(cachedResponse)) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && isValidAsset(networkResponse)) {
      cache.put(request, networkResponse.clone());
    }
    // 即使不是有效资产也原样返回（浏览器会按 200 处理，
    // 但至少不会在下次从缓存中再次返回错误的 HTML）
    return networkResponse;
  } catch (error) {
    // 网络失败且缓存也没有有效资产时，不返回可能损坏的旧缓存
    return new Response('资源不可用', { status: 503, statusText: 'Service Unavailable' });
  }
}

// 校验响应是否为有效的静态资源（排除被 _redirects fallback 成 HTML 的情况）
function isValidAsset(response) {
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  return ct.includes('javascript') || ct.includes('css') ||
         ct.includes('font') || ct.includes('image') ||
         ct.includes('svg') || ct.includes('woff');
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

const CURRENT_CACHES = [STATIC_CACHE_NAME, ASSETS_CACHE_NAME, DYNAMIC_CACHE_NAME, API_CACHE_NAME];

// ... later in activate:

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('codeseek-') && !CURRENT_CACHES.includes(name))
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
  
  // 静态资源（不含 index.html）用 cacheFirst
  if (STATIC_ASSETS.some(asset => url.pathname === asset && asset !== '/' && asset !== '/index.html')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE_NAME));
    return;
  }
  
  // Vite 构建的带 hash 的静态资源（/assets/*.js、*.css）是不可变的
  // 用 assetCacheFirst：校验 Content-Type，防止 _redirects 返回的 HTML 被缓存
  if ((request.destination === 'script' || request.destination === 'style') &&
      url.pathname.startsWith('/assets/')) {
    event.respondWith(assetCacheFirst(request, ASSETS_CACHE_NAME));
    return;
  }

  if (request.destination === 'font' ||
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
