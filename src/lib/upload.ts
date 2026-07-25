/** Envío de comprobantes al backend de Google Apps Script. */
import { APPS_SCRIPT_URL } from '../config'
import type { Cliente, Comprobante } from '../types'
import { dataUrlToBase64 } from './image'

export interface RespuestaSubida {
  ok: boolean
  url?: string
  fileId?: string
  error?: string
}

/**
 * Sube un comprobante. Se usa Content-Type text/plain para que sea una
 * "simple request" y el navegador no dispare una verificación CORS previa
 * (preflight), que Apps Script no maneja bien.
 */
export async function subirComprobante(
  cliente: Cliente,
  comp: Comprobante,
  indice: number,
  total: number,
): Promise<RespuestaSubida> {
  const payload = {
    cliente: {
      nombre: cliente.nombre,
      ruc: cliente.ruc,
      email: cliente.email,
      tipo: cliente.tipo,
      periodo: cliente.periodo,
      nota: cliente.nota,
    },
    archivo: {
      nombre: comp.nombreArchivo,
      mimeType: 'image/jpeg',
      base64: dataUrlToBase64(comp.dataUrl),
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
    if (!res.ok) {
      return { ok: false, error: `Error del servidor (HTTP ${res.status}).` }
    }
    const data = (await res.json()) as RespuestaSubida
    return data
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servidor.',
    }
  }
}
