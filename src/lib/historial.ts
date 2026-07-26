/**
 * Historial de subidas: guarda en el teléfono (localStorage) cada comprobante
 * enviado con éxito, para que el cliente pueda verlos aunque la app se recargue
 * o se cierre.
 */

export interface RegistroHistorial {
  id: string
  fecha: string // ISO
  clienteNombre: string
  clienteRuc: string
  tipo: string
  proveedor: string
  rucProveedor: string
  nroFactura: string
  urlDrive?: string
}

const CLAVE = 'se-historial-v1'
const MAX = 500

export function leerHistorial(): RegistroHistorial[] {
  try {
    const raw = localStorage.getItem(CLAVE)
    const lista = raw ? (JSON.parse(raw) as RegistroHistorial[]) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function agregarAlHistorial(reg: RegistroHistorial): void {
  try {
    const lista = leerHistorial()
    lista.unshift(reg) // el más reciente primero
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAX)))
  } catch {
    // sin almacenamiento disponible: no es crítico
  }
}

export function limpiarHistorial(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // ignore
  }
}
