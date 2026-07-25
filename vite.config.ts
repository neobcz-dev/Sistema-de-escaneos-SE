import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// El repositorio se publica en GitHub Pages bajo /Sistema-de-escaneos-SE/.
// En desarrollo local usamos la raíz "/".
const base = process.env.NODE_ENV === 'production' ? '/Sistema-de-escaneos-SE/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg'],
      manifest: {
        name: 'Servicio Empresarial · Escaneo de Comprobantes',
        short_name: 'SE Escaneos',
        description:
          'Escanee sus comprobantes y envíelos directamente a Servicio Empresarial.',
        lang: 'es',
        theme_color: '#0B2C4D',
        background_color: '#0B2C4D',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // No cacheamos las peticiones a Google (subida de archivos).
        navigateFallbackDenylist: [/^\/macros\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
