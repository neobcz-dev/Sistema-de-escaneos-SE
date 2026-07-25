/** OCR en español ejecutado 100% en el navegador con Tesseract.js. */
import { createWorker, type Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    // 'spa' = idioma español. Los datos del modelo se descargan desde el CDN
    // la primera vez y quedan en caché del navegador.
    workerPromise = createWorker('spa')
  }
  return workerPromise
}

/**
 * Reconoce el texto de una imagen. `onProgress` recibe un valor 0..1.
 * Nota: al reutilizar un único worker, el progreso se reporta de forma
 * aproximada (inicio / fin) para evitar condiciones de carrera.
 */
export async function reconocerTexto(
  image: Blob | string,
  onProgress?: (p: number) => void,
): Promise<string> {
  onProgress?.(0.05)
  const worker = await getWorker()
  onProgress?.(0.3)
  const { data } = await worker.recognize(image)
  onProgress?.(1)
  return (data.text || '').trim()
}

/** Libera el worker de OCR (opcional, al terminar el flujo). */
export async function liberarOCR(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise
    await worker.terminate()
    workerPromise = null
  }
}
