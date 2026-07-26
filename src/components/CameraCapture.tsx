import { useEffect, useRef, useState } from 'react'
import { useAtrasCierra } from '../lib/useAtras'

interface Props {
  onCapturar: (blob: Blob) => void
  onCerrar: () => void
}

/**
 * Cámara a pantalla completa con captura continua. El recorte y enderezado del
 * comprobante se hacen al procesar cada foto (liviano, sin librerías pesadas).
 */
export function CameraCapture({ onCapturar, onCerrar }: Props) {
  useAtrasCierra(onCerrar)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [conteo, setConteo] = useState(0)
  const [flash, setFlash] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
          setListo(true)
        }
      } catch (e) {
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'No se pudo acceder a la cámara. Revise los permisos del navegador.'
            : 'No se pudo abrir la cámara en este dispositivo.',
        )
      }
    }
    iniciar()
    return () => {
      cancelado = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function disparar() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (blob) {
      onCapturar(blob)
      setConteo((c) => c + 1)
      setFlash(true)
      setTimeout(() => setFlash(false), 120)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-white">{error}</p>
          <button className="btn-accent" onClick={onCerrar}>
            Volver
          </button>
        </div>
      ) : (
        <>
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            {flash && <div className="absolute inset-0 bg-white/70" />}
            <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/40" />
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4">
              <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">
                {conteo} {conteo === 1 ? 'foto' : 'fotos'}
              </span>
              <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
                Encuadre el comprobante
              </span>
              <button
                onClick={onCerrar}
                className="rounded-full bg-black/50 px-4 py-1 text-sm font-semibold text-white"
              >
                Cancelar
              </button>
            </div>
          </div>

          <div className="safe-bottom flex items-center justify-between gap-4 bg-black px-8 py-5">
            <div className="w-24 text-sm text-white/70">
              {conteo > 0 ? 'Toque ✓ al terminar' : 'Dispare cada foto'}
            </div>
            <button
              onClick={disparar}
              disabled={!listo}
              aria-label="Tomar foto"
              className="rounded-full border-4 border-white bg-white/20 p-1 disabled:opacity-40"
              style={{ height: 72, width: 72 }}
            >
              <span className="block h-full w-full rounded-full bg-white" />
            </button>
            <div className="flex w-24 justify-end">
              <button
                onClick={onCerrar}
                disabled={conteo === 0}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-celeste text-2xl font-bold text-navy-dark disabled:opacity-40"
                aria-label="Terminar"
              >
                ✓
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
