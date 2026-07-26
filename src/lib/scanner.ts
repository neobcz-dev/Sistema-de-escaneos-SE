/**
 * Escáner de documentos con OpenCV + jscanify: detecta el borde del papel,
 * lo recorta y lo endereza (corrección de perspectiva), como el escáner de
 * Google Drive. OpenCV se carga bajo demanda (archivo grande, ~9 MB).
 */
import jscanify from 'jscanify/client'

type Punto = { x: number; y: number }

interface CV {
  Mat: unknown
  imread(source: HTMLImageElement | HTMLCanvasElement): { delete(): void }
}

let cvPromise: Promise<CV> | null = null
let scanner: jscanify | null = null

/** Carga OpenCV una sola vez (inyecta el script y espera a que esté listo). */
export function cargarOpenCV(): Promise<CV> {
  if (cvPromise) return cvPromise
  cvPromise = new Promise<CV>((resolve, reject) => {
    const w = window as unknown as { cv?: CV; Module?: unknown }
    if (w.cv && (w.cv as CV).Mat) return resolve(w.cv)
    ;(w as { Module?: unknown }).Module = {
      onRuntimeInitialized: () => resolve(w.cv as CV),
    }
    const s = document.createElement('script')
    s.src = `${import.meta.env.BASE_URL}opencv.js`
    s.async = true
    s.onerror = () => reject(new Error('No se pudo cargar OpenCV.'))
    document.head.appendChild(s)
    // Respaldo: sondeo por si onRuntimeInitialized no dispara.
    const t0 = Date.now()
    const iv = setInterval(() => {
      if (w.cv && (w.cv as CV).Mat) {
        clearInterval(iv)
        resolve(w.cv)
      } else if (Date.now() - t0 > 30000) {
        clearInterval(iv)
        cvPromise = null // permitir reintento
        reject(new Error('OpenCV tardó demasiado en cargar.'))
      }
    }, 200)
  })
  return cvPromise
}

function getScanner(): jscanify {
  if (!scanner) scanner = new jscanify()
  return scanner
}

function dist(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** ¿OpenCV ya está disponible en memoria? (para no forzar la carga). */
export function opencvListo(): boolean {
  const w = window as unknown as { cv?: CV }
  return !!(w.cv && w.cv.Mat)
}

/**
 * Extrae el documento enderezado de la imagen. Devuelve un canvas recortado y
 * corregido, o null si no detecta un papel confiable (el llamador hace fallback).
 */
export async function extraerDocumento(
  source: HTMLImageElement | HTMLCanvasElement,
): Promise<HTMLCanvasElement | null> {
  const cv = await cargarOpenCV()
  const s = getScanner()
  let src: { delete(): void } | null = null
  try {
    src = cv.imread(source)
    const contour = s.findPaperContour(src)
    if (!contour) return null
    const cp = s.getCornerPoints(contour)
    const tl = cp.topLeftCorner
    const tr = cp.topRightCorner
    const bl = cp.bottomLeftCorner
    const br = cp.bottomRightCorner
    if (!tl || !tr || !bl || !br) return null

    const w = Math.round((dist(tl, tr) + dist(bl, br)) / 2)
    const h = Math.round((dist(tl, bl) + dist(tr, br)) / 2)
    const sw = 'width' in source ? source.width : 0
    const sh = 'height' in source ? source.height : 0
    // Rechazos de seguridad: muy chico o casi toda la imagen (no detectó nada útil).
    if (w < 80 || h < 80) return null
    if (sw && sh && w * h > sw * sh * 0.985) return null

    return s.extractPaper(source, w, h, cp)
  } catch {
    return null
  } finally {
    if (src) src.delete()
  }
}

/**
 * Devuelve las 4 esquinas del papel [TL, TR, BR, BL] en coordenadas de la
 * imagen fuente, o null si no detecta. Para dibujar el borde en vivo.
 */
export async function detectarEsquinas(
  source: HTMLImageElement | HTMLCanvasElement,
): Promise<Punto[] | null> {
  const cv = await cargarOpenCV()
  const s = getScanner()
  let src: { delete(): void } | null = null
  try {
    src = cv.imread(source)
    const contour = s.findPaperContour(src)
    if (!contour) return null
    const cp = s.getCornerPoints(contour)
    const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } = cp
    if (!tl || !tr || !br || !bl) return null
    return [tl, tr, br, bl]
  } catch {
    return null
  } finally {
    if (src) src.delete()
  }
}
