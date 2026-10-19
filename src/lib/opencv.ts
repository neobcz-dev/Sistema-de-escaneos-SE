/**
 * Detección de las 4 esquinas del documento con OpenCV.js (visión por
 * computadora real). Es la misma técnica de los escáneres: bordes (Canny) →
 * contornos → el mayor cuadrilátero = la hoja. Funciona en cualquier navegador
 * (iPhone incluido), 100% dentro de la web app.
 *
 * OpenCV.js (~13 MB) se carga de forma perezosa la primera vez y queda en la
 * caché del navegador. Llamar `precargarOpenCV()` al entrar al escáner adelanta
 * esa descarga.
 */
import type { Punto } from '../types'

// cv se tipa como `any`: la API de OpenCV.js es dinámica.
/* eslint-disable @typescript-eslint/no-explicit-any */
let cvPromesa: Promise<any> | null = null

/** Carga (una sola vez) el runtime de OpenCV.js. */
export function obtenerCV(): Promise<any> {
  if (!cvPromesa) {
    cvPromesa = import('@techstark/opencv-js').then((m: any) => m.default ?? m)
  }
  return cvPromesa
}

/** Adelanta la descarga de OpenCV.js (sin bloquear). */
export function precargarOpenCV(): void {
  obtenerCV().catch(() => {
    cvPromesa = null // si falla, permitimos reintentar luego
  })
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Ordena 4 puntos como [tl, tr, br, bl]. */
function ordenar(puntos: Punto[]): Punto[] {
  const porSuma = [...puntos].sort((a, b) => a.x + a.y - (b.x + b.y))
  const porDif = [...puntos].sort((a, b) => a.x - a.y - (b.x - b.y))
  return [porSuma[0], porDif[3], porSuma[3], porDif[0]] // tl, tr, br, bl
}

/** 4 esquinas de un RotatedRect (centro/tamaño/ángulo) de OpenCV. */
function esquinasDeRect(rect: any): Punto[] {
  const rad = (rect.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = rect.size.width / 2
  const hh = rect.size.height / 2
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => ({
    x: rect.center.x + x * cos - y * sin,
    y: rect.center.y + x * sin + y * cos,
  }))
}

/**
 * Detecta la hoja y devuelve sus 4 esquinas NORMALIZADAS (0–1) en orden
 * [tl, tr, br, bl], o null si no encuentra un cuadrilátero razonable.
 */
export async function detectarEsquinasOpenCV(
  src: string,
  maxDim = 700,
): Promise<Punto[] | null> {
  let cv: any
  try {
    cv = await obtenerCV()
  } catch {
    return null
  }

  const img = await cargarImagen(src)
  const escala = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * escala))
  const h = Math.max(1, Math.round(img.height * escala))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)

  const mats: any[] = []
  const nuevo = <T>(m: T): T => {
    mats.push(m)
    return m
  }
  try {
    const srcMat = nuevo(cv.imread(canvas))
    const gray = nuevo(new cv.Mat())
    const edges = nuevo(new cv.Mat())
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)
    cv.Canny(gray, edges, 50, 150)
    const kernel = nuevo(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)))
    cv.dilate(edges, edges, kernel)

    const contours = nuevo(new cv.MatVector())
    const hierarchy = nuevo(new cv.Mat())
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const areaImg = w * h
    let mejorQuad: Punto[] | null = null
    let mejorArea = 0
    let mejorContorno: any = null
    let mejorContornoArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      const area = cv.contourArea(c)
      // Nos interesan contornos grandes (la hoja ocupa buena parte del cuadro).
      if (area <= 0.18 * areaImg) {
        c.delete()
        continue
      }
      const peri = cv.arcLength(c, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(c, approx, 0.02 * peri, true)
      if (approx.rows === 4 && cv.isContourConvex(approx) && area > mejorArea) {
        mejorArea = area
        mejorQuad = []
        for (let j = 0; j < 4; j++) {
          mejorQuad.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })
        }
      }
      approx.delete()
      // Guardamos el contorno más grande como respaldo (minAreaRect).
      if (area > mejorContornoArea) {
        if (mejorContorno) mejorContorno.delete()
        mejorContorno = c
        mejorContornoArea = area
      } else {
        c.delete()
      }
    }

    // Si no hubo un cuadrilátero limpio, usamos el rectángulo mínimo rotado del
    // contorno más grande (tolera bordes con huecos).
    if (!mejorQuad && mejorContorno) {
      const rect = cv.minAreaRect(mejorContorno)
      mejorQuad = esquinasDeRect(rect)
      mejorArea = mejorContornoArea
    }
    if (mejorContorno) mejorContorno.delete()

    if (!mejorQuad) return null
    // Descartamos si cubre casi todo el cuadro (no recortó nada) o es muy chico.
    const rel = mejorArea / areaImg
    if (rel > 0.985 || rel < 0.15) return null

    return ordenar(mejorQuad.map((p) => ({ x: p.x / w, y: p.y / h })))
  } catch {
    return null
  } finally {
    for (const m of mats) {
      try {
        m.delete()
      } catch {
        // ya liberado
      }
    }
  }
}
