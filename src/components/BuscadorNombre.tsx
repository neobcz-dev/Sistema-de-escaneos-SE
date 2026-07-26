import { useEffect, useRef, useState } from 'react'
import { buscarRucPorNombre, type OpcionRuc } from '../lib/set'

interface Props {
  onElegir: (opcion: OpcionRuc) => void
  onCerrar: () => void
  titulo?: string
}

/**
 * Buscador por NOMBRE / razón social: escribe el nombre y muestra las
 * coincidencias (pueden ser varias); al tocar una, la elige.
 */
export function BuscadorNombre({ onElegir, onCerrar, titulo = 'Buscar por nombre' }: Props) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'idle' | 'buscando' | 'listo' | 'error'>('idle')
  const [opciones, setOpciones] = useState<OpcionRuc[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = texto.trim()
    if (q.length < 3) {
      setEstado('idle')
      setOpciones([])
      return
    }
    let cancelado = false
    setEstado('buscando')
    const t = setTimeout(async () => {
      const r = await buscarRucPorNombre(q)
      if (cancelado) return
      if (r.ok) {
        setOpciones(r.opciones)
        setEstado('listo')
      } else {
        setError(r.error || 'No se pudo buscar.')
        setEstado('error')
      }
    }, 500)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [texto])

  return (
    <div className="rounded-xl border border-navy/10 bg-mist/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-navy">{titulo}</span>
        <button
          type="button"
          onClick={onCerrar}
          className="text-xs font-semibold text-anthracite/60"
        >
          Cerrar
        </button>
      </div>
      <input
        ref={inputRef}
        className="field-input"
        placeholder="Escriba el nombre o razón social…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {texto.trim().length > 0 && texto.trim().length < 3 && (
        <p className="mt-1 text-xs text-anthracite/50">Escriba al menos 3 letras.</p>
      )}
      {estado === 'buscando' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-celeste-dark">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-celeste border-t-transparent" />
          Buscando…
        </p>
      )}
      {estado === 'error' && <p className="mt-2 text-xs text-amber-600">⚠️ {error}</p>}
      {estado === 'listo' && opciones.length === 0 && (
        <p className="mt-2 text-xs text-anthracite/60">Sin coincidencias.</p>
      )}

      {opciones.length > 0 && (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {opciones.map((o) => (
            <li key={`${o.ruc}-${o.dv}`}>
              <button
                type="button"
                onClick={() => onElegir(o)}
                className="w-full rounded-lg bg-white px-3 py-2 text-left ring-1 ring-navy/10 hover:bg-celeste/10"
              >
                <div className="font-semibold text-navy">{o.razonSocial || 'Sin nombre'}</div>
                <div className="text-xs text-anthracite/60">
                  RUC {o.ruc}-{o.dv}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
