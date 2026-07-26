import { useRef, useState } from 'react'
import { useAtrasCierra } from '../lib/useAtras'

interface Props {
  src: string
  onCerrar: () => void
}

/**
 * Visor a pantalla completa con zoom (pellizco de 2 dedos o botones) y
 * desplazamiento (arrastre). Sirve para leer bien el comprobante al llenar
 * el RUC y el número a mano.
 */
export function ZoomViewer({ src, onCerrar }: Props) {
  useAtrasCierra(onCerrar)
  const [escala, setEscala] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const punteros = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ dist: number; escala: number } | null>(null)
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  function fijar(e: number, p: { x: number; y: number }) {
    const lim = 260 * (e - 1)
    setEscala(e)
    setPos({ x: clamp(p.x, -lim, lim), y: clamp(p.y, -lim, lim) })
  }

  function onDown(e: React.PointerEvent) {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), escala }
      arrastre.current = null
    } else {
      arrastre.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    }
  }

  function onMove(e: React.PointerEvent) {
    if (!punteros.current.has(e.pointerId)) return
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (punteros.current.size === 2 && pinch.current) {
      const [a, b] = [...punteros.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const nueva = clamp((dist / pinch.current.dist) * pinch.current.escala, 1, 6)
      fijar(nueva, pos)
    } else if (arrastre.current && escala > 1) {
      const lim = 260 * (escala - 1)
      setPos({
        x: clamp(arrastre.current.px + (e.clientX - arrastre.current.x), -lim, lim),
        y: clamp(arrastre.current.py + (e.clientY - arrastre.current.y), -lim, lim),
      })
    }
  }

  function onUp(e: React.PointerEvent) {
    punteros.current.delete(e.pointerId)
    if (punteros.current.size < 2) pinch.current = null
    if (punteros.current.size === 0) arrastre.current = null
  }

  function alternarZoom() {
    if (escala > 1) fijar(1, { x: 0, y: 0 })
    else fijar(2.5, { x: 0, y: 0 })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white/70">
          Pellizque o use + / − para acercar
        </span>
        <button onClick={onCerrar} className="text-sm font-semibold text-white">
          Cerrar
        </button>
      </div>

      <div
        className="relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={alternarZoom}
      >
        <img
          src={src}
          alt="Comprobante"
          draggable={false}
          className="max-h-full max-w-full"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
            transition: arrastre.current || pinch.current ? 'none' : 'transform 0.15s',
          }}
        />
      </div>

      <div className="safe-bottom flex items-center justify-center gap-4 bg-black/80 p-4">
        <button
          onClick={() => fijar(clamp(escala - 0.5, 1, 6), pos)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white"
          aria-label="Alejar"
        >
          −
        </button>
        <span className="w-16 text-center text-sm font-semibold text-white">
          {Math.round(escala * 100)}%
        </span>
        <button
          onClick={() => fijar(clamp(escala + 0.5, 1, 6), pos)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white"
          aria-label="Acercar"
        >
          +
        </button>
      </div>
    </div>
  )
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
