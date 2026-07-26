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

    // Canvas a resolución original (limitada) para poder analizar/recortar.
    const base = document.createElement('canvas')
    base.width = img.width
    base.height = img.height
    const bctx = base.getContext('2d')
    if (!bctx) throw new Error('El navegador no soporta procesamiento de imágenes.')
    bctx.drawImage(img, 0, 0)

    // Región a conservar (por defecto, todo).
    let sx = 0
    let sy = 0
    let sw = img.width
    let sh = img.height
    if (autoRecorte) {
      const r = detectarHoja(bctx, img.width, img.height)
      if (r) {
        sx = r.x
        sy = r.y
        sw = r.w
        sh = r.h
      }
    }

    // Escalado final.
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
    octx.drawImage(base, sx, sy, sw, sh, 0, 0, outW, outH)
    return await canvasAImagen(out, quality)
  } finally {
    if (typeof file !== 'string') URL.revokeObjectURL(src)
  }
}

export interface OpcionesEdicion {
  rotacion?: 0 | 90 | 180 | 270
  crop?: { x: number; y: number; w: number; h: number }
  escaneo?: boolean
  maxDim?: number
  quality?: number
}

/** Aplica rotación, recorte y/o filtro documento y devuelve una nueva imagen. */
export async function editarImagen(
  src: string,
  opciones: OpcionesEdicion = {},
): Promise<ImagenProcesada> {
  const { rotacion = 0, crop, escaneo = false, maxDim = 2200, quality = 0.8 } = opciones
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

  if (escaneo) filtroDocumento(octx, outW, outH)

  return canvasAImagen(out, quality)
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
