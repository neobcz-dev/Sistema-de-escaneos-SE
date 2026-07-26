/**
 * Consulta de RUC. Usa TuRUC (https://turuc.com.py) — API pública y gratuita,
 * sin API key. Intenta primero una llamada directa desde el navegador; si CORS
 * la bloquea, cae al proxy del Apps Script (que consulta del lado servidor).
 */
import { APPS_SCRIPT_URL, appsScriptConfigurado } from '../config'

export interface ConsultaRuc {
  ok: boolean
  razonSocial?: string
  estadoRuc?: string
  error?: string
  fuente?: 'directo' | 'proxy'
}

/** Devuelve true si el error indica que la consulta no está disponible. */
export function noConfigurada(r: ConsultaRuc): boolean {
  return !r.ok && /no configurad|no disponible/i.test(r.error || '')
}

const CLAVES_RAZON = [
  'razonSocial',
  'razon_social',
  'razonsocial',
  'razon',
  'denominacion',
  'nombre',
  'nombre_completo',
  'nombreCompleto',
]
const CLAVES_ESTADO = ['estado', 'situacion', 'status']

function primerValor(obj: Record<string, unknown> | null, claves: string[]): string {
  if (!obj) return ''
  for (const k of claves) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Extrae {razonSocial, estado} de una respuesta JSON de forma tolerante. */
function extraer(json: unknown): ConsultaRuc {
  const raiz = json as Record<string, unknown> | null
  const obj =
    (raiz?.contribuyente as Record<string, unknown>) ||
    (raiz?.data as Record<string, unknown>) ||
    (raiz?.result as Record<string, unknown>) ||
    raiz
  const razonSocial = primerValor(obj, CLAVES_RAZON)
  const estadoRuc = primerValor(obj, CLAVES_ESTADO)
  if (razonSocial) return { ok: true, razonSocial, estadoRuc }
  return { ok: false, error: 'RUC no encontrado.' }
}

/** Intento directo al API de TuRUC desde el navegador. */
async function consultarDirecto(rucCompleto: string): Promise<ConsultaRuc> {
  const url = `https://turuc.com.py/api/contribuyente/${encodeURIComponent(rucCompleto)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return { ok: false, error: `RUC no encontrado (${res.status}).` }
  const json = await res.json()
  return { ...extraer(json), fuente: 'directo' }
}

/** Fallback: el Apps Script consulta del lado servidor (sin CORS). */
async function consultarProxy(ruc: string, dv: number): Promise<ConsultaRuc> {
  if (!appsScriptConfigurado()) return { ok: false, error: 'Consulta no disponible.' }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion: 'consultaRuc', ruc, dv: String(dv) }),
    redirect: 'follow',
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ...((await res.json()) as ConsultaRuc), fuente: 'proxy' }
}

export async function consultarRucSet(ruc: string, dv: number): Promise<ConsultaRuc> {
  const rucCompleto = `${ruc}-${dv}`
  try {
    const directo = await consultarDirecto(rucCompleto)
    if (directo.ok) return directo
    // Si respondió pero no encontró, no insistimos con el proxy.
    return directo
  } catch {
    // CORS/red bloquearon la llamada directa: intentamos por el proxy.
    try {
      return await consultarProxy(ruc, dv)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error de conexión.' }
    }
  }
}
