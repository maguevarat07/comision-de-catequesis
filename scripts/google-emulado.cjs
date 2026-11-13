// Google emulado para desarrollo y pruebas: ejecuta el escritor real (apps-script/Code.gs)
// en Node con sustitutos en memoria de SpreadsheetApp, Sheets, DriveApp, MailApp, etc.
// La API real (api/_lib/app.js) lee esta hoja emulada y escribe a través de doPost(),
// con el mismo sobre firmado por HMAC que usa en producción.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ENCABEZADOS = {
  Catequistas: ['id', 'numero_catequista', 'estado', 'fecha_registro', 'nombres', 'apellidos', 'cedula', 'fecha_nacimiento', 'sexo', 'telefono', 'correo', 'direccion', 'parroquia', 'vicaria_zona', 'anios_servicio', 'nivel_que_imparte', 'formacion_cenafca', 'coordinador_parroquial', 'foto_file_id', 'firma_file_id', 'comprobante_file_id', 'yappy_referencia', 'comprobante_sha256', 'pdf_inscripcion_file_id', 'carnet_file_id', 'vigencia_hasta', 'correo_enviado_at', 'consentimiento_datos', 'consentimiento_imagen', 'creado_at', 'actualizado_at', 'notas_admin'],
  SemanaCatequista: ['id', 'numero_inscripcion_semana', 'catequista_id', 'numero_catequista', 'correo', 'edicion', 'estado', 'fecha_inscripcion', 'talla_camiseta', 'restricciones_alimentarias', 'comprobante_file_id', 'yappy_referencia', 'comprobante_sha256', 'qr_token', 'qr_file_id', 'correo_enviado_at', 'checkin_at', 'checkin_por', 'creado_at', 'actualizado_at', 'notas_admin'],
  Pagos: ['id', 'tipo', 'referencia_id', 'numero_catequista', 'monto', 'moneda', 'metodo', 'yappy_referencia', 'comprobante_file_id', 'comprobante_sha256', 'estado', 'creado_at', 'anulado_at', 'anulado_por', 'motivo_anulacion'],
  Correos: ['id', 'fecha', 'destinatario', 'asunto', 'tipo', 'referencia_id', 'estado', 'error'],
  Auditoria: ['id', 'fecha', 'actor', 'accion', 'entidad', 'entidad_id', 'detalle'],
};

const CONFIG_PRUEBA = {
  COSTO_REGISTRO: 1, COSTO_SEMANA: 1, MONEDA: 'B/.',
  YAPPY_DIRECTORIO: '@CatequesisPanama (emulado)', YAPPY_TELEFONO: '6000-0000',
  YAPPY_INSTRUCCIONES: 'Paga B/. 1.00 por Yappy y adjunta la captura del comprobante.',
  REGISTRO_ABIERTO: true, SEMANA_EDICION: 2026, SEMANA_SECUENCIA: 'SEMANA_2026', SEMANA_ABIERTA: true,
  SEMANA_FECHAS: 'Del 23 al 27 de noviembre de 2026 (emulado)', SEMANA_SEDE: 'Edificio San Pablo, Arzobispado de Panamá (emulado)',
  SEMANA_CUPO: 0, CARNET_VIGENCIA_MESES: 12,
  REMITENTE_NOMBRE: 'Comisión Arquidiocesana de Catequesis', CORREO_RESPUESTA: 'aovv.26@gmail.com',
  ADMIN_EMAILS: 'aovv.26@gmail.com,admin@ejemplo.com', VERIFICADORES_EMAILS: 'verificador@ejemplo.com',
  URL_SITIO: 'POR DEFINIR',
  DRIVE_RAIZ: 'carpeta_raiz', DRIVE_FOTOS: 'carpeta_fotos', DRIVE_FIRMAS: 'carpeta_firmas',
  DRIVE_COMPROBANTES_REGISTRO: 'carpeta_comp_registro', DRIVE_COMPROBANTES_SEMANA: 'carpeta_comp_semana',
  DRIVE_PDF_INSCRIPCION: 'carpeta_pdf', DRIVE_CARNETS: 'carpeta_carnets', DRIVE_QR: 'carpeta_qr', DRIVE_RESPALDOS: 'carpeta_respaldos',
};

function crearGoogleEmulado({ config = {}, cuotaCorreo = 100 } = {}) {
  const sheetId = 'libro_emulado';
  const secreto = crypto.randomBytes(32).toString('base64url');

  // ---------- Libro ----------
  const hojas = {};
  const idsHoja = {};
  let siguienteIdHoja = 100;
  const crearHoja = (nombre, filas) => { hojas[nombre] = filas; idsHoja[nombre] = siguienteIdHoja++; };
  for (const [n, cab] of Object.entries(ENCABEZADOS)) crearHoja(n, [cab.slice()]);
  crearHoja('Config', [['clave', 'valor', 'descripcion'], ...Object.entries({ ...CONFIG_PRUEBA, ...config }).map(([k, v]) => [k, v, ''])]);
  crearHoja('Secuencias', [['nombre', 'prefijo', 'siguiente', 'relleno', 'descripcion'], ['CATEQUISTA', 'CAT-', 1, 5, ''], ['SEMANA_2026', 'SEM26-', 1, 4, '']]);
  crearHoja('_meta', [['version', 0], ['ultima_escritura', ''], ['version_esquema', 1]]);
  const nombrePorId = () => Object.fromEntries(Object.entries(idsHoja).map(([n, i]) => [i, n]));

  const ultimaFilaConDatos = (filas) => {
    for (let i = filas.length - 1; i >= 0; i--) if (filas[i].some((v) => v !== '' && v !== null && v !== undefined)) return i + 1;
    return 0;
  };
  const valorCelda = (c) => {
    const u = (c && c.userEnteredValue) || {};
    if ('numberValue' in u) return u.numberValue;
    if ('boolValue' in u) return u.boolValue;
    return u.stringValue ?? '';
  };

  function hoja(nombre) {
    if (!hojas[nombre]) return null;
    return {
      getSheetId: () => idsHoja[nombre],
      getName: () => nombre,
      getLastRow: () => ultimaFilaConDatos(hojas[nombre]),
      getDataRange: () => ({ getValues: () => {
        const filas = hojas[nombre].slice(0, Math.max(1, ultimaFilaConDatos(hojas[nombre])));
        const ancho = Math.max(...filas.map((f) => f.length));
        return filas.map((f) => Array.from({ length: ancho }, (_, i) => (f[i] === undefined || f[i] === null ? '' : f[i])));
      } }),
      getRange: (a1) => {
        const m = /^([A-Z])(\d+)$/.exec(a1);
        const col = m[1].charCodeAt(0) - 65;
        const fila = Number(m[2]) - 1;
        return { getValue: () => (hojas[nombre][fila] || [])[col] ?? '' };
      },
    };
  }

  const Sheets = { Spreadsheets: { batchUpdate({ requests }, id) {
    if (id !== sheetId) throw new Error('Libro desconocido');
    const copia = JSON.parse(JSON.stringify(hojas)); // atómico: se aplica sobre una copia
    const porId = nombrePorId();
    for (const r of requests) {
      if (r.appendCells) {
        const filas = copia[porId[r.appendCells.sheetId]];
        let destino = ultimaFilaConDatos(filas);
        for (const fila of r.appendCells.rows) filas[destino++] = fila.values.map(valorCelda);
      } else if (r.updateCells) {
        const { range, rows } = r.updateCells;
        const filas = copia[porId[range.sheetId]];
        rows.forEach((fila, i) => {
          const f = (filas[range.startRowIndex + i] = filas[range.startRowIndex + i] || []);
          fila.values.forEach((c, j) => { f[range.startColumnIndex + j] = valorCelda(c); });
        });
      } else {
        throw new Error(`Solicitud no emulada: ${Object.keys(r)[0]}`);
      }
    }
    Object.assign(hojas, copia);
    return {};
  } } };

  // ---------- Drive ----------
  const archivos = new Map();
  const blob = (bytes, mime, nombre) => {
    const b = { bytes: Buffer.from(bytes), mime, nombre };
    return { getBytes: () => b.bytes, getContentType: () => b.mime, getName: () => b.nombre, setName(n) { b.nombre = n; return this; }, _b: b };
  };
  const archivo = (id) => {
    const a = archivos.get(id);
    if (!a) throw new Error(`No existe el archivo ${id}`);
    return {
      getId: () => id, getName: () => a.nombre,
      setName(n) { a.nombre = n; return this; },
      setTrashed(t) { a.papelera = !!t; return this; },
      getBlob: () => blob(a.bytes, a.mime, a.nombre),
      makeCopy(n) { const nid = `copia_${crypto.randomUUID()}`; archivos.set(nid, { ...a, nombre: n }); return archivo(nid); },
    };
  };
  const DriveApp = {
    getFolderById: (carpeta) => ({
      getName: () => carpeta,
      createFile(bl) { const id = `drv_${crypto.randomBytes(12).toString('hex')}`; archivos.set(id, { bytes: bl._b.bytes, mime: bl._b.mime, nombre: bl._b.nombre, carpeta, papelera: false }); return archivo(id); },
    }),
    getFileById: (id) => (id === sheetId ? { getName: () => 'Catequesis · Base de Registro (emulado)', makeCopy: () => ({}) } : archivo(id)),
  };

  // ---------- Gmail, caché, bloqueo, propiedades ----------
  const buzon = [];
  let cuota = cuotaCorreo;
  const MailApp = {
    getRemainingDailyQuota: () => cuota,
    sendEmail(o) {
      if (cuota <= 0) throw new Error('Service invoked too many times for one day: email.');
      cuota--;
      buzon.push({ para: o.to, asunto: o.subject, html: o.htmlBody, adjuntos: (o.attachments || []).map((a) => a.getName()), inline: Object.keys(o.inlineImages || {}), replyTo: o.replyTo, nombre: o.name });
    },
  };
  const cache = new Map();
  const CacheService = { getScriptCache: () => ({
    get: (k) => { const e = cache.get(k); return e && e.hasta > Date.now() ? e.v : null; },
    put: (k, v, s) => { cache.set(k, { v, hasta: Date.now() + (s || 600) * 1000 }); },
  }) };
  const props = new Map([['SHEET_ID', sheetId], ['WRITER_SECRET', secreto]]);
  const contexto = {
    console,
    Date, JSON, Math, Object, String, Number, Array, Error, isFinite, encodeURIComponent,
    SpreadsheetApp: { openById: (id) => { if (id !== sheetId) throw new Error('Libro desconocido'); return { getSheetByName: hoja, getName: () => 'Catequesis · Base de Registro (emulado)' }; } },
    Sheets, DriveApp, MailApp, CacheService,
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)) }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }), everyDays: () => ({ atHour: () => ({ inTimezone: () => ({ create: () => {} }) }) }) }) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      base64Decode: (s) => Buffer.from(s, 'base64'),
      computeHmacSha256Signature: (valor, clave) => crypto.createHmac('sha256', clave).update(valor).digest(),
      newBlob: (bytes, mime, nombre) => blob(bytes, mime, nombre),
      formatDate: (d, zona, fmt) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
        return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
      },
    },
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), contexto, { filename: 'Code.gs' });

  return {
    sheetId,
    secreto,
    buzon,
    archivos,
    hojas,
    gas: contexto,
    fijarCuota: (n) => { cuota = n; },
    /** Igual que la lectura con la cuenta de servicio: { pestaña: filas[][] }. */
    async leer(pestanas) {
      return Object.fromEntries(pestanas.map((p) => [p, hoja(p) ? hoja(p).getDataRange().getValues() : []]));
    },
    async descargar(id) {
      const a = archivos.get(id);
      return a && !a.papelera ? { mime: a.mime, nombre: a.nombre, bytes: a.bytes } : null;
    },
    /** Transporte del escritor: entrega el sobre firmado a doPost(). */
    async enviar(sobre) {
      return JSON.parse(contexto.doPost({ postData: { contents: sobre } }).getContent());
    },
  };
}

module.exports = { crearGoogleEmulado, ENCABEZADOS };
