// Genera los íconos PNG de la PWA a partir de public/favicon.svg
// Uso: npm run gen:icons
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pub = resolve(__dirname, '..', 'public')
const svg = readFileSync(resolve(pub, 'favicon.svg'))

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512 },
]

for (const t of targets) {
  await sharp(svg, { density: 384 })
    .resize(t.size, t.size, { fit: 'contain', background: { r: 11, g: 44, b: 77, alpha: 1 } })
    .png()
    .toFile(resolve(pub, t.name))
  console.log('✓', t.name)
}
