import { useEffect, useRef } from 'react'

/**
 * Hace que el botón "Atrás" del teléfono CIERRE la pantalla superpuesta (visor,
 * editor, cámara) en vez de salir de la app. Al montar empuja un estado en el
 * historial; cuando el usuario va "atrás", el navegador lo saca y llamamos a
 * onCerrar. Si se cierra por un botón de la interfaz, consumimos ese estado
 * para no dejar entradas de historial colgadas.
 */
export function useAtrasCierra(onCerrar: () => void): void {
  const ref = useRef(onCerrar)
  ref.current = onCerrar
  useEffect(() => {
    window.history.pushState({ seOverlay: true }, '')
    const alVolver = () => ref.current()
    window.addEventListener('popstate', alVolver)
    return () => {
      window.removeEventListener('popstate', alVolver)
      // Si seguimos sobre el estado que empujamos (cierre por botón), lo sacamos.
      if (window.history.state && window.history.state.seOverlay) {
        window.history.back()
      }
    }
  }, [])
}
