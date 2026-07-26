/**
 * Configuración de la aplicación.
 *
 * 1) APPS_SCRIPT_URL — URL del despliegue de Google Apps Script que recibe los
 *    comprobantes y los guarda en Google Drive. La obtiene después de desplegar
 *    el script (ver apps-script/README.md). Puede pegarla aquí directamente, o
 *    definirla como variable de entorno VITE_APPS_SCRIPT_URL al compilar.
 *
 * 2) DRIVE_FOLDER_ID — Solo informativo para el frontend. La carpeta destino
 *    real se define dentro del propio Apps Script (Code.gs).
 */

export const APPS_SCRIPT_URL: string =
  (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined)?.trim() ||
  'https://script.google.com/macros/s/AKfycbw_2ByL8lzCndQkutWNACnDWPjXWsdmQcsrQOW9lb9Y_EpENiuDZaplAuBylFqe0XnI/exec'

// Carpeta de Google Drive indicada por Servicio Empresarial.
export const DRIVE_FOLDER_ID = '1w4zPtnayNonsFU2-36EI-JWpQNKZbvDq'

export const EMPRESA = {
  nombre: 'Servicio Empresarial',
  tagline: 'Auditoría · Contabilidad · Tributación',
  web: 'servicioempresarial.com.py',
}

export function appsScriptConfigurado(): boolean {
  return (
    APPS_SCRIPT_URL.startsWith('https://') &&
    !APPS_SCRIPT_URL.includes('PEGAR_AQUI')
  )
}
