/**
 * Consulta de RUC. Usa TuRUC (https://turuc.com.py) — API pública y gratuita,
 * sin API key. Intenta primero una llamada directa desde el navegador; si CORS
 * la bloquea, cae al proxy del Apps Script (que consulta del lado servidor).
 */
import { APPS_SCRIPT_URL, appsScriptConfigurado } from '../config'
import { calcularDV } from './util'

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

// ---- Búsqueda por NOMBRE / razón social (devuelve varias coincidencias) ----

export interface OpcionRuc {
  ruc: string // base sin DV
  dv: number
  razonSocial: string
}

export interface BusquedaNombre {
  ok: boolean
  opciones: OpcionRuc[]
  error?: string
}

/** Normaliza un contribuyente del API a { ruc(base), dv, razonSocial }. */
function normalizarOpcion(c: Record<string, unknown> | null): OpcionRuc | null {
  if (!c) return null
  const razonSocial = primerValor(c, CLAVES_RAZON)
  const rucRaw = String(c.ruc ?? c.RUC ?? c.numero ?? c.documento ?? '').trim()
  if (!rucRaw) return null
  const dvRaw = c.dv ?? c.digitoVerificador ?? c.digito_verificador ?? c.digito
  let base = ''
  let dv = NaN
  if (rucRaw.includes('-')) {
    const g = rucRaw.lastIndexOf('-')
    base = rucRaw.slice(0, g).replace(/\D/g, '')
    dv = Number(rucRaw.slice(g + 1).replace(/\D/g, '').charAt(0))
  } else if (dvRaw !== undefined && dvRaw !== null && String(dvRaw) !== '') {
    base = rucRaw.replace(/\D/g, '')
    dv = Number(String(dvRaw).replace(/\D/g, '').charAt(0))
  } else {
    base = rucRaw.replace(/\D/g, '')
    dv = calcularDV(base)
  }
  if (!base || Number.isNaN(dv)) return null
  return { ruc: base, dv, razonSocial }
}

/** Extrae el array de contribuyentes de la respuesta, de forma tolerante. */
function extraerLista(json: unknown): OpcionRuc[] {
  const raiz = json as Record<string, unknown> | null
  const data = (raiz?.data as Record<string, unknown>) || raiz
  const arr =
    (data?.contribuyentes as unknown[]) ||
    (raiz?.contribuyentes as unknown[]) ||
    (Array.isArray(data) ? (data as unknown[]) : null) ||
    (raiz?.results as unknown[]) ||
    []
  if (!Array.isArray(arr)) return []
  const vistos = new Set<string>()
  const salida: OpcionRuc[] = []
  for (const c of arr) {
    const op = normalizarOpcion(c as Record<string, unknown>)
    if (!op) continue
    const clave = `${op.ruc}-${op.dv}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    salida.push(op)
    if (salida.length >= 15) break
  }
  return salida
}

async function buscarDirecto(texto: string): Promise<BusquedaNombre> {
  const url = `https://turuc.com.py/api/contribuyente/search?search=${encodeURIComponent(texto)}&page=0`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return { ok: false, opciones: [], error: `HTTP ${res.status}` }
  const json = await res.json()
  return { ok: true, opciones: extraerLista(json) }
}

async function buscarProxy(texto: string): Promise<BusquedaNombre> {
  if (!appsScriptConfigurado()) return { ok: false, opciones: [], error: 'Búsqueda no disponible.' }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion: 'buscarNombre', texto }),
    redirect: 'follow',
  })
  if (!res.ok) return { ok: false, opciones: [], error: `HTTP ${res.status}` }
  const json = (await res.json()) as { ok?: boolean; opciones?: OpcionRuc[]; error?: string }
  return { ok: !!json.ok, opciones: json.opciones || [], error: json.error }
}

/**
 * Busca contribuyentes por nombre/razón social (mínimo 3 caracteres). Devuelve
 * varias coincidencias para que el usuario elija. Intenta directo y, si CORS lo
 * bloquea, cae al proxy del Apps Script.
 */
export async function buscarRucPorNombre(texto: string): Promise<BusquedaNombre> {
  const q = (texto || '').trim()
  if (q.length < 3) return { ok: true, opciones: [] }
  try {
    return await buscarDirecto(q)
  } catch {
    try {
      return await buscarProxy(q)
    } catch (e) {
      return { ok: false, opciones: [], error: e instanceof Error ? e.message : 'Error de conexión.' }
    }
  }
}
