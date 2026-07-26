import { useEffect, useState } from 'react'
import type { Cliente, TipoComprobante } from '../types'
import { calcularDV, emailValido, rucCompleto, TIPOS_COMPROBANTE } from '../lib/util'
import { consultarRucSet, noConfigurada } from '../lib/set'

const TIPOS = TIPOS_COMPROBANTE

/** Extrae la base (sin DV) de un RUC guardado como "80012345-6". */
function extraerBase(ruc: string): string {
  const g = (ruc || '').lastIndexOf('-')
  return g > 0 ? ruc.slice(0, g) : ruc || ''
}

interface Props {
  valor: Cliente
  fotosCompartidas?: number
  onContinuar: (cliente: Cliente) => void
}

export function ClientForm({ valor, fotosCompartidas = 0, onContinuar }: Props) {
  const [cliente, setCliente] = useState<Cliente>(valor)
  const [rucBase, setRucBase] = useState(() => extraerBase(valor.ruc))
  const [tocado, setTocado] = useState(false)

  const baseLimpia = rucBase.trim()
  const dv = baseLimpia ? calcularDV(baseLimpia) : null
  const rucValidoBase = /^[0-9A-Za-z]{3,12}$/.test(baseLimpia)

  // Consulta automática del nombre en la SET (vía Apps Script) al validar el RUC.
  type EstadoSet = { estado: 'idle' | 'buscando' | 'ok' | 'error'; razon?: string; msg?: string }
  const [consultaSet, setConsultaSet] = useState<EstadoSet>({ estado: 'idle' })

  useEffect(() => {
    if (!rucValidoBase || dv === null) {
      setConsultaSet({ estado: 'idle' })
      return
    }
    let cancelado = false
    setConsultaSet({ estado: 'buscando' })
    const t = setTimeout(async () => {
      const r = await consultarRucSet(baseLimpia, dv)
      if (cancelado) return
      if (noConfigurada(r)) {
        setConsultaSet({ estado: 'idle' }) // silencioso si no está configurada
        return
      }
      if (r.ok && r.razonSocial) {
        setConsultaSet({ estado: 'ok', razon: r.razonSocial })
        // Autocompleta el nombre solo si está vacío (no pisa lo que el usuario escribió).
        setCliente((c) => (c.nombre.trim() ? c : { ...c, nombre: r.razonSocial as string }))
      } else {
        setConsultaSet({ estado: 'error', msg: r.error })
      }
    }, 700)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [baseLimpia, dv, rucValidoBase])

  const errores = {
    nombre: cliente.nombre.trim().length < 2 ? 'Ingrese su nombre o razón social.' : '',
    ruc: !rucValidoBase ? 'Ingrese su RUC o cédula (sin el dígito verificador).' : '',
    email: !emailValido(cliente.email) ? 'El correo no es válido.' : '',
  }
  const valido = !errores.nombre && !errores.ruc && !errores.email

  function set<K extends keyof Cliente>(campo: K, v: Cliente[K]) {
    setCliente((c) => ({ ...c, [campo]: v }))
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (valido) {
      onContinuar({
        ...cliente,
        nombre: cliente.nombre.trim(),
        ruc: rucCompleto(baseLimpia), // guarda "base-DV"
      })
    }
  }

  return (
    <form onSubmit={enviar} className="card space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-bold text-navy">Identifíquese</h2>
        <p className="mt-1 text-sm text-anthracite/70">
          Estos datos nos permiten asociar sus comprobantes a su cuenta.
        </p>
      </div>

      {fotosCompartidas > 0 && (
        <div className="rounded-xl bg-celeste/15 px-4 py-3 text-sm font-medium text-navy">
          📎 {fotosCompartidas} {fotosCompartidas === 1 ? 'foto recibida' : 'fotos recibidas'} de
          WhatsApp. Identifíquese y las cargamos automáticamente.
        </div>
      )}

      <div>
        <label htmlFor="nombre" className="field-label">
          Nombre o razón social <span className="text-celeste-dark">*</span>
        </label>
        <input
          id="nombre"
          className="field-input"
          autoComplete="organization"
          placeholder="Ej.: Comercial San Miguel S.A."
          value={cliente.nombre}
          onChange={(e) => set('nombre', e.target.value)}
        />
        {tocado && errores.nombre && <p className="mt-1 text-sm text-red-600">{errores.nombre}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="ruc" className="field-label">
            RUC o C.I. <span className="text-celeste-dark">*</span>
            <span className="font-normal text-anthracite/50"> (sin dígito verificador)</span>
          </label>
          <div className="flex items-stretch">
            <input
              id="ruc"
              className="field-input rounded-r-none"
              inputMode="numeric"
              placeholder="Ej.: 80012345"
              value={rucBase}
              onChange={(e) => setRucBase(e.target.value)}
            />
            <span
              className="flex min-w-[3.2rem] items-center justify-center rounded-r-xl border border-l-0 border-anthracite/15 bg-mist px-2 font-bold text-navy"
              title="Dígito verificador calculado automáticamente"
            >
              {dv !== null && rucValidoBase ? `-${dv}` : '-?'}
            </span>
          </div>
          {rucValidoBase && dv !== null ? (
            <p className="mt-1 text-xs text-emerald-600">
              RUC completo: <strong>{baseLimpia}-{dv}</strong>
            </p>
          ) : (
            tocado && errores.ruc && <p className="mt-1 text-sm text-red-600">{errores.ruc}</p>
          )}
          {consultaSet.estado === 'buscando' && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-celeste-dark">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-celeste border-t-transparent" />
              Consultando la SET…
            </p>
          )}
          {consultaSet.estado === 'ok' && consultaSet.razon && (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              ✓ SET: {consultaSet.razon}
            </p>
          )}
          {consultaSet.estado === 'error' && (
            <p className="mt-1 text-xs text-amber-600">SET: {consultaSet.msg}</p>
          )}
        </div>
        <div>
          <label htmlFor="email" className="field-label">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            className="field-input"
            autoComplete="email"
            placeholder="opcional"
            value={cliente.email}
            onChange={(e) => set('email', e.target.value)}
          />
          {tocado && errores.email && <p className="mt-1 text-sm text-red-600">{errores.email}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="tipo" className="field-label">
          Tipo de comprobante (por defecto)
        </label>
        <select
          id="tipo"
          className="field-input"
          value={cliente.tipo}
          onChange={(e) => set('tipo', e.target.value as TipoComprobante)}
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-anthracite/50">
          Los comprobantes se archivan por fecha de envío.
        </p>
      </div>

      <div>
        <label htmlFor="nota" className="field-label">
          Nota (opcional)
        </label>
        <textarea
          id="nota"
          className="field-input min-h-[72px] resize-y"
          placeholder="Cualquier detalle que quiera indicarnos…"
          value={cliente.nota}
          onChange={(e) => set('nota', e.target.value)}
        />
      </div>

      <button type="submit" className="btn-primary w-full">
        Continuar
      </button>
    </form>
  )
}
