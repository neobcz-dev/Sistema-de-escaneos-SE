import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { Stepper } from './components/Stepper'
import { ClientForm } from './components/ClientForm'
import { Scanner } from './components/Scanner'
import { ReviewSend } from './components/ReviewSend'
import { InstallButton } from './components/InstallButton'
import type { Cliente, Comprobante } from './types'
import { procesarImagen, type ImagenProcesada } from './lib/image'
import { reconocerTexto } from './lib/ocr'
import { crearPdfBuscable } from './lib/pdf'
import { detectarDatos, detectarTipo } from './lib/parse'
import { subirComprobante } from './lib/upload'
import { nuevoId, selloTiempo, slug } from './lib/util'
import type { TipoComprobante } from './types'
import { EMPRESA } from './config'

const CLIENTE_INICIAL: Cliente = {
  nombre: '',
  ruc: '',
  email: '',
  tipo: 'Factura',
  nota: '',
}

export default function App() {
  const [paso, setPaso] = useState(0)
  const [cliente, setCliente] = useState<Cliente>(CLIENTE_INICIAL)
  const [items, setItems] = useState<Comprobante[]>([])
  const [enviando, setEnviando] = useState(false)
  const [finalizado, setFinalizado] = useState(false)
  // Fotos recibidas desde WhatsApp/galería vía "Compartir con la app".
  const [compartidas, setCompartidas] = useState<File[]>([])

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
        for (const k of await cache.keys()) await cache.delete(k)
        window.history.replaceState(null, '', window.location.pathname)
        if (files.length) setCompartidas(files)
      } catch {
        // sin fotos compartidas
      }
    })()
  }, [])

  function actualizarItem(id: string, cambios: Partial<Comprobante>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)))
  }

  /** Ejecuta OCR sobre la imagen y autocompleta los datos detectados. */
  function ejecutarOCR(id: string, blob: Blob) {
    actualizarItem(id, { ocrEstado: 'procesando', ocrProgreso: 0 })
    reconocerTexto(blob, (p) => actualizarItem(id, { ocrProgreso: p }))
      .then(({ texto, palabras }) => {
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
          // Si el OCR detecta el tipo, lo usamos; si no, dejamos el actual.
          ...(tipoDetectado ? { tipo: tipoDetectado } : {}),
        })
      })
      .catch(() => actualizarItem(id, { ocrEstado: 'error', ocrProgreso: 1 }))
  }

  async function agregarArchivos(files: FileList | File[], autoRecorte = true) {
    const lista = Array.from(files).filter((f) => f.type.startsWith('image/'))
    for (const file of lista) {
      const id = nuevoId()
      try {
        const img = await procesarImagen(file, { autoRecorte })
        const nuevo: Comprobante = {
          id,
          nombreArchivo: construirNombre(cliente, id),
          dataUrl: img.dataUrl,
          blob: img.blob,
          width: img.width,
          height: img.height,
          ocrTexto: '',
          ocrPalabras: [],
          ocrEstado: 'procesando',
          ocrProgreso: 0,
          tipo: cliente.tipo, // valor por defecto hasta que el OCR detecte
          rucProveedor: '',
          nroFactura: '',
          timbrado: '',
          subida: 'pendiente',
        }
        setItems((prev) => [...prev, nuevo])
        ejecutarOCR(id, img.blob)
      } catch (e) {
        console.error('No se pudo procesar la imagen', e)
      }
    }
  }

  function reemplazarImagen(id: string, img: ImagenProcesada) {
    actualizarItem(id, {
      dataUrl: img.dataUrl,
      blob: img.blob,
      width: img.width,
      height: img.height,
    })
    ejecutarOCR(id, img.blob) // el recorte cambia el contenido: re-leemos
  }

  function eliminarItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function editarOCR(id: string, texto: string) {
    actualizarItem(id, { ocrTexto: texto })
  }

  function editarCampo(id: string, campo: 'rucProveedor' | 'nroFactura', valor: string) {
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
        // PDF buscable: imagen + capa de texto invisible del OCR.
        const pdf = await crearPdfBuscable(it.dataUrl, it.width, it.height, it.ocrPalabras)
        const r = await subirComprobante(cliente, it, pdf, i + 1, total)
        if (r.ok) actualizarItem(it.id, { subida: 'ok', urlDrive: r.url })
        else actualizarItem(it.id, { subida: 'error', errorSubida: r.error })
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
          <ClientForm
            valor={cliente}
            fotosCompartidas={compartidas.length}
            onContinuar={(c) => {
              setCliente(c)
              setPaso(1)
              if (compartidas.length) {
                agregarArchivos(compartidas, true)
                setCompartidas([])
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
      </footer>
    </div>
  )
}

function construirNombre(cliente: Cliente, id: string): string {
  const partes = [slug(cliente.ruc || 'sin-ruc'), slug(cliente.tipo), selloTiempo(), id.slice(-4)]
  return `${partes.join('_')}.pdf`
}
