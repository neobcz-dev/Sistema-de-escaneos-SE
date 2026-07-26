/**
 * Genera un PDF "buscable": la imagen del comprobante con una capa de texto
 * invisible encima (el resultado del OCR). Así el documento se puede buscar
 * dentro de Google Drive por su contenido.
 */
import { jsPDF } from 'jspdf'
import type { PalabraOCR } from '../types'

export async function crearPdfBuscable(
  dataUrl: string,
  width: number,
  height: number,
  palabras: PalabraOCR[],
): Promise<Blob> {
  const orientation = width >= height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'px', format: [width, height] })

  // Fondo: la imagen del comprobante ocupando toda la página.
  pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height)

  // Capa de texto invisible, palabra por palabra en su posición.
  pdf.setTextColor(0, 0, 0)
  for (const w of palabras) {
    const { x0, y0, x1, y1 } = w.bbox
    const h = y1 - y0
    if (h <= 1 || !w.text) continue
    try {
      pdf.setFontSize(clamp(h * 0.85, 4, 200))
      pdf.text(w.text, x0, y1 - h * 0.15, {
        renderingMode: 'invisible',
        baseline: 'alphabetic',
        maxWidth: Math.max(1, x1 - x0) * 2,
      })
    } catch {
      // Ignoramos palabras con caracteres que la fuente no soporta.
    }
  }

  return pdf.output('blob')
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
