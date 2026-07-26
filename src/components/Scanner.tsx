import { useState } from 'react'
import type { Comprobante, TipoComprobante } from '../types'
import { codigoTipo, formatearNumeroComprobante, TIPOS_COMPROBANTE } from '../lib/util'
import { analizarRuc } from '../lib/ruc'
import { CameraCapture } from './CameraCapture'
import { ImageEditor, type ResultadoEdicion } from './ImageEditor'
import { ZoomViewer } from './ZoomViewer'
import { BuscadorNombre } from './BuscadorNombre'

interface Props {
  items: Comprobante[]
  onAgregarArchivos: (files: FileList | File[], autoRecorte?: boolean) => void
  onEliminar: (id: string) => void
  onEditarOCR: (id: string, texto: string) => void
  onEditarCampo: (
    id: string,
    campo: 'rucProveedor' | 'nombreProveedor' | 'nroFactura',
    valor: string,
  ) => void
  onEditarTipo: (id: string, tipo: TipoComprobante) => void
  onBuscarProveedor: (id: string, ruc: string) => void
  onReemplazarImagen: (id: string, r: ResultadoEdicion) => void
  onAtras: () => void
  onContinuar: () => void
}

export function Scanner({
  items,
  onAgregarArchivos,
  onEliminar,
  onEditarOCR,
  onEditarCampo,
  onEditarTipo,
  onBuscarProveedor,
  onReemplazarImagen,
  onAtras,
  onContinuar,
}: Props) {
  const [camara, setCamara] = useState(false)
  const [editando, setEditando] = useState<Comprobante | null>(null)
  const [zoom, setZoom] = useState<Comprobante | null>(null)
  const [buscarProvId, setBuscarProvId] = useState<string | null>(null)

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

              {/* Imagen grande: tocar para ampliar (zoom) y leer los datos. */}
              <div className="text-center">
                <div className="relative inline-block max-w-full">
                  <button
                    type="button"
                    onClick={() => setZoom(c)}
                    className="block overflow-hidden rounded-xl ring-1 ring-navy/10"
                    aria-label="Ampliar imagen"
                  >
                    <img
                      src={c.dataUrl}
                      alt={`Comprobante ${i + 1}`}
                      className="block max-h-80 max-w-full"
                    />
                  </button>
                  {/* Selección detectada (cuadrilátero) sobre la miniatura. */}
                  {c.esquinas && !c.recortado && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <polygon
                        points={c.esquinas.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                        fill="rgba(62,166,221,0.12)"
                        stroke="#3EA6DD"
                        strokeWidth="0.8"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  )}
                  <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                    🔍 Tocar para ampliar
                  </span>
                </div>
                <div className="mt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setEditando(c)}
                    className="rounded-lg bg-navy/5 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/10"
                  >
                    ✂️ Ajustar esquinas y enderezar
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="field-label">
                    Tipo de comprobante{' '}
                    {c.ocrEstado === 'listo' && (
                      <span className="font-normal text-emerald-600">· detectado</span>
                    )}
                  </label>
                  <select
                    className="field-input"
                    value={c.tipo}
                    onChange={(e) => onEditarTipo(c.id, e.target.value as TipoComprobante)}
                  >
                    {TIPOS_COMPROBANTE.map((t) => (
                      <option key={t} value={t}>
                        {t} ({codigoTipo(t).codigo})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">RUC proveedor</label>
                  <input
                    inputMode="numeric"
                    className="field-input text-lg tracking-wide"
                    placeholder={c.ocrEstado === 'procesando' ? 'Leyendo…' : 'No detectado'}
                    value={c.rucProveedor}
                    onChange={(e) => onEditarCampo(c.id, 'rucProveedor', e.target.value)}
                    onBlur={(e) => onBuscarProveedor(c.id, e.target.value)}
                  />
                  <AvisoRuc
                    valor={c.rucProveedor}
                    onCorregir={(ruc) => {
                      onEditarCampo(c.id, 'rucProveedor', ruc)
                      onBuscarProveedor(c.id, ruc)
                    }}
                  />
                  {buscarProvId === c.id ? (
                    <div className="mt-2">
                      <BuscadorNombre
                        titulo="Buscar proveedor por nombre"
                        onCerrar={() => setBuscarProvId(null)}
                        onElegir={(o) => {
                          onEditarCampo(c.id, 'rucProveedor', `${o.ruc}-${o.dv}`)
                          onEditarCampo(c.id, 'nombreProveedor', o.razonSocial)
                          setBuscarProvId(null)
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBuscarProvId(c.id)}
                      className="mt-1 text-xs font-semibold text-celeste-dark underline"
                    >
                      Buscar proveedor por nombre
                    </button>
                  )}
                </div>
                <div>
                  <label className="field-label">N° comprobante</label>
                  <input
                    inputMode="numeric"
                    className="field-input text-lg tracking-wide"
                    placeholder={
                      c.ocrEstado === 'procesando'
                        ? 'Leyendo…'
                        : codigoTipo(c.tipo).numerado
                          ? '001-001-0000001'
                          : 'N° libre (ej. 0001)'
                    }
                    value={c.nroFactura}
                    onChange={(e) => onEditarCampo(c.id, 'nroFactura', e.target.value)}
                    onBlur={(e) =>
                      onEditarCampo(
                        c.id,
                        'nroFactura',
                        formatearNumeroComprobante(e.target.value, codigoTipo(c.tipo).numerado),
                      )
                    }
                  />
                  {codigoTipo(c.tipo).numerado && (
                    <p className="mt-1 text-xs text-anthracite/50">
                      Complete los ceros solos: escriba 001-001-1 y queda 001-001-0000001.
                    </p>
                  )}
                </div>
                <div>
                  <label className="field-label">Nombre del proveedor</label>
                  <input
                    className="field-input"
                    placeholder="Se busca por el RUC…"
                    value={c.nombreProveedor}
                    onChange={(e) => onEditarCampo(c.id, 'nombreProveedor', e.target.value)}
                  />
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
          onCapturar={(blob) =>
            onAgregarArchivos([new File([blob], 'captura.jpg', { type: 'image/jpeg' })], true)
          }
          onCerrar={() => setCamara(false)}
        />
      )}

      {editando && (
        <ImageEditor
          src={editando.originalDataUrl}
          esquinasIniciales={editando.esquinas}
          baseInicial={editando.baseEdicion}
          onCancelar={() => setEditando(null)}
          onAplicar={(r) => {
            onReemplazarImagen(editando.id, r)
            setEditando(null)
          }}
        />
      )}

      {zoom && <ZoomViewer src={zoom.dataUrl} onCerrar={() => setZoom(null)} />}
    </div>
  )
}

/** Aviso de validación del RUC del proveedor + botón para corregir. */
function AvisoRuc({ valor, onCorregir }: { valor: string; onCorregir: (ruc: string) => void }) {
  const limpio = (valor || '').trim()
  if (!limpio || limpio.replace(/\D/g, '').length < 4) return null
  const a = analizarRuc(limpio)
  if (a.valido) {
    return <p className="mt-1 text-xs font-medium text-emerald-600">✓ RUC válido</p>
  }
  const mensaje = !a.enRango
    ? 'El RUC no cae en un rango válido (empresas 8…, personas hasta 7 dígitos).'
    : a.dv === null
      ? 'Falta el dígito verificador.'
      : `El dígito verificador no coincide (para ${a.base} debería ser ${a.dvEsperado}).`
  return (
    <div className="mt-1 space-y-1">
      <p className="text-xs font-medium text-amber-600">⚠️ {mensaje}</p>
      {a.sugerencia && (
        <button
          type="button"
          onClick={() => onCorregir(a.sugerencia!)}
          className="rounded-lg bg-celeste/15 px-3 py-1.5 text-xs font-bold text-celeste-dark"
        >
          Corregir a {a.sugerencia}
        </button>
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
