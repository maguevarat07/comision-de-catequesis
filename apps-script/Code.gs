/**
 * Escritor único · Registro de catequistas (Comisión de Catequesis)
 *
 * Única vía de escritura del libro "Catequesis · Base de Registro", de Drive y de Gmail.
 * Lo invoca solo la API (api/_lib/escritor.js) con solicitudes firmadas (HMAC-SHA256),
 * con marca de tiempo y nonce para impedir repeticiones.
 *
 * Por cada solicitud:
 *   1. verifica firma, antigüedad y nonce;
 *   2. si trae clave de idempotencia ya resuelta, devuelve la misma respuesta;
 *   3. sube a Drive los archivos de la solicitud (fuera del bloqueo, es lo más lento);
 *   4. toma ScriptLock, relee las pestañas, valida unicidad, asigna consecutivos y aplica
 *      todos los cambios en un único spreadsheets.batchUpdate (atómico);
 *   5. libera el bloqueo, renombra archivos y envía los correos.
 *
 * Requisitos (ver docs/DESPLIEGUE.md):
 *   - Servicio avanzado "Google Sheets API" (identificador Sheets), ya declarado en appsscript.json.
 *   - Propiedades del script: SHEET_ID y WRITER_SECRET (>= 32 caracteres, igual que
 *     APPS_SCRIPT_WRITER_SECRET en Vercel).
 *   - Implementar como aplicación web: ejecutar como "yo"; acceso "cualquier usuario".
 *   - Ejecutar una vez instalarActivadores() para procesarPendientes (cada hora) y respaldoDiario.
 */

var MAX_EDAD_MS = 5 * 60 * 1000;
var ESPERA_BLOQUEO_MS = 30000;
var IDEM_TTL_S = 6 * 3600;
var ZONA = 'America/Panama';

// ---------------------------------------------------------------- Entrada web

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var secreto = props.getProperty('WRITER_SECRET');
    var sheetId = props.getProperty('SHEET_ID');
    if (!secreto || secreto.length < 32 || !sheetId) return responder(error_('CONFIG', 'Escritor sin configurar'));

    var sobre = JSON.parse(e.postData.contents);
    var esperada = Utilities.base64Encode(Utilities.computeHmacSha256Signature(sobre.body, secreto));
    if (!igualSeguro_(esperada, sobre.signature)) return responder(error_('FIRMA', 'Firma no válida'));

    var cuerpo = JSON.parse(sobre.body);
    if (Math.abs(Date.now() - Number(cuerpo.ts)) > MAX_EDAD_MS) return responder(error_('CADUCADA', 'Solicitud caducada'));
    var cache = CacheService.getScriptCache();
    if (!cuerpo.nonce || cache.get('nonce:' + cuerpo.nonce)) return responder(error_('REPETIDA', 'Solicitud repetida'));
    cache.put('nonce:' + cuerpo.nonce, '1', 600);
    if (cuerpo.urlSitio && props.getProperty('URL_SITIO') !== cuerpo.urlSitio) props.setProperty('URL_SITIO', cuerpo.urlSitio);

    var accion = ACCIONES[cuerpo.accion];
    if (!accion) return responder(error_('ACCION', 'Acción desconocida'));
    return responder(ejecutar_(accion, cuerpo.accion, cuerpo.datos || {}, cuerpo.idem || '', sheetId));
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return responder(error_('ERROR', String(err && err.message ? err.message : err)));
  }
}

function ejecutar_(accion, nombre, datos, idem, sheetId) {
  var cache = CacheService.getScriptCache();
  var claveIdem = idem ? 'idem:' + nombre + ':' + idem : '';
  if (claveIdem) {
    var previa = cache.get(claveIdem);
    if (previa) return JSON.parse(previa);
  }
  // Consulta de la API ante un posible reintento: responde solo desde la caché, sin escribir nada.
  if (datos.soloCache) return error_('SIN_CACHE', 'No hay una respuesta guardada para esta clave');
  var ss = SpreadsheetApp.openById(sheetId);
  var config = leerConfig_(ss);
  var prep = accion.antes ? accion.antes(datos, config) : {};
  var res;
  if (accion.bajoBloqueo) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
      deshacer_(prep);
      return error_('OCUPADO', 'El sistema está ocupado. Vuelve a intentarlo en unos segundos.');
    }
    try {
      if (claveIdem && cache.get(claveIdem)) { deshacer_(prep); return JSON.parse(cache.get(claveIdem)); }
      var libro = abrirLibro_(ss, sheetId);
      try {
        res = accion.bajoBloqueo(libro, datos, prep, config);
        libro.confirmar();
      } catch (err) {
        if (!err || !err.codigo) throw err;
        res = error_(err.codigo, err.message);
      }
    } finally {
      lock.releaseLock();
    }
    if (!res.ok) { deshacer_(prep); return res; }
  } else {
    res = { ok: true };
  }
  if (accion.despues) res = accion.despues(res, datos, prep, config, ss, sheetId) || res;
  var publica = {};
  Object.keys(res).forEach(function (k) { if (k.charAt(0) !== '_') publica[k] = res[k]; });
  if (claveIdem && publica.ok) cache.put(claveIdem, JSON.stringify(publica), IDEM_TTL_S);
  return publica;
}

// ---------------------------------------------------------------- Acciones

var ACCIONES = {
  estado: {
    despues: function (res, d, prep, config, ss) {
      var correos = leerTabla_(ss, 'Correos');
      return { ok: true, cuotaCorreo: MailApp.getRemainingDailyQuota(), correosPendientes: correos.filas.filter(function (c) { return c.estado === 'PENDIENTE'; }).length };
    },
  },

  /** Paso 1 del registro: archivos, consecutivo, fila PENDIENTE_DOCUMENTOS y pago. */
  registrarCatequista: {
    antes: function (d, config) {
      var n = Utilities.getUuid().slice(0, 8);
      return { archivos: [
        subir_(config.DRIVE_FOTOS, d.foto, 'pendiente_' + n + '_foto.jpg'),
        subir_(config.DRIVE_FIRMAS, d.firma, 'pendiente_' + n + '_firma.png'),
        subir_(config.DRIVE_COMPROBANTES_REGISTRO, d.comprobante, 'pendiente_' + n + '_yappy' + extension_(d.comprobante.mime)),
      ] };
    },
    bajoBloqueo: function (libro, d, prep, config) {
      if (!esVerdadero_(config.REGISTRO_ABIERTO)) throw fallo_('CERRADO', 'El registro de catequistas está cerrado en este momento.');
      var c = d.campos;
      var cat = libro.tabla('Catequistas');
      if (cat.filas.some(function (x) { return minus_(x.correo) === minus_(c.correo) || mayus_(x.cedula) === mayus_(c.cedula); })) {
        throw fallo_('DUPLICADO', 'Ya existe un registro con estos datos. Si ya te registraste, puedes recuperar tu número de catequista por correo.');
      }
      comprobarPago_(libro, d.comprobante_sha256, c.yappy_referencia, false);
      var ahora = ahora_();
      var id = Utilities.getUuid();
      var numero = libro.siguiente('CATEQUISTA');
      var fila = {};
      Object.keys(c).forEach(function (k) { fila[k] = c[k]; });
      fila.id = id;
      fila.numero_catequista = numero;
      fila.estado = 'PENDIENTE_DOCUMENTOS';
      fila.fecha_registro = ahora;
      fila.foto_file_id = prep.archivos[0].getId();
      fila.firma_file_id = prep.archivos[1].getId();
      fila.comprobante_file_id = prep.archivos[2].getId();
      fila.comprobante_sha256 = d.comprobante_sha256;
      fila.pdf_inscripcion_file_id = '';
      fila.carnet_file_id = '';
      fila.vigencia_hasta = vigencia_(config.CARNET_VIGENCIA_MESES);
      fila.correo_enviado_at = '';
      fila.consentimiento_datos = ahora;
      fila.consentimiento_imagen = ahora;
      fila.creado_at = ahora;
      fila.actualizado_at = ahora;
      fila.notas_admin = '';
      libro.insertar('Catequistas', fila);
      libro.insertar('Pagos', pago_('REGISTRO', id, numero, config.COSTO_REGISTRO, config.MONEDA, c.yappy_referencia, fila.comprobante_file_id, d.comprobante_sha256, ahora));
      libro.auditar(c.correo, 'REGISTRO', 'Catequistas', id, numero);
      return { ok: true, id: id, numero: numero, fecha_registro: ahora, vigencia_hasta: fila.vigencia_hasta };
    },
    despues: function (res, d, prep) {
      renombrar_(prep.archivos, [res.numero + '_foto.jpg', res.numero + '_firma.png', res.numero + '_yappy' + extension_(d.comprobante.mime)]);
      return res;
    },
  },

  /** Paso 2 del registro (y regeneración): PDF de inscripción y carnet; pasa a ACTIVO y envía el correo. */
  adjuntarDocumentos: {
    antes: function (d, config) {
      return { archivos: [
        subir_(config.DRIVE_PDF_INSCRIPCION, { mime: 'application/pdf', b64: d.pdf }, 'pendiente_' + d.id + '_inscripcion.pdf'),
        subir_(config.DRIVE_CARNETS, { mime: 'application/pdf', b64: d.carnet }, 'pendiente_' + d.id + '_carnet.pdf'),
      ] };
    },
    bajoBloqueo: function (libro, d, prep) {
      var c = libro.buscar('Catequistas', d.id);
      if (!c) throw fallo_('INEXISTENTE', 'Registro no encontrado.');
      if (c.estado === 'ANULADO') throw fallo_('ANULADO', 'No se generan documentos de un registro anulado.');
      var viejos = [c.pdf_inscripcion_file_id, c.carnet_file_id].filter(String);
      libro.actualizar('Catequistas', c, { pdf_inscripcion_file_id: prep.archivos[0].getId(), carnet_file_id: prep.archivos[1].getId(), estado: 'ACTIVO', actualizado_at: ahora_() });
      if (d.por) libro.auditar(d.por, 'REGENERAR', 'Catequistas', c.id, c.numero_catequista);
      return { ok: true, estado: 'ACTIVO', _cat: c, _viejos: viejos };
    },
    despues: function (res, d, prep, config, ss, sheetId) {
      var c = res._cat;
      renombrar_(prep.archivos, [c.numero_catequista + '_inscripcion.pdf', c.numero_catequista + '_carnet.pdf']);
      res._viejos.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ya no existe */ } });
      if (d.enviarCorreo) res.correoEnviado = enviarRegistro_(ss, sheetId, config, c, '');
      return res;
    },
  },

  /** Paso 1 de la Semana: comprobante, consecutivo, fila CONFIRMADA y pago. */
  inscribirSemana: {
    antes: function (d, config) {
      return { archivos: [subir_(config.DRIVE_COMPROBANTES_SEMANA, d.comprobante, 'pendiente_' + d.id + '_yappy' + extension_(d.comprobante.mime))] };
    },
    bajoBloqueo: function (libro, d, prep, config) {
      if (!esVerdadero_(config.SEMANA_ABIERTA)) throw fallo_('CERRADO', 'La inscripción a la Semana del Catequista está cerrada.');
      var edicion = String(config.SEMANA_EDICION);
      var c = libro.buscar('Catequistas', d.catequista_id);
      if (!c || c.estado !== 'ACTIVO') throw fallo_('NO_ACTIVO', 'Tu registro aún no está activo. Contacta a la Comisión.');
      var sem = libro.tabla('SemanaCatequista');
      var vigentes = sem.filas.filter(function (s) { return String(s.edicion) === edicion && s.estado !== 'ANULADA'; });
      if (vigentes.some(function (s) { return s.catequista_id === c.id; })) throw fallo_('YA_INSCRITO', 'Ya estás inscrito(a) en esta edición.');
      var cupo = numero_(config.SEMANA_CUPO);
      if (cupo > 0 && vigentes.length >= cupo) throw fallo_('SIN_CUPO', 'Se agotaron los cupos de esta edición.');
      comprobarPago_(libro, d.comprobante_sha256, d.yappy_referencia, true);
      var ahora = ahora_();
      var numero = libro.siguiente(String(config.SEMANA_SECUENCIA));
      var compId = prep.archivos[0].getId();
      libro.insertar('SemanaCatequista', {
        id: d.id, numero_inscripcion_semana: numero, catequista_id: c.id, numero_catequista: c.numero_catequista, correo: c.correo,
        edicion: edicion, estado: 'CONFIRMADA', fecha_inscripcion: ahora, talla_camiseta: d.talla_camiseta || '',
        restricciones_alimentarias: d.restricciones_alimentarias || '', comprobante_file_id: compId, yappy_referencia: d.yappy_referencia,
        comprobante_sha256: d.comprobante_sha256, qr_token: d.qr_token, qr_file_id: '', correo_enviado_at: '', checkin_at: '', checkin_por: '',
        creado_at: ahora, actualizado_at: ahora, notas_admin: '',
      });
      libro.insertar('Pagos', pago_('SEMANA', d.id, c.numero_catequista, config.COSTO_SEMANA, config.MONEDA, d.yappy_referencia, compId, d.comprobante_sha256, ahora));
      if (d.telefono && String(d.telefono) !== String(c.telefono)) libro.actualizar('Catequistas', c, { telefono: d.telefono, actualizado_at: ahora });
      libro.auditar(c.correo, 'INSCRIPCION_SEMANA', 'SemanaCatequista', d.id, numero);
      return { ok: true, id: d.id, numero: numero, edicion: edicion, fecha: ahora };
    },
    despues: function (res, d, prep) {
      renombrar_(prep.archivos, [res.numero + '_yappy' + extension_(d.comprobante.mime)]);
      return res;
    },
  },

  /** Paso 2 de la Semana: imagen del QR en Drive y correo con el pase adjunto. */
  adjuntarPase: {
    antes: function (d, config) {
      return { archivos: [subir_(config.DRIVE_QR, { mime: 'image/png', b64: d.qr }, 'pendiente_' + d.id + '_qr.png')] };
    },
    bajoBloqueo: function (libro, d, prep) {
      var s = libro.buscar('SemanaCatequista', d.id);
      if (!s) throw fallo_('INEXISTENTE', 'Inscripción no encontrada.');
      var viejo = s.qr_file_id;
      libro.actualizar('SemanaCatequista', s, { qr_file_id: prep.archivos[0].getId(), actualizado_at: ahora_() });
      return { ok: true, _s: s, _viejos: viejo ? [viejo] : [] };
    },
    despues: function (res, d, prep, config, ss, sheetId) {
      renombrar_(prep.archivos, [res._s.numero_inscripcion_semana + '_qr.png']);
      res._viejos.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ya no existe */ } });
      if (d.enviarCorreo) res.correoEnviado = enviarSemana_(ss, sheetId, config, res._s, d.pase, '');
      return res;
    },
  },

  registrarEntrada: {
    bajoBloqueo: function (libro, d) {
      var s = libro.buscar('SemanaCatequista', d.id);
      var c = s && libro.buscar('Catequistas', s.catequista_id);
      if (!s || !c) throw fallo_('INEXISTENTE', 'Pase inexistente.');
      if (s.estado === 'ANULADA' || c.estado === 'ANULADO') throw fallo_('ANULADO', 'Este pase está anulado. No permitas la entrada.');
      if (s.checkin_at) return { ok: true, yaHabiaEntrado: true, checkin_at: s.checkin_at, checkin_por: s.checkin_por };
      var t = ahora_();
      libro.actualizar('SemanaCatequista', s, { checkin_at: t, checkin_por: d.por, actualizado_at: t });
      libro.auditar(d.por, 'CHECKIN', 'SemanaCatequista', s.id, s.numero_inscripcion_semana);
      return { ok: true, yaHabiaEntrado: false, checkin_at: t, checkin_por: d.por };
    },
  },

  anular: {
    bajoBloqueo: function (libro, d) {
      var t = ahora_();
      var anularPagos = function (refId) {
        libro.tabla('Pagos').filas.filter(function (p) { return p.referencia_id === refId && p.estado !== 'ANULADO'; }).forEach(function (p) {
          libro.actualizar('Pagos', p, { estado: 'ANULADO', anulado_at: t, anulado_por: d.por, motivo_anulacion: d.motivo });
        });
      };
      if (d.tipo === 'catequista') {
        var c = libro.buscar('Catequistas', d.id);
        if (!c) throw fallo_('INEXISTENTE', 'Registro no encontrado.');
        if (c.estado === 'ANULADO') return { ok: true, yaAnulado: true };
        libro.actualizar('Catequistas', c, { estado: 'ANULADO', actualizado_at: t, notas_admin: (c.notas_admin ? c.notas_admin + ' | ' : '') + 'Anulado ' + t + ': ' + d.motivo });
        anularPagos(c.id);
        libro.tabla('SemanaCatequista').filas.filter(function (s) { return s.catequista_id === c.id && s.estado !== 'ANULADA'; }).forEach(function (s) {
          libro.actualizar('SemanaCatequista', s, { estado: 'ANULADA', actualizado_at: t });
          anularPagos(s.id);
        });
        libro.auditar(d.por, 'ANULAR', 'Catequistas', c.id, d.motivo);
      } else if (d.tipo === 'semana') {
        var s = libro.buscar('SemanaCatequista', d.id);
        if (!s) throw fallo_('INEXISTENTE', 'Inscripción no encontrada.');
        if (s.estado === 'ANULADA') return { ok: true, yaAnulado: true };
        libro.actualizar('SemanaCatequista', s, { estado: 'ANULADA', actualizado_at: t, notas_admin: (s.notas_admin ? s.notas_admin + ' | ' : '') + 'Anulada ' + t + ': ' + d.motivo });
        anularPagos(s.id);
        libro.auditar(d.por, 'ANULAR', 'SemanaCatequista', s.id, d.motivo);
      } else {
        throw fallo_('VALIDACION', 'Tipo no válido.');
      }
      return { ok: true };
    },
  },

  reenviarCorreo: {
    despues: function (res, d, prep, config, ss, sheetId) {
      var enviado;
      if (d.tipo === 'catequista') {
        var c = leerTabla_(ss, 'Catequistas').porId[d.id];
        if (!c) return error_('INEXISTENTE', 'Registro no encontrado.');
        if (c.estado !== 'ACTIVO') return error_('NO_ACTIVO', 'Solo se reenvía el correo de registros activos.');
        enviado = enviarRegistro_(ss, sheetId, config, c, '');
      } else {
        var s = leerTabla_(ss, 'SemanaCatequista').porId[d.id];
        if (!s) return error_('INEXISTENTE', 'Inscripción no encontrada.');
        if (s.estado === 'ANULADA') return error_('ANULADO', 'La inscripción está anulada.');
        enviado = enviarSemana_(ss, sheetId, config, s, d.pase, '');
      }
      escribirSueltos_(ss, sheetId, function (libro) { libro.auditar(d.por, 'REENVIAR', d.tipo, d.id, enviado ? 'enviado' : 'pendiente'); });
      return { ok: true, enviado: enviado };
    },
  },

  /** Envía el número al correo si existe; la respuesta nunca revela si existe. */
  recuperarNumero: {
    despues: function (res, d, prep, config, ss, sheetId) {
      var c = leerTabla_(ss, 'Catequistas').filas.filter(function (x) { return minus_(x.correo) === minus_(d.correo) && x.estado !== 'ANULADO'; })[0];
      if (c) enviarRecuperar_(ss, sheetId, config, c, '');
      return { ok: true };
    },
  },
};

// ---------------------------------------------------------------- Activadores

/** Reintenta los correos que quedaron PENDIENTE (cuota agotada o error transitorio). Cada hora. */
function procesarPendientes() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var ss = SpreadsheetApp.openById(sheetId);
  var config = leerConfig_(ss);
  var correos = leerTabla_(ss, 'Correos').filas.filter(function (c) { return c.estado === 'PENDIENTE'; });
  var cat = leerTabla_(ss, 'Catequistas').porId;
  var sem = leerTabla_(ss, 'SemanaCatequista').porId;
  for (var i = 0; i < correos.length; i++) {
    if (MailApp.getRemainingDailyQuota() <= 0) break;
    var m = correos[i];
    if (m.tipo === 'REGISTRO' && cat[m.referencia_id] && cat[m.referencia_id].estado === 'ACTIVO') enviarRegistro_(ss, sheetId, config, cat[m.referencia_id], m.id);
    else if (m.tipo === 'SEMANA' && sem[m.referencia_id] && sem[m.referencia_id].estado !== 'ANULADA') enviarSemana_(ss, sheetId, config, sem[m.referencia_id], '', m.id);
    else if (m.tipo === 'RECUPERAR' && cat[m.referencia_id]) enviarRecuperar_(ss, sheetId, config, cat[m.referencia_id], m.id);
    else escribirSueltos_(ss, sheetId, function (libro) { var f = libro.buscar('Correos', m.id); if (f) libro.actualizar('Correos', f, { estado: 'DESCARTADO', error: 'El registro ya no está vigente' }); });
  }
}

/** Copia diaria del libro a la carpeta DRIVE_RESPALDOS. */
function respaldoDiario() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var config = leerConfig_(SpreadsheetApp.openById(sheetId));
  var archivo = DriveApp.getFileById(sheetId);
  var sello = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd_HHmm');
  archivo.makeCopy(archivo.getName() + ' · respaldo ' + sello, DriveApp.getFolderById(config.DRIVE_RESPALDOS));
}

/** Ejecutar una vez desde el editor: crea (o recrea) los dos activadores. */
function instalarActivadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['procesarPendientes', 'respaldoDiario'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('procesarPendientes').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('respaldoDiario').timeBased().everyDays(1).atHour(2).inTimezone(ZONA).create();
}

/** Ejecutar una vez desde el editor para conceder los permisos (Drive, Sheets, Gmail). */
function autorizar() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = SpreadsheetApp.openById(sheetId);
  var config = leerConfig_(ss);
  DriveApp.getFolderById(config.DRIVE_RAIZ).getName();
  console.log('Libro: ' + ss.getName() + ' · cuota de correo restante: ' + MailApp.getRemainingDailyQuota());
}

// ---------------------------------------------------------------- Correos

function enviarRegistro_(ss, sheetId, config, c, correoId) {
  var url = urlSitio_(config);
  var adjuntos = [c.pdf_inscripcion_file_id, c.carnet_file_id].filter(String).map(function (id) { return DriveApp.getFileById(id).getBlob(); });
  var html = plantilla_(config, 'Bienvenido(a) a la Comisión de Catequesis',
    '<p>Hola, <strong>' + esc_(c.nombres) + '</strong>:</p>' +
    '<p>Tu registro como catequista quedó confirmado. Tu número es:</p>' +
    '<p style="font-size:26px;font-weight:700;letter-spacing:1px;color:#0E1B3D;margin:8px 0 16px">' + esc_(c.numero_catequista) + '</p>' +
    '<p>Adjuntamos tu ficha de inscripción y tu carnet en PDF. También puedes verlos en el portal del catequista entrando con tu correo y tu número:</p>' +
    boton_(url + '/portal/', 'Entrar al portal') +
    '<p style="color:#555;font-size:13px">Guarda este correo: tu número de catequista te servirá para entrar al portal y para inscribirte en la Semana del Catequista.</p>');
  return enviar_(ss, sheetId, config, {
    tipo: 'REGISTRO', referencia_id: c.id, para: c.correo, asunto: 'Bienvenido(a), catequista ' + c.numero_catequista,
    html: html, adjuntos: adjuntos, tabla: 'Catequistas', correoId: correoId,
  });
}

function enviarSemana_(ss, sheetId, config, s, paseB64, correoId) {
  var url = urlSitio_(config);
  var c = leerTabla_(ss, 'Catequistas').porId[s.catequista_id] || {};
  var inline = {};
  if (s.qr_file_id) inline.qr = DriveApp.getFileById(s.qr_file_id).getBlob();
  var adjuntos = paseB64 ? [Utilities.newBlob(Utilities.base64Decode(paseB64), 'application/pdf', s.numero_inscripcion_semana + '_pase.pdf')] : [];
  var html = plantilla_(config, 'Semana del Catequista ' + esc_(s.edicion),
    '<p>Hola, <strong>' + esc_(c.nombres || '') + '</strong>:</p>' +
    '<p>Tu inscripción quedó confirmada con el número <strong>' + esc_(s.numero_inscripcion_semana) + '</strong>.</p>' +
    '<table style="margin:8px 0 16px;font-size:15px"><tr><td style="color:#555;padding-right:12px">Fechas</td><td>' + esc_(config.SEMANA_FECHAS) + '</td></tr>' +
    '<tr><td style="color:#555;padding-right:12px">Sede</td><td>' + esc_(config.SEMANA_SEDE) + '</td></tr></table>' +
    (inline.qr ? '<p>Presenta este código QR en la entrada:</p><p><img src="cid:qr" alt="Código QR de tu pase" width="220" height="220"></p>' : '') +
    '<p>' + (adjuntos.length ? 'Adjuntamos tu pase en PDF. ' : '') + 'También lo encuentras en el portal del catequista.</p>' +
    boton_(url + '/portal/', 'Ver mi pase'));
  return enviar_(ss, sheetId, config, {
    tipo: 'SEMANA', referencia_id: s.id, para: s.correo, asunto: 'Inscripción confirmada · Semana del Catequista ' + s.edicion,
    html: html, adjuntos: adjuntos, inline: inline, tabla: 'SemanaCatequista', correoId: correoId,
  });
}

function enviarRecuperar_(ss, sheetId, config, c, correoId) {
  var url = urlSitio_(config);
  var html = plantilla_(config, 'Tu número de catequista',
    '<p>Hola, <strong>' + esc_(c.nombres) + '</strong>:</p>' +
    '<p>Pediste recordar tu número de catequista. Es:</p>' +
    '<p style="font-size:26px;font-weight:700;letter-spacing:1px;color:#0E1B3D;margin:8px 0 16px">' + esc_(c.numero_catequista) + '</p>' +
    boton_(url + '/portal/', 'Entrar al portal') +
    '<p style="color:#555;font-size:13px">Si no lo pediste, puedes ignorar este correo.</p>');
  return enviar_(ss, sheetId, config, { tipo: 'RECUPERAR', referencia_id: c.id, para: c.correo, asunto: 'Tu número de catequista: ' + c.numero_catequista, html: html, correoId: correoId });
}

/** Envía (si hay cuota) y deja constancia en Correos. Devuelve true si salió. */
function enviar_(ss, sheetId, config, m) {
  var enviado = false;
  var error = '';
  if (MailApp.getRemainingDailyQuota() <= 0) {
    error = 'Cuota diaria agotada';
  } else {
    try {
      var opciones = { to: m.para, subject: m.asunto, htmlBody: m.html, name: config.REMITENTE_NOMBRE || 'Comisión de Catequesis', attachments: m.adjuntos || [], inlineImages: m.inline || {} };
      if (config.CORREO_RESPUESTA) opciones.replyTo = config.CORREO_RESPUESTA;
      MailApp.sendEmail(opciones);
      enviado = true;
    } catch (err) {
      error = String(err && err.message ? err.message : err).slice(0, 300);
    }
  }
  var t = ahora_();
  escribirSueltos_(ss, sheetId, function (libro) {
    var previo = m.correoId && libro.buscar('Correos', m.correoId);
    var fila = { fecha: t, estado: enviado ? 'ENVIADO' : 'PENDIENTE', error: error };
    if (previo) libro.actualizar('Correos', previo, fila);
    else libro.insertar('Correos', { id: Utilities.getUuid(), fecha: t, destinatario: m.para, asunto: m.asunto, tipo: m.tipo, referencia_id: m.referencia_id, estado: fila.estado, error: error });
    if (enviado && m.tabla) {
      var ref = libro.buscar(m.tabla, m.referencia_id);
      if (ref) libro.actualizar(m.tabla, ref, { correo_enviado_at: t });
    }
  });
  return enviado;
}

function plantilla_(config, titulo, cuerpo) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1d1d1f;line-height:1.5">' +
    '<div style="background:#0E1B3D;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">' +
    '<div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.85">' + esc_(config.REMITENTE_NOMBRE || 'Comisión Arquidiocesana de Catequesis') + '</div>' +
    '<div style="font-size:20px;font-weight:700;margin-top:4px">' + titulo + '</div></div>' +
    '<div style="border:1px solid #e3e3e8;border-top:0;padding:20px 22px;border-radius:0 0 12px 12px">' + cuerpo + '</div>' +
    '<p style="font-size:12px;color:#777;text-align:center;margin-top:14px">Arquidiócesis de Panamá · Comisión de Catequesis</p></div>';
}

function boton_(href, texto) {
  return '<p style="margin:18px 0"><a href="' + esc_(href) + '" style="background:#F0B544;color:#0E1B3D;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:700;display:inline-block">' + esc_(texto) + '</a></p>';
}

function urlSitio_(config) {
  var p = PropertiesService.getScriptProperties().getProperty('URL_SITIO');
  var c = String(config.URL_SITIO || '');
  return (p || (/^https?:\/\//.test(c) ? c : '')).replace(/\/+$/, '');
}

// ---------------------------------------------------------------- Libro

/** Lee una pestaña como objetos (identidad por id, nunca por número de fila). */
function leerTabla_(ss, nombre) {
  var sh = ss.getSheetByName(nombre);
  if (!sh) throw new Error('No existe la pestaña ' + nombre);
  var valores = sh.getDataRange().getValues();
  var encabezados = (valores[0] || []).map(String);
  var filas = [];
  var porId = {};
  for (var i = 1; i < valores.length; i++) {
    if (valores[i].every(function (v) { return v === '' || v === null; })) continue;
    var o = { _fila: i };
    encabezados.forEach(function (h, j) { o[h] = celdaTexto_(valores[i][j]); });
    filas.push(o);
    if (o.id) porId[o.id] = o;
  }
  return { sh: sh, sheetId: sh.getSheetId(), encabezados: encabezados, filas: filas, porId: porId, siguienteFila: valores.length };
}

function celdaTexto_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function leerConfig_(ss) {
  var valores = ss.getSheetByName('Config').getDataRange().getValues();
  var c = {};
  for (var i = 1; i < valores.length; i++) if (valores[i][0]) c[String(valores[i][0]).trim()] = celdaTexto_(valores[i][1]).trim();
  return c;
}

/** Acumula cambios y los aplica en un único batchUpdate atómico con la nueva versión de _meta. */
function abrirLibro_(ss, sheetId) {
  var tablas = {};
  var solicitudes = [];
  var libro = {
    tabla: function (nombre) { return tablas[nombre] || (tablas[nombre] = leerTabla_(ss, nombre)); },
    buscar: function (nombre, id) { return id ? libro.tabla(nombre).porId[id] || null : null; },
    insertar: function (nombre, obj) {
      var t = libro.tabla(nombre);
      solicitudes.push({ appendCells: { sheetId: t.sheetId, rows: [{ values: t.encabezados.map(function (h) { return celda_(obj[h]); }) }], fields: 'userEnteredValue' } });
      var o = { _fila: t.siguienteFila++ };
      t.encabezados.forEach(function (h) { o[h] = celdaTexto_(obj[h]); });
      t.filas.push(o);
      if (o.id) t.porId[o.id] = o;
      return o;
    },
    actualizar: function (nombre, fila, campos) {
      var t = libro.tabla(nombre);
      Object.keys(campos).forEach(function (k) {
        var col = t.encabezados.indexOf(k);
        if (col < 0) throw new Error('No existe la columna ' + nombre + '.' + k);
        solicitudes.push({ updateCells: { range: { sheetId: t.sheetId, startRowIndex: fila._fila, endRowIndex: fila._fila + 1, startColumnIndex: col, endColumnIndex: col + 1 }, rows: [{ values: [celda_(campos[k])] }], fields: 'userEnteredValue' } });
        fila[k] = celdaTexto_(campos[k]);
      });
    },
    siguiente: function (nombre) {
      var t = libro.tabla('Secuencias');
      var s = t.filas.filter(function (x) { return x.nombre === nombre; })[0];
      if (!s) throw new Error('No existe la secuencia ' + nombre);
      var n = Math.max(1, Math.floor(numero_(s.siguiente)));
      var col = t.encabezados.indexOf('siguiente');
      solicitudes.push({ updateCells: { range: { sheetId: t.sheetId, startRowIndex: s._fila, endRowIndex: s._fila + 1, startColumnIndex: col, endColumnIndex: col + 1 }, rows: [{ values: [celda_(n + 1)] }], fields: 'userEnteredValue' } });
      s.siguiente = String(n + 1);
      var relleno = Math.max(1, Math.floor(numero_(s.relleno) || 1));
      var cifras = String(n);
      while (cifras.length < relleno) cifras = '0' + cifras;
      return s.prefijo + cifras;
    },
    auditar: function (actor, accion, entidad, entidadId, detalle) {
      libro.insertar('Auditoria', { id: Utilities.getUuid(), fecha: ahora_(), actor: actor || '', accion: accion, entidad: entidad, entidad_id: entidadId, detalle: String(detalle || '').slice(0, 500) });
    },
    confirmar: function () {
      if (!solicitudes.length) return;
      var meta = ss.getSheetByName('_meta');
      var version = numero_(meta.getRange('B1').getValue());
      solicitudes.push({ updateCells: { range: { sheetId: meta.getSheetId(), startRowIndex: 0, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 }, rows: [{ values: [celda_(version + 1)] }, { values: [celda_(ahora_())] }], fields: 'userEnteredValue' } });
      Sheets.Spreadsheets.batchUpdate({ requests: solicitudes }, sheetId);
      solicitudes = [];
    },
  };
  return libro;
}

/** Escrituras pequeñas fuera de una acción (registro de correos). Toman el bloqueo brevemente. */
function escribirSueltos_(ss, sheetId, fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) { console.error('No se pudo registrar en Correos/Auditoria: bloqueo ocupado'); return; }
  try {
    var libro = abrirLibro_(ss, sheetId);
    fn(libro);
    libro.confirmar();
  } finally {
    lock.releaseLock();
  }
}

/** Los textos se escriben como stringValue: nunca se interpretan como fórmulas. */
function celda_(v) {
  if (typeof v === 'number' && isFinite(v)) return { userEnteredValue: { numberValue: v } };
  if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
  return { userEnteredValue: { stringValue: v === null || v === undefined ? '' : String(v) } };
}

function comprobarPago_(libro, sha, referencia, semana) {
  var pagos = libro.tabla('Pagos').filas;
  if (pagos.some(function (p) { return p.comprobante_sha256 === sha; })) {
    throw fallo_('COMPROBANTE_REPETIDO', semana ? 'Este comprobante ya fue utilizado. Adjunta el comprobante de este pago.' : 'Este comprobante ya fue utilizado en otro registro. Adjunta el comprobante de tu propio pago.');
  }
  if (pagos.some(function (p) { return mayus_(p.yappy_referencia) === mayus_(referencia); })) {
    throw fallo_('REFERENCIA_REPETIDA', semana ? 'Esta referencia de Yappy ya fue registrada.' : 'Esta referencia de Yappy ya fue registrada. Revisa el número de confirmación de tu pago.');
  }
}

function pago_(tipo, refId, numero, monto, moneda, referencia, compId, sha, t) {
  return { id: Utilities.getUuid(), tipo: tipo, referencia_id: refId, numero_catequista: numero, monto: numero_(monto), moneda: moneda || 'B/.', metodo: 'YAPPY', yappy_referencia: referencia, comprobante_file_id: compId, comprobante_sha256: sha, estado: 'DECLARADO_AUTO', creado_at: t, anulado_at: '', anulado_por: '', motivo_anulacion: '' };
}

// ---------------------------------------------------------------- Drive

function subir_(carpetaId, archivo, nombre) {
  if (!carpetaId) throw new Error('Falta la carpeta de Drive en Config');
  var blob = Utilities.newBlob(Utilities.base64Decode(archivo.b64), archivo.mime, nombre);
  return DriveApp.getFolderById(carpetaId).createFile(blob);
}

function renombrar_(archivos, nombres) {
  archivos.forEach(function (f, i) { try { f.setName(nombres[i]); } catch (e) { console.error('No se pudo renombrar: ' + e); } });
}

function deshacer_(prep) {
  (prep && prep.archivos || []).forEach(function (f) { try { f.setTrashed(true); } catch (e) { /* nada */ } });
}

function extension_(mime) {
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mime] || '';
}

// ---------------------------------------------------------------- Utilidades

function ahora_() { return new Date().toISOString(); }

function vigencia_(meses) {
  var d = new Date();
  d.setMonth(d.getMonth() + (numero_(meses) || 12));
  return Utilities.formatDate(d, ZONA, 'yyyy-MM-dd');
}

function numero_(v) { return Number(String(v === undefined || v === null ? '' : v).replace(',', '.')) || 0; }
function esVerdadero_(v) { return ['TRUE', 'true', '1', 'si', 'sí', 'SI', 'SÍ'].indexOf(String(v).trim()) >= 0; }
function minus_(v) { return String(v || '').trim().toLowerCase(); }
function mayus_(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }
function esc_(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function fallo_(codigo, mensaje) { var e = new Error(mensaje); e.codigo = codigo; return e; }
function error_(codigo, mensaje) { return { ok: false, codigo: codigo, mensaje: mensaje }; }

function igualSeguro_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var dif = 0;
  for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
