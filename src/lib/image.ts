/** Utilidades de imagen: carga, compresión, rotación, recorte (auto y manual)
 *  y filtro "documento" con umbral adaptativo. */

import type { Punto } from '../types'
export type { Punto }
import { detectarEsquinasDePixeles, TOPE_DETECCION } from './esquinas'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    img.src = src
  })
}

/**
 * Decodifica una imagen aplicando su orientación EXIF (from-image). Así una foto
 * tomada de costado con el teléfono sale derecha. Para Blob/File usa
 * createImageBitmap (respeta EXIF de forma explícita en todos los navegadores);
 * para data URLs (imágenes ya generadas por nosotros) usa el <img> normal.
 */
async function decodificarConOrientacion(
  file: File | Blob | string,
): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof file !== 'string' && typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // navegador sin soporte: caemos al método <img>
    }
  }
  const src = typeof file === 'string' ? file : URL.createObjectURL(file)
  try {
    return await loadImage(src)
  } finally {
    if (typeof file !== 'string') URL.revokeObjectURL(src)
  }
}

export interface ImagenProcesada {
  blob: Blob
  dataUrl: string
  width: number
  height: number
}

async function canvasAImagen(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<ImagenProcesada> {
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('No se pudo generar la imagen.')
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return { blob, dataUrl, width: canvas.width, height: canvas.height }
}

export interface OpcionesProceso {
  maxDim?: number
  quality?: number
  /** Intenta detectar y recortar automáticamente la hoja del comprobante. */
  autoRecorte?: boolean
}

/**
 * Comprime a JPEG con un lado máximo `maxDim`. Opcionalmente recorta la hoja
 * del comprobante automáticamente (útil para fotos de cámara con fondo).
 */
export async function procesarImagen(
  file: File | Blob | string,
  opciones: OpcionesProceso = {},
): Promise<ImagenProcesada> {
  const { maxDim = 2200, quality = 0.8, autoRecorte = false } = opciones
  // Decodifica aplicando la ORIENTACIÓN EXIF del teléfono, así una foto tomada
  // de costado sale derecha automáticamente.
  const img = await decodificarConOrientacion(file)
  try {
    // Lienzo de trabajo LIMITADO (no a resolución original) para no agotar la
    // memoria con fotos de celular de 12+ megapíxeles. Todo el procesamiento es
    // liviano en canvas (sin librerías pesadas): nunca congela ni crashea.
    const tope = Math.max(maxDim, 2400)
    const wEsc = Math.min(1, tope / Math.max(img.width, img.height))
    const bw = Math.max(1, Math.round(img.width * wEsc))
    const bh = Math.max(1, Math.round(img.height * wEsc))
    let fuente = document.createElement('canvas')
    fuente.width = bw
    fuente.height = bh
    fuente.getContext('2d')!.drawImage(img, 0, 0, bw, bh)

    let sx = 0
    let sy = 0
    let sw = fuente.width
    let sh = fuente.height

    // Recorte conservador de la hoja (SIN rotar: enderezar automáticamente daba
    // resultados impredecibles). Si no distingue bien la hoja, no recorta.
    if (autoRecorte) {
      const r = detectarHoja(fuente.getContext('2d')!, fuente.width, fuente.height)
      if (r) {
        sx = r.x
        sy = r.y
        sw = r.w
        sh = r.h
      }
    }

    const largest = Math.max(sw, sh)
    const scale = largest > maxDim ? maxDim / largest : 1
    const outW = Math.max(1, Math.round(sw * scale))
    const outH = Math.max(1, Math.round(sh * scale))

    const out = document.createElement('canvas')
    out.width = outW
    out.height = outH
    const octx = out.getContext('2d')!
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, outW, outH)
    octx.drawImage(fuente, sx, sy, sw, sh, 0, 0, outW, outH)
    return await canvasAImagen(out, quality)
  } finally {
    if (typeof (img as ImageBitmap).close === 'function') (img as ImageBitmap).close()
  }
}

export type Filtro = 'color' | 'magico' | 'gris' | 'realce' | 'bn'

/** Ajustes del filtro "mágico": brillo y contraste (rango recomendado -80..80). */
export interface AjustesFiltro {
  brillo: number
  contraste: number
}

export const AJUSTES_MAGICO: AjustesFiltro = { brillo: 8, contraste: 30 }

export interface OpcionesEdicion {
  rotacion?: 0 | 90 | 180 | 270
  crop?: { x: number; y: number; w: number; h: number }
  filtro?: Filtro
  ajustes?: AjustesFiltro
  maxDim?: number
  quality?: number
}

/** Aplica rotación, recorte y/o filtro documento y devuelve una nueva imagen. */
export async function editarImagen(
  src: string,
  opciones: OpcionesEdicion = {},
): Promise<ImagenProcesada> {
  const { rotacion = 0, crop, filtro = 'color', ajustes, maxDim = 2200, quality = 0.8 } = opciones
  const img = await loadImage(src)

  // 1) Rotación.
  const rot = document.createElement('canvas')
  const rctx = rot.getContext('2d')!
  if (rotacion === 90 || rotacion === 270) {
    rot.width = img.height
    rot.height = img.width
  } else {
    rot.width = img.width
    rot.height = img.height
  }
  rctx.save()
  rctx.translate(rot.width / 2, rot.height / 2)
  rctx.rotate((rotacion * Math.PI) / 180)
  rctx.drawImage(img, -img.width / 2, -img.height / 2)
  rctx.restore()

  // 2) Recorte.
  const cx = crop ? Math.round(crop.x * rot.width) : 0
  const cy = crop ? Math.round(crop.y * rot.height) : 0
  const cw = Math.max(1, crop ? Math.round(crop.w * rot.width) : rot.width)
  const ch = Math.max(1, crop ? Math.round(crop.h * rot.height) : rot.height)

  // 3) Escalado.
  const largest = Math.max(cw, ch)
  const scale = largest > maxDim ? maxDim / largest : 1
  const outW = Math.max(1, Math.round(cw * scale))
  const outH = Math.max(1, Math.round(ch * scale))

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const octx = out.getContext('2d')!
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, outW, outH)
  octx.drawImage(rot, cx, cy, cw, ch, 0, 0, outW, outH)

  aplicarFiltro(octx, outW, outH, filtro, ajustes)

  return canvasAImagen(out, quality)
}

/** Aplica el filtro elegido al contexto ya dibujado. */
export function aplicarFiltro(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  filtro: Filtro,
  ajustes?: AjustesFiltro,
): void {
  if (filtro === 'magico') {
    const a = ajustes ?? AJUSTES_MAGICO
    filtroMagico(ctx, w, h, a.brillo, a.contraste)
  } else if (filtro === 'gris') filtroGris(ctx, w, h)
  else if (filtro === 'realce') filtroEscaneo(ctx, w, h, false)
  else if (filtro === 'bn') filtroEscaneo(ctx, w, h, true)
}

/**
 * Filtro "mágico" (estilo ScanSnap): BALANCE DE BLANCOS por canal para
 * neutralizar el tinte de la luz (el papel queda blanco, no beige) y luego
 * brillo/contraste para que el texto quede nítido. El efecto es marcado pero
 * `brillo` y `contraste` lo ajustan (rango recomendado -80..80).
 */
function filtroMagico(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  brillo: number,
  contraste: number,
): void {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const n = w * h

  // Punto blanco POR CANAL (percentil 97 de cada canal ≈ el papel). Escalar
  // cada canal a 255 en su punto blanco quita el tinte de la iluminación.
  const hR = new Uint32Array(256)
  const hG = new Uint32Array(256)
  const hB = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    hR[d[i]]++
    hG[d[i + 1]]++
    hB[d[i + 2]]++
  }
  const puntoBlanco = (hist: Uint32Array): number => {
    let acc = 0
    const obj = n * 0.97
    for (let v = 0; v < 256; v++) {
      acc += hist[v]
      if (acc >= obj) return v
    }
    return 255
  }
  const sR = 255 / Math.max(120, puntoBlanco(hR))
  const sG = 255 / Math.max(120, puntoBlanco(hG))
  const sB = 255 / Math.max(120, puntoBlanco(hB))

  const c = Math.max(-255, Math.min(255, contraste))
  const factor = (259 * (c + 255)) / (255 * (259 - c))
  for (let i = 0; i < d.length; i += 4) {
    // 1) Balance de blancos (neutraliza el tinte, blanquea el papel).
    let r = d[i] * sR
    let g = d[i + 1] * sG
    let b = d[i + 2] * sB
    // 2) Brillo + contraste alrededor de 128.
    r = factor * (r - 128) + 128 + brillo
    g = factor * (g - 128) + 128 + brillo
    b = factor * (b - 128) + 128 + brillo
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
  ctx.putImageData(imgData, 0, 0)
}

/** Escala de grises simple. */
function filtroGris(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(imgData, 0, 0)
}

/**
 * Filtro "escáner": aplana la iluminación dividiendo cada píxel por el FONDO
 * local (media en una ventana grande). Esto borra sombras y viñeteo y deja el
 * papel blanco parejo con el texto oscuro, tal como un escáner real.
 *  - realce (binarizar=false): grises normalizados con contraste (legible, ideal
 *    también para el OCR porque conserva los bordes suaves de las letras).
 *  - B/N (binarizar=true): además umbraliza a blanco y negro puro.
 */
function filtroEscaneo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  binarizar: boolean,
): void {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const n = w * h
  const gray = new Float32Array(n)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }

  // Imagen integral para media local (fondo) rápida.
  const iw = w + 1
  const integral = new Float64Array(iw * (h + 1))
  for (let y = 0; y < h; y++) {
    let fila = 0
    for (let x = 0; x < w; x++) {
      fila += gray[y * w + x]
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + fila
    }
  }

  // Ventana grande = estimación del fondo (no del texto).
  const radio = Math.max(16, Math.floor(Math.min(w, h) / 8))
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio)
    const y1 = Math.min(h - 1, y + radio)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio)
      const x1 = Math.min(w - 1, x + radio)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const suma =
        integral[(y1 + 1) * iw + (x1 + 1)] -
        integral[y0 * iw + (x1 + 1)] -
        integral[(y1 + 1) * iw + x0] +
        integral[y0 * iw + x0]
      const fondo = suma / area
      const g = gray[y * w + x]
      const idx = (y * w + x) * 4
      let v: number
      if (binarizar) {
        v = g < fondo * 0.82 ? 0 : 255
      } else {
        // ratio 1 = fondo (blanco); mapeamos [0.55..1] -> [0..255] para dar
        // blancos limpios y texto oscuro sin quemar los medios tonos.
        let r = fondo > 1 ? g / fondo : 1
        r = (r - 0.55) / 0.45
        v = r <= 0 ? 0 : r >= 1 ? 255 : Math.round(r * 255)
      }
      d[idx] = d[idx + 1] = d[idx + 2] = v
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

interface ComponenteHoja {
  lbl: Int32Array
  etiqueta: number
  aw: number
  ah: number
  escala: number
  minx: number
  miny: number
  maxx: number
  maxy: number
  area: number
  n: number
}

/**
 * Aísla la hoja del comprobante como el COMPONENTE CLARO CONECTADO MÁS GRANDE
 * (la hoja es un bloque claro contiguo; el fondo —mesa, teclado— aporta manchas
 * claras chicas y dispersas que se descartan). Trabaja en baja resolución.
 * Devuelve el mapa de etiquetas y la etiqueta del mayor, o null.
 */
function componenteHoja(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): ComponenteHoja | null {
  const escala = Math.min(1, 600 / Math.max(w, h))
  const aw = Math.max(1, Math.round(w * escala))
  const ah = Math.max(1, Math.round(h * escala))
  const tmp = document.createElement('canvas')
  tmp.width = aw
  tmp.height = ah
  const tctx = tmp.getContext('2d')!
  tctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, aw, ah)
  const data = tctx.getImageData(0, 0, aw, ah).data

  const n = aw * ah
  const gray = new Uint8Array(n)
  const hist = new Array(256).fill(0)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0
    gray[p] = g
    hist[g]++
  }

  // Umbral de Otsu (separa hoja clara de fondo oscuro).
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let maxVar = -1
  let umbral = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const entre = wB * wF * (mB - mF) * (mB - mF)
    if (entre > maxVar) {
      maxVar = entre
      umbral = i
    }
  }

  // Máscara clara + 2 erosiones (rompe puentes finos y borra manchitas).
  let mask: Uint8Array = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = gray[i] > umbral ? 1 : 0
  mask = erosionar(erosionar(mask, aw, ah), aw, ah)

  // Componentes conectados (BFS 4-conex): nos quedamos con el mayor.
  const lbl = new Int32Array(n)
  const pila = new Int32Array(n)
  let etiqueta = 0
  let mejorArea = 0
  let mejor: ComponenteHoja | null = null
  for (let s = 0; s < n; s++) {
    if (!mask[s] || lbl[s]) continue
    etiqueta++
    let sp = 0
    pila[sp++] = s
    lbl[s] = etiqueta
    let area = 0
    let minx = aw
    let miny = ah
    let maxx = 0
    let maxy = 0
    while (sp) {
      const p = pila[--sp]
      area++
      const px = p % aw
      const py = (p / aw) | 0
      if (px < minx) minx = px
      if (px > maxx) maxx = px
      if (py < miny) miny = py
      if (py > maxy) maxy = py
      if (px > 0 && mask[p - 1] && !lbl[p - 1]) { lbl[p - 1] = etiqueta; pila[sp++] = p - 1 }
      if (px < aw - 1 && mask[p + 1] && !lbl[p + 1]) { lbl[p + 1] = etiqueta; pila[sp++] = p + 1 }
      if (py > 0 && mask[p - aw] && !lbl[p - aw]) { lbl[p - aw] = etiqueta; pila[sp++] = p - aw }
      if (py < ah - 1 && mask[p + aw] && !lbl[p + aw]) { lbl[p + aw] = etiqueta; pila[sp++] = p + aw }
    }
    if (area > mejorArea) {
      mejorArea = area
      mejor = { lbl, etiqueta, aw, ah, escala, minx, miny, maxx, maxy, area, n }
    }
  }
  return mejor
}

/**
 * Recuadro (píxeles de la imagen original) de la hoja detectada, o null si no
 * se distingue una hoja razonable (entonces no se recorta automáticamente).
 */
function detectarHoja(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | null {
  const c = componenteHoja(ctx, w, h)
  if (!c) return null
  const rw = c.maxx - c.minx + 1
  const rh = c.maxy - c.miny + 1
  const areaRel = (rw * rh) / c.n
  const fill = c.area / (rw * rh)
  if (areaRel < 0.15 || areaRel > 0.95 || fill < 0.45) return null

  const mx = Math.round(rw * 0.02) + 2
  const my = Math.round(rh * 0.02) + 2
  const x0 = Math.max(0, c.minx - mx)
  const y0 = Math.max(0, c.miny - my)
  const x1 = Math.min(c.aw - 1, c.maxx + mx)
  const y1 = Math.min(c.ah - 1, c.maxy + my)
  const inv = 1 / c.escala
  return {
    x: Math.round(x0 * inv),
    y: Math.round(y0 * inv),
    w: Math.round((x1 - x0 + 1) * inv),
    h: Math.round((y1 - y0 + 1) * inv),
  }
}

/**
 * Detecta automáticamente el recuadro del comprobante por DENSIDAD DE TEXTO.
 * El cálculo pesado (Sobel + componentes conectados) corre en un Web Worker
 * para NO trabar la interfaz; si el worker no está disponible, se hace en el
 * hilo principal como respaldo. Devuelve 4 esquinas NORMALIZADAS (0–1) en
 * orden [tl, tr, br, bl], o null si no hay un bloque de texto claro.
 */
export async function detectarEsquinas(src: string): Promise<Punto[] | null> {
  const esquinas = await detectarEsquinasBruto(src)
  // Descartamos recuadros con proporción irreal (no parecen un comprobante).
  if (esquinas && !validarEsquinas(esquinas)) return null
  return esquinas
}

/** Detección "cruda" (Web Worker con respaldo en el hilo principal). */
async function detectarEsquinasBruto(src: string): Promise<Punto[] | null> {
  const worker = obtenerWorker()
  if (worker) {
    return new Promise<Punto[] | null>((resolve) => {
      const id = ++contadorPeticion
      let resuelto = false
      const terminar = (r: Punto[] | null) => {
        if (resuelto) return
        resuelto = true
        pendientes.delete(id)
        resolve(r)
      }
      pendientes.set(id, terminar)
      worker.postMessage({ id, src })
      // Salvavidas: si el worker no responde, lo hacemos en el hilo principal.
      setTimeout(() => {
        if (!resuelto) detectarEsquinasDirecto(src).then(terminar)
      }, 5000)
    })
  }
  return detectarEsquinasDirecto(src)
}

// --- Web Worker de detección (con respaldo en el hilo principal) ---
let worker: Worker | null = null
let workerRoto = false
let contadorPeticion = 0
const pendientes = new Map<number, (r: Punto[] | null) => void>()

function obtenerWorker(): Worker | null {
  if (workerRoto) return null
  if (worker) return worker
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    workerRoto = true
    return null
  }
  try {
    worker = new Worker(new URL('../workers/esquinas.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<{ id: number; esquinas: Punto[] | null }>) => {
      const cb = pendientes.get(e.data.id)
      if (cb) cb(e.data.esquinas)
    }
    worker.onerror = () => {
      // Si el worker falla, marcamos y seguimos con el hilo principal.
      workerRoto = true
      worker = null
    }
    return worker
  } catch {
    workerRoto = true
    return null
  }
}

/** Detección en el hilo principal (respaldo si no hay Worker/OffscreenCanvas). */
async function detectarEsquinasDirecto(src: string): Promise<Punto[] | null> {
  try {
    const img = await loadImage(src)
    const esc = Math.min(1, TOPE_DETECCION / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * esc))
    const h = Math.max(1, Math.round(img.height * esc))
    if (w < 40 || h < 40) return null
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const d = ctx.getImageData(0, 0, w, h).data
    return detectarEsquinasDePixeles(d, w, h)
  } catch {
    return null
  }
}

/** Erosión morfológica 3×3 (mantiene el píxel solo si todos sus vecinos son 1). */
function erosionar(m: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(m.length)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      if (!m[idx]) continue
      if (
        m[idx - 1] && m[idx + 1] && m[idx - w] && m[idx + w] &&
        m[idx - w - 1] && m[idx - w + 1] && m[idx + w - 1] && m[idx + w + 1]
      ) {
        o[idx] = 1
      }
    }
  }
  return o
}

/**
 * Recorte con corrección de perspectiva a partir de 4 esquinas MANUALES.
 * Las esquinas vienen normalizadas (0–1) en orden [sup-izq, sup-der, inf-der,
 * inf-izq]. Se "endereza" el cuadrilátero a un rectángulo (dewarp por
 * homografía). Es matemática liviana en canvas: nunca congela ni crashea.
 */
export async function recortarPerspectiva(
  src: string,
  esquinas: Punto[],
  filtro: Filtro = 'color',
  maxDim = 2200,
  quality = 0.85,
  ajustes?: AjustesFiltro,
): Promise<ImagenProcesada> {
  const img = await loadImage(src)

  // Lienzo fuente LIMITADO (fotos de celular de 12+ MP agotarían memoria).
  const tope = Math.max(maxDim, 2600)
  const esc = Math.min(1, tope / Math.max(img.width, img.height))
  const bw = Math.max(1, Math.round(img.width * esc))
  const bh = Math.max(1, Math.round(img.height * esc))
  const fuente = document.createElement('canvas')
  fuente.width = bw
  fuente.height = bh
  fuente.getContext('2d')!.drawImage(img, 0, 0, bw, bh)

  // Esquinas normalizadas -> píxeles del lienzo fuente.
  const p = esquinas.map((e) => ({
    x: clampNum(e.x, 0, 1) * bw,
    y: clampNum(e.y, 0, 1) * bh,
  }))
  const [tl, tr, br, bl] = p

  // Tamaño de salida a partir de los largos de los lados (promedio de opuestos).
  const wTop = dist(tl, tr)
  const wBot = dist(bl, br)
  const hL = dist(tl, bl)
  const hR = dist(tr, br)
  let outW = Math.round(Math.max(wTop, wBot))
  let outH = Math.round(Math.max(hL, hR))
  outW = Math.max(1, outW)
  outH = Math.max(1, outH)
  // Tope al lado mayor.
  const mayor = Math.max(outW, outH)
  if (mayor > maxDim) {
    const s = maxDim / mayor
    outW = Math.max(1, Math.round(outW * s))
    outH = Math.max(1, Math.round(outH * s))
  }

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const octx = out.getContext('2d')!
  warpPerspectiva(fuente, [tl, tr, br, bl], octx, outW, outH)

  // Auto-recorte de los márgenes blancos que quedan tras enderezar/deformar.
  let lienzo = out
  let lw = outW
  let lh = outH
  let lctx = octx
  const rec = recortarMargenesBlancos(octx, outW, outH)
  if (rec.w < outW * 0.95 || rec.h < outH * 0.95) {
    const cortado = document.createElement('canvas')
    cortado.width = Math.max(1, rec.w)
    cortado.height = Math.max(1, rec.h)
    const cctx = cortado.getContext('2d')!
    cctx.drawImage(out, rec.x, rec.y, rec.w, rec.h, 0, 0, rec.w, rec.h)
    lienzo = cortado
    lw = cortado.width
    lh = cortado.height
    lctx = cctx
  }

  aplicarFiltro(lctx, lw, lh, filtro, ajustes)

  return canvasAImagen(lienzo, quality)
}

function dist(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clampNum(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Mapea el cuadrilátero `q` (en píxeles de `fuente`, orden tl,tr,br,bl) al
 * rectángulo de salida outW×outH mediante una homografía (mapeo cuadrado→quad
 * de Heckbert, invertido por muestreo inverso) con interpolación bilineal.
 */
function warpPerspectiva(
  fuente: HTMLCanvasElement,
  q: Punto[],
  octx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
): void {
  const sctx = fuente.getContext('2d')!
  const srcData = sctx.getImageData(0, 0, fuente.width, fuente.height)
  const sd = srcData.data
  const sw = fuente.width
  const sh = fuente.height

  // Coeficientes del mapeo del cuadrado unitario -> cuadrilátero q.
  const [p0, p1, p2, p3] = q // tl(0,0) tr(1,0) br(1,1) bl(0,1)
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y

  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, hh: number
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // Caso afín (el cuadrilátero es un paralelogramo).
    a = p1.x - p0.x
    b = p2.x - p1.x
    c = p0.x
    d = p1.y - p0.y
    e = p2.y - p1.y
    f = p0.y
    g = 0
    hh = 0
  } else {
    const den = dx1 * dy2 - dx2 * dy1
    g = (dx3 * dy2 - dx2 * dy3) / den
    hh = (dx1 * dy3 - dx3 * dy1) / den
    a = p1.x - p0.x + g * p1.x
    b = p3.x - p0.x + hh * p3.x
    c = p0.x
    d = p1.y - p0.y + g * p1.y
    e = p3.y - p0.y + hh * p3.y
    f = p0.y
  }

  const outImg = octx.createImageData(outW, outH)
  const od = outImg.data
  for (let y = 0; y < outH; y++) {
    const t = (y + 0.5) / outH
    for (let x = 0; x < outW; x++) {
      const s = (x + 0.5) / outW
      const den = g * s + hh * t + 1
      const sxf = (a * s + b * t + c) / den
      const syf = (d * s + e * t + f) / den
      const oIdx = (y * outW + x) * 4
      // Interpolación bilineal en la fuente (fondo blanco fuera de límites).
      if (sxf < 0 || syf < 0 || sxf > sw - 1 || syf > sh - 1) {
        od[oIdx] = od[oIdx + 1] = od[oIdx + 2] = 255
        od[oIdx + 3] = 255
        continue
      }
      const x0 = sxf | 0
      const y0 = syf | 0
      const x1 = x0 + 1 < sw ? x0 + 1 : x0
      const y1 = y0 + 1 < sh ? y0 + 1 : y0
      const fx = sxf - x0
      const fy = syf - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      for (let k = 0; k < 3; k++) {
        const top = sd[i00 + k] * (1 - fx) + sd[i10 + k] * fx
        const bot = sd[i01 + k] * (1 - fx) + sd[i11 + k] * fx
        od[oIdx + k] = (top * (1 - fy) + bot * fy) | 0
      }
      od[oIdx + 3] = 255
    }
  }
  octx.putImageData(outImg, 0, 0)
}

/** Miniatura pequeña (dataURL JPEG) para guardar en el historial local. */
export async function crearMiniatura(src: string, maxDim = 220, quality = 0.6): Promise<string> {
  try {
    const img = await loadImage(src)
    const esc = Math.min(1, maxDim / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * esc))
    const h = Math.max(1, Math.round(img.height * esc))
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    cv.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return cv.toDataURL('image/jpeg', quality)
  } catch {
    return ''
  }
}

/** Extrae la parte base64 (sin el prefijo data:) de un data URL. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

/** Convierte un Blob a base64 (sin prefijo). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(dataUrlToBase64(String(reader.result)))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Endereza (deskew) la imagen: detecta la inclinación de las líneas de texto
 * por PROYECCIÓN DE PERFILES sobre una miniatura de 200 px, y rota la imagen
 * ORIGINAL sólo si el ángulo supera 0.5°. Devuelve un dataUrl JPEG (0.92).
 */
export async function enderezar(src: string): Promise<string> {
  try {
    const img = await loadImage(src)
    // Miniatura de análisis (lado mayor 200 px).
    const esc = Math.min(1, 200 / Math.max(img.width, img.height))
    const tw = Math.max(1, Math.round(img.width * esc))
    const th = Math.max(1, Math.round(img.height * esc))
    const mini = document.createElement('canvas')
    mini.width = tw
    mini.height = th
    const mctx = mini.getContext('2d')!
    mctx.drawImage(img, 0, 0, tw, th)
    const data = mctx.getImageData(0, 0, tw, th).data

    // Binarizamos la tinta (píxeles oscuros) sobre blanco, para rotar y medir.
    const n = tw * th
    const gray = new Float32Array(n)
    let suma = 0
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      suma += gray[p]
    }
    const media = suma / n
    const ink = document.createElement('canvas')
    ink.width = tw
    ink.height = th
    const ictx = ink.getContext('2d')!
    const im = ictx.createImageData(tw, th)
    for (let p = 0; p < n; p++) {
      const v = gray[p] < media - 20 ? 0 : 255
      const j = p * 4
      im.data[j] = im.data[j + 1] = im.data[j + 2] = v
      im.data[j + 3] = 255
    }
    ictx.putImageData(im, 0, 0)

    // "Nitidez" de las líneas: varianza del perfil de filas (suma de tinta por
    // fila). El texto derecho da filas muy marcadas -> puntaje alto.
    const puntaje = (angulo: number): number => {
      const rc = document.createElement('canvas')
      rc.width = tw
      rc.height = th
      const rctx = rc.getContext('2d')!
      rctx.fillStyle = '#ffffff'
      rctx.fillRect(0, 0, tw, th)
      rctx.save()
      rctx.translate(tw / 2, th / 2)
      rctx.rotate((angulo * Math.PI) / 180)
      rctx.drawImage(ink, -tw / 2, -th / 2)
      rctx.restore()
      const dd = rctx.getImageData(0, 0, tw, th).data
      const filas = new Float32Array(th)
      for (let y = 0; y < th; y++) {
        let c = 0
        for (let x = 0; x < tw; x++) if (dd[(y * tw + x) * 4] < 128) c++
        filas[y] = c
      }
      let s = 0
      for (let y = 1; y < th; y++) {
        const df = filas[y] - filas[y - 1]
        s += df * df
      }
      return s
    }

    let mejorAng = 0
    let mejorPunt = -1
    for (let a = -8; a <= 8; a += 0.5) {
      const p = puntaje(a)
      if (p > mejorPunt) {
        mejorPunt = p
        mejorAng = a
      }
    }
    if (Math.abs(mejorAng) <= 0.5) return src

    // Rotamos la imagen ORIGINAL por el ángulo hallado (lienzo agrandado para
    // no cortar esquinas; el fondo nuevo queda blanco).
    const rad = (mejorAng * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const nw = Math.max(1, Math.round(img.width * cos + img.height * sin))
    const nh = Math.max(1, Math.round(img.width * sin + img.height * cos))
    const out = document.createElement('canvas')
    out.width = nw
    out.height = nh
    const octx = out.getContext('2d')!
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, nw, nh)
    octx.translate(nw / 2, nh / 2)
    octx.rotate(rad)
    octx.drawImage(img, -img.width / 2, -img.height / 2)
    return out.toDataURL('image/jpeg', 0.92)
  } catch {
    return src
  }
}

/**
 * Recorta los MÁRGENES BLANCOS: descarta las filas/columnas de los bordes donde
 * más del 98% de los píxeles superan el umbral 240 (casi blanco). Devuelve el
 * rectángulo útil {x, y, w, h} dentro del contexto.
 */
export function recortarMargenesBlancos(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const d = ctx.getImageData(0, 0, w, h).data
  const umbral = 240
  const blanco = (i: number) => {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    return g >= umbral
  }
  const filaBlanca = (y: number) => {
    let b = 0
    for (let x = 0; x < w; x++) if (blanco((y * w + x) * 4)) b++
    return b / w > 0.98
  }
  const colBlanca = (x: number) => {
    let b = 0
    for (let y = 0; y < h; y++) if (blanco((y * w + x) * 4)) b++
    return b / h > 0.98
  }
  let top = 0
  while (top < h - 1 && filaBlanca(top)) top++
  let bottom = h - 1
  while (bottom > top && filaBlanca(bottom)) bottom--
  let left = 0
  while (left < w - 1 && colBlanca(left)) left++
  let right = w - 1
  while (right > left && colBlanca(right)) right--
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
}

/**
 * Detecta las 4 esquinas del comprobante usando `componenteHoja()` (el
 * componente CLARO más grande = la hoja). Devuelve las esquinas del bounding
 * box NORMALIZADAS (0–1) en orden [tl, tr, br, bl], o null si no hay una hoja
 * razonable (areaRel 0.15–0.95, fill > 0.45).
 */
export async function detectarEsquinasPorHoja(src: string): Promise<Punto[] | null> {
  try {
    const img = await loadImage(src)
    const tope = 1000
    const esc = Math.min(1, tope / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * esc))
    const h = Math.max(1, Math.round(img.height * esc))
    if (w < 40 || h < 40) return null
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)

    const c = componenteHoja(ctx, w, h)
    if (!c) return null
    const rw = c.maxx - c.minx + 1
    const rh = c.maxy - c.miny + 1
    const areaRel = (rw * rh) / c.n
    const fill = c.area / (rw * rh)
    if (areaRel < 0.15 || areaRel > 0.95 || fill < 0.45) return null

    const x0 = c.minx / c.aw
    const y0 = c.miny / c.ah
    const x1 = (c.maxx + 1) / c.aw
    const y1 = (c.maxy + 1) / c.ah
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]
  } catch {
    return null
  }
}

/**
 * Valida un juego de 4 esquinas: la proporción (ancho/alto) del bounding box
 * debe ser razonable y el recuadro no demasiado chico (coordenadas 0–1).
 */
export function validarEsquinas(e: Punto[]): boolean {
  if (!e || e.length < 4) return false
  const xs = e.map((p) => p.x)
  const ys = e.map((p) => p.y)
  const ancho = Math.max(...xs) - Math.min(...xs)
  const alto = Math.max(...ys) - Math.min(...ys)
  if (ancho < 0.15 || alto < 0.1) return false
  const aspecto = ancho / alto
  return aspecto >= 0.35 && aspecto <= 2.5
}
