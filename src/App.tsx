import { useState } from 'react'
import { Header } from './components/Header'
import { Stepper } from './components/Stepper'
import { ClientForm } from './components/ClientForm'
import { Scanner } from './components/Scanner'
import { ReviewSend } from './components/ReviewSend'
import type { Cliente, Comprobante } from './types'
import { procesarImagen } from './lib/image'
import { reconocerTexto } from './lib/ocr'
import { subirComprobante } from './lib/upload'
import { nuevoId, periodoActual, selloTiempo, slug } from './lib/util'
import { EMPRESA } from './config'

const CLIENTE_INICIAL: Cliente = {
  nombre: '',
  ruc: '',
  email: '',
  tipo: 'Factura',
  periodo: periodoActual(),
  nota: '',
}

export default function App() {
  const [paso, setPaso] = useState(0)
  const [cliente, setCliente] = useState<Cliente>(CLIENTE_INICIAL)
  const [items, setItems] = useState<Comprobante[]>([])
  const [enviando, setEnviando] = useState(false)
  const [finalizado, setFinalizado] = useState(false)

  function actualizarItem(id: string, cambios: Partial<Comprobante>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)))
  }

  async function agregarArchivos(files: FileList | File[]) {
    const lista = Array.from(files).filter((f) => f.type.startsWith('image/'))
    for (const file of lista) {
      const id = nuevoId()
      try {
        const { blob, dataUrl } = await procesarImagen(file)
        const nombreArchivo = construirNombre(cliente, id)
        const nuevo: Comprobante = {
          id,
          nombreArchivo,
          dataUrl,
          blob,
          ocrTexto: '',
          ocrEstado: 'procesando',
          ocrProgreso: 0,
          subida: 'pendiente',
        }
        setItems((prev) => [...prev, nuevo])

        // OCR en segundo plano (no bloquea la carga de más imágenes).
        reconocerTexto(blob, (p) => actualizarItem(id, { ocrProgreso: p }))
          .then((texto) =>
            actualizarItem(id, {
              ocrTexto: texto,
              ocrEstado: 'listo',
              ocrProgreso: 1,
            }),
          )
          .catch(() => actualizarItem(id, { ocrEstado: 'error', ocrProgreso: 1 }))
      } catch (e) {
        console.error('No se pudo procesar la imagen', e)
      }
    }
  }

  function eliminarItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function editarOCR(id: string, texto: string) {
    actualizarItem(id, { ocrTexto: texto })
  }

  async function enviar() {
    setEnviando(true)
    const total = items.length
    // Envío secuencial: peticiones pequeñas y progreso claro.
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.subida === 'ok') continue
      actualizarItem(it.id, { subida: 'subiendo', errorSubida: undefined })
      const r = await subirComprobante(cliente, it, i + 1, total)
      if (r.ok) {
        actualizarItem(it.id, { subida: 'ok', urlDrive: r.url })
      } else {
        actualizarItem(it.id, { subida: 'error', errorSubida: r.error })
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
        {paso === 0 && (
          <ClientForm
            valor={cliente}
            onContinuar={(c) => {
              setCliente(c)
              setPaso(1)
            }}
          />
        )}

        {paso === 1 && (
          <Scanner
            items={items}
            onAgregarArchivos={agregarArchivos}
            onEliminar={eliminarItem}
            onEditarOCR={editarOCR}
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
  const partes = [
    slug(cliente.ruc || 'sin-ruc'),
    slug(cliente.tipo),
    selloTiempo(),
    id.slice(-4),
  ]
  return `${partes.join('_')}.jpg`
}
