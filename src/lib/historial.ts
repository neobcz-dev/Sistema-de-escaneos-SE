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
  miniatura?: string // dataURL JPEG pequeño
}

const CLAVE = 'se-historial-v1'
// Guardamos pocos porque cada registro lleva una miniatura (imagen).
const MAX = 30

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
    let lista = leerHistorial()
    lista.unshift(reg) // el más reciente primero
    lista = lista.slice(0, MAX)
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista))
    } catch {
      // Cuota excedida (por las miniaturas): recortamos más y reintentamos.
      localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, 10)))
    }
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
