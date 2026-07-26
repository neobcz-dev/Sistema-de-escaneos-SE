import { useEffect, useRef, useState } from 'react'
import {
  AJUSTES_MAGICO,
  detectarEsquinas,
  editarImagen,
  recortarPerspectiva,
  type AjustesFiltro,
  type Filtro,
  type ImagenProcesada,
} from '../lib/image'
import type { Punto } from '../types'
import { useAtrasCierra } from '../lib/useAtras'

const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: 'color', nombre: 'Color' },
  { id: 'magico', nombre: '✨ Mágico' },
  { id: 'gris', nombre: 'Gris' },
  { id: 'realce', nombre: 'Realce' },
  { id: 'bn', nombre: 'B/N' },
]

/** CSS de vista previa por filtro (aproxima el resultado real del canvas). */
function cssFiltro(filtro: Filtro, ajustes: AjustesFiltro): string | undefined {
  switch (filtro) {
    case 'magico':
      return `brightness(${1.16 + ajustes.brillo / 200}) contrast(${1.38 + ajustes.contraste / 140}) saturate(0.82)`
    case 'gris':
      return 'grayscale(1)'
    case 'realce':
      return 'grayscale(1) contrast(1.5) brightness(1.12)'
    case 'bn':
      return 'grayscale(1) contrast(2.4) brightness(1.15)'
    default:
      return undefined
  }
}

export interface ResultadoEdicion {
  img: ImagenProcesada
  esquinas: Punto[]
  base: string
}

interface Props {
  src: string
  esquinasIniciales?: Punto[]
  baseInicial?: string
  onAplicar: (r: ResultadoEdicion) => void
  onCancelar: () => void
}

// Esquinas normalizadas (0–1) en orden: sup-izq, sup-der, inf-der, inf-izq.
const ESQUINAS_INICIAL: Punto[] = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
]

/**
 * Editor de imagen: detecta las 4 esquinas del comprobante automáticamente
 * (ajustables a mano), lo endereza por perspectiva, rota y aplica filtro.
 */
export function ImageEditor({
  src,
  esquinasIniciales,
  baseInicial,
  onAplicar,
  onCancelar,
}: Props) {
  useAtrasCierra(onCancelar)
  const [preview, setPreview] = useState(baseInicial ?? src)
  const [esquinas, setEsquinas] = useState<Punto[]>(esquinasIniciales ?? ESQUINAS_INICIAL)
  const [filtro, setFiltro] = useState<Filtro>('magico')
  const [ajustes, setAjustes] = useState<AjustesFiltro>(AJUSTES_MAGICO)
  const [ocupado, setOcupado] = useState(false)
  const [detectando, setDetectando] = useState(!esquinasIniciales)
  // Lupa: posición del toque (cx,cy) y de la esquina en la imagen (nx,ny).
  const [lupa, setLupa] = useState<{ cx: number; cy: number; nx: number; ny: number } | null>(null)
  // Rectángulo real donde se dibuja la imagen (medido), para alinear el overlay.
  const [caja, setCaja] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const contRef = useRef<HTMLDivElement>(null)
  const arrastreRef = useRef<number | null>(null)

  // Detección automática de esquinas al abrir (si no venían guardadas).
  useEffect(() => {
    if (esquinasIniciales) return
    let vivo = true
    ;(async () => {
      const e = await detectarEsquinas(src)
      if (vivo && e) setEsquinas(e)
      if (vivo) setDetectando(false)
    })()
    return () => {
      vivo = false
    }
  }, [src, esquinasIniciales])

  async function autoDetectar() {
    setDetectando(true)
    const e = await detectarEsquinas(preview)
    setEsquinas(e ?? ESQUINAS_INICIAL)
    setDetectando(false)
  }

  async function rotar() {
    setOcupado(true)
    try {
      const r = await editarImagen(preview, { rotacion: 90, maxDim: 2200, quality: 0.92 })
      setPreview(r.dataUrl)
      const e = await detectarEsquinas(r.dataUrl)
      setEsquinas(e ?? ESQUINAS_INICIAL)
    } finally {
      setOcupado(false)
    }
  }

  async function aplicar() {
    setOcupado(true)
    try {
      const img = await recortarPerspectiva(preview, esquinas, filtro, 2200, 0.85, ajustes)
      onAplicar({ img, esquinas, base: preview })
    } finally {
      setOcupado(false)
    }
  }

  useEffect(() => {
    function mover(e: PointerEvent) {
      const i = arrastreRef.current
      if (i === null) return
      const el = imgRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const x = clamp((e.clientX - r.left) / r.width, 0, 1)
      const y = clamp((e.clientY - r.top) / r.height, 0, 1)
      setEsquinas((prev) => prev.map((p, idx) => (idx === i ? { x, y } : p)))
      setLupa({ cx: e.clientX, cy: e.clientY, nx: x, ny: y })
    }
    function soltar() {
      arrastreRef.current = null
      setLupa(null)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [])

  // Mide el rectángulo REAL de la imagen (dentro del contenedor) para que el
  // overlay de esquinas quede exactamente encima, sin desplazarse.
  useEffect(() => {
    const medir = () => {
      const img = imgRef.current
      const cont = contRef.current
      if (!img || !cont) return
      const ir = img.getBoundingClientRect()
      const cr = cont.getBoundingClientRect()
      setCaja({ left: ir.left - cr.left, top: ir.top - cr.top, width: ir.width, height: ir.height })
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (imgRef.current) ro.observe(imgRef.current)
    if (contRef.current) ro.observe(contRef.current)
    window.addEventListener('resize', medir)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [preview])

  const puntosSvg = esquinas.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between p-4">
        <button onClick={onCancelar} className="text-sm font-semibold text-white/80">
          Cancelar
        </button>
        <span className="text-sm font-semibold text-white">Ajustar esquinas</span>
        <button
          onClick={autoDetectar}
          disabled={detectando}
          className="text-sm font-semibold text-celeste disabled:opacity-50"
        >
          {detectando ? 'Detectando…' : 'Auto'}
        </button>
      </div>

      <p className="px-4 pb-2 text-center text-xs text-white/60">
        Detectamos las esquinas solas; arrastre los puntos si hace falta. Lo enderezamos al aplicar.
      </p>

      <div
        ref={contRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4"
      >
        <img
          ref={imgRef}
          src={preview}
          alt="Editar"
          draggable={false}
          onLoad={() => {
            const img = imgRef.current
            const cont = contRef.current
            if (!img || !cont) return
            const ir = img.getBoundingClientRect()
            const cr = cont.getBoundingClientRect()
            setCaja({ left: ir.left - cr.left, top: ir.top - cr.top, width: ir.width, height: ir.height })
          }}
          className="block max-h-full max-w-full select-none touch-none"
          style={{ filter: cssFiltro(filtro, ajustes) }}
        />
        {/* Overlay alineado al rectángulo REAL de la imagen (medido). */}
        {caja && (
          <div className="pointer-events-none absolute" style={caja}>
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={puntosSvg}
                fill="rgba(62,166,221,0.12)"
                stroke="#3EA6DD"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Manijas de esquina (área táctil grande). */}
            {esquinas.map((p, idx) => (
              <span
                key={idx}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  arrastreRef.current = idx
                  setLupa({ cx: e.clientX, cy: e.clientY, nx: p.x, ny: p.y })
                }}
                className="pointer-events-auto absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span className="h-6 w-6 rounded-full border-2 border-navy bg-celeste shadow-lg" />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Lupa: muestra la zona ampliada de la esquina que se arrastra, ubicada
          arriba del dedo (o debajo si está muy arriba) y siempre dentro de vista. */}
      {lupa && imgRef.current && (() => {
        const rect = imgRef.current.getBoundingClientRect()
        const L = 132
        const Z = 2.6
        const bgW = rect.width * Z
        const bgH = rect.height * Z
        const px = lupa.nx * bgW
        const py = lupa.ny * bgH
        let top = lupa.cy - L - 34
        if (top < 8) top = lupa.cy + 34
        let left = lupa.cx - L / 2
        left = Math.max(8, Math.min(window.innerWidth - L - 8, left))
        return (
          <div
            className="pointer-events-none fixed z-[60] overflow-hidden rounded-full border-4 border-celeste bg-white shadow-2xl"
            style={{ top, left, width: L, height: L }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${preview})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: `${bgW}px ${bgH}px`,
                backgroundPosition: `${-(px - L / 2)}px ${-(py - L / 2)}px`,
                filter: cssFiltro(filtro, ajustes),
              }}
            />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-celeste/70" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-celeste/70" />
          </div>
        )
      })()}

      <div className="safe-bottom space-y-3 bg-black/80 p-4">
        {/* Se acomodan en varias líneas (wrap) para que se vean y se puedan
            tocar TODOS, sin depender del deslizamiento horizontal. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={[
                'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                filtro === f.id ? 'bg-celeste text-navy-dark' : 'bg-white/10 text-white',
              ].join(' ')}
            >
              {f.nombre}
            </button>
          ))}
          <button
            onClick={rotar}
            disabled={ocupado}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            title="Rotar 90°"
          >
            ↻
          </button>
        </div>

        {/* Ajustes del filtro mágico (brillo y contraste). SIEMPRE en el layout
            (solo ocultos cuando no es mágico) para que el cuadro de recorte NO
            se mueva al cambiar de filtro. */}
        <div
          className={[
            'space-y-2 rounded-xl bg-white/5 p-3',
            filtro === 'magico' ? '' : 'invisible',
          ].join(' ')}
        >
          <Deslizador
            etiqueta="Brillo"
            valor={ajustes.brillo}
            onChange={(brillo) => setAjustes((a) => ({ ...a, brillo }))}
          />
          <Deslizador
            etiqueta="Contraste"
            valor={ajustes.contraste}
            onChange={(contraste) => setAjustes((a) => ({ ...a, contraste }))}
          />
          <button
            onClick={() => setAjustes(AJUSTES_MAGICO)}
            className="text-xs font-semibold text-celeste"
          >
            Restablecer
          </button>
        </div>

        <button onClick={aplicar} disabled={ocupado} className="btn-primary w-full">
          {ocupado ? 'Procesando…' : 'Aplicar'}
        </button>
      </div>
    </div>
  )
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Deslizador -80..80 para brillo/contraste del filtro mágico. */
function Deslizador({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string
  valor: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs font-semibold text-white/80">
        <span>{etiqueta}</span>
        <span>{valor > 0 ? `+${valor}` : valor}</span>
      </div>
      <input
        type="range"
        min={-80}
        max={80}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-celeste"
      />
    </label>
  )
}
