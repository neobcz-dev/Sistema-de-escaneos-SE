# Backend en Google Apps Script

Este pequeño script se ejecuta dentro de **su propia cuenta de Google** (la de
Servicio Empresarial) y guarda en su Google Drive los comprobantes que envían
los clientes. Los clientes **nunca** inician sesión con su cuenta.

## Qué hace

- Recibe cada foto de comprobante desde la aplicación web.
- La guarda en su carpeta de Drive, dentro de una **subcarpeta por cliente**
  (`Nombre (RUC)`).
- Guarda el texto detectado por OCR en la **descripción** del archivo, para que
  pueda buscarlo dentro de Drive.

## Pasos para desplegarlo (≈ 5 minutos)

1. Abra <https://script.google.com> con la cuenta de Google **dueña de la
   carpeta** de Drive.
2. Haga clic en **Nuevo proyecto**.
3. Borre el contenido del archivo `Código.gs` y pegue **todo** el contenido de
   [`Code.gs`](./Code.gs).
4. Verifique que la constante `FOLDER_ID` corresponda a su carpeta. Ya viene
   configurada con:
   ```
   var FOLDER_ID = '1w4zPtnayNonsFU2-36EI-JWpQNKZbvDq';
   ```
   > El ID es la parte final de la URL de la carpeta:
   > `https://drive.google.com/drive/folders/<ESTO_ES_EL_ID>`
5. Guarde el proyecto (ícono de disquete) y póngale un nombre, por ejemplo
   **"Escaneos SE"**.
6. Haga clic en **Implementar → Nueva implementación**.
7. En **Tipo**, elija **Aplicación web**.
8. Configure:
   - **Descripción**: `Escaneos SE`
   - **Ejecutar como**: **Yo** (su cuenta)
   - **Quién tiene acceso**: **Cualquier persona**
9. Haga clic en **Implementar**. Google le pedirá **autorizar** el acceso a su
   Drive: acepte (si aparece "Google no verificó la app", entre en
   *Configuración avanzada → Ir a Escaneos SE → Permitir*; es su propio script,
   es seguro).
10. Copie la **URL de la aplicación web**. Tiene esta forma:
    ```
    https://script.google.com/macros/s/AKfyc.../exec
    ```

## Conectar la app con este backend

Pegue esa URL en uno de estos dos lugares:

- **Opción A (recomendada):** en GitHub, vaya a
  *Settings → Secrets and variables → Actions → Variables*, cree una variable
  llamada `VITE_APPS_SCRIPT_URL` con la URL. El sitio se recompila con ese valor.
- **Opción B:** edite `src/config.ts` y reemplace `PEGAR_AQUI_LA_URL_DEL_APPS_SCRIPT`
  por la URL.

## Probar

Abra la URL terminada en `/exec` en el navegador. Debe responder algo como:

```json
{ "ok": true, "servicio": "Servicio Empresarial — Escaneo de comprobantes", "estado": "activo" }
```

## Actualizar el script más adelante

Si modifica `Code.gs`, en Apps Script use **Implementar → Gestionar
implementaciones → (editar) → Nueva versión**. Así la URL **no cambia**.
