import { useRef } from 'react'
import type { Comprobante } from '../types'

interface Props {
  items: Comprobante[]
  onAgregarArchivos: (files: FileList | File[]) => void
  onEliminar: (id: string) => void
  onEditarOCR: (id: string, texto: string) => void
  onAtras: () => void
  onContinuar: () => void
}

export function Scanner({
  items,
  onAgregarArchivos,
  onEliminar,
  onEditarOCR,
  onAtras,
  onContinuar,
}: Props) {
  const camaraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)

  function alSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length) {
      onAgregarArchivos(e.target.files)
    }
    e.target.value = '' // permite volver a elegir el mismo archivo
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div>
          <h2 className="text-xl font-bold text-navy">Capture sus comprobantes</h2>
          <p className="mt-1 text-sm text-anthracite/70">
            Tome una foto de cada comprobante o elíjalos desde su galería. Puede
            agregar varios. Procuramos leer el texto automáticamente.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => camaraRef.current?.click()}
          >
            <IconCamara /> Tomar foto
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => galeriaRef.current?.click()}
          >
            <IconGaleria /> Elegir de la galería
          </button>
        </div>

        <input
          ref={camaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={alSeleccionar}
        />
        <input
          ref={galeriaRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={alSeleccionar}
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-navy/15 bg-white/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-anthracite/60">
            Aún no ha agregado comprobantes.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((c) => (
            <li key={c.id} className="card">
              <div className="flex gap-4">
                <img
                  src={c.dataUrl}
                  alt="Comprobante"
                  className="h-28 w-24 shrink-0 rounded-lg object-cover ring-1 ring-navy/10"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <EstadoOCRBadge comp={c} />
                    <button
                      type="button"
                      onClick={() => onEliminar(c.id)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                      aria-label="Eliminar comprobante"
                    >
                      Eliminar
                    </button>
                  </div>

                  <label className="field-label mt-3 text-xs">Texto detectado (editable)</label>
                  <textarea
                    className="field-input min-h-[80px] resize-y text-sm"
                    value={c.ocrTexto}
                    placeholder={
                      c.ocrEstado === 'procesando'
                        ? 'Leyendo el comprobante…'
                        : 'Sin texto. Puede escribir una referencia.'
                    }
                    onChange={(e) => onEditarOCR(c.id, e.target.value)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        <button type="button" className="btn-ghost flex-1" onClick={onAtras}>
          Atrás
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={items.length === 0}
          onClick={onContinuar}
        >
          Continuar ({items.length})
        </button>
      </div>
    </div>
  )
}

function EstadoOCRBadge({ comp }: { comp: Comprobante }) {
  if (comp.ocrEstado === 'procesando') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-celeste/15 px-3 py-1 text-xs font-semibold text-celeste-dark">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-celeste border-t-transparent" />
        Leyendo… {Math.round(comp.ocrProgreso * 100)}%
      </span>
    )
  }
  if (comp.ocrEstado === 'listo') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        ✓ Texto detectado
      </span>
    )
  }
  if (comp.ocrEstado === 'error') {
    return (
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        OCR no disponible
      </span>
    )
  }
  return (
    <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy/60">
      En cola…
    </span>
  )
}

function IconCamara() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

function IconGaleria() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.5-3.5L9 20" />
    </svg>
  )
}
