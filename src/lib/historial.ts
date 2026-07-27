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
  miniatura?: string // dataURL JPEG pequeño (para la tarjeta de la lista)
  vista?: string // dataURL JPEG grande (para ampliar sin verse borroso)
}

const CLAVE = 'se-historial-v1'
// Guardamos pocos porque cada registro lleva una miniatura (imagen).
const MAX = 30
// Solo los más recientes conservan la imagen grande (zoom nítido); el resto se
// queda con la miniatura chica para no llenar el almacenamiento del teléfono.
const VISTA_RECIENTES = 3

/** Intenta guardar; si excede la cuota, va soltando peso hasta que entra. */
function guardar(lista: RegistroHistorial[]): void {
  const sinVista = () => lista.map((r) => ({ ...r, vista: undefined }))
  const sinImagenes = () => lista.map((r) => ({ ...r, vista: undefined, miniatura: undefined }))
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista))
  } catch {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(sinVista().slice(0, 15)))
    } catch {
      try {
        localStorage.setItem(CLAVE, JSON.stringify(sinImagenes().slice(0, 15)))
      } catch {
        // sin almacenamiento disponible: no es crítico
      }
    }
  }
}

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
    // La imagen grande solo se conserva en los más recientes.
    lista = lista.map((r, i) => (i < VISTA_RECIENTES ? r : { ...r, vista: undefined }))
    guardar(lista)
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
