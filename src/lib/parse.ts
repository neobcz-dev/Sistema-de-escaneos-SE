/**
 * Extracción de datos de comprobantes paraguayos a partir del texto OCR.
 *
 * Los campos clave están regulados por la SET, por lo que tienen formatos
 * bastante estandarizados aunque el diseño del comprobante varíe:
 *  - RUC: número + dígito verificador  -> 80012345-6
 *  - N° de comprobante: establecimiento-punto-secuencia -> 001-001-0000123
 *  - Timbrado: 8 dígitos junto a la palabra "Timbrado"
 *
 * Para el RUC del proveedor usamos una heurística clave: como el cliente ya se
 * identificó con SU propio RUC, lo excluimos y nos quedamos con "el otro".
 */

import type { TipoComprobante } from '../types'

export interface DatosDetectados {
  rucProveedor: string
  nroFactura: string
  timbrado: string
}

function sinAcentos(s: string): string {
  return s
    .replace(/[ÁÀÄÂ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O')
    .replace(/[ÚÙÜÛ]/g, 'U')
}

// El tipo se detecta por su leyenda obligatoria. El orden importa:
// AUTOFACTURA contiene "FACTURA", así que va antes.
const REGLAS_TIPO: Array<[RegExp, TipoComprobante]> = [
  [/AUTOFACTURA/, 'Autofactura'],
  [/NOTA\s+DE\s+CREDITO/, 'Nota de crédito'],
  [/NOTA\s+DE\s+DEBITO/, 'Nota de débito'],
  [/BOLETA/, 'Boleta / Ticket'],
  [/RETENCION/, 'Comprobante de retención'],
  [/RECIBO/, 'Recibo'],
  [/FACTURA/, 'Factura'],
]

/** Detecta el tipo de comprobante por su leyenda. Devuelve '' si no lo halla. */
export function detectarTipo(texto: string): TipoComprobante | '' {
  const t = sinAcentos((texto || '').toUpperCase())
  for (const [re, tipo] of REGLAS_TIPO) if (re.test(t)) return tipo
  return ''
}

/** Deja solo los dígitos de un RUC/cédula para comparar. */
export function soloDigitos(texto: string): string {
  return (texto || '').replace(/\D/g, '')
}

// N° de comprobante NNN-NNN-NNNNNNN. Separadores SOLO guion o espacio (NO
// punto, para no confundir con precios como "50.018 300.108") y primer grupo
// SIEMPRE de 3 dígitos (el establecimiento; "50" no es válido). La secuencia
// final admite espacios entre dígitos ("00 0 0 4 6 2"). Los separadores admiten
// hasta 3 caracteres para tolerar espacios a ambos lados del guion ("003 - 001
// - 0025532"), como los produce el texto extraído de un PDF.
const RE_NRO = /(\d{3})[-–\s]{1,3}(\d{3})[-–\s]{1,3}((?:\d[ ]?){6,9})/g
// Etiquetas cercanas que confirman que es el N° (no un precio ni un código).
const RE_NRO_LABEL = /n[°ºo]|nro|numero|factura|comprobante/i
// RUC con dígito verificador, admitiendo espacios: "1636907 - 6".
const RE_RUC = /(\d{5,8})\s*[-–]\s*(\d)(?!\d)/g
// RUC precedido de su etiqueta "RUC" aunque venga SIN guion: "RUC: 801236444".
// El último dígito es el verificador. Cubre facturas donde el OCR pierde el guion.
const RE_RUC_ETQ = /r\.?u\.?c\.?[^\d]{0,10}(\d{6,8})\s*[-–]?\s*(\d)(?!\d)/gi
// Timbrado: la palabra seguida (con ruido de por medio) de 7-9 dígitos.
const RE_TIMBRADO = /timbrado\D{0,15}(\d{7,9})/i

function detectarNumero(t: string): string {
  // Reúne todos los candidatos con forma NNN-NNN-NNNNNN(N).
  const candidatos: { num: string; indice: number }[] = []
  let m: RegExpExecArray | null
  RE_NRO.lastIndex = 0
  while ((m = RE_NRO.exec(t)) !== null) {
    const seq = m[3].replace(/\D/g, '').slice(0, 7)
    if (seq.length >= 6) candidatos.push({ num: `${m[1]}-${m[2]}-${seq}`, indice: m.index })
  }
  if (!candidatos.length) return ''
  // Preferimos el que tiene una etiqueta cerca ("N°", "Factura"…); si ninguno,
  // el primero (los precios usan punto y ya quedaron descartados por el patrón).
  const etiquetado = candidatos.find((c) =>
    RE_NRO_LABEL.test(t.slice(Math.max(0, c.indice - 20), c.indice)),
  )
  return (etiquetado || candidatos[0]).num
}

/**
 * Analiza el texto OCR y devuelve los datos detectados.
 * @param texto     Texto plano del OCR.
 * @param rucCliente RUC del cliente (para excluirlo y aislar al proveedor).
 */
export function detectarDatos(texto: string, rucCliente: string): DatosDetectados {
  const t = texto || ''

  const nroFactura = detectarNumero(t)

  const mTimb = t.match(RE_TIMBRADO)
  const timbrado = mTimb ? mTimb[1] : ''

  // RUC del proveedor: primer RUC del texto que NO sea el del cliente ni el de
  // la imprenta (pie de página: "Imp. ... RUC" / "Hab. SET N°").
  const clienteDigitos = soloDigitos(rucCliente)
  type Cand = { ruc: string; indice: number; d: string; etiquetado: boolean }
  const candidatos: Cand[] = []
  let m: RegExpExecArray | null
  RE_RUC.lastIndex = 0
  while ((m = RE_RUC.exec(t)) !== null) {
    candidatos.push({ ruc: `${m[1]}-${m[2]}`, indice: m.index, d: m[1] + m[2], etiquetado: false })
  }
  RE_RUC_ETQ.lastIndex = 0
  while ((m = RE_RUC_ETQ.exec(t)) !== null) {
    candidatos.push({ ruc: `${m[1]}-${m[2]}`, indice: m.index, d: m[1] + m[2], etiquetado: true })
  }
  // Un mismo RUC puede venir por ambos patrones: 1ª aparición + si alguno traía
  // la etiqueta "RUC".
  const porDigitos = new Map<string, Cand>()
  for (const c of candidatos) {
    const prev = porDigitos.get(c.d)
    if (!prev) porDigitos.set(c.d, { ...c })
    else {
      prev.indice = Math.min(prev.indice, c.indice)
      prev.etiquetado = prev.etiquetado || c.etiquetado
    }
  }
  const RE_IMPRENTA = /imp[.\s]|impreso|imprenta|hab[.\s]|habilit/
  const filtrados = [...porDigitos.values()]
    .filter((c) => !(clienteDigitos && c.d === clienteDigitos))
    .filter((c) => !RE_IMPRENTA.test(t.slice(Math.max(0, c.indice - 35), c.indice).toLowerCase()))
    // Preferimos los RUC ETIQUETADOS ("RUC: …", casi siempre el real) sobre
    // números sueltos con guion (que pueden ser precios/fechas); dentro de cada
    // grupo, el que aparece primero.
    .sort((a, b) => Number(b.etiquetado) - Number(a.etiquetado) || a.indice - b.indice)
  const rucProveedor = filtrados.length ? filtrados[0].ruc : ''

  return { rucProveedor, nroFactura, timbrado }
}
