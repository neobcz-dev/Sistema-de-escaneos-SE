import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { Stepper } from './components/Stepper'
import { ClientForm } from './components/ClientForm'
import { Scanner } from './components/Scanner'
import { ReviewSend } from './components/ReviewSend'
import { InstallButton } from './components/InstallButton'
import { Historial } from './components/Historial'
import { bloquearAutoActualizacion } from './lib/autoActualizar'
import { agregarAlHistorial } from './lib/historial'
import type { Cliente, Comprobante } from './types'
import { procesarImagen, detectarEsquinas, recortarPerspectiva, editarImagen } from './lib/image'
import type { ResultadoEdicion } from './components/ImageEditor'
import { reconocerTexto } from './lib/ocr'
import { ocrEnServidor } from './lib/ocrServidor'
import { crearPdfBuscable } from './lib/pdf'
import { detectarDatos, detectarTipo } from './lib/parse'
import { consultarRucSet } from './lib/set'
import { subirComprobante } from './lib/upload'
import { calcularDV, nuevoId, selloTiempo, slug } from './lib/util'
import type { TipoComprobante } from './types'
import { EMPRESA } from './config'

const CLIENTE_INICIAL: Cliente = {
  nombre: '',
  ruc: '',
  email: '',
  tipo: 'Factura',
  nota: '',
}

// Caché de nombres de proveedor por RUC (evita consultas repetidas en el lote).
const cacheProveedor = new Map<string, string>()

export default function App() {
  const [paso, setPaso] = useState(0)
  const [cliente, setCliente] = useState<Cliente>(CLIENTE_INICIAL)
  const [items, setItems] = useState<Comprobante[]>([])
  const [enviando, setEnviando] = useState(false)
  const [finalizado, setFinalizado] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  // Fotos recibidas desde WhatsApp/galería vía "Compartir con la app".
  const [compartidas, setCompartidas] = useState<File[]>([])

  // No dejar que la app se recargue sola (por una actualización) mientras haya
  // comprobantes en la lista o un envío en curso: se perdería el trabajo.
  useEffect(() => {
    bloquearAutoActualizacion(enviando || items.length > 0)
  }, [enviando, items.length])

  useEffect(() => {
    if (!window.location.search.includes('compartido')) return
    ;(async () => {
      try {
        const cache = await caches.open('se-compartidos')
        const countRes = await cache.match('shared-count')
        const count = countRes ? parseInt(await countRes.text(), 10) : 0
        const files: File[] = []
        for (let i = 0; i < count; i++) {
          const r = await cache.match(`shared-${i}`)
          if (r) {
            const b = await r.blob()
            files.push(new File([b], `whatsapp-${i}.jpg`, { type: b.type || 'image/jpeg' }))
          }
        }
        // NO limpiamos acá: dejamos que se acumulen mientras el cliente comparte
        // de a una. Se limpian recién cuando las importa (al Continuar).
        window.history.replaceState(null, '', window.location.pathname)
        if (files.length) setCompartidas(files)
      } catch {
        // sin fotos compartidas
      }
    })()
  }, [])

  /** Borra la caché de compartidos (tras importarlos a la lista). */
  async function limpiarCompartidos() {
    try {
      const cache = await caches.open('se-compartidos')
      for (const k of await cache.keys()) await cache.delete(k)
    } catch {
      // sin caché disponible
    }
  }

  function actualizarItem(id: string, cambios: Partial<Comprobante>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)))
  }

  /** Ejecuta OCR (Google Drive; respaldo Tesseract) y autocompleta los datos. */
  async function ejecutarOCR(id: string, dataUrl: string) {
    actualizarItem(id, { ocrEstado: 'procesando', ocrProgreso: 0 })
    let texto = ''
    let palabras: Comprobante['ocrPalabras'] = []

    // 1) OCR con el motor de Google (mejor calidad).
    const serv = await ocrEnServidor(dataUrl)
    if (serv.ok && typeof serv.texto === 'string') {
      texto = serv.texto
    } else {
      // 2) Respaldo: OCR en el navegador (Tesseract).
      try {
        const r = await reconocerTexto(dataUrl, (p) => actualizarItem(id, { ocrProgreso: p }))
        texto = r.texto
        palabras = r.palabras
      } catch {
        actualizarItem(id, { ocrEstado: 'error', ocrProgreso: 1 })
        return
      }
    }

    const d = detectarDatos(texto, cliente.ruc)
    const tipoDetectado = detectarTipo(texto)
    actualizarItem(id, {
      ocrTexto: texto,
      ocrPalabras: palabras,
      ocrEstado: 'listo',
      ocrProgreso: 1,
      rucProveedor: d.rucProveedor,
      nroFactura: d.nroFactura,
      timbrado: d.timbrado,
      ...(tipoDetectado ? { tipo: tipoDetectado } : {}),
    })
    if (d.rucProveedor) buscarNombreProveedor(id, d.rucProveedor)
  }

  /** Busca el nombre del proveedor en TuRUC a partir del RUC (con o sin DV). */
  async function buscarNombreProveedor(id: string, rucProveedor: string) {
    const limpio = (rucProveedor || '').trim()
    if (!/\d{4,}/.test(limpio)) {
      actualizarItem(id, { nombreProveedor: '' })
      return
    }
    const g = limpio.lastIndexOf('-')
    let base: string
    let dv: number
    if (g > 0) {
      base = limpio.slice(0, g)
      dv = Number(limpio.slice(g + 1))
    } else {
      base = limpio
      dv = calcularDV(limpio) // si falta el DV, lo calculamos
    }
    if (Number.isNaN(dv)) return

    const clave = `${base}-${dv}`
    const enCache = cacheProveedor.get(clave)
    if (enCache !== undefined) {
      actualizarItem(id, { nombreProveedor: enCache })
      return
    }
    const r = await consultarRucSet(base, dv)
    const nombre = r.ok && r.razonSocial ? r.razonSocial : ''
    cacheProveedor.set(clave, nombre)
    actualizarItem(id, { nombreProveedor: nombre })
  }

  async function agregarArchivos(files: FileList | File[], autoDetectar = true) {
    const lista = Array.from(files).filter((f) => f.type.startsWith('image/'))
    for (const file of lista) {
      const id = nuevoId()
      try {
        // Foto completa (base para reeditar) + detección de las 4 esquinas.
        const original = await procesarImagen(file, { autoRecorte: false })
        const esquinas = autoDetectar ? await detectarEsquinas(original.dataUrl) : null

        // Aplicamos el filtro "mágico" por defecto (blanquea y realza) y, si
        // detectamos el comprobante, lo RECORTAMOS y enderezamos solo. La
        // miniatura muestra ya el resultado; queda corregible en el editor.
        let vista = original
        let recortado = false
        try {
          if (esquinas) {
            vista = await recortarPerspectiva(original.dataUrl, esquinas, 'magico')
            recortado = true
          } else {
            vista = await editarImagen(original.dataUrl, { filtro: 'magico' })
          }
        } catch {
          vista = original // si algo falla, dejamos la foto original
        }

        const nuevo: Comprobante = {
          id,
          nombreArchivo: construirNombre(cliente, id),
          dataUrl: vista.dataUrl,
          originalDataUrl: original.dataUrl,
          baseEdicion: original.dataUrl,
          esquinas: esquinas ?? undefined,
          recortado,
          blob: vista.blob,
          width: vista.width,
          height: vista.height,
          ocrTexto: '',
          ocrPalabras: [],
          ocrEstado: 'procesando',
          ocrProgreso: 0,
          tipo: cliente.tipo, // valor por defecto hasta que el OCR detecte
          rucProveedor: '',
          nombreProveedor: '',
          nroFactura: '',
          timbrado: '',
          subida: 'pendiente',
        }
        setItems((prev) => [...prev, nuevo])
        ejecutarOCR(id, vista.dataUrl) // OCR sobre el recorte (menos fondo)
      } catch (e) {
        console.error('No se pudo procesar la imagen', e)
      }
    }
  }

  function reemplazarImagen(id: string, r: ResultadoEdicion) {
    actualizarItem(id, {
      dataUrl: r.img.dataUrl,
      blob: r.img.blob,
      width: r.img.width,
      height: r.img.height,
      esquinas: r.esquinas, // recordamos las esquinas para reeditar
      baseEdicion: r.base, // imagen (con rotación) sobre la que se marcaron
      recortado: true, // ya se enderezó: la miniatura muestra el resultado
    })
    ejecutarOCR(id, r.img.dataUrl) // el recorte cambia el contenido: re-leemos
  }

  function eliminarItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function editarOCR(id: string, texto: string) {
    actualizarItem(id, { ocrTexto: texto })
  }

  function editarCampo(
    id: string,
    campo: 'rucProveedor' | 'nombreProveedor' | 'nroFactura',
    valor: string,
  ) {
    actualizarItem(id, { [campo]: valor })
  }

  function editarTipo(id: string, tipo: TipoComprobante) {
    actualizarItem(id, { tipo })
  }

  async function enviar() {
    setEnviando(true)
    const total = items.length
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.subida === 'ok') continue
      actualizarItem(it.id, { subida: 'subiendo', errorSubida: undefined })
      try {
        // Texto extra buscable: datos clave + todo el texto OCR (para que el PDF
        // sea buscable en Drive por su contenido, ya sin posiciones por palabra).
        const extra = [
          it.nombreProveedor,
          it.rucProveedor && `RUC ${it.rucProveedor}`,
          it.tipo,
          it.nroFactura,
          it.ocrTexto,
        ]
          .filter(Boolean)
          .join(' · ')
        // PDF buscable: imagen + capa de texto invisible del OCR + texto extra.
        const pdf = await crearPdfBuscable(it.dataUrl, it.width, it.height, it.ocrPalabras, extra)
        const r = await subirComprobante(cliente, it, pdf, i + 1, total)
        if (r.ok) {
          actualizarItem(it.id, { subida: 'ok', urlDrive: r.url })
          // Guardar en el historial local (sobrevive a recargas y cierres).
          agregarAlHistorial({
            id: `${it.id}-${new Date().getTime()}`,
            fecha: new Date().toISOString(),
            clienteNombre: cliente.nombre,
            clienteRuc: cliente.ruc,
            tipo: it.tipo,
            proveedor: it.nombreProveedor,
            rucProveedor: it.rucProveedor,
            nroFactura: it.nroFactura,
            urlDrive: r.url,
          })
        } else {
          actualizarItem(it.id, { subida: 'error', errorSubida: r.error })
        }
      } catch (e) {
        actualizarItem(it.id, {
          subida: 'error',
          errorSubida: e instanceof Error ? e.message : 'Error al generar el PDF.',
        })
      }
    }
    setEnviando(false)
    setItems((prev) => {
      if (prev.every((it) => it.subida === 'ok')) setFinalizado(true)
      return prev
    })
  }

  function reiniciar() {
    setItems([])
    setFinalizado(false)
    setPaso(1)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <Stepper paso={paso} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 sm:px-6">
        {paso === 0 && <InstallButton />}

        {paso === 0 && (
          <button
            type="button"
            onClick={() => setVerHistorial(true)}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-navy/10 bg-white px-4 py-3 text-sm font-semibold text-navy shadow-sm"
          >
            📋 Ver historial de envíos
          </button>
        )}

        {paso === 0 && (
          <ClientForm
            valor={cliente}
            fotosCompartidas={compartidas.length}
            onContinuar={(c) => {
              setCliente(c)
              setPaso(1)
              if (compartidas.length) {
                agregarArchivos(compartidas, true) // con detección de esquinas
                setCompartidas([])
                limpiarCompartidos()
              }
            }}
          />
        )}

        {paso === 1 && (
          <Scanner
            items={items}
            onAgregarArchivos={agregarArchivos}
            onEliminar={eliminarItem}
            onEditarOCR={editarOCR}
            onEditarCampo={editarCampo}
            onEditarTipo={editarTipo}
            onBuscarProveedor={buscarNombreProveedor}
            onReemplazarImagen={reemplazarImagen}
            onAtras={() => setPaso(0)}
            onContinuar={() => setPaso(2)}
          />
        )}

        {paso === 2 && (
          <ReviewSend
            cliente={cliente}
            items={items}
            enviando={enviando}
            finalizado={finalizado}
            onEnviar={enviar}
            onAtras={() => setPaso(1)}
            onReiniciar={reiniciar}
          />
        )}
      </main>

      <footer className="safe-bottom border-t border-navy/5 bg-white py-4">
        <p className="text-center text-xs text-anthracite/50">
          {EMPRESA.nombre} · {EMPRESA.tagline}
        </p>
        <p className="mt-0.5 text-center text-[10px] text-anthracite/30">v{__BUILD__}</p>
      </footer>

      {verHistorial && <Historial onCerrar={() => setVerHistorial(false)} />}
    </div>
  )
}

function construirNombre(cliente: Cliente, id: string): string {
  const partes = [slug(cliente.ruc || 'sin-ruc'), slug(cliente.tipo), selloTiempo(), id.slice(-4)]
  return `${partes.join('_')}.pdf`
}
