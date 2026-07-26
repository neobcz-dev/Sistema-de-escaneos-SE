import { useState } from 'react'
import type { Cliente, TipoComprobante } from '../types'
import { emailValido, rucValido, TIPOS_COMPROBANTE } from '../lib/util'

const TIPOS = TIPOS_COMPROBANTE

interface Props {
  valor: Cliente
  fotosCompartidas?: number
  onContinuar: (cliente: Cliente) => void
}

export function ClientForm({ valor, fotosCompartidas = 0, onContinuar }: Props) {
  const [cliente, setCliente] = useState<Cliente>(valor)
  const [tocado, setTocado] = useState(false)

  const errores = {
    nombre: cliente.nombre.trim().length < 2 ? 'Ingrese su nombre o razón social.' : '',
    ruc: !rucValido(cliente.ruc) ? 'Ingrese un RUC o C.I. válido.' : '',
    email: !emailValido(cliente.email) ? 'El correo no es válido.' : '',
  }
  const valido = !errores.nombre && !errores.ruc && !errores.email

  function set<K extends keyof Cliente>(campo: K, v: Cliente[K]) {
    setCliente((c) => ({ ...c, [campo]: v }))
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (valido) onContinuar({ ...cliente, nombre: cliente.nombre.trim(), ruc: cliente.ruc.trim() })
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
          </label>
          <input
            id="ruc"
            className="field-input"
            inputMode="numeric"
            placeholder="Ej.: 80012345-6"
            value={cliente.ruc}
            onChange={(e) => set('ruc', e.target.value)}
          />
          {tocado && errores.ruc && <p className="mt-1 text-sm text-red-600">{errores.ruc}</p>}
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
