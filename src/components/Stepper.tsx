const PASOS = ['Identificación', 'Comprobantes', 'Enviar'] as const

export function Stepper({ paso }: { paso: number }) {
  return (
    <ol className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4 sm:px-6">
      {PASOS.map((nombre, i) => {
        const activo = i === paso
        const completado = i < paso
        return (
          <li key={nombre} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
                  completado
                    ? 'bg-celeste text-navy-dark'
                    : activo
                      ? 'bg-navy text-white'
                      : 'bg-navy/10 text-navy/50',
                ].join(' ')}
              >
                {completado ? '✓' : i + 1}
              </span>
              <span
                className={[
                  'hidden text-sm font-semibold sm:inline',
                  activo ? 'text-navy' : 'text-anthracite/50',
                ].join(' ')}
              >
                {nombre}
              </span>
            </div>
            {i < PASOS.length - 1 && (
              <span
                className={[
                  'h-0.5 flex-1 rounded-full',
                  completado ? 'bg-celeste' : 'bg-navy/10',
                ].join(' ')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
