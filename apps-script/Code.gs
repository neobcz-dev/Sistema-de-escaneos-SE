/**
 * Servicio Empresarial - Backend de escaneo de comprobantes.
 *
 * Este script vive en la cuenta de Google de Servicio Empresarial y recibe los
 * comprobantes que envian los clientes desde la aplicacion web. Cada comprobante
 * se guarda en la carpeta de Google Drive indicada, dentro de una subcarpeta por
 * cliente. El texto detectado por OCR se guarda en la descripcion del archivo.
 *
 * Los clientes NO inician sesion con Google: el script se ejecuta siempre como
 * el propietario (ver README de despliegue).
 */

// === Carpeta destino en Google Drive (Servicio Empresarial) ===
var FOLDER_ID = '1w4zPtnayNonsFU2-36EI-JWpQNKZbvDq';

/** Punto de entrada para las subidas (POST desde la app). */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'Peticion vacia.' });
    }

    var data = JSON.parse(e.postData.contents);
    var cliente = data.cliente || {};
    var archivo = data.archivo || {};

    if (!archivo.base64) {
      return jsonResponse({ ok: false, error: 'No se recibio ninguna imagen.' });
    }

    var raiz = DriveApp.getFolderById(FOLDER_ID);
    var carpetaCliente = obtenerOCrearSubcarpeta(raiz, nombreCarpetaCliente(cliente));

    var bytes = Utilities.base64Decode(archivo.base64);
    var mime = archivo.mimeType || 'image/jpeg';
    var nombre = archivo.nombre || ('comprobante_' + Date.now() + '.jpg');
    var blob = Utilities.newBlob(bytes, mime, nombre);

    var file = carpetaCliente.createFile(blob);
    file.setDescription(construirDescripcion(data));

    return jsonResponse({
      ok: true,
      url: file.getUrl(),
      fileId: file.getId(),
      carpeta: carpetaCliente.getName()
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** Verificacion rapida del despliegue (abrir la URL en el navegador). */
function doGet() {
  return jsonResponse({
    ok: true,
    servicio: 'Servicio Empresarial - Escaneo de comprobantes',
    estado: 'activo'
  });
}

/** Respuesta a preflight CORS (por si el navegador lo solicita). */
function doOptions() {
  return ContentService.createTextOutput('');
}

// ---------- Auxiliares ----------

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nombreCarpetaCliente(cliente) {
  var ruc = sanitizar(cliente.ruc || 'sin-ruc');
  var nombre = sanitizar(cliente.nombre || 'sin-nombre');
  return nombre + ' (' + ruc + ')';
}

function obtenerOCrearSubcarpeta(padre, nombre) {
  var existentes = padre.getFoldersByName(nombre);
  if (existentes.hasNext()) return existentes.next();
  return padre.createFolder(nombre);
}

function construirDescripcion(data) {
  var c = data.cliente || {};
  var d = data.detectado || {};
  var lineas = [
    'Cliente: ' + (c.nombre || ''),
    'RUC/CI cliente: ' + (c.ruc || ''),
    'Correo: ' + (c.email || ''),
    'Periodo: ' + (c.periodo || ''),
    'Nota: ' + (c.nota || ''),
    '',
    '--- Datos detectados ---',
    'Tipo: ' + (d.tipo || c.tipo || ''),
    'RUC proveedor: ' + (d.rucProveedor || '(no detectado)'),
    'N° comprobante: ' + (d.nroFactura || '(no detectado)'),
    'Timbrado: ' + (d.timbrado || '(no detectado)'),
    'Enviado: ' + (data.enviadoEn || ''),
    '',
    '--- Texto detectado (OCR) ---',
    data.ocr || '(sin texto)'
  ];
  return lineas.join('\n');
}

/** Quita caracteres no validos en nombres de carpeta (sin usar regex). */
function sanitizar(texto) {
  var s = String(texto);
  var invalidos = '\\/:*?"<>|';
  var salida = '';
  var espacioPrevio = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (invalidos.indexOf(ch) >= 0) ch = ' ';
    if (ch === ' ') {
      if (!espacioPrevio) salida += ' ';
      espacioPrevio = true;
    } else {
      salida += ch;
      espacioPrevio = false;
    }
  }
  salida = salida.trim().slice(0, 80);
  return salida || 'sin-dato';
}
