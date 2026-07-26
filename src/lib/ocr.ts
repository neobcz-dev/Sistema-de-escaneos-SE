/** OCR en español ejecutado 100% en el navegador con Tesseract.js. */
import { createWorker, type Worker } from 'tesseract.js'
import type { PalabraOCR, ResultadoOCR } from '../types'

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    // 'spa' = idioma español. Los datos del modelo se descargan del CDN la
    // primera vez y quedan en la caché del navegador.
    workerPromise = createWorker('spa')
  }
  return workerPromise
}

/**
 * Reconoce el texto de una imagen y devuelve también las palabras con su
 * posición (para armar el PDF buscable). `onProgress` recibe un valor 0..1.
 */
export async function reconocerTexto(
  image: Blob | string,
  onProgress?: (p: number) => void,
): Promise<ResultadoOCR> {
  onProgress?.(0.05)
  const worker = await getWorker()
  onProgress?.(0.3)
  // Pedimos "blocks" para obtener la jerarquía con recuadros de cada palabra.
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true })
  onProgress?.(1)

  const palabras: PalabraOCR[] = []
  const blocks = (data as unknown as { blocks?: BloqueTess[] }).blocks ?? []
  for (const b of blocks) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        for (const w of l.words ?? []) {
          const text = (w.text || '').trim()
          if (text && w.bbox) palabras.push({ text, bbox: w.bbox })
        }
      }
    }
  }

  return { texto: (data.text || '').trim(), palabras }
}

/** Libera el worker de OCR (opcional, al terminar el flujo). */
export async function liberarOCR(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise
    await worker.terminate()
    workerPromise = null
  }
}

// Tipos parciales de la jerarquía que devuelve Tesseract.js
interface CajaTess {
  bbox: { x0: number; y0: number; x1: number; y1: number }
  text: string
}
interface LineaTess {
  words?: CajaTess[]
}
interface ParrafoTess {
  lines?: LineaTess[]
}
interface BloqueTess {
  paragraphs?: ParrafoTess[]
}
