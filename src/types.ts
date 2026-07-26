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

/** Punto normalizado (0–1) relativo al ancho/alto de la imagen. */
export interface Punto {
  x: number
  y: number
}

export interface Comprobante {
  id: string
  nombreArchivo: string
  dataUrl: string // JPEG comprimido (preview + base para PDF)
  ocrDataUrl?: string // imagen limpia para Drive OCR (sin filtro mágico, enderezada, recortada)
  originalDataUrl: string // base sin filtros, para reeditar de forma no destructiva
  baseEdicion?: string // imagen sobre la que se marcaron las esquinas (con rotación aplicada)
  esquinas?: Punto[] // 4 esquinas elegidas/detectadas [tl, tr, br, bl], para recordarlas
  recortado?: boolean // true si ya se aplicó el recorte por perspectiva
  blob: Blob
  width: number
  height: number
  ocrTexto: string
  ocrPalabras: PalabraOCR[]
  ocrEstado: EstadoOCR
  ocrProgreso: number // 0..1
  // Datos detectados automáticamente (editables por el usuario)
  tipo: TipoComprobante
  rucProveedor: string
  nombreProveedor: string
  nroFactura: string
  timbrado: string
  subida: EstadoSubida
  urlDrive?: string
  errorSubida?: string
}
