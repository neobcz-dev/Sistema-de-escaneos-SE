/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const SHARE_CACHE = 'se-compartidos'

// Web Share Target: recibe fotos compartidas desde WhatsApp/galería (Android).
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(manejarCompartir(event.request, url))
  }
})

async function manejarCompartir(request: Request, url: URL): Promise<Response> {
  const base = url.pathname.replace(/share-target$/, '')
  try {
    const form = await request.formData()
    const archivos = form.getAll('foto').filter((f): f is File => f instanceof File)
    const cache = await caches.open(SHARE_CACHE)
    // Limpiar restos anteriores.
    for (const k of await cache.keys()) await cache.delete(k)
    let i = 0
    for (const f of archivos) {
      await cache.put(
        new Request(`shared-${i}`),
        new Response(f, { headers: { 'content-type': f.type || 'image/jpeg' } }),
      )
      i++
    }
    await cache.put(new Request('shared-count'), new Response(String(i)))
  } catch {
    // Si algo falla, igual redirigimos a la app.
  }
  return Response.redirect(`${base}?compartido=1`, 303)
}
