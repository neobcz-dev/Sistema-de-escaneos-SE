/** Envío de comprobantes (PDF buscable) al backend de Google Apps Script. */
import { APPS_SCRIPT_URL } from '../config'
import type { Cliente, Comprobante } from '../types'
import { blobToBase64 } from './image'
import { selloTiempo, slug } from './util'

export interface RespuestaSubida {
  ok: boolean
  url?: string
  fileId?: string
  error?: string
}

/** Nombre de archivo legible: RUC proveedor + N° comprobante + fecha. */
function construirNombre(comp: Comprobante): string {
  const partes = [
    slug(comp.rucProveedor || 'sin-ruc'),
    slug(comp.nroFactura || 'sin-nro'),
    selloTiempo(),
  ]
  return `${partes.join('_')}.pdf`
}

/**
 * Sube un comprobante como PDF. Se usa Content-Type text/plain para que sea una
 * "simple request" y el navegador no dispare verificación CORS previa.
 */
export async function subirComprobante(
  cliente: Cliente,
  comp: Comprobante,
  pdf: Blob,
  indice: number,
  total: number,
): Promise<RespuestaSubida> {
  const base64 = await blobToBase64(pdf)
  const payload = {
    cliente: {
      nombre: cliente.nombre,
      ruc: cliente.ruc,
      email: cliente.email,
      tipo: cliente.tipo,
      periodo: cliente.periodo,
      nota: cliente.nota,
    },
    detectado: {
      rucProveedor: comp.rucProveedor,
      nroFactura: comp.nroFactura,
      timbrado: comp.timbrado,
    },
    archivo: {
      nombre: construirNombre(comp),
      mimeType: 'application/pdf',
      base64,
    },
    ocr: comp.ocrTexto,
    indice,
    total,
    enviadoEn: new Date().toISOString(),
  }

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, error: `Error del servidor (HTTP ${res.status}).` }
    return (await res.json()) as RespuestaSubida
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
    }
  }
}
