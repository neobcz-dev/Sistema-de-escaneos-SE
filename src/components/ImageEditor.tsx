import { useEffect, useRef, useState } from 'react'
import { editarImagen, type ImagenProcesada } from '../lib/image'

interface Props {
  src: string
  onAplicar: (img: ImagenProcesada) => void
  onCancelar: () => void
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const RECT_INICIAL: Rect = { x: 0.03, y: 0.03, w: 0.94, h: 0.94 }
const MIN = 0.12

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move' | null

/** Editor de una imagen: recortar, rotar y aplicar filtro "escaneo". */
export function ImageEditor({ src, onAplicar, onCancelar }: Props) {
  const [preview, setPreview] = useState(src)
  const [crop, setCrop] = useState<Rect>(RECT_INICIAL)
  const [escaneo, setEscaneo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; startRect: Rect }>({
    handle: null,
    startX: 0,
    startY: 0,
    startRect: RECT_INICIAL,
  })

  async function rotar() {
    setOcupado(true)
    try {
      const r = await editarImagen(preview, { rotacion: 90, maxDim: 2000, quality: 0.9 })
      setPreview(r.dataUrl)
      setCrop(RECT_INICIAL)
    } finally {
      setOcupado(false)
    }
  }

  async function aplicar() {
    setOcupado(true)
    try {
      const usarCrop = !(crop.x < 0.01 && crop.y < 0.01 && crop.w > 0.98 && crop.h > 0.98)
      const r = await editarImagen(preview, {
        crop: usarCrop ? crop : undefined,
        escaneo,
      })
      onAplicar(r)
    } finally {
      setOcupado(false)
    }
  }

  function iniciarArrastre(handle: Handle, e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...crop },
    }
  }

  useEffect(() => {
    function mover(e: PointerEvent) {
      const d = dragRef.current
      if (!d.handle) return
      const el = imgRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = (e.clientX - d.startX) / r.width
      const dy = (e.clientY - d.startY) / r.height
      const s = d.startRect
      let nx = s.x
      let ny = s.y
      let nw = s.w
      let nh = s.h

      if (d.handle === 'move') {
        nx = clamp(s.x + dx, 0, 1 - s.w)
        ny = clamp(s.y + dy, 0, 1 - s.h)
      } else {
        let x0 = s.x
        let y0 = s.y
        let x1 = s.x + s.w
        let y1 = s.y + s.h
        if (d.handle === 'nw') {
          x0 = clamp(s.x + dx, 0, x1 - MIN)
          y0 = clamp(s.y + dy, 0, y1 - MIN)
        } else if (d.handle === 'ne') {
          x1 = clamp(s.x + s.w + dx, x0 + MIN, 1)
          y0 = clamp(s.y + dy, 0, y1 - MIN)
        } else if (d.handle === 'sw') {
          x0 = clamp(s.x + dx, 0, x1 - MIN)
          y1 = clamp(s.y + s.h + dy, y0 + MIN, 1)
        } else if (d.handle === 'se') {
          x1 = clamp(s.x + s.w + dx, x0 + MIN, 1)
          y1 = clamp(s.y + s.h + dy, y0 + MIN, 1)
        }
        nx = x0
        ny = y0
        nw = x1 - x0
        nh = y1 - y0
      }
      setCrop({ x: nx, y: ny, w: nw, h: nh })
    }
    function soltar() {
      dragRef.current.handle = null
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [])

  const pct = (n: number) => `${n * 100}%`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between p-4">
        <button onClick={onCancelar} className="text-sm font-semibold text-white/80">
          Cancelar
        </button>
        <span className="text-sm font-semibold text-white">Ajustar comprobante</span>
        <span className="w-16" />
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        <div className="relative inline-block max-h-full max-w-full">
          <img
            ref={imgRef}
            src={preview}
            alt="Editar"
            draggable={false}
            className="max-h-[60vh] max-w-full select-none touch-none"
            style={escaneo ? { filter: 'grayscale(1) contrast(1.35) brightness(1.03)' } : undefined}
          />
          {/* Overlay de recorte */}
          <div
            className="absolute cursor-move border-2 border-celeste"
            style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
            onPointerDown={(e) => iniciarArrastre('move', e)}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
              <span
                key={h}
                onPointerDown={(e) => iniciarArrastre(h, e)}
                className="absolute h-6 w-6 rounded-full border-2 border-navy bg-celeste"
                style={esquinaEstilo(h)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="safe-bottom space-y-3 bg-black/80 p-4">
        <div className="flex items-center justify-center gap-3">
          <button onClick={rotar} disabled={ocupado} className="btn-ghost">
            ↻ Rotar
          </button>
          <button
            onClick={() => setEscaneo((v) => !v)}
            className={escaneo ? 'btn-accent' : 'btn-ghost'}
          >
            {escaneo ? '📄 Escaneo' : '🎨 Color'}
          </button>
        </div>
        <button onClick={aplicar} disabled={ocupado} className="btn-primary w-full">
          {ocupado ? 'Procesando…' : 'Aplicar'}
        </button>
      </div>
    </div>
  )
}

function esquinaEstilo(h: 'nw' | 'ne' | 'sw' | 'se'): React.CSSProperties {
  const off = -12
  switch (h) {
    case 'nw':
      return { left: off, top: off }
    case 'ne':
      return { right: off, top: off }
    case 'sw':
      return { left: off, bottom: off }
    case 'se':
      return { right: off, bottom: off }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
