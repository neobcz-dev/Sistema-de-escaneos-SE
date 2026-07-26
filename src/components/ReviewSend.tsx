import type { Cliente, Comprobante } from '../types'
import { appsScriptConfigurado, EMPRESA } from '../config'
import { codigoTipo } from '../lib/util'

interface Props {
  cliente: Cliente
  items: Comprobante[]
  enviando: boolean
  finalizado: boolean
  onEnviar: () => void
  onAtras: () => void
  onReiniciar: () => void
}

export function ReviewSend({
  cliente,
  items,
  enviando,
  finalizado,
  onEnviar,
  onAtras,
  onReiniciar,
}: Props) {
  const configurado = appsScriptConfigurado()
  const enviados = items.filter((i) => i.subida === 'ok').length
  const conError = items.filter((i) => i.subida === 'error')

  if (finalizado && conError.length === 0) {
    return (
      <div className="card space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-navy">¡Comprobantes enviados!</h2>
          <p className="mt-1 text-sm text-anthracite/70">
            Recibimos {enviados} {enviados === 1 ? 'comprobante' : 'comprobantes'} de{' '}
            <span className="font-semibold text-navy">{cliente.nombre}</span>. Ya están
            en poder de {EMPRESA.nombre}.
          </p>
        </div>
        <button type="button" className="btn-primary w-full" onClick={onReiniciar}>
          Enviar más comprobantes
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {!configurado && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Falta configurar el destino.</p>
          <p className="mt-1">
            El administrador debe indicar la URL del Apps Script en{' '}
            <code className="rounded bg-amber-100 px-1">src/config.ts</code>. Mientras
            tanto, el envío está deshabilitado.
          </p>
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="text-xl font-bold text-navy">Revise y confirme</h2>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
          <Dato etiqueta="Cliente" valor={cliente.nombre} />
          <Dato etiqueta="RUC / C.I." valor={cliente.ruc} />
          {cliente.email && <Dato etiqueta="Correo" valor={cliente.email} />}
          <Dato etiqueta="Comprobantes" valor={String(items.length)} />
        </dl>
        {cliente.nota && (
          <p className="rounded-lg bg-mist px-3 py-2 text-sm text-anthracite/80">
            <span className="font-semibold text-navy">Nota:</span> {cliente.nota}
          </p>
        )}
      </div>

      <ul className="space-y-3">
        {items.map((c, i) => (
          <li key={c.id} className="card flex items-center gap-4 py-4">
            <img
              src={c.dataUrl}
              alt={`Comprobante ${i + 1}`}
              className="h-16 w-14 shrink-0 rounded-lg object-cover ring-1 ring-navy/10"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy">
                <span className="mr-1 rounded bg-navy/10 px-1.5 py-0.5 text-xs font-bold text-navy">
                  {codigoTipo(c.tipo).codigo}
                </span>
                {[c.rucProveedor && `RUC ${c.rucProveedor}`, c.nroFactura]
                  .filter(Boolean)
                  .join(' · ') || `Comprobante ${i + 1}`}
              </p>
              <p className="truncate text-xs text-anthracite/60">
                📄 PDF buscable · {c.tipo}
              </p>
            </div>
            <EstadoSubidaBadge comp={c} />
          </li>
        ))}
      </ul>

      {conError.length > 0 && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {conError.length} {conError.length === 1 ? 'comprobante no se pudo enviar' : 'comprobantes no se pudieron enviar'}.
          Puede reintentar el envío.
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={onAtras}
          disabled={enviando}
        >
          Atrás
        </button>
        <button
          type="button"
          className="btn-accent flex-1"
          onClick={onEnviar}
          disabled={enviando || !configurado}
        >
          {enviando
            ? `Enviando… ${enviados}/${items.length}`
            : conError.length > 0
              ? 'Reintentar envío'
              : 'Enviar a Servicio Empresarial'}
        </button>
      </div>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="col-span-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-anthracite/50">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 break-words font-semibold text-navy">{valor}</dd>
    </div>
  )
}

function EstadoSubidaBadge({ comp }: { comp: Comprobante }) {
  switch (comp.subida) {
    case 'subiendo':
      return (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-celeste border-t-transparent" />
      )
    case 'ok':
      return <span className="text-lg text-emerald-600">✓</span>
    case 'error':
      return <span className="text-lg text-red-600" title={comp.errorSubida}>✕</span>
    default:
      return <span className="text-xs font-medium text-anthracite/40">En espera</span>
  }
}
