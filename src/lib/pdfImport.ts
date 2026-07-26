/**
 * Importación de comprobantes en PDF (facturas electrónicas que llegan por
 * correo). Renderiza la primera página como imagen para la vista previa y
 * extrae el texto embebido del documento (los PDF electrónicos ya lo traen,
 * así que la detección de RUC/número sale precisa y sin OCR).
 *
 * Se carga de forma perezosa (import dinámico) para no inflar el bundle inicial.
 */
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfImportado {
  dataUrl: string // JPEG de la 1ª página (vista previa)
  blob: Blob
  width: number
  height: number
  texto: string // texto embebido de todas las páginas ('' si es un PDF escaneado)
}

/**
 * Lee un PDF: devuelve una imagen de la primera página y el texto de todo el
 * documento. `maxDim` limita el lado mayor de la vista previa.
 */
export async function importarPdf(file: File, maxDim = 2000): Promise<PdfImportado> {
  const datos = new Uint8Array(await file.arrayBuffer())
  const tarea = pdfjsLib.getDocument({ data: datos })
  const doc = await tarea.promise
  try {
    // Texto embebido de todas las páginas.
    let texto = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const linea = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (linea) texto += linea + '\n'
    }

    // Render de la primera página a una imagen JPEG.
    const page1 = await doc.getPage(1)
    const base = page1.getViewport({ scale: 1 })
    const escala = Math.min(maxDim / Math.max(base.width, base.height), 3) || 1
    const viewport = page1.getViewport({ scale: escala })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d')!
    // Fondo blanco: algunos PDF tienen transparencia.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page1.render({ canvas, canvasContext: ctx, viewport }).promise

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    const blob = await (await fetch(dataUrl)).blob()
    return { dataUrl, blob, width: canvas.width, height: canvas.height, texto: texto.trim() }
  } finally {
    tarea.destroy()
  }
}
