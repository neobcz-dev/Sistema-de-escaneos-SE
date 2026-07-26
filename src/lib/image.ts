/** Utilidades de imagen: carga, compresión, rotación, recorte y filtro documento. */

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

/**
 * Reduce la imagen a un lado máximo `maxDim` y la comprime a JPEG.
 * Equilibra nitidez para OCR/PDF y tamaño de subida.
 */
export async function procesarImagen(
  file: File | Blob | string,
  maxDim = 1800,
  quality = 0.72,
): Promise<ImagenProcesada> {
  const src = typeof file === 'string' ? file : URL.createObjectURL(file)
  try {
    const img = await loadImage(src)
    const largest = Math.max(img.width, img.height)
    const scale = largest > maxDim ? maxDim / largest : 1
    const width = Math.round(img.width * scale)
    const height = Math.round(img.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no soporta el procesamiento de imágenes.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return await canvasAImagen(canvas, quality)
  } finally {
    if (typeof file !== 'string') URL.revokeObjectURL(src)
  }
}

export interface OpcionesEdicion {
  rotacion?: 0 | 90 | 180 | 270
  /** Recorte en coordenadas normalizadas (0..1) sobre la imagen YA rotada. */
  crop?: { x: number; y: number; w: number; h: number }
  /** Aplica filtro "documento" (escala de grises + contraste) para lectura. */
  escaneo?: boolean
  maxDim?: number
  quality?: number
}

/** Aplica rotación, recorte y/o filtro documento y devuelve una nueva imagen. */
export async function editarImagen(
  src: string,
  opciones: OpcionesEdicion = {},
): Promise<ImagenProcesada> {
  const { rotacion = 0, crop, escaneo = false, maxDim = 1800, quality = 0.72 } = opciones
  const img = await loadImage(src)

  // 1) Rotación sobre un canvas intermedio.
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

  // 2) Recorte (en espacio ya rotado).
  const cx = crop ? Math.round(crop.x * rot.width) : 0
  const cy = crop ? Math.round(crop.y * rot.height) : 0
  const cw = crop ? Math.round(crop.w * rot.width) : rot.width
  const ch = crop ? Math.round(crop.h * rot.height) : rot.height
  const cwN = Math.max(1, cw)
  const chN = Math.max(1, ch)

  // 3) Escalado final.
  const largest = Math.max(cwN, chN)
  const scale = largest > maxDim ? maxDim / largest : 1
  const outW = Math.max(1, Math.round(cwN * scale))
  const outH = Math.max(1, Math.round(chN * scale))

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const octx = out.getContext('2d')!
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, outW, outH)
  octx.drawImage(rot, cx, cy, cwN, chN, 0, 0, outW, outH)

  if (escaneo) aplicarFiltroDocumento(octx, outW, outH)

  return canvasAImagen(out, quality)
}

/** Escala de grises + realce de contraste, estilo "escáner de documentos". */
function aplicarFiltroDocumento(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  // Contraste moderado alrededor del punto medio.
  const contraste = 1.35
  const brillo = 8
  for (let i = 0; i < d.length; i += 4) {
    // Luminancia
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    g = (g - 128) * contraste + 128 + brillo
    g = g < 0 ? 0 : g > 255 ? 255 : g
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(imgData, 0, 0)
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
    reader.onloadend = () => {
      const s = String(reader.result)
      resolve(dataUrlToBase64(s))
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
