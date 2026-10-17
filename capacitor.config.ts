import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Configuración de la app nativa (Capacitor) que envuelve la misma PWA y le
 * agrega el escáner de documentos de Google (ML Kit). El `appId` es el nombre
 * de paquete en Android; cambialo si querés otro (sin guiones, en minúsculas).
 */
const config: CapacitorConfig = {
  appId: 'com.servicioempresarial.escaneos',
  appName: 'Escaneos SE',
  webDir: 'dist',
}

export default config
