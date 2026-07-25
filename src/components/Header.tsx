import { EMPRESA } from '../config'
import { Mark } from './Mark'

export function Header() {
  return (
    <header className="bg-white shadow-sm ring-1 ring-navy/5">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
        <Mark size={46} className="shrink-0" />
        <div className="leading-tight">
          <p className="text-lg font-extrabold tracking-tight text-navy sm:text-xl">
            SERVICIO EMPRESARIAL
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-celeste-dark sm:text-xs">
            {EMPRESA.tagline}
          </p>
        </div>
      </div>
    </header>
  )
}
