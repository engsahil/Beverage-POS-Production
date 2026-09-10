# PWA Setup Guide - Beverage POS

## Overview

This directory contains the Progressive Web App (PWA) foundation for the Beverage POS system. These files enable installability, offline capability, and enhanced user experience.

## Files

### `manifest.json`
Web App Manifest that defines how the app appears when installed:
- App name: "Beverage POS - Pakistan"
- Short name: "BevPOS"
- Theme color: Red (#dc2626) matching the locked design system
- Display mode: Standalone (full-screen app experience)
- Icons: Multiple sizes for different devices
- Shortcuts: Quick access to New Sale, Dashboard, Inventory

### `sw.js` (Service Worker)
Handles offline caching and network strategies:

**Caching Strategies:**
- **Static Assets** (JS, CSS, fonts): Cache First - instant loading
- **Images**: Cache First with 7-day expiration
- **HTML Pages**: Network First with offline fallback
- **API Responses**: Network First - never cache sensitive data

**Features:**
- Automatic cache cleanup on update
- Offline fallback to `offline.html`
- Skip waiting on update
- Message handling for cache control

### `offline.html`
Beautiful offline page shown when:
- User loses internet connection
- POS is in offline mode
- Network requests fail

**Features:**
- Matches locked Red + White + Off-White + Brown design
- Shows what users can do offline
- Auto-retry on connection restore
- Professional, reassuring messaging

## Installation

### For Development
1. Serve the `public` directory with any static file server
2. Access via HTTPS (required for service worker)
3. Open browser DevTools > Application > Service Workers
4. Verify service worker is registered

### For Production
1. Copy `public/*` to your web server's public directory
2. Ensure HTTPS is configured
3. Add to your HTML `<head>`:

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#dc2626">
<link rel="apple-touch-icon" href="/icons/icon-192x192.png">

<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg))
        .catch(err => console.error('SW failed:', err));
    });
  }
</script>
```

## Icons Required

Generate these icon sizes in `/public/icons/`:
- `icon-72x72.png`
- `icon-96x96.png`
- `icon-128x128.png`
- `icon-144x144.png`
- `icon-152x152.png`
- `icon-192x192.png`
- `icon-384x384.png`
- `icon-512x512.png`

**Design Guidelines:**
- Use the locked red color (#dc2626) as primary
- Keep design simple and recognizable at small sizes
- Test on both light and dark backgrounds
- Ensure clarity at 72x72 (smallest size)

## Offline Capabilities

The service worker enables:

### What Works Offline:
✅ Cached static assets (JS, CSS, fonts)  
✅ Previously loaded images  
✅ Offline fallback page  
✅ POS operations (via offline-db package)  
✅ Queued transactions  

### What Requires Network:
❌ API calls to server  
❌ Real-time updates  
❌ Cloud backup  
❌ WhatsApp notifications  
❌ Initial data load  

## Security Considerations

### Service Worker Safety:
- **Never caches API responses** - sensitive data stays on server
- **HTTPS only** - service workers require secure context
- **Scope limited** - only caches same-origin requests
- **Cache versioning** - old caches deleted on update
- **No cross-origin caching** - prevents data leakage

### Offline Data Safety:
- Uses IndexedDB via `@beverage-pos/offline-db` package
- Pending transactions stored locally
- Automatic sync when online
- Conflict resolution handled by sync engine
- Never stores passwords or secrets

## Testing

### Test Offline Mode:
1. Open DevTools > Application > Service Workers
2. Check "Offline" checkbox
3. Reload page - should see offline.html
4. Uncheck "Offline" - should auto-reload

### Test Installation:
1. Open in Chrome/Edge
2. Look for install icon in address bar
3. Click "Install" button
4. Verify app opens in standalone window

### Test Cache:
1. Open DevTools > Application > Cache Storage
2. Verify `bevpos-static-v1` cache exists
3. Check cached assets
4. Clear cache and verify re-population

## Browser Support

✅ Chrome/Edge 90+  
✅ Firefox 90+  
✅ Safari 14+  
✅ Samsung Internet 14+  

## Troubleshooting

### Service Worker Not Registering
- Must be served over HTTPS (localhost is OK)
- Check browser console for errors
- Verify `sw.js` is accessible at `/sw.js`

### Offline Page Not Showing
- Clear browser cache
- Check service worker is active
- Verify `offline.html` is cached

### App Not Installable
- Must have valid `manifest.json`
- Must have service worker registered
- Must be served over HTTPS
- Must have appropriate icons

## Updates

When updating the app:
1. Increment `CACHE_NAME` in `sw.js`
2. Service worker will detect change
3. Old caches automatically deleted
4. New assets cached on next visit

**Never force-refresh during active transactions!**

## Integration with POS

The PWA integrates with existing Phase 16/17/18 packages:

```
POS Frontend (Future)
    ↓
Service Worker (This)
    ↓
Offline DB (@beverage-pos/offline-db)
    ↓
Sync Engine (Phase 17)
    ↓
Realtime Client (@beverage-pos/realtime-client)
    ↓
Server API (Phase 1-23)
    ↓
PostgreSQL
```

## Next Steps

1. Build actual POS/Admin frontend (React/Vue/etc)
2. Generate app icons
3. Test on real devices (mobile, tablet, desktop)
4. Measure performance with Lighthouse
5. Add to app stores (optional)

## Performance Targets

- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Lighthouse PWA Score**: > 90
- **Offline Load Time**: < 500ms
- **Service Worker Install**: < 2s

## Support

For issues or questions:
- Check browser console for errors
- Review service worker lifecycle in DevTools
- Verify network requests in Network tab
- Test with Lighthouse PWA audit
