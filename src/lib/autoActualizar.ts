/**
 * Actualización automática de la PWA: sin tener que refrescar a mano.
 *
 * El service worker (sw.ts) ya hace skipWaiting() + clients.claim(), así que
 * una versión nueva toma el control apenas se instala. Acá:
 *  1) Buscamos versiones nuevas al abrir la app, al volver a enfocarla y cada
 *     minuto (para sesiones que quedan abiertas).
 *  2) Cuando el nuevo service worker toma el control, recargamos la página sola
 *     para mostrar la versión nueva… PERO NO si hay un envío en curso o
 *     comprobantes sin terminar (para no perder el trabajo). En ese caso la
 *     recarga queda PENDIENTE y se aplica recién cuando todo está resuelto.
 */

let bloquear = false
let recargaPendiente = false
let recargando = false

function recargar(): void {
  if (recargando) return
  recargando = true
  window.location.reload()
}

/**
 * Bloquea (o desbloquea) la recarga automática. La app llama a esto con `true`
 * mientras haya comprobantes sin enviar / enviándose / con error, y con `false`
 * cuando todo está resuelto. Al desbloquear, si había una recarga pendiente, se
 * aplica.
 */
export function bloquearAutoActualizacion(v: boolean): void {
  bloquear = v
  if (!v && recargaPendiente) recargar()
}

export function activarAutoActualizacion(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker

  // Un cambio de controlador significa que un service worker nuevo tomó el
  // control. La "toma inicial" de la primera visita no recarga (para no
  // parpadear). Si hay trabajo en curso, la recarga queda pendiente.
  let esTomaInicial = !sw.controller
  sw.addEventListener('controllerchange', () => {
    if (esTomaInicial) {
      esTomaInicial = false
      return
    }
    if (bloquear) {
      recargaPendiente = true
      return
    }
    recargar()
  })

  sw.ready
    .then((registro) => {
      const buscar = () => {
        registro.update().catch(() => {
          // sin conexión o sin cambios: se reintenta luego
        })
      }
      buscar() // al abrir
      window.setInterval(buscar, 60_000) // sesiones largas abiertas
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') buscar() // al volver a la app
      })
    })
    .catch(() => {
      // el service worker aún no está listo; se intentará en la próxima carga
    })
}
