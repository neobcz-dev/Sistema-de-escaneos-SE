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

// N° de comprobante: formato estricto NNN-NNN-NNNNNNN.
const RE_NRO_ESTRICTO = /\b(\d{3})-(\d{3})-(\d{6,7})\b/
// Tolerante al ruido del OCR: separadores por guion/punto/espacio y la
// secuencia final puede venir con espacios entre dígitos ("00 0 0 4 6 2").
const RE_NRO_FLEX = /(\d{2,3})[-.\s]{1,2}(\d{3})[-.\s]{1,3}((?:\d[ .]?){6,9})/
// RUC con dígito verificador, admitiendo espacios: "1636907 - 6".
const RE_RUC = /(\d{5,8})\s*[-–]\s*(\d)(?!\d)/g
// Timbrado: la palabra seguida (con ruido de por medio) de 7-9 dígitos.
const RE_TIMBRADO = /timbrado\D{0,15}(\d{7,9})/i

function detectarNumero(t: string): string {
  const e = t.match(RE_NRO_ESTRICTO)
  if (e) return `${e[1]}-${e[2]}-${e[3]}`
  const f = t.match(RE_NRO_FLEX)
  if (f) {
    const seq = f[3].replace(/\D/g, '').slice(0, 7)
    if (seq.length >= 6) return `${f[1]}-${f[2]}-${seq}`
  }
  return ''
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
  const candidatos: { ruc: string; indice: number; d: string }[] = []
  let m: RegExpExecArray | null
  RE_RUC.lastIndex = 0
  while ((m = RE_RUC.exec(t)) !== null) {
    candidatos.push({ ruc: `${m[1]}-${m[2]}`, indice: m.index, d: m[1] + m[2] })
  }
  const RE_IMPRENTA = /imp[.\s]|impreso|imprenta|hab[.\s]|habilit/
  const filtrados = candidatos
    .filter((c) => !(clienteDigitos && c.d === clienteDigitos))
    .filter((c) => !RE_IMPRENTA.test(t.slice(Math.max(0, c.indice - 35), c.indice).toLowerCase()))
    .sort((a, b) => a.indice - b.indice)
  const rucProveedor = filtrados.length ? filtrados[0].ruc : ''

  return { rucProveedor, nroFactura, timbrado }
}
