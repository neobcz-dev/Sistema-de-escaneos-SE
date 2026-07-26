/**
 * Detección de las 4 esquinas del comprobante por DENSIDAD DE TEXTO/BORDES.
 *
 * Esta parte es PURA (solo cálculo sobre el arreglo de píxeles), sin DOM, para
 * poder correr tanto en el hilo principal como en un Web Worker.
 *
 * Pasos: gradiente Sobel -> celdas con muchos bordes -> se unen (dilatación) ->
 * mayor bloque contiguo = el comprobante -> su recuadro. Devuelve 4 esquinas
 * NORMALIZADAS (0–1) en orden [tl, tr, br, bl], o null si no hay un bloque de
 * texto claro (el editor arranca entonces con un recuadro por defecto).
 */

import type { Punto } from '../types'

/** Resolución de trabajo recomendada (lado mayor) para la detección. */
export const TOPE_DETECCION = 440

export function detectarEsquinasDePixeles(
  d: Uint8ClampedArray,
  w: number,
  h: number,
): Punto[] | null {
  if (w < 40 || h < 40) return null

  const g = new Float32Array(w * h)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }
  // Magnitud de gradiente (Sobel |gx|+|gy|).
  const mag = new Float32Array(w * h)
  let suma = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - (g[i - w - 1] + 2 * g[i - 1] + g[i + w - 1])
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1])
      const m = Math.abs(gx) + Math.abs(gy)
      mag[i] = m
      suma += m
    }
  }
  // Umbral relativo al ruido de la imagen (fotos ruidosas -> umbral más alto).
  const media = suma / (w * h)
  const thr = Math.min(200, Math.max(80, media * 4))

  // Rejilla de celdas: una celda es "densa" si tiene muchos bordes (texto).
  const cell = 8
  const gw = Math.ceil(w / cell)
  const gh = Math.ceil(h / cell)
  const cuenta = new Float32Array(gw * gh)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mag[y * w + x] > thr) cuenta[(((y / cell) | 0) * gw) + ((x / cell) | 0)]++
    }
  }
  let denso: Uint8Array = new Uint8Array(gw * gh)
  let totalDensas = 0
  for (let i = 0; i < denso.length; i++) {
    if (cuenta[i] > cell * cell * 0.15) {
      denso[i] = 1
      totalDensas++
    }
  }
  if (totalDensas < 8) return null // casi sin texto: no arriesgamos

  // Dilatación (×2): une los renglones del comprobante en un solo bloque.
  denso = dilatarCeldas(dilatarCeldas(denso, gw, gh), gw, gh)

  // Mayor bloque contiguo de celdas densas = el comprobante.
  const lbl = new Int32Array(gw * gh)
  const pila = new Int32Array(gw * gh)
  let etiqueta = 0
  let mejorArea = 0
  let bb: { minx: number; miny: number; maxx: number; maxy: number } | null = null
  for (let s = 0; s < denso.length; s++) {
    if (!denso[s] || lbl[s]) continue
    etiqueta++
    let sp = 0
    pila[sp++] = s
    lbl[s] = etiqueta
    let area = 0
    let minx = gw
    let miny = gh
    let maxx = 0
    let maxy = 0
    while (sp) {
      const p = pila[--sp]
      area++
      const px = p % gw
      const py = (p / gw) | 0
      if (px < minx) minx = px
      if (px > maxx) maxx = px
      if (py < miny) miny = py
      if (py > maxy) maxy = py
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
          const np = ny * gw + nx
          if (denso[np] && !lbl[np]) { lbl[np] = etiqueta; pila[sp++] = np }
        }
      }
    }
    if (area > mejorArea) { mejorArea = area; bb = { minx, miny, maxx, maxy } }
  }
  if (!bb) return null

  // Compensamos la dilatación (2 celdas) al volver a píxeles.
  let x0 = (bb.minx + 2) * cell
  let y0 = (bb.miny + 2) * cell
  let x1 = (bb.maxx - 1) * cell
  let y1 = bb.maxy * cell
  if (x1 <= x0 || y1 <= y0) return null
  // Margen pequeño hacia afuera.
  const mx = (x1 - x0) * 0.03
  const my = (y1 - y0) * 0.03
  x0 = Math.max(0, x0 - mx)
  y0 = Math.max(0, y0 - my)
  x1 = Math.min(w, x1 + mx)
  y1 = Math.min(h, y1 + my)

  const bw = (x1 - x0) / w
  const bh = (y1 - y0) / h
  if (bw > 0.93 && bh > 0.93) return null // cubre casi toda la foto: sin recorte útil
  if (bw < 0.12 || bh < 0.07) return null // demasiado chico para ser el comprobante

  // 4 esquinas del recuadro (ejes alineados; el usuario ajusta si hay sesgo).
  const nx0 = x0 / w
  const nx1 = x1 / w
  const ny0 = y0 / h
  const ny1 = y1 / h
  return [
    { x: nx0, y: ny0 },
    { x: nx1, y: ny0 },
    { x: nx1, y: ny1 },
    { x: nx0, y: ny1 },
  ]
}

/** Dilatación morfológica en la rejilla de celdas (crece 1 celda alrededor). */
function dilatarCeldas(m: Uint8Array, gw: number, gh: number): Uint8Array {
  const o = new Uint8Array(m.length)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let algun = 0
      for (let dy = -1; dy <= 1 && !algun; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
          if (m[ny * gw + nx]) { algun = 1; break }
        }
      }
      o[y * gw + x] = algun
    }
  }
  return o
}
