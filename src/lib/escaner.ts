/**
 * Escáner de documentos nativo (solo en la app de Android).
 *
 * Usa el escáner de documentos de Google (ML Kit) a través de Capacitor: el
 * MISMO motor que Google Drive. Detecta bordes, recorta, corrige la perspectiva
 * y mejora la imagen. En la web (PWA) no está disponible y se usa el flujo
 * normal (cámara/galería/compartir).
 */
import { Capacitor } from '@capacitor/core'
import {
  DocumentScanner,
  GoogleDocumentScannerModuleInstallState,
} from '@capacitor-mlkit/document-scanner'

/** ¿Corre dentro de la app nativa de Android (no en el navegador)? */
export function escanerNativoDisponible(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/**
 * El motor del escáner lo descarga Google Play Services la primera vez. Nos
 * aseguramos de que esté listo antes de abrirlo (con un salvavidas por si el
 * progreso nunca llega).
 */
async function asegurarModulo(): Promise<void> {
  try {
    const { available } = await DocumentScanner.isGoogleDocumentScannerModuleAvailable()
    if (available) return
  } catch {
    return // si no se puede consultar, dejamos que scanDocument lo maneje
  }
  await new Promise<void>((resolve) => {
    let listo = false
    const terminar = () => {
      if (listo) return
      listo = true
      DocumentScanner.removeAllListeners().catch(() => {})
      resolve()
    }
    DocumentScanner.addListener('googleDocumentScannerModuleInstallProgress', (e) => {
      const s = e.state
      if (
        s === GoogleDocumentScannerModuleInstallState.COMPLETED ||
        s === GoogleDocumentScannerModuleInstallState.FAILED ||
        s === GoogleDocumentScannerModuleInstallState.CANCELED
      ) {
        terminar()
      }
    }).catch(() => {})
    DocumentScanner.installGoogleDocumentScannerModule().catch(() => terminar())
    setTimeout(terminar, 90_000) // salvavidas
  })
}

/**
 * Abre el escáner nativo y devuelve las páginas escaneadas como archivos JPEG
 * (ya recortados y corregidos). El llamador los agrega SIN volver a recortar.
 */
export async function escanearDocumento(): Promise<File[]> {
  await asegurarModulo()
  const res = await DocumentScanner.scanDocument({
    resultFormats: 'JPEG',
    scannerMode: 'FULL', // limpieza con IA (borra manchas, dedos, etc.)
    galleryImportAllowed: false,
    pageLimit: 10,
  })
  const uris = res.scannedImages ?? []
  const archivos: File[] = []
  for (let i = 0; i < uris.length; i++) {
    try {
      const url = Capacitor.convertFileSrc(uris[i])
      const blob = await (await fetch(url)).blob()
      archivos.push(
        new File([blob], `escaneo-${Date.now()}-${i}.jpg`, { type: blob.type || 'image/jpeg' }),
      )
    } catch {
      // si una página falla al leerse, seguimos con las demás
    }
  }
  return archivos
}
