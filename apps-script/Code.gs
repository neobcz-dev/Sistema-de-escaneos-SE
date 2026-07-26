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

// === APIKEY del servicio de Consulta Publica de la SET (Sistema Marangatu) ===
// Deje '' para desactivar la consulta de RUC. Peguela aqui cuando la obtenga.
var SET_APIKEY = '';

/** Punto de entrada para las subidas (POST desde la app). */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'Peticion vacia.' });
    }

    var data = JSON.parse(e.postData.contents);

    // Consulta de RUC a la SET (no guarda archivo).
    if (data.accion === 'consultaRuc') {
      return jsonResponse(consultarRuc(data.ruc, data.dv));
    }

    var cliente = data.cliente || {};
    var archivo = data.archivo || {};

    if (!archivo.base64) {
      return jsonResponse({ ok: false, error: 'No se recibio ninguna imagen.' });
    }

    var raiz = DriveApp.getFolderById(FOLDER_ID);
    var carpetaCliente = obtenerOCrearSubcarpeta(raiz, nombreCarpetaCliente(cliente));

    // Subcarpeta por FECHA DE ENVIO (la calcula el servidor, no el cliente).
    // Estructura: Cliente (RUC) / AAAA-MM /
    var tz = Session.getScriptTimeZone();
    var mesEnvio = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
    var carpetaMes = obtenerOCrearSubcarpeta(carpetaCliente, mesEnvio);

    var bytes = Utilities.base64Decode(archivo.base64);
    var mime = archivo.mimeType || 'image/jpeg';
    var nombreBase = archivo.nombre || ('comprobante_' + Date.now() + '.jpg');
    // Si ya existe ese nombre en la carpeta del mes, se agrega un sufijo (2), (3)...
    var nombre = nombreUnico(carpetaMes, nombreBase);
    var blob = Utilities.newBlob(bytes, mime, nombre);

    var file = carpetaMes.createFile(blob);
    file.setDescription(construirDescripcion(data, tz));

    return jsonResponse({
      ok: true,
      url: file.getUrl(),
      fileId: file.getId(),
      carpeta: carpetaCliente.getName() + ' / ' + mesEnvio
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

/**
 * Devuelve un nombre libre en la carpeta. Si "archivo.pdf" ya existe,
 * prueba "archivo (2).pdf", "archivo (3).pdf", etc. Así se guardan ambos
 * comprobantes sin pisarse.
 */
function nombreUnico(carpeta, nombre) {
  if (!carpeta.getFilesByName(nombre).hasNext()) return nombre;
  var punto = nombre.lastIndexOf('.');
  var base = punto >= 0 ? nombre.substring(0, punto) : nombre;
  var ext = punto >= 0 ? nombre.substring(punto) : '';
  var i = 2;
  var candidato = base + ' (' + i + ')' + ext;
  while (carpeta.getFilesByName(candidato).hasNext()) {
    i++;
    candidato = base + ' (' + i + ')' + ext;
  }
  return candidato;
}

/**
 * Consulta el RUC en el servicio publico de la SET y devuelve la razon social.
 * Requiere SET_APIKEY configurada. El apiKey NUNCA sale de este servidor.
 */
function consultarRuc(ruc, dv) {
  if (!SET_APIKEY) return { ok: false, error: 'Consulta de RUC no configurada.' };
  if (!ruc || dv === undefined || dv === null || dv === '') {
    return { ok: false, error: 'Faltan RUC o DV.' };
  }
  try {
    var url =
      'https://servicios.set.gov.py/EsetApiWS/ApiWS/consultaRUC' +
      '?apiKey=' + encodeURIComponent(SET_APIKEY) +
      '&ruc=' + encodeURIComponent(String(ruc)) +
      '&dv=' + encodeURIComponent(String(dv));
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(resp.getContentText());
    if (json && json.estado === 'VALIDO' && json.contribuyente) {
      return {
        ok: true,
        razonSocial: json.contribuyente.razonSocial || '',
        estadoRuc: json.contribuyente.estado || '',
        nombreComercial: json.contribuyente.nombreComercial || ''
      };
    }
    return { ok: false, error: (json && json.mensaje) || 'RUC no encontrado.' };
  } catch (err) {
    return { ok: false, error: 'Error al consultar la SET: ' + String(err) };
  }
}

function construirDescripcion(data, tz) {
  var c = data.cliente || {};
  var d = data.detectado || {};
  var recibido = Utilities.formatDate(new Date(), tz || 'GMT', 'yyyy-MM-dd HH:mm');
  var lineas = [
    'Cliente: ' + (c.nombre || ''),
    'RUC/CI cliente: ' + (c.ruc || ''),
    'Correo: ' + (c.email || ''),
    'Nota: ' + (c.nota || ''),
    'Recibido: ' + recibido,
    '',
    '--- Datos detectados ---',
    'Tipo: ' + (d.tipo || c.tipo || ''),
    'RUC proveedor: ' + (d.rucProveedor || '(no detectado)'),
    'N comprobante: ' + (d.nroFactura || '(no detectado)'),
    'Timbrado: ' + (d.timbrado || '(no detectado)'),
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
