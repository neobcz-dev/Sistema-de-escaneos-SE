/** Utilidades varias. */

let contador = 0
export function nuevoId(): string {
  contador += 1
  return `c_${Date.now().toString(36)}_${contador}`
}

const ACENTOS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N',
}

/** Limpia una cadena para usarla en nombres de archivo. */
export function slug(texto: string): string {
  return texto
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (m) => ACENTOS[m] ?? m)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Marca de tiempo compacta AAAAMMDD-HHMMSS para nombres de archivo. */
export function selloTiempo(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

/** Periodo por defecto (mes actual) en formato AAAA-MM. */
export function periodoActual(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Valida un RUC paraguayo de forma flexible: número base y dígito verificador
 * (formato NNNNNNN-D). No exige el cálculo del DV para no bloquear casos
 * legítimos; solo verifica una forma razonable.
 */
export function rucValido(ruc: string): boolean {
  const limpio = ruc.trim()
  return /^\d{3,10}-?\d?$/.test(limpio)
}

export function emailValido(email: string): boolean {
  if (!email.trim()) return true // opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/**
 * Calcula el dígito verificador (DV) del RUC/cédula de Paraguay (módulo 11,
 * base máxima 11). Admite entradas alfanuméricas: las letras se reemplazan por
 * su código ASCII antes del cálculo (igual que la función oficial de la SET).
 */
export function calcularDV(numero: string, baseMax = 11): number {
  let numeroAl = ''
  for (const ch of (numero || '').trim()) {
    const c = ch.toUpperCase()
    const code = c.charCodeAt(0)
    if (code >= 48 && code <= 57) numeroAl += c // dígito 0-9
    else numeroAl += String(code) // letra -> su ASCII
  }
  let k = 2
  let total = 0
  for (let i = numeroAl.length - 1; i >= 0; i--) {
    if (k > baseMax) k = 2
    total += Number(numeroAl[i]) * k
    k++
  }
  const resto = total % 11
  return resto > 1 ? 11 - resto : 0
}

/** RUC completo a partir de la base (sin DV): "80012345" -> "80012345-6". */
export function rucCompleto(base: string): string {
  const b = (base || '').trim()
  if (!b) return ''
  return `${b}-${calcularDV(b)}`
}

import type { TipoComprobante } from '../types'

/** Lista de tipos de comprobante (para los selectores). */
export const TIPOS_COMPROBANTE: TipoComprobante[] = [
  'Factura',
  'Boleta / Ticket',
  'Autofactura',
  'Nota de crédito',
  'Nota de débito',
  'Recibo',
  'Comprobante de retención',
  'Otro',
]

/**
 * Código de 3 letras por tipo de comprobante y si lleva numeración.
 * Solo Factura, Nota de crédito y Nota de débito usan el formato NNN-NNN-NNNNNNN.
 */
export function codigoTipo(tipo: TipoComprobante): { codigo: string; numerado: boolean } {
  switch (tipo) {
    case 'Factura':
      return { codigo: 'FAT', numerado: true }
    case 'Nota de crédito':
      return { codigo: 'NCR', numerado: true }
    case 'Nota de débito':
      return { codigo: 'NDB', numerado: true }
    case 'Boleta / Ticket':
      return { codigo: 'BOL', numerado: true }
    case 'Autofactura':
      return { codigo: 'AUT', numerado: true }
    case 'Recibo':
      return { codigo: 'REC', numerado: false }
    case 'Comprobante de retención':
      return { codigo: 'RET', numerado: false }
    default:
      return { codigo: 'OTROS', numerado: false }
  }
}

/** Deja solo dígitos y guiones (para el RUC en el nombre del archivo). */
export function limpiarNumero(s: string): string {
  return (s || '').replace(/[^0-9-]/g, '')
}

/**
 * Referencia/N° de comprobante para el nombre de archivo. Admite numeración
 * libre (alfanumérica) para recibos y otros comprobantes: 0001, X54F8, etc.
 */
export function limpiarRef(s: string): string {
  return (s || '').trim().replace(/\s+/g, '-').replace(/[^0-9A-Za-z-]/g, '')
}
