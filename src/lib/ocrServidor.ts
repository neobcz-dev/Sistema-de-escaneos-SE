/** OCR con el motor de Google (Drive), vía el proxy del Apps Script. */
import { APPS_SCRIPT_URL, appsScriptConfigurado } from '../config'
import { dataUrlToBase64 } from './image'

export interface RespuestaOCR {
  ok: boolean
  texto?: string
  error?: string
}

export async function ocrEnServidor(dataUrl: string): Promise<RespuestaOCR> {
  if (!appsScriptConfigurado()) return { ok: false, error: 'no configurado' }
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        accion: 'ocr',
        base64: dataUrlToBase64(dataUrl),
        mimeType: 'image/jpeg',
      }),
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return (await res.json()) as RespuestaOCR
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de conexión.' }
  }
}
