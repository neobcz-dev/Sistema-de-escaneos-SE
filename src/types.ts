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

/** Palabra reconocida por el OCR, con su recuadro en píxeles de la imagen. */
export interface PalabraOCR {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface ResultadoOCR {
  texto: string
  palabras: PalabraOCR[]
}

export interface Comprobante {
  id: string
  nombreArchivo: string
  dataUrl: string // JPEG comprimido (preview + base para PDF)
  blob: Blob
  width: number
  height: number
  ocrTexto: string
  ocrPalabras: PalabraOCR[]
  ocrEstado: EstadoOCR
  ocrProgreso: number // 0..1
  // Datos detectados automáticamente (editables por el usuario)
  rucProveedor: string
  nroFactura: string
  timbrado: string
  subida: EstadoSubida
  urlDrive?: string
  errorSubida?: string
}
