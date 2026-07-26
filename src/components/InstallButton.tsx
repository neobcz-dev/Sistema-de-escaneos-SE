import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function estaInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Banner/botón para instalar la app (PWA). En iPhone muestra instrucciones. */
export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [instalada, setInstalada] = useState(estaInstalada())
  const [mostrarIOS, setMostrarIOS] = useState(false)
  const [oculto, setOculto] = useState(false)

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    function onInstalada() {
      setInstalada(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalada)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalada)
    }
  }, [])

  const ios = esIOS()
  // No mostrar si ya está instalada, si el usuario lo cerró, o si no hay forma
  // de instalar (navegador sin soporte y no es iOS).
  if (instalada || oculto || (!prompt && !ios)) return null

  async function instalar() {
    if (prompt) {
      await prompt.prompt()
      const res = await prompt.userChoice
      if (res.outcome === 'accepted') setInstalada(true)
      setPrompt(null)
    } else if (ios) {
      setMostrarIOS(true)
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-navy px-4 py-3 text-white shadow-card">
        <IconDescargar />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Instale la app en su celular</p>
          <p className="text-xs text-white/70">Acceso directo, se abre como una app.</p>
        </div>
        <button
          onClick={instalar}
          className="shrink-0 rounded-xl bg-celeste px-4 py-2 text-sm font-bold text-navy-dark hover:bg-celeste-light"
        >
          Instalar
        </button>
        <button
          onClick={() => setOculto(true)}
          aria-label="Cerrar"
          className="shrink-0 text-white/60 hover:text-white"
        >
          ✕
        </button>
      </div>

      {mostrarIOS && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
          onClick={() => setMostrarIOS(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-navy">Instalar en iPhone / iPad</h3>
            <p className="mt-1 text-sm text-anthracite/70">
              En Safari, siga estos pasos:
            </p>
            <ol className="mt-3 space-y-3 text-sm text-anthracite">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-celeste text-xs font-bold text-navy-dark">1</span>
                <span>
                  Toque el botón <strong>Compartir</strong>{' '}
                  <IconCompartir /> (abajo en la barra de Safari).
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-celeste text-xs font-bold text-navy-dark">2</span>
                <span>
                  Deslice y elija <strong>«Agregar a inicio»</strong> (Add to Home Screen).
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-celeste text-xs font-bold text-navy-dark">3</span>
                <span>Confirme con <strong>«Agregar»</strong>. ¡Listo!</span>
              </li>
            </ol>
            <button onClick={() => setMostrarIOS(false)} className="btn-primary mt-5 w-full">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function IconDescargar() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

function IconCompartir() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3EA6DD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline align-text-bottom">
      <path d="M12 16V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}
