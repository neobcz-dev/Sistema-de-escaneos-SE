import { useMemo, useState } from 'react'
import { leerHistorial, limpiarHistorial, type RegistroHistorial } from '../lib/historial'
import { useAtrasCierra } from '../lib/useAtras'

interface Props {
  onCerrar: () => void
}

/** Convierte la fecha ISO (UTC) a día y hora en zona de Paraguay. */
function partesPY(iso: string): { dia: string; hora: string } {
  try {
    const partes = new Intl.DateTimeFormat('es-PY', {
      timeZone: 'America/Asuncion',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(iso))
    const g = (t: string) => partes.find((p) => p.type === t)?.value || ''
    return { dia: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` }
  } catch {
    return { dia: (iso || '').slice(0, 10), hora: (iso || '').slice(11, 16) }
  }
}

/** Agrupa por día (en hora de Paraguay). */
function agrupar(lista: RegistroHistorial[]): [string, RegistroHistorial[]][] {
  const mapa = new Map<string, RegistroHistorial[]>()
  for (const r of lista) {
    const dia = partesPY(r.fecha).dia
    if (!mapa.has(dia)) mapa.set(dia, [])
    mapa.get(dia)!.push(r)
  }
  return [...mapa.entries()]
}

function formatoDia(dia: string): string {
  const p = dia.split('-')
  if (p.length !== 3) return dia
  return `${p[2]}/${p[1]}/${p[0]}`
}

function formatoHora(iso: string): string {
  return partesPY(iso).hora
}

export function Historial({ onCerrar }: Props) {
  useAtrasCierra(onCerrar)
  const [lista, setLista] = useState<RegistroHistorial[]>(() => leerHistorial())
  const grupos = useMemo(() => agrupar(lista), [lista])

  function vaciar() {
    if (confirm('¿Borrar el historial de este teléfono? Los comprobantes ya enviados NO se borran de Drive.')) {
      limpiarHistorial()
      setLista([])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-mist">
      <div className="flex items-center justify-between border-b border-navy/10 bg-white px-4 py-3">
        <button onClick={onCerrar} className="text-sm font-semibold text-navy">
          ← Volver
        </button>
        <span className="text-sm font-bold text-navy">Historial de envíos</span>
        {lista.length > 0 ? (
          <button onClick={vaciar} className="text-sm font-semibold text-red-600">
            Vaciar
          </button>
        ) : (
          <span className="w-12" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {lista.length === 0 ? (
          <div className="mt-10 text-center text-sm text-anthracite/60">
            Todavía no hay comprobantes enviados desde este teléfono.
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            <p className="text-center text-xs text-anthracite/60">
              Se guardan en este teléfono. {lista.length}{' '}
              {lista.length === 1 ? 'comprobante enviado' : 'comprobantes enviados'}.
            </p>
            {grupos.map(([dia, items]) => (
              <div key={dia} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-navy/60">
                  {formatoDia(dia)}
                </h3>
                <ul className="space-y-2">
                  {items.map((r) => (
                    <li key={r.id} className="card space-y-1 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-navy">
                          {r.proveedor || r.rucProveedor || 'Proveedor sin dato'}
                        </span>
                        <span className="shrink-0 text-xs text-anthracite/50">
                          {formatoHora(r.fecha)}
                        </span>
                      </div>
                      <div className="text-sm text-anthracite/70">
                        {r.tipo}
                        {r.nroFactura ? ` · N° ${r.nroFactura}` : ''}
                      </div>
                      {r.urlDrive && (
                        <a
                          href={r.urlDrive}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-sm font-semibold text-celeste-dark underline"
                        >
                          Ver en Drive
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
