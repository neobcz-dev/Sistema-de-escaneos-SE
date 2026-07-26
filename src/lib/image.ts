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
 * Detecta la hoja del comprobante (región clara sobre fondo más oscuro) y
 * devuelve su recuadro en píxeles. Conservador: si no hay una hoja clara
 * distinguible, devuelve null (no recorta).
 */
function detectarHoja(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | null {
  // Analizamos en baja resolución para velocidad.
  const escala = Math.min(1, 700 / Math.max(w, h))
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

  // Umbral de Otsu para separar hoja (claro) del fondo (oscuro).
  const total = n
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let maxVar = -1
  let umbral = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = total - wB
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

  // Perfiles de filas/columnas con píxeles "claros" (hoja).
  const filas = new Int32Array(ah)
  const cols = new Int32Array(aw)
  let claros = 0
  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      if (gray[y * aw + x] > umbral) {
        filas[y]++
        cols[x]++
        claros++
      }
    }
  }
  if (claros < n * 0.1) return null // casi nada de hoja detectable

  const limFila = Math.max(1, Math.floor(aw * 0.15))
  const limCol = Math.max(1, Math.floor(ah * 0.15))
  let top = 0
  while (top < ah && filas[top] < limFila) top++
  let bottom = ah - 1
  while (bottom > top && filas[bottom] < limFila) bottom--
  let left = 0
  while (left < aw && cols[left] < limCol) left++
  let right = aw - 1
  while (right > left && cols[right] < limCol) right--

  const rw = right - left + 1
  const rh = bottom - top + 1
  const areaRel = (rw * rh) / n
  // Solo recortamos si la región es sensata (ni casi todo, ni casi nada).
  if (areaRel < 0.2 || areaRel > 0.97) return null

  // Margen y mapeo a resolución original.
  const mx = Math.round(rw * 0.02)
  const my = Math.round(rh * 0.02)
  const x0 = Math.max(0, left - mx)
  const y0 = Math.max(0, top - my)
  const x1 = Math.min(aw - 1, right + mx)
  const y1 = Math.min(ah - 1, bottom + my)
  const inv = 1 / escala
  return {
    x: Math.round(x0 * inv),
    y: Math.round(y0 * inv),
    w: Math.round((x1 - x0 + 1) * inv),
    h: Math.round((y1 - y0 + 1) * inv),
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
