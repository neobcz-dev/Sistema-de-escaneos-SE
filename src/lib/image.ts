/** Utilidades de imagen: carga, compresión, rotación, recorte (auto y manual)
 *  y filtro "documento" con umbral adaptativo. */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    img.src = src
  })
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
  const src = typeof file === 'string' ? file : URL.createObjectURL(file)
  try {
    const img = await loadImage(src)

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
    if (typeof file !== 'string') URL.revokeObjectURL(src)
  }
}

export type Filtro = 'color' | 'gris' | 'realce' | 'bn'

export interface OpcionesEdicion {
  rotacion?: 0 | 90 | 180 | 270
  crop?: { x: number; y: number; w: number; h: number }
  filtro?: Filtro
  maxDim?: number
  quality?: number
}

/** Aplica rotación, recorte y/o filtro documento y devuelve una nueva imagen. */
export async function editarImagen(
  src: string,
  opciones: OpcionesEdicion = {},
): Promise<ImagenProcesada> {
  const { rotacion = 0, crop, filtro = 'color', maxDim = 2200, quality = 0.8 } = opciones
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

  if (filtro === 'bn') filtroDocumento(octx, outW, outH)
  else if (filtro === 'gris') filtroGris(octx, outW, outH, false)
  else if (filtro === 'realce') filtroGris(octx, outW, outH, true)

  return canvasAImagen(out, quality)
}

/** Escala de grises; si `realce`, estira el contraste (auto-niveles). */
function filtroGris(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  realce: boolean,
): void {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  let min = 255
  let max = 0
  const gris = new Float32Array(w * h)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    gris[p] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const rango = realce && max > min ? 255 / (max - min) : 1
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let g = gris[p]
    if (realce) g = (g - min) * rango
    g = g < 0 ? 0 : g > 255 ? 255 : g
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(imgData, 0, 0)
}

/**
 * Filtro "escaneo": escala de grises + umbral adaptativo (Bradley). Da texto
 * negro nítido sobre blanco, robusto a iluminación despareja y SIN sobreexponer.
 */
function filtroDocumento(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const n = w * h
  const gray = new Float32Array(n)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }

  // Imagen integral para media local rápida.
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let fila = 0
    for (let x = 0; x < w; x++) {
      fila += gray[y * w + x]
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + fila
    }
  }

  const radio = Math.max(12, Math.floor(Math.min(w, h) / 22))
  const t = 0.15 // umbral: 15% por debajo de la media local -> negro
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio)
    const y1 = Math.min(h - 1, y + radio)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio)
      const x1 = Math.min(w - 1, x + radio)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const suma =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0]
      const media = suma / area
      const v = gray[y * w + x] < media * (1 - t) ? 0 : 255
      const idx = (y * w + x) * 4
      d[idx] = d[idx + 1] = d[idx + 2] = v
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

/**
 * Detecta la hoja del comprobante: toma el COMPONENTE CLARO CONECTADO MÁS
 * GRANDE (la hoja es un bloque claro y contiguo; el fondo —teclado, mesa—
 * aporta manchas claras pequeñas y dispersas que se descartan).
 * Devuelve el recuadro en píxeles de la imagen original, o null si no
 * distingue una hoja razonable (entonces no se recorta).
 */
function detectarHoja(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | null {
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
  let bb: { minx: number; miny: number; maxx: number; maxy: number; area: number } | null = null
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
      bb = { minx, miny, maxx, maxy, area }
    }
  }
  if (!bb) return null

  const rw = bb.maxx - bb.minx + 1
  const rh = bb.maxy - bb.miny + 1
  const areaRel = (rw * rh) / n
  const fill = bb.area / (rw * rh)
  // Debe ser una región sensata y bien "rellena" (una hoja, no un scatter).
  if (areaRel < 0.15 || areaRel > 0.95 || fill < 0.45) return null

  // Margen (2% + compensación de la erosión) y mapeo a resolución original.
  const mx = Math.round(rw * 0.02) + 2
  const my = Math.round(rh * 0.02) + 2
  const x0 = Math.max(0, bb.minx - mx)
  const y0 = Math.max(0, bb.miny - my)
  const x1 = Math.min(aw - 1, bb.maxx + mx)
  const y1 = Math.min(ah - 1, bb.maxy + my)
  const inv = 1 / escala
  return {
    x: Math.round(x0 * inv),
    y: Math.round(y0 * inv),
    w: Math.round((x1 - x0 + 1) * inv),
    h: Math.round((y1 - y0 + 1) * inv),
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

export interface Punto {
  x: number
  y: number
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

  if (filtro === 'bn') filtroDocumento(octx, outW, outH)
  else if (filtro === 'gris') filtroGris(octx, outW, outH, false)
  else if (filtro === 'realce') filtroGris(octx, outW, outH, true)

  return canvasAImagen(out, quality)
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
