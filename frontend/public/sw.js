const CACHE_VERSION = '__SW_CACHE_VERSION__';
const STATIC_CACHE_NAME = `atlas-static-${CACHE_VERSION}`;
const ASSETS_CACHE_NAME = `atlas-assets-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `atlas-dynamic-${CACHE_VERSION}`;
const API_CACHE_NAME = `atlas-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
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
  // 不在这里 skipWaiting：新版本安装完成后保持 waiting，
  // 由页面在用户确认后发送 SKIP_WAITING，避免使用中页面被强制换掉。
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      // 单个资源失败不应导致整个 SW 安装失败
      .then(cache => Promise.allSettled(
        STATIC_ASSETS.map(asset => cache.add(asset).catch(() => null))
      ))
  );
});

const CURRENT_CACHES = [STATIC_CACHE_NAME, ASSETS_CACHE_NAME, DYNAMIC_CACHE_NAME, API_CACHE_NAME];

// 历史缓存前缀：codeseek- 为项目更名前的遗留命名
const STALE_CACHE_PREFIXES = ['atlas-', 'codeseek-'];

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => STALE_CACHE_PREFIXES.some(prefix => name.startsWith(prefix)))
            .filter(name => !CURRENT_CACHES.includes(name))
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
  
  // manifest 必须网络优先：缓存优先会让修改后的清单（如 orientation）永远不生效
  if (url.pathname === '/manifest.json') {
    event.respondWith(networkFirst(request, STATIC_CACHE_NAME));
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
    // 导航请求：网络优先，失败时回退到缓存页面，最终回退到内置离线页
    event.respondWith(
      networkFirst(request, DYNAMIC_CACHE_NAME).then(async (response) => {
        if (response.status !== 503) return response;
        const cached = await caches.match(request) || await caches.match('/index.html');
        if (cached) return cached;
        return new Response(
          '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
          '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">' +
          '<title>Atlas - 离线</title></head>' +
          '<body style="margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;' +
          'background:#0a0a0b;color:#e7e5e4;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
          '<div><h1 style="font-size:20px;margin:0 0 8px">当前处于离线状态</h1>' +
          '<p style="font-size:14px;color:#a8a29e;margin:0 0 16px">请检查网络连接后重试</p>' +
          '<button onclick="location.reload()" style="padding:10px 20px;border:0;border-radius:10px;' +
          'background:#d4a853;color:#1c1917;font-weight:600;cursor:pointer">重新加载</button></div></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
    return;
  }
  
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE_NAME));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // 供页面识别 waiting 中的版本号，用于「同一版本只提示一次」的持久化
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE_VERSION });
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
