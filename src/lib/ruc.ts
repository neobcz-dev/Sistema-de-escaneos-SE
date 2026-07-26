/**
 * Validación y CORRECCIÓN del RUC paraguayo.
 *
 * Reglas de rango (a la fecha):
 *  - Empresas: 8 dígitos que empiezan con 8 (80000000–89999999).
 *  - Personas físicas: de 1 a 9.999.999 (hasta 7 dígitos).
 *
 * Con esas reglas + el dígito verificador (módulo 11) podemos:
 *  1) Avisar cuando el DV no coincide.
 *  2) Sugerir una corrección cuando el OCR confundió un dígito (p. ej. un 3
 *     por un 2, o un 8 por un 3), probando las confusiones típicas y quedándonos
 *     con la que da un RUC válido en rango y con DV correcto.
 */

import { calcularDV } from './util'

export type TipoRuc = 'empresa' | 'persona' | 'desconocido'

export interface AnalisisRuc {
  base: string // solo dígitos, sin DV
  dv: number | null // DV ingresado (o null si no vino)
  tipo: TipoRuc
  enRango: boolean // la base cae en un rango válido (persona/empresa)
  dvEsperado: number | null // DV que corresponde a la base
  valido: boolean // enRango && dv === dvEsperado
  sugerencia: string | null // "base-dv" corregido, o null
}

// Confusiones típicas del OCR entre dígitos (ordenadas de más a menos probable).
const CONFUSIONES: Record<string, string[]> = {
  '0': ['8', '6', '9', '5'],
  '1': ['7', '4'],
  '2': ['3', '7', '1'],
  '3': ['8', '5', '2', '9'],
  '4': ['9', '1', '7'],
  '5': ['6', '8', '3', '9'],
  '6': ['8', '5', '0', '9'],
  '7': ['1', '2', '9'],
  '8': ['0', '6', '3', '9', '5'],
  '9': ['8', '4', '0', '7', '3'],
}

/** ¿La base cae en un rango de RUC válido y de qué tipo es? */
function clasificar(base: string): { tipo: TipoRuc; enRango: boolean } {
  if (!/^\d+$/.test(base)) return { tipo: 'desconocido', enRango: false }
  const n = Number(base)
  if (base.length === 8 && base[0] === '8') return { tipo: 'empresa', enRango: true }
  if (n >= 1 && n <= 9_999_999) return { tipo: 'persona', enRango: true }
  return { tipo: 'desconocido', enRango: false }
}

/** Separa "80123644-4" o "801236444" en base + DV. */
function separar(entrada: string): { base: string; dv: number | null } {
  const limpio = (entrada || '').replace(/[^\d-]/g, '')
  if (!limpio) return { base: '', dv: null }
  const g = limpio.lastIndexOf('-')
  if (g > 0) {
    const base = limpio.slice(0, g).replace(/\D/g, '')
    const dvTxt = limpio.slice(g + 1).replace(/\D/g, '')
    return { base, dv: dvTxt ? Number(dvTxt[0]) : null }
  }
  // Sin guion: el último dígito es el DV (formato "801236444").
  const soloD = limpio.replace(/\D/g, '')
  if (soloD.length < 2) return { base: soloD, dv: null }
  return { base: soloD.slice(0, -1), dv: Number(soloD.slice(-1)) }
}

/** Busca una corrección plausible cambiando UN dígito confundible de la base. */
function buscarSugerencia(base: string, dv: number | null): string | null {
  if (dv === null || !base) return null
  const candidatos: { ruc: string; score: number }[] = []

  // Tipo A: un dígito de la base cambiado por una confusión típica, que quede
  // en rango y cuyo DV coincida con el ingresado (el DV actúa de verificación).
  for (let i = 0; i < base.length; i++) {
    const alts = CONFUSIONES[base[i]] || []
    for (let r = 0; r < alts.length; r++) {
      const base2 = base.slice(0, i) + alts[r] + base.slice(i + 1)
      if (clasificar(base2).enRango && calcularDV(base2) === dv) {
        candidatos.push({ ruc: `${base2}-${dv}`, score: r })
      }
    }
  }
  if (candidatos.length) {
    candidatos.sort((a, b) => a.score - b.score)
    return candidatos[0].ruc
  }

  // Tipo B (respaldo): la base está en rango y solo el DV no coincide -> quizás
  // el DV se leyó mal; sugerimos el DV correcto.
  if (clasificar(base).enRango) {
    const dvE = calcularDV(base)
    if (dvE !== dv) return `${base}-${dvE}`
  }
  return null
}

/** Analiza un RUC (con o sin DV) y, si hace falta, sugiere una corrección. */
export function analizarRuc(entrada: string): AnalisisRuc {
  const { base, dv } = separar(entrada)
  const { tipo, enRango } = clasificar(base)
  const dvEsperado = base && /^\d+$/.test(base) ? calcularDV(base) : null
  const valido = enRango && dv !== null && dv === dvEsperado
  const sugerencia = valido || !base ? null : buscarSugerencia(base, dv)
  return { base, dv, tipo, enRango, dvEsperado, valido, sugerencia }
}
