/// <reference lib="webworker" />
/**
 * Web Worker que detecta las 4 esquinas del comprobante fuera del hilo
 * principal (así la interfaz no se traba). Decodifica la imagen con
 * createImageBitmap + OffscreenCanvas y corre el algoritmo puro.
 */
import { detectarEsquinasDePixeles, TOPE_DETECCION } from '../lib/esquinas'

self.onmessage = async (e: MessageEvent<{ id: number; src: string }>) => {
  const { id, src } = e.data
  try {
    const resp = await fetch(src)
    const blob = await resp.blob()
    const bmp = await createImageBitmap(blob)
    const esc = Math.min(1, TOPE_DETECCION / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * esc))
    const h = Math.max(1, Math.round(bmp.height * esc))
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const d = ctx.getImageData(0, 0, w, h).data
    const esquinas = detectarEsquinasDePixeles(d, w, h)
    ;(self as unknown as Worker).postMessage({ id, esquinas })
  } catch {
    ;(self as unknown as Worker).postMessage({ id, esquinas: null })
  }
}
