import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// El repositorio se publica en GitHub Pages bajo /Sistema-de-escaneos-SE/.
// En desarrollo local usamos la raíz "/".
const base = process.env.NODE_ENV === 'production' ? '/Sistema-de-escaneos-SE/' : '/'

// Sello de versión (fecha/hora de compilación) para saber si la app está al día.
const version = new Date()
  .toISOString()
  .slice(2, 16)
  .replace('T', ' ')

export default defineConfig({
  base,
  define: {
    __BUILD__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/opencv.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
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
        // Recibir fotos compartidas desde otras apps (WhatsApp, galería…).
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            files: [{ name: 'foto', accept: ['image/*'] }],
          },
        },
      },
    }),
  ],
})
