# Sistema de Escaneos · Servicio Empresarial

Aplicación web para que los **clientes de Servicio Empresarial** escaneen sus
comprobantes con el celular y los envíen directamente a la carpeta de Google
Drive del estudio. Incluye **OCR en español** (lectura automática del texto) e
**identificación del cliente** antes de enviar.

<p align="center"><img src="public/logo.svg" width="360" alt="Servicio Empresarial"></p>

## Características

- 📷 **Captura con la cámara** o desde la galería (varios comprobantes por envío).
- 🔎 **OCR en español** en el navegador (Tesseract.js), con texto editable.
- 🧾 **Identificación del cliente**: nombre/razón social, RUC o C.I., tipo de
  comprobante, período y nota.
- ☁️ **Subida a Google Drive** vía Google Apps Script, ordenada en una
  **subcarpeta por cliente**.
- 📱 **PWA**: se puede "instalar" en el teléfono como una app.
- 🎨 Identidad visual de Servicio Empresarial (azul marino, celeste, antracita).

## Cómo funciona

```
Cliente (celular)                Google (su cuenta)
┌───────────────────┐           ┌─────────────────────────────┐
│  App web (Pages)  │  POST     │  Apps Script  →  Google Drive│
│  · Identificación │ ───────►  │  guarda el archivo en la     │
│  · Foto + OCR     │  imagen   │  subcarpeta del cliente      │
│  · Enviar         │  + datos  │                              │
└───────────────────┘           └─────────────────────────────┘
```

El cliente **no** usa su cuenta de Google. El Apps Script se ejecuta como el
propietario de la carpeta.

## Puesta en marcha (resumen)

1. **Backend (Drive).** Siga [`apps-script/README.md`](apps-script/README.md)
   para desplegar el script y obtener la URL `.../exec`.
2. **Conectar la app.** Guarde esa URL como variable `VITE_APPS_SCRIPT_URL`
   (GitHub → *Settings → Secrets and variables → Actions → Variables*) o en
   `src/config.ts`.
3. **Publicar (GitHub Pages).**
   - En GitHub: *Settings → Pages → Build and deployment → Source: **GitHub
     Actions***.
   - Cada push a `main` publica el sitio automáticamente
     (workflow en `.github/workflows/deploy.yml`).
   - Quedará disponible en:
     `https://neobcz-dev.github.io/Sistema-de-escaneos-SE/`
4. **Compartir** ese enlace con los clientes (o el código QR que genere a partir
   de él).

## Desarrollo local

Requiere Node.js 18+.

```bash
npm install
npm run gen:icons   # genera los íconos PNG de la PWA (una sola vez)
npm run dev         # servidor de desarrollo
npm run build       # compila a dist/
npm run preview     # sirve la compilación
```

Para probar el envío en local, cree un archivo `.env` (copie `.env.example`) con
`VITE_APPS_SCRIPT_URL=` y la URL de su Apps Script.

## Estructura

```
├─ apps-script/        Backend de Google Apps Script (Drive)
│  ├─ Code.gs          Script a pegar en script.google.com
│  └─ README.md        Guía de despliegue paso a paso
├─ src/
│  ├─ components/      Interfaz (identificación, escáner, revisión)
│  ├─ lib/             OCR, procesamiento de imagen, subida, utilidades
│  ├─ config.ts        URL del backend y datos de la carpeta
│  └─ App.tsx          Flujo de 3 pasos
├─ public/             Logo, favicon e íconos PWA
└─ .github/workflows/  Despliegue automático a GitHub Pages
```

## Privacidad

Las imágenes se procesan en el dispositivo del cliente (el OCR **no** sale del
navegador) y solo se envían a la carpeta de Drive de Servicio Empresarial al
presionar **Enviar**. No se utilizan servicios de terceros para almacenar los
comprobantes.

## Personalización

- **Carpeta de destino:** cambie `FOLDER_ID` en `apps-script/Code.gs`.
- **Colores / marca:** `tailwind.config.js` (paleta) y `src/components/Mark.tsx`
  (logo).
- **Tipos de comprobante:** `src/components/ClientForm.tsx`.
