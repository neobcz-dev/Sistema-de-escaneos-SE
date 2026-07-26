import { useEffect, useRef, useState } from 'react'
import { cargarOpenCV, detectarEsquinas } from '../lib/scanner'

interface Props {
  onCapturar: (blob: Blob) => void
  onCerrar: () => void
}

/**
 * Cámara a pantalla completa con captura continua y detección del documento en
 * vivo (borde resaltado, estilo escáner de Google Drive). El enderezado/recorte
 * final lo hace el procesamiento al capturar.
 */
export function CameraCapture({ onCapturar, onCerrar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analisisRef = useRef<HTMLCanvasElement | null>(null)
  const corriendoRef = useRef(false)
  const [error, setError] = useState('')
  const [conteo, setConteo] = useState(0)
  const [flash, setFlash] = useState(false)
  const [listo, setListo] = useState(false)
  const [escanerListo, setEscanerListo] = useState(false)
  const [documentoDetectado, setDocumentoDetectado] = useState(false)

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

  // Carga OpenCV y arranca la detección del borde en vivo.
  useEffect(() => {
    if (!listo) return
    let cancelado = false
    let iv: ReturnType<typeof setInterval> | null = null

    cargarOpenCV()
      .then(() => {
        if (cancelado) return
        setEscanerListo(true)
        iv = setInterval(() => detectarBorde(), 220)
      })
      .catch(() => {
        /* sin escáner en vivo: igual se puede capturar */
      })

    return () => {
      cancelado = true
      if (iv) clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo])

  async function detectarBorde() {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay || !video.videoWidth || corriendoRef.current) return
    corriendoRef.current = true
    try {
      const vw = video.videoWidth
      const vh = video.videoHeight
      // Canvas de análisis en baja resolución (rápido).
      if (!analisisRef.current) analisisRef.current = document.createElement('canvas')
      const aw = 480
      const ah = Math.round((vh / vw) * aw)
      const an = analisisRef.current
      an.width = aw
      an.height = ah
      an.getContext('2d')!.drawImage(video, 0, 0, aw, ah)

      const esquinas = await detectarEsquinas(an)

      // El overlay comparte dimensiones y object-cover con el video → alinea.
      if (overlay.width !== vw || overlay.height !== vh) {
        overlay.width = vw
        overlay.height = vh
      }
      const ctx = overlay.getContext('2d')!
      ctx.clearRect(0, 0, vw, vh)
      if (esquinas) {
        const s = vw / aw
        ctx.beginPath()
        ctx.moveTo(esquinas[0].x * s, esquinas[0].y * s)
        for (let i = 1; i < esquinas.length; i++) ctx.lineTo(esquinas[i].x * s, esquinas[i].y * s)
        ctx.closePath()
        ctx.fillStyle = 'rgba(62,166,221,0.22)'
        ctx.fill()
        ctx.lineWidth = Math.max(3, vw / 180)
        ctx.strokeStyle = '#3EA6DD'
        ctx.stroke()
        setDocumentoDetectado(true)
      } else {
        setDocumentoDetectado(false)
      }
    } catch {
      /* ignorar */
    } finally {
      corriendoRef.current = false
    }
  }

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
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            {flash && <div className="absolute inset-0 bg-white/70" />}
            {!documentoDetectado && (
              <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/40" />
            )}
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4">
              <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">
                {conteo} {conteo === 1 ? 'foto' : 'fotos'}
              </span>
              <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
                {!escanerListo
                  ? 'Preparando escáner…'
                  : documentoDetectado
                    ? '✓ Documento detectado'
                    : 'Encuadre el comprobante'}
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
