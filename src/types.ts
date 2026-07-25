export type TipoComprobante =
  | 'Factura'
  | 'Boleta / Ticket'
  | 'Autofactura'
  | 'Nota de crédito'
  | 'Nota de débito'
  | 'Recibo'
  | 'Comprobante de retención'
  | 'Otro'

export interface Cliente {
  nombre: string
  ruc: string
  email: string
  tipo: TipoComprobante
  periodo: string // AAAA-MM
  nota: string
}

export type EstadoOCR = 'pendiente' | 'procesando' | 'listo' | 'error'
export type EstadoSubida = 'pendiente' | 'subiendo' | 'ok' | 'error'

export interface Comprobante {
  id: string
  nombreArchivo: string
  dataUrl: string // JPEG comprimido (preview + payload)
  blob: Blob
  ocrTexto: string
  ocrEstado: EstadoOCR
  ocrProgreso: number // 0..1
  subida: EstadoSubida
  urlDrive?: string
  errorSubida?: string
}
