import { useEffect, useRef, useState } from 'react'
import {
  detectarEsquinas,
  editarImagen,
  recortarPerspectiva,
  type Filtro,
  type ImagenProcesada,
} from '../lib/image'
import type { Punto } from '../types'
import { useAtrasCierra } from '../lib/useAtras'

const FILTROS: { id: Filtro; nombre: string; css?: string }[] = [
  { id: 'color', nombre: 'Color' },
  { id: 'gris', nombre: 'Gris', css: 'grayscale(1)' },
  { id: 'realce', nombre: 'Realce', css: 'grayscale(1) contrast(1.5) brightness(1.12)' },
  { id: 'bn', nombre: 'B/N', css: 'grayscale(1) contrast(2.4) brightness(1.15)' },
]

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
  const [filtro, setFiltro] = useState<Filtro>('color')
  const [ocupado, setOcupado] = useState(false)
  const [detectando, setDetectando] = useState(!esquinasIniciales)
  const imgRef = useRef<HTMLImageElement>(null)
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
      const img = await recortarPerspectiva(preview, esquinas, filtro)
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
    }
    function soltar() {
      arrastreRef.current = null
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [])

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

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        <div className="relative inline-block max-h-full max-w-full">
          <img
            ref={imgRef}
            src={preview}
            alt="Editar"
            draggable={false}
            className="max-h-[58vh] max-w-full select-none touch-none"
            style={{ filter: FILTROS.find((f) => f.id === filtro)?.css }}
          />
          {/* Cuadrilátero (SVG superpuesto exactamente sobre la imagen). */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
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
              }}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              <span className="h-6 w-6 rounded-full border-2 border-navy bg-celeste shadow-lg" />
            </span>
          ))}
        </div>
      </div>

      <div className="safe-bottom space-y-3 bg-black/80 p-4">
        <div className="flex items-center justify-center gap-2">
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
