/**
 * Phase 24: Service Worker
 * Provides offline capability and caching for the POS application
 * 
 * Caching Strategy:
 * - Static assets (JS, CSS, fonts): Cache First
 * - API responses: Network First (never cache sensitive data)
 * - Images: Cache First with expiration
 * - HTML pages: Network First with offline fallback
 */

const CACHE_NAME = 'bevpos-v1';
const STATIC_CACHE = 'bevpos-static-v1';
const IMAGE_CACHE = 'bevpos-images-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/pos',
  '/admin',
  '/offline.html',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== IMAGE_CACHE) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // API requests - Network First (never cache sensitive data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Static assets (JS, CSS, fonts) - Cache First
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // Images - Cache First with expiration
  if (isImage(url.pathname)) {
    event.respondWith(cacheFirstWithExpiration(request, IMAGE_CACHE, 7 * 24 * 60 * 60 * 1000)); // 7 days
    return;
  }
  
  // HTML pages - Network First with offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithFallback(request, '/offline.html'));
    return;
  }
  
  // Default - Network First
  event.respondWith(networkFirst(request));
});

// Strategy: Cache First
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[Service Worker] Cache first failed:', error);
    throw error;
  }
}

// Strategy: Cache First with expiration
async function cacheFirstWithExpiration(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  if (cached) {
    const cachedDate = cached.headers.get('date');
    if (cachedDate) {
      const age = Date.now() - new Date(cachedDate).getTime();
      if (age < maxAge) {
        return cached;
      }
    }
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cached) {
      return cached; // Return stale cache on network error
    }
    throw error;
  }
}

// Strategy: Network First
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

// Strategy: Network First with fallback
async function networkFirstWithFallback(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    const fallback = await caches.match(fallbackUrl);
    if (fallback) {
      return fallback;
    }
    
    throw error;
  }
}

// Helper: Check if URL is a static asset
function isStaticAsset(pathname) {
  return pathname.endsWith('.js') ||
         pathname.endsWith('.css') ||
         pathname.endsWith('.woff') ||
         pathname.endsWith('.woff2') ||
         pathname.endsWith('.ttf') ||
         pathname.endsWith('.eot');
}

// Helper: Check if URL is an image
function isImage(pathname) {
  return pathname.endsWith('.png') ||
         pathname.endsWith('.jpg') ||
         pathname.endsWith('.jpeg') ||
         pathname.endsWith('.gif') ||
         pathname.endsWith('.svg') ||
         pathname.endsWith('.webp');
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => caches.delete(cacheName));
    });
  }
});
