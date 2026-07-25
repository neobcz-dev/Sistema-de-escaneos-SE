/** Utilidades de imagen: carga, corrección de orientación y compresión a JPEG. */

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

/**
 * Reduce la imagen a un lado máximo `maxDim` y la comprime a JPEG.
 * Mantiene un buen equilibrio entre nitidez para OCR y tamaño de subida.
 */
export async function procesarImagen(
  file: File | Blob,
  maxDim = 1800,
  quality = 0.72,
): Promise<ImagenProcesada> {
  const src = URL.createObjectURL(file)
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

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('No se pudo comprimir la imagen.')
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    return { blob, dataUrl, width, height }
  } finally {
    URL.revokeObjectURL(src)
  }
}

/** Extrae la parte base64 (sin el prefijo data:) de un data URL. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}
