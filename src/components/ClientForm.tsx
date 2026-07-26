import { useEffect, useState } from 'react'
import type { Cliente, TipoComprobante } from '../types'
import { calcularDV, rucCompleto, TIPOS_COMPROBANTE } from '../lib/util'
import { consultarRucSet, noConfigurada } from '../lib/set'
import { BuscadorNombre } from './BuscadorNombre'

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
  const [buscarPorNombre, setBuscarPorNombre] = useState(false)

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
        // Fija el nombre OFICIAL (y lo bloquea) para no duplicar carpetas de
        // clientes por errores de tipeo.
        setCliente((c) => ({ ...c, nombre: r.razonSocial as string }))
      } else {
        setConsultaSet({ estado: 'error', msg: r.error })
      }
    }, 700)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [baseLimpia, dv, rucValidoBase])

  // El nombre se bloquea cuando el RUC fue encontrado (nombre oficial).
  const nombreBloqueado = consultaSet.estado === 'ok'

  const errores = {
    nombre: cliente.nombre.trim().length < 2 ? 'Ingrese su nombre o razón social.' : '',
    ruc: !rucValidoBase ? 'Ingrese su RUC o cédula (sin el dígito verificador).' : '',
  }
  const valido = !errores.nombre && !errores.ruc

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
          📎 {fotosCompartidas}{' '}
          {fotosCompartidas === 1 ? 'archivo recibido' : 'archivos recibidos'} (fotos o PDF). Puede
          seguir compartiendo más de a uno (se van sumando); al continuar los cargamos todos.
        </div>
      )}

      {/* 1) RUC primero: con él buscamos el nombre automáticamente. */}
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
            autoFocus
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
            Buscando el nombre…
          </p>
        )}
        {consultaSet.estado === 'ok' && consultaSet.razon && (
          <p className="mt-1 text-xs font-medium text-emerald-700">✓ {consultaSet.razon}</p>
        )}

        {/* Buscar por nombre si no sabe el RUC. */}
        {!buscarPorNombre ? (
          <button
            type="button"
            onClick={() => setBuscarPorNombre(true)}
            className="mt-2 text-xs font-semibold text-celeste-dark underline"
          >
            ¿No sabe su RUC? Buscar por nombre
          </button>
        ) : (
          <div className="mt-2">
            <BuscadorNombre
              titulo="Buscar su RUC por nombre"
              onCerrar={() => setBuscarPorNombre(false)}
              onElegir={(o) => {
                setRucBase(o.ruc) // dispara la verificación por RUC (fija y bloquea el nombre)
                setCliente((c) => ({ ...c, nombre: o.razonSocial })) // ya sabemos el nombre
                setBuscarPorNombre(false)
              }}
            />
          </div>
        )}
      </div>

      {/* 2) Nombre: si el RUC se encontró, se fija el nombre OFICIAL y se bloquea. */}
      <div>
        <label htmlFor="nombre" className="field-label">
          Nombre o razón social <span className="text-celeste-dark">*</span>
          {nombreBloqueado && (
            <span className="font-normal text-emerald-600"> · 🔒 oficial (no editable)</span>
          )}
        </label>
        <input
          id="nombre"
          className={[
            'field-input',
            nombreBloqueado ? 'cursor-not-allowed bg-mist text-anthracite/70' : '',
          ].join(' ')}
          autoComplete="organization"
          placeholder="Se completa con el RUC…"
          value={cliente.nombre}
          readOnly={nombreBloqueado}
          onChange={(e) => set('nombre', e.target.value)}
        />
        {nombreBloqueado ? (
          <p className="mt-1 text-xs text-anthracite/50">
            Nombre tomado del RUC para evitar carpetas duplicadas.
          </p>
        ) : (
          tocado && errores.nombre && <p className="mt-1 text-sm text-red-600">{errores.nombre}</p>
        )}
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

      <button type="submit" className="btn-primary w-full">
        Continuar
      </button>
    </form>
  )
}
