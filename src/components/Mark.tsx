/** Marca SE (monograma) en SVG, reutilizable en la interfaz. */
export function Mark({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Servicio Empresarial"
    >
      <rect width="100" height="100" rx="22" fill="#0B2C4D" />
      <path
        d="M44 40 C44 33 38 30 32 30 C24 30 20 34 20 40 C20 46 26 49 33 51 C40 53 46 55 46 61 C46 68 40 72 32 72 C25 72 20 69 19 63"
        fill="none"
        stroke="#3EA6DD"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="#FFFFFF">
        <rect x="54" y="30" width="9" height="44" rx="1.5" />
        <rect x="54" y="30" width="28" height="9" rx="1.5" />
        <rect x="54" y="47.5" width="22" height="9" rx="1.5" />
        <rect x="54" y="65" width="28" height="9" rx="1.5" />
      </g>
    </svg>
  )
}
