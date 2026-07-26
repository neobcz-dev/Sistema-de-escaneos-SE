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

import type { TipoComprobante } from '../types'

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
