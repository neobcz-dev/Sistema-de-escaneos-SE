import { useState } from 'react'
import type { Comprobante } from '../types'
import type { ImagenProcesada } from '../lib/image'
import { CameraCapture } from './CameraCapture'
import { ImageEditor } from './ImageEditor'

interface Props {
  items: Comprobante[]
  numerado: boolean
  onAgregarArchivos: (files: FileList | File[]) => void
  onEliminar: (id: string) => void
  onEditarOCR: (id: string, texto: string) => void
  onEditarCampo: (id: string, campo: 'rucProveedor' | 'nroFactura', valor: string) => void
  onReemplazarImagen: (id: string, img: ImagenProcesada) => void
  onAtras: () => void
  onContinuar: () => void
}

export function Scanner({
  items,
  numerado,
  onAgregarArchivos,
  onEliminar,
  onEditarOCR,
  onEditarCampo,
  onReemplazarImagen,
  onAtras,
  onContinuar,
}: Props) {
  const [camara, setCamara] = useState(false)
  const [editando, setEditando] = useState<Comprobante | null>(null)

  function alSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length) onAgregarArchivos(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div>
          <h2 className="text-xl font-bold text-navy">Capture sus comprobantes</h2>
          <p className="mt-1 text-sm text-anthracite/70">
            Con la cámara puede sacar <span className="font-semibold">varias fotos seguidas</span>{' '}
            sin reabrirla. Leemos el texto y detectamos el RUC del proveedor y el N° de
            comprobante automáticamente.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={() => setCamara(true)}>
            <IconCamara /> Escanear con cámara
          </button>
          <label className="btn-ghost cursor-pointer">
            <IconGaleria /> Elegir de la galería
            <input type="file" accept="image/*" multiple className="hidden" onChange={alSeleccionar} />
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-navy/15 bg-white/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-anthracite/60">
            Aún no ha agregado comprobantes.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((c, i) => (
            <li key={c.id} className="card space-y-3">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setEditando(c)}
                  className="group relative h-28 w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-navy/10"
                  aria-label="Editar imagen"
                >
                  <img src={c.dataUrl} alt={`Comprobante ${i + 1}`} className="h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-navy/70 py-0.5 text-center text-[10px] font-semibold text-white">
                    ✂️ Ajustar
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <EstadoOCRBadge comp={c} />
                    <button
                      type="button"
                      onClick={() => onEliminar(c.id)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="field-label text-xs">RUC proveedor</label>
                      <input
                        className="field-input py-2 text-sm"
                        placeholder={c.ocrEstado === 'procesando' ? '…' : 'No detectado'}
                        value={c.rucProveedor}
                        onChange={(e) => onEditarCampo(c.id, 'rucProveedor', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label text-xs">N° comprobante</label>
                      <input
                        className="field-input py-2 text-sm"
                        placeholder={
                          c.ocrEstado === 'procesando'
                            ? '…'
                            : numerado
                              ? '001-001-0000001'
                              : 'N° libre (ej. 0001)'
                        }
                        value={c.nroFactura}
                        onChange={(e) => onEditarCampo(c.id, 'nroFactura', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-navy/70">
                  Ver / editar texto detectado
                </summary>
                <textarea
                  className="field-input mt-2 min-h-[80px] resize-y text-sm"
                  value={c.ocrTexto}
                  placeholder={
                    c.ocrEstado === 'procesando' ? 'Leyendo el comprobante…' : 'Sin texto detectado.'
                  }
                  onChange={(e) => onEditarOCR(c.id, e.target.value)}
                />
              </details>
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

      {camara && (
        <CameraCapture
          onCapturar={(blob) => onAgregarArchivos([new File([blob], 'captura.jpg', { type: 'image/jpeg' })])}
          onCerrar={() => setCamara(false)}
        />
      )}

      {editando && (
        <ImageEditor
          src={editando.dataUrl}
          onCancelar={() => setEditando(null)}
          onAplicar={(img) => {
            onReemplazarImagen(editando.id, img)
            setEditando(null)
          }}
        />
      )}
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
        ✓ Leído
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
    <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy/60">En cola…</span>
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
