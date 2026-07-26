/** Consulta de RUC al servicio de la SET, vía el proxy de Apps Script. */
import { APPS_SCRIPT_URL, appsScriptConfigurado } from '../config'

export interface ConsultaRuc {
  ok: boolean
  razonSocial?: string
  estadoRuc?: string
  nombreComercial?: string
  error?: string
}

/** Devuelve true si el error indica que la consulta no está configurada. */
export function noConfigurada(r: ConsultaRuc): boolean {
  return !r.ok && /no configurada/i.test(r.error || '')
}

export async function consultarRucSet(ruc: string, dv: number): Promise<ConsultaRuc> {
  if (!appsScriptConfigurado()) return { ok: false, error: 'Consulta de RUC no configurada.' }
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'consultaRuc', ruc, dv: String(dv) }),
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return (await res.json()) as ConsultaRuc
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de conexión.' }
  }
}
