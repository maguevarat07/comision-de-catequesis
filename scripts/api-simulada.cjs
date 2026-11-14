// API SIMULADA en memoria para desarrollar y probar el frontend sin Google.
// Implementa el mismo contrato que la API real (ver docs/API-CONTRATO.md): rutas, cuerpos,
// códigos de error, cookies de sesión, idempotencia y reglas antifraude.
// Los datos se pierden al reiniciar `npm run dev`. Nunca se publica: Vercel usa api/.

const crypto = require('node:crypto');
const territorio = require('../api/_lib/territorio.js');
const { diasDesdeCumple, diasHastaCumple, fechaCumple, edadQueCumple, hoyPanama } = require('../api/_lib/cumpleanos.js');

// Catálogo territorial: el inicial hasta la primera edición desde el panel (como la API real con la hoja vacía).
let terrFilas = null;
const terrActual = () => (terrFilas ? territorio.crearTerritorio(terrFilas, 'hoja') : territorio.BASE);

const FUERA = ['ANULADO', 'RECHAZADO']; // estados en los que el registro ya no existe para el catequista
const LIMITE_CUERPO = 4.5 * 1024 * 1024; // igual que Vercel
const SECRETO = crypto.randomBytes(32); // firma de tokens y cookies de esta sesión de desarrollo
const LATENCIA_MS = Number(process.env.SIM_LATENCIA_MS ?? 450);
const COOKIE_CAT = 'cat_sesion';
const COOKIE_STAFF = 'cat_staff';
const SESION_CAT_S = 2 * 3600;
const SESION_STAFF_S = 8 * 3600;

// ---------- Estado ----------

const config = {
  COSTO_REGISTRO: '1.00', COSTO_SEMANA: '1.00', MONEDA: 'B/.',
  YAPPY_DIRECTORIO: '@CatequesisPanama (simulado)', YAPPY_TELEFONO: '6000-0000',
  YAPPY_INSTRUCCIONES: 'Paga B/. 1.00 por Yappy y adjunta la captura del comprobante.',
  REGISTRO_ABIERTO: 'TRUE', SEMANA_EDICION: '2026', SEMANA_SECUENCIA: 'SEMANA_2026', SEMANA_ABIERTA: 'TRUE',
  SEMANA_FECHAS: 'Del 23 al 27 de noviembre de 2026 (simulado)', SEMANA_SEDE: 'Edificio San Pablo, Arzobispado de Panamá (simulado)',
  SEMANA_CUPO: '0', SEMANA_PEDIR_TALLA: 'TRUE', SEMANA_PEDIR_RESTRICCIONES: 'TRUE', CARNET_VIGENCIA_MESES: '12',
  REQUIERE_APROBACION: 'TRUE',
  REMITENTE_NOMBRE: 'Comisión Arquidiocesana de Catequesis', CORREO_RESPUESTA: 'aovv.26@gmail.com',
  ADMIN_EMAILS: 'aovv.26@gmail.com,admin@ejemplo.com', VERIFICADORES_EMAILS: 'verificador@ejemplo.com',
  URL_SITIO: 'http://127.0.0.1:4173',
};

const db = { Catequistas: [], SemanaCatequista: [], Pagos: [], Correos: [], Auditoria: [] };
const archivos = new Map(); // id → { mime, bytes }
const secuencias = { CATEQUISTA: { prefijo: 'CAT-', siguiente: 1, relleno: 5 }, SEMANA_2026: { prefijo: 'SEM26-', siguiente: 1, relleno: 4 } };
const idempotencia = new Map(); // clave → { status, cuerpo, cookies }
const sesiones = new Map(); // sid → { tipo, id|email, rol, exp }
const intentos = new Map(); // correo|ip → { n, hasta }
let cuotaCorreo = 100;

const ahora = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const bool = (v) => ['TRUE', 'true', '1', 'si', 'sí'].includes(String(v).trim());
const num = (v) => Number(String(v).replace(',', '.')) || 0;
const lista = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function siguienteNumero(nombre) {
  const s = secuencias[nombre];
  const n = s.siguiente++;
  return s.prefijo + String(n).padStart(s.relleno, '0');
}

// ---------- Tokens firmados (mismo formato que usará la API real) ----------

const b64u = (b) => Buffer.from(b).toString('base64url');
function firmarToken(payload) {
  const datos = b64u(JSON.stringify(payload));
  const firma = crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url').slice(0, 22);
  return `${datos}.${firma}`;
}
function leerToken(token) {
  const [datos, firma] = String(token || '').split('.');
  if (!datos || !firma) return null;
  const esperado = crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url').slice(0, 22);
  if (esperado.length !== firma.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(firma))) return null;
  try { return JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')); } catch { return null; }
}

// ---------- PDF mínimo (marcador de posición; la API real usa pdf-lib) ----------

function pdfSimple(titulo, lineas) {
  const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\xFF]/g, '?');
  const texto = [`BT /F1 20 Tf 50 740 Td (${esc(titulo)}) Tj ET`, ...lineas.map((l, i) => `BT /F1 12 Tf 50 ${700 - i * 20} Td (${esc(l)}) Tj ET`),
    'BT /F1 10 Tf 50 60 Td (Documento SIMULADO: el PDF definitivo se genera al conectar Google.) Tj ET'].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(texto, 'latin1')} >>\nstream\n${texto}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---------- Utilidades HTTP ----------

class Fallo extends Error {
  constructor(status, codigo, mensaje, campos) { super(mensaje); this.status = status; this.codigo = codigo; this.campos = campos; }
}
const fallo = (status, codigo, mensaje, campos) => { throw new Fallo(status, codigo, mensaje, campos); };

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
}
function cookieSesion(nombre, valor, maxAge) {
  return `${nombre}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
function crearSesion(datos, maxAge) {
  const sid = crypto.randomBytes(24).toString('base64url');
  sesiones.set(sid, { ...datos, exp: Date.now() + maxAge * 1000 });
  return sid;
}
function sesion(req, nombre, tipo) {
  const sid = cookies(req)[nombre];
  const s = sid && sesiones.get(sid);
  if (!s || s.tipo !== tipo || s.exp < Date.now()) return null;
  return s;
}
function catequistaSesion(req) {
  const s = sesion(req, COOKIE_CAT, 'catequista');
  const c = s && db.Catequistas.find((x) => x.id === s.id);
  return c && !FUERA.includes(c.estado) ? c : null;
}
function staffSesion(req) {
  const s = sesion(req, COOKIE_STAFF, 'staff');
  if (!s) return null;
  const rol = lista(config.ADMIN_EMAILS).includes(s.email) ? 'admin' : lista(config.VERIFICADORES_EMAILS).includes(s.email) ? 'verificador' : null;
  return rol ? { email: s.email, rol } : null; // los roles se releen en cada petición
}
function exigirAdmin(req) {
  const s = staffSesion(req);
  if (!s) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
  if (s.rol !== 'admin') fallo(403, 'PROHIBIDO', 'Tu cuenta solo puede verificar pases.');
  return s;
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > LIMITE_CUERPO) { reject(new Fallo(413, 'DEMASIADO_GRANDE', 'Los archivos son demasiado grandes. Vuelve a intentarlo; la página los comprimirá.')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8'))); } catch { reject(new Fallo(400, 'JSON', 'Solicitud no válida.')); }
    });
    req.on('error', reject);
  });
}

function guardarDataUrl(dataUrl, tiposPermitidos, maxBytes, etiqueta) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) fallo(400, 'VALIDACION', `${etiqueta}: archivo no válido.`, { [etiqueta]: 'Archivo no válido' });
  if (!tiposPermitidos.includes(m[1])) fallo(400, 'VALIDACION', `${etiqueta}: formato no permitido.`);
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > maxBytes) fallo(400, 'VALIDACION', `${etiqueta}: el archivo supera el tamaño máximo.`);
  // Firma mágica: JPEG FF D8 FF, PNG 89 50 4E 47, WEBP "RIFF....WEBP"
  const ok = (m[1] === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) || (m[1] === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50) || (m[1] === 'image/webp' && bytes.subarray(8, 12).toString() === 'WEBP');
  if (!ok) fallo(400, 'VALIDACION', `${etiqueta}: el contenido no coincide con el tipo de archivo.`);
  return { mime: m[1], bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function guardarArchivo(a) {
  const id = 'sim_' + uid();
  archivos.set(id, a);
  return id;
}

const RE_CEDULA = /^(?:(?:[1-9]|1[0-3])(?:AV|PI)?|PE|E|N)-\d{1,4}-\d{1,6}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const texto = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const normCorreo = (v) => texto(v, 160).toLowerCase();
const normCedula = (v) => texto(v, 20).toUpperCase().replace(/\s+/g, '');
const normTel = (v) => String(v || '').replace(/\D/g, '').replace(/^507(?=\d{7,8}$)/, '');
function normNumero(v) {
  const m = String(v || '').trim().toUpperCase().match(/^(?:CAT)?[\s-]*0*(\d{1,7})$/);
  return m && Number(m[1]) > 0 ? `CAT-${m[1].padStart(5, '0')}` : '';
}
const normRef = (v) => texto(v, 40).toUpperCase().replace(/\s+/g, '');

function auditar(actor, accion, entidad, entidad_id, detalle) {
  db.Auditoria.push({ id: uid(), fecha: ahora(), actor, accion, entidad, entidad_id, detalle });
}
function enviarCorreo(destinatario, asunto, tipo, referencia_id) {
  const sale = cuotaCorreo > 0;
  if (sale) cuotaCorreo--;
  db.Correos.push({ id: uid(), fecha: ahora(), destinatario, asunto, tipo, referencia_id, estado: sale ? 'ENVIADO_SIMULADO' : 'PENDIENTE', error: sale ? '' : 'Cuota diaria agotada' });
  console.log(`[api-simulada] correo ${sale ? 'simulado' : 'PENDIENTE'} → ${destinatario}: ${asunto}`);
  return sale;
}

function urlVerificacionCarnet(c) {
  return `${config.URL_SITIO}/verificar/?c=${firmarToken({ k: 'c', i: c.id })}`;
}
function urlVerificacionPase(s) {
  return `${config.URL_SITIO}/verificar/?t=${s.qr_token}`;
}
const nombreDe = (c) => `${c.nombres} ${c.apellidos}`.trim();

function vigencia(desde = new Date()) {
  const d = new Date(desde);
  d.setMonth(d.getMonth() + num(config.CARNET_VIGENCIA_MESES || 12));
  return d.toISOString().slice(0, 10);
}

function generarDocumentosCatequista(c) {
  const pdf = pdfSimple('Ficha de Inscripción de Catequista', [`Número: ${c.numero_catequista}`, `Nombre: ${nombreDe(c)}`, `Cédula: ${c.cedula}`, `Parroquia: ${c.parroquia}`, `Vicaría: ${c.vicaria_zona}`, `Registro: ${c.fecha_registro}`, `Referencia Yappy: ${c.yappy_referencia}`]);
  const carnet = pdfSimple('Carnet de Catequista (CR80)', [`${nombreDe(c)} · ${c.numero_catequista}`, `Vigente hasta ${c.vigencia_hasta}`, urlVerificacionCarnet(c)]);
  c.pdf_inscripcion_file_id = guardarArchivo({ mime: 'application/pdf', bytes: pdf, nombre: `${c.numero_catequista}_inscripcion.pdf` });
  c.carnet_file_id = guardarArchivo({ mime: 'application/pdf', bytes: carnet, nombre: `${c.numero_catequista}_carnet.pdf` });
  // Igual que el escritor: ACTIVO solo si ya estaba aprobado o Config no exige aprobación.
  c.estado = c.estado === 'ACTIVO' || c.revisado_at || !bool(config.REQUIERE_APROBACION) ? 'ACTIVO' : 'PENDIENTE_APROBACION';
  c.actualizado_at = ahora();
}

/** Correo según el estado del registro: carnet (ACTIVO), recibido (por aprobar) o rechazo. */
function correoRegistro(c) {
  const asunto = { ACTIVO: `Bienvenido(a), catequista ${c.numero_catequista}`, PENDIENTE_APROBACION: `Recibimos tu registro · ${c.numero_catequista}`, RECHAZADO: `Tu registro de catequista ${c.numero_catequista} necesita correcciones` }[c.estado];
  const tipo = { ACTIVO: 'REGISTRO', PENDIENTE_APROBACION: 'RECIBIDO', RECHAZADO: 'RECHAZO' }[c.estado];
  if (!asunto) return false;
  const enviado = enviarCorreo(c.correo, asunto, tipo, c.id);
  if (enviado && c.estado === 'ACTIVO') c.correo_enviado_at = ahora();
  return enviado;
}

// ---------- Vistas públicas ----------

function semanaPublica() {
  const edicion = config.SEMANA_EDICION;
  const inscritos = db.SemanaCatequista.filter((s) => s.edicion === edicion && s.estado !== 'ANULADA').length;
  const cupo = num(config.SEMANA_CUPO);
  return {
    edicion, abierta: bool(config.SEMANA_ABIERTA), fechas: config.SEMANA_FECHAS, sede: config.SEMANA_SEDE,
    cupo, inscritos, hayCupo: cupo === 0 || inscritos < cupo, costo: num(config.COSTO_SEMANA), moneda: config.MONEDA,
    campos: { talla: bool(config.SEMANA_PEDIR_TALLA), restricciones: bool(config.SEMANA_PEDIR_RESTRICCIONES) },
  };
}

function configPublica() {
  return {
    modo: 'simulado', googleClientId: '', urlSitio: config.URL_SITIO,
    registroAbierto: bool(config.REGISTRO_ABIERTO), costoRegistro: num(config.COSTO_REGISTRO), costoSemana: num(config.COSTO_SEMANA), moneda: config.MONEDA,
    yappy: { directorio: config.YAPPY_DIRECTORIO, telefono: config.YAPPY_TELEFONO, instrucciones: config.YAPPY_INSTRUCCIONES },
    semana: semanaPublica(),
  };
}

function vistaPortal(c) {
  const sp = semanaPublica();
  const insc = db.SemanaCatequista.find((s) => s.catequista_id === c.id && s.edicion === sp.edicion && s.estado !== 'ANULADA');
  return {
    catequista: {
      numero: c.numero_catequista, nombres: c.nombres, apellidos: c.apellidos, correo: c.correo, telefono: c.telefono,
      parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, zona_pastoral: terrActual().clasificar(c).zona.replace(territorio.SIN_CLASIFICAR, ''), cumpleanosHoy: c.estado === 'ACTIVO' && diasDesdeCumple(c.fecha_nacimiento) === 0, estado: c.estado, fecha_registro: c.fecha_registro, vigencia_hasta: c.vigencia_hasta,
      fotoUrl: c.foto_file_id ? '/api/portal/archivo/foto' : '', firmaUrl: c.firma_file_id ? '/api/portal/archivo/firma' : '',
      verificacionUrl: urlVerificacionCarnet(c),
    },
    documentos: {
      pdf: c.pdf_inscripcion_file_id ? '/api/portal/archivo/pdf' : '',
      carnet: c.carnet_file_id && c.estado === 'ACTIVO' ? '/api/portal/archivo/carnet' : '',
    },
    semana: {
      ...sp,
      puedeInscribirse: c.estado === 'ACTIVO' && sp.abierta && sp.hayCupo && !insc,
      inscripcion: insc ? {
        numero: insc.numero_inscripcion_semana, estado: insc.estado, fecha: insc.fecha_inscripcion, talla: insc.talla_camiseta,
        restricciones: insc.restricciones_alimentarias, verificacionUrl: urlVerificacionPase(insc), checkin_at: insc.checkin_at,
        pase: insc.pase_file_id ? '/api/portal/archivo/pase' : '',
      } : null,
    },
  };
}

// ---------- Rutas ----------

const rutas = [];
const ruta = (metodo, patron, fn, opciones = {}) => rutas.push({ metodo, patron, fn, ...opciones });

ruta('GET', /^\/api\/salud$/, () => ({ ok: true, modo: 'simulado', configLeida: true, hora: ahora() }));
ruta('GET', /^\/api\/config-publica$/, () => ({ ok: true, config: configPublica() }));
ruta('GET', /^\/api\/territorio$/, () => ({ ok: true, ...terrActual().catalogoPublico() }));

// Registro de catequista
ruta('POST', /^\/api\/registro$/, async (req, ctx) => {
  if (!bool(config.REGISTRO_ABIERTO)) fallo(409, 'CERRADO', 'El registro de catequistas está cerrado en este momento.');
  const b = ctx.cuerpo;
  const d = b.datos || {};
  const campos = {};
  const req2 = (k, ok, msg) => { if (!ok) campos[k] = msg; };
  const datos = {
    nombres: texto(d.nombres, 80), apellidos: texto(d.apellidos, 80), cedula: normCedula(d.cedula), fecha_nacimiento: texto(d.fecha_nacimiento, 10),
    sexo: texto(d.sexo, 20), telefono: normTel(d.telefono), correo: normCorreo(d.correo), direccion: texto(d.direccion, 200),
    anios_servicio: Math.max(0, Math.min(80, Math.floor(num(d.anios_servicio)))),
    nivel_que_imparte: (Array.isArray(d.nivel_que_imparte) ? d.nivel_que_imparte : [d.nivel_que_imparte]).map((x) => texto(x, 60)).filter(Boolean).slice(0, 10).join('; '),
    formacion_cenafca: texto(d.formacion_cenafca, 60), coordinador_parroquial: texto(d.coordinador_parroquial, 120),
    yappy_referencia: normRef(d.yappy_referencia),
  };
  const lugar = terrActual().resolverParroquia(d);
  if (lugar.error) Object.assign(campos, lugar.error);
  else Object.assign(datos, { parroquia: lugar.parroquia, vicaria_zona: lugar.vicaria_zona, zona_pastoral: lugar.zona_pastoral, coordinador_parroquial: datos.coordinador_parroquial || lugar.coordinador });
  req2('nombres', datos.nombres.length >= 2, 'Escribe tus nombres.');
  req2('apellidos', datos.apellidos.length >= 2, 'Escribe tus apellidos.');
  req2('cedula', RE_CEDULA.test(datos.cedula), 'Cédula con formato no válido.');
  req2('fecha_nacimiento', /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha_nacimiento), 'Fecha no válida.');
  req2('sexo', ['Femenino', 'Masculino'].includes(datos.sexo), 'Selecciona una opción.');
  req2('telefono', /^6\d{7}$/.test(datos.telefono), 'El celular debe tener 8 dígitos y empezar por 6.');
  req2('correo', RE_CORREO.test(datos.correo), 'Correo no válido.');
  req2('nivel_que_imparte', !!datos.nivel_que_imparte, 'Selecciona al menos un nivel.');
  req2('formacion_cenafca', !!datos.formacion_cenafca, 'Selecciona una opción.');
  req2('yappy_referencia', /^[A-Z0-9-]{4,40}$/.test(datos.yappy_referencia), 'Referencia de Yappy no válida.');
  req2('consentimiento_datos', d.consentimiento_datos === true, 'Debes aceptar el tratamiento de datos.');
  req2('consentimiento_imagen', d.consentimiento_imagen === true, 'Debes aceptar el uso de la foto.');
  if (Object.keys(campos).length) fallo(400, 'VALIDACION', 'Revisa los datos marcados.', campos);

  const foto = guardarDataUrl(b.foto, ['image/jpeg'], 700 * 1024, 'foto');
  const firma = guardarDataUrl(b.firma, ['image/png'], 700 * 1024, 'firma');
  const comp = guardarDataUrl(b.comprobante, ['image/jpeg', 'image/png', 'image/webp'], 2.5 * 1024 * 1024, 'comprobante');
  if (b.comprobante_sha256 && b.comprobante_sha256 !== comp.sha256) fallo(400, 'VALIDACION', 'El comprobante llegó dañado. Vuelve a adjuntarlo.');

  // Unicidad: mensaje que no revela qué dato coincidió.
  // Un registro rechazado (y su pago) no bloquea un registro nuevo corregido.
  if (db.Catequistas.some((c) => c.estado !== 'RECHAZADO' && (c.correo === datos.correo || c.cedula === datos.cedula))) {
    fallo(409, 'DUPLICADO', 'Ya existe un registro con estos datos. Si ya te registraste, puedes recuperar tu número de catequista por correo.');
  }
  const pagosVigentes = db.Pagos.filter((p) => p.estado !== 'RECHAZADO');
  if (pagosVigentes.some((p) => p.comprobante_sha256 === comp.sha256)) fallo(409, 'COMPROBANTE_REPETIDO', 'Este comprobante ya fue utilizado en otro registro. Adjunta el comprobante de tu propio pago.');
  if (pagosVigentes.some((p) => p.yappy_referencia === datos.yappy_referencia)) fallo(409, 'REFERENCIA_REPETIDA', 'Esta referencia de Yappy ya fue registrada. Revisa el número de confirmación de tu pago.');

  // 1) Escritor: archivos + consecutivo + fila PENDIENTE_DOCUMENTOS
  const id = uid();
  const numero = siguienteNumero('CATEQUISTA');
  const t = ahora();
  const c = {
    id, numero_catequista: numero, estado: 'PENDIENTE_DOCUMENTOS', fecha_registro: t, ...datos,
    foto_file_id: guardarArchivo({ ...foto, nombre: `${numero}_foto.jpg` }), firma_file_id: guardarArchivo({ ...firma, nombre: `${numero}_firma.png` }),
    comprobante_file_id: guardarArchivo({ ...comp, nombre: `${numero}_yappy.jpg` }), comprobante_sha256: comp.sha256,
    pdf_inscripcion_file_id: '', carnet_file_id: '', vigencia_hasta: vigencia(), correo_enviado_at: '',
    consentimiento_datos: t, consentimiento_imagen: t, creado_at: t, actualizado_at: t, notas_admin: '',
    revisado_at: '', revisado_por: '', motivo_rechazo: '',
  };
  db.Catequistas.push(c);
  db.Pagos.push({ id: uid(), tipo: 'REGISTRO', referencia_id: id, numero_catequista: numero, monto: num(config.COSTO_REGISTRO), moneda: config.MONEDA, metodo: 'YAPPY', yappy_referencia: datos.yappy_referencia, comprobante_file_id: c.comprobante_file_id, comprobante_sha256: comp.sha256, estado: 'DECLARADO_AUTO', creado_at: t, anulado_at: '', anulado_por: '', motivo_anulacion: '' });
  auditar(datos.correo, 'REGISTRO', 'Catequistas', id, numero);

  // 2) y 3) Documentos + estado (PENDIENTE_APROBACION o ACTIVO) + correo (en la API real pueden fallar y quedar pendientes)
  let correoEnviado = false;
  if (process.env.SIM_FALLAR_DOCUMENTOS !== '1') {
    generarDocumentosCatequista(c);
    correoEnviado = correoRegistro(c);
  }

  const sid = crearSesion({ tipo: 'catequista', id }, SESION_CAT_S);
  ctx.cookies.push(cookieSesion(COOKIE_CAT, sid, SESION_CAT_S));
  return {
    ok: true, numero, estado: c.estado, correoEnviado, correo: c.correo, parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, zona_pastoral: c.zona_pastoral,
    documentos: { pdf: c.pdf_inscripcion_file_id ? '/api/portal/archivo/pdf' : '', carnet: c.carnet_file_id && c.estado === 'ACTIVO' ? '/api/portal/archivo/carnet' : '' },
  };
}, { idempotente: true });

function limitarIntentos(clave) {
  const r = intentos.get(clave);
  if (r && r.hasta > Date.now() && r.n >= 5) fallo(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.');
}
function registrarFallo(clave) {
  const r = intentos.get(clave);
  const vigente = r && r.hasta > Date.now();
  intentos.set(clave, { n: vigente ? r.n + 1 : 1, hasta: vigente ? r.hasta : Date.now() + 15 * 60 * 1000 });
}

ruta('POST', /^\/api\/recuperar$/, async (req, ctx) => {
  const correo = normCorreo(ctx.cuerpo.correo);
  if (!RE_CORREO.test(correo)) fallo(400, 'VALIDACION', 'Escribe un correo válido.', { correo: 'Correo no válido' });
  limitarIntentos('rec:' + correo);
  registrarFallo('rec:' + correo);
  const c = db.Catequistas.find((x) => x.correo === correo && !FUERA.includes(x.estado));
  if (c) enviarCorreo(c.correo, `Tu número de catequista: ${c.numero_catequista}`, 'RECUPERAR', c.id);
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, mensaje: 'Si el correo está registrado, recibirás tu número de catequista en unos minutos. Revisa también la carpeta de spam.' };
});

// Portal del catequista
ruta('POST', /^\/api\/portal\/entrar$/, async (req, ctx) => {
  const correo = normCorreo(ctx.cuerpo.correo);
  const numero = normNumero(ctx.cuerpo.numero);
  const claves = ['acc:' + correo, 'ip:' + ctx.ip];
  claves.forEach(limitarIntentos);
  const c = db.Catequistas.find((x) => x.correo === correo && x.numero_catequista === numero && !FUERA.includes(x.estado));
  await new Promise((r) => setTimeout(r, 600)); // espera fija, con y sin acierto
  if (!c) {
    claves.forEach(registrarFallo);
    fallo(401, 'CREDENCIALES', 'No pudimos validar los datos. Revisa tu correo y tu número de catequista.');
  }
  claves.forEach((k) => intentos.delete(k));
  const sid = crearSesion({ tipo: 'catequista', id: c.id }, SESION_CAT_S);
  ctx.cookies.push(cookieSesion(COOKIE_CAT, sid, SESION_CAT_S));
  return { ok: true };
});
ruta('POST', /^\/api\/portal\/salir$/, (req, ctx) => {
  const sid = cookies(req)[COOKIE_CAT];
  if (sid) sesiones.delete(sid);
  ctx.cookies.push(cookieSesion(COOKIE_CAT, '', 0));
  return { ok: true };
});
ruta('GET', /^\/api\/portal\/yo$/, (req) => {
  const c = catequistaSesion(req);
  if (!c) fallo(401, 'NO_AUTENTICADO', 'Tu sesión terminó. Vuelve a entrar.');
  return { ok: true, ...vistaPortal(c) };
});
ruta('GET', /^\/api\/portal\/archivo\/(foto|firma|pdf|carnet|pase)$/, (req, ctx) => {
  const c = catequistaSesion(req);
  if (!c) fallo(401, 'NO_AUTENTICADO', 'Tu sesión terminó. Vuelve a entrar.');
  const clave = ctx.m[1];
  if (clave === 'carnet' && c.estado !== 'ACTIVO') fallo(404, 'INEXISTENTE', 'Tu carnet estará disponible cuando la Comisión apruebe tu registro.');
  let fileId = { foto: c.foto_file_id, firma: c.firma_file_id, pdf: c.pdf_inscripcion_file_id, carnet: c.carnet_file_id }[clave];
  if (clave === 'pase') fileId = db.SemanaCatequista.find((s) => s.catequista_id === c.id && s.edicion === config.SEMANA_EDICION && s.estado !== 'ANULADA')?.pase_file_id;
  return { archivo: fileId, descarga: clave === 'pdf' || clave === 'carnet' || clave === 'pase' };
});

// Semana del Catequista
ruta('POST', /^\/api\/semana\/inscribir$/, async (req, ctx) => {
  const c = catequistaSesion(req);
  if (!c) fallo(401, 'NO_AUTENTICADO', 'Tu sesión terminó. Vuelve a entrar.');
  if (c.estado !== 'ACTIVO') fallo(403, 'NO_ACTIVO', 'Tu registro aún no está activo. Contacta a la Comisión.');
  const sp = semanaPublica();
  if (!sp.abierta) fallo(409, 'CERRADO', 'La inscripción a la Semana del Catequista está cerrada.');
  if (!sp.hayCupo) fallo(409, 'SIN_CUPO', 'Se agotaron los cupos de esta edición.');
  if (db.SemanaCatequista.some((s) => s.catequista_id === c.id && s.edicion === sp.edicion && s.estado !== 'ANULADA')) fallo(409, 'YA_INSCRITO', 'Ya estás inscrito(a) en esta edición.');
  const b = ctx.cuerpo;
  const campos = {};
  const tel = normTel(b.telefono);
  if (!/^6\d{7}$/.test(tel)) campos.telefono = 'El celular debe tener 8 dígitos y empezar por 6.';
  const ref = normRef(b.yappy_referencia);
  if (!/^[A-Z0-9-]{4,40}$/.test(ref)) campos.yappy_referencia = 'Referencia de Yappy no válida.';
  if (sp.campos.talla && !['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(b.talla_camiseta)) campos.talla_camiseta = 'Selecciona una talla.';
  if (Object.keys(campos).length) fallo(400, 'VALIDACION', 'Revisa los datos marcados.', campos);
  const comp = guardarDataUrl(b.comprobante, ['image/jpeg', 'image/png', 'image/webp'], 2.5 * 1024 * 1024, 'comprobante');
  if (db.Pagos.some((p) => p.comprobante_sha256 === comp.sha256)) fallo(409, 'COMPROBANTE_REPETIDO', 'Este comprobante ya fue utilizado. Adjunta el comprobante de este pago.');
  if (db.Pagos.some((p) => p.yappy_referencia === ref)) fallo(409, 'REFERENCIA_REPETIDA', 'Esta referencia de Yappy ya fue registrada.');

  const id = uid();
  const numero = siguienteNumero(config.SEMANA_SECUENCIA);
  const t = ahora();
  const s = {
    id, numero_inscripcion_semana: numero, catequista_id: c.id, numero_catequista: c.numero_catequista, correo: c.correo, edicion: sp.edicion,
    estado: 'CONFIRMADA', fecha_inscripcion: t, talla_camiseta: sp.campos.talla ? b.talla_camiseta : '', restricciones_alimentarias: sp.campos.restricciones ? texto(b.restricciones_alimentarias, 300) : '',
    comprobante_file_id: guardarArchivo({ ...comp, nombre: `${numero}_yappy.jpg` }), yappy_referencia: ref, comprobante_sha256: comp.sha256,
    qr_token: firmarToken({ k: 't', i: id, n: c.numero_catequista, e: sp.edicion }), qr_file_id: '', correo_enviado_at: '', checkin_at: '', checkin_por: '',
    creado_at: t, actualizado_at: t, notas_admin: '',
  };
  s.pase_file_id = guardarArchivo({ mime: 'application/pdf', bytes: pdfSimple(`Pase de acceso · Semana del Catequista ${sp.edicion}`, [nombreDe(c), `${c.numero_catequista} · ${numero}`, sp.fechas, sp.sede]), nombre: `${numero}_pase.pdf` });
  db.SemanaCatequista.push(s);
  db.Pagos.push({ id: uid(), tipo: 'SEMANA', referencia_id: id, numero_catequista: c.numero_catequista, monto: num(config.COSTO_SEMANA), moneda: config.MONEDA, metodo: 'YAPPY', yappy_referencia: ref, comprobante_file_id: s.comprobante_file_id, comprobante_sha256: comp.sha256, estado: 'DECLARADO_AUTO', creado_at: t, anulado_at: '', anulado_por: '', motivo_anulacion: '' });
  if (tel !== c.telefono) { c.telefono = tel; c.actualizado_at = t; }
  if (enviarCorreo(c.correo, `Inscripción confirmada · Semana del Catequista ${sp.edicion}`, 'SEMANA', id)) s.correo_enviado_at = ahora();
  auditar(c.correo, 'INSCRIPCION_SEMANA', 'SemanaCatequista', id, numero);
  return { ok: true, numero, verificacionUrl: urlVerificacionPase(s), correoEnviado: !!s.correo_enviado_at };
}, { idempotente: true });

// Verificación pública
ruta('GET', /^\/api\/verificar$/, (req, ctx) => {
  const staff = staffSesion(req);
  const tc = ctx.url.searchParams.get('c');
  const tt = ctx.url.searchParams.get('t');
  const p = leerToken(tc || tt);
  const tipo = tc ? 'carnet' : 'pase';
  if (!p || (tc && p.k !== 'c') || (tt && p.k !== 't')) return { ok: true, tipo, estado: 'INEXISTENTE', staff: !!staff };
  if (p.k === 'c') {
    const c = db.Catequistas.find((x) => x.id === p.i);
    if (!c) return { ok: true, tipo, estado: 'INEXISTENTE', staff: !!staff };
    const vencido = c.vigencia_hasta && c.vigencia_hasta < ahora().slice(0, 10);
    const estado = FUERA.includes(c.estado) ? 'ANULADO' : vencido ? 'VENCIDO' : c.estado === 'ACTIVO' ? 'VALIDO' : 'PENDIENTE';
    return { ok: true, tipo, estado, staff: !!staff, publico: { numero: c.numero_catequista, vigencia_hasta: c.vigencia_hasta },
      detalle: staff ? { nombre: nombreDe(c), numero: c.numero_catequista, parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, fotoUrl: `/api/admin/archivo/catequistas/${c.id}/foto` } : undefined };
  }
  const s = db.SemanaCatequista.find((x) => x.id === p.i);
  const c = s && db.Catequistas.find((x) => x.id === s.catequista_id);
  if (!s || !c) return { ok: true, tipo, estado: 'INEXISTENTE', staff: !!staff };
  const estado = s.estado === 'ANULADA' || c.estado === 'ANULADO' ? 'ANULADO' : s.edicion !== config.SEMANA_EDICION ? 'OTRA_EDICION' : 'VALIDO';
  return { ok: true, tipo, estado, staff: !!staff, publico: { edicion: s.edicion },
    detalle: staff ? { nombre: nombreDe(c), numero: c.numero_catequista, numeroInscripcion: s.numero_inscripcion_semana, parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, edicion: s.edicion, talla: s.talla_camiseta, restricciones: s.restricciones_alimentarias, checkin_at: s.checkin_at, checkin_por: s.checkin_por, fotoUrl: `/api/admin/archivo/catequistas/${c.id}/foto` } : undefined };
});
ruta('POST', /^\/api\/verificar\/entrada$/, (req, ctx) => {
  const staff = staffSesion(req);
  if (!staff) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión como verificador para registrar entradas.');
  const p = leerToken(ctx.cuerpo.t);
  const s = p && p.k === 't' && db.SemanaCatequista.find((x) => x.id === p.i);
  const c = s && db.Catequistas.find((x) => x.id === s.catequista_id);
  if (!s || !c) fallo(404, 'INEXISTENTE', 'Pase inexistente.');
  if (s.estado === 'ANULADA' || c.estado === 'ANULADO') fallo(409, 'ANULADO', 'Este pase está anulado. No permitas la entrada.');
  if (s.checkin_at) return { ok: true, yaHabiaEntrado: true, checkin_at: s.checkin_at, checkin_por: s.checkin_por };
  s.checkin_at = ahora();
  s.checkin_por = staff.email;
  s.actualizado_at = s.checkin_at;
  auditar(staff.email, 'CHECKIN', 'SemanaCatequista', s.id, s.numero_inscripcion_semana);
  return { ok: true, yaHabiaEntrado: false, checkin_at: s.checkin_at, checkin_por: s.checkin_por };
});

// Autenticación del personal
ruta('POST', /^\/api\/auth\/simulado$/, (req, ctx) => {
  const email = normCorreo(ctx.cuerpo.email);
  const permitido = lista(config.ADMIN_EMAILS).includes(email) || lista(config.VERIFICADORES_EMAILS).includes(email);
  if (!permitido) fallo(403, 'PROHIBIDO', 'Esta cuenta no tiene acceso al panel.');
  const sid = crearSesion({ tipo: 'staff', email }, SESION_STAFF_S);
  ctx.cookies.push(cookieSesion(COOKIE_STAFF, sid, SESION_STAFF_S));
  auditar(email, 'LOGIN', 'Staff', email, 'simulado');
  return { ok: true };
});
ruta('POST', /^\/api\/auth\/google$/, () => fallo(501, 'NO_DISPONIBLE', 'El inicio de sesión con Google se activa al conectar la API real.'));
ruta('POST', /^\/api\/auth\/salir$/, (req, ctx) => {
  const sid = cookies(req)[COOKIE_STAFF];
  if (sid) sesiones.delete(sid);
  ctx.cookies.push(cookieSesion(COOKIE_STAFF, '', 0));
  return { ok: true };
});
ruta('GET', /^\/api\/auth\/yo$/, (req) => {
  const s = staffSesion(req);
  if (!s) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
  return { ok: true, email: s.email, rol: s.rol };
});

// Administración
ruta('GET', /^\/api\/admin\/resumen$/, (req) => {
  exigirAdmin(req);
  const ed = config.SEMANA_EDICION;
  const cat = db.Catequistas;
  const sem = db.SemanaCatequista.filter((s) => s.edicion === ed);
  return {
    ok: true, edicion: ed, moneda: config.MONEDA,
    registrados: cat.length, activos: cat.filter((c) => c.estado === 'ACTIVO').length,
    porAprobar: cat.filter((c) => c.estado === 'PENDIENTE_APROBACION').length, rechazados: cat.filter((c) => c.estado === 'RECHAZADO').length,
    pendientes: cat.filter((c) => c.estado === 'PENDIENTE_DOCUMENTOS').length, anulados: cat.filter((c) => c.estado === 'ANULADO').length,
    inscritosSemana: sem.filter((s) => s.estado !== 'ANULADA').length, entradas: sem.filter((s) => s.checkin_at && s.estado !== 'ANULADA').length,
    recaudado: db.Pagos.filter((p) => p.estado === 'DECLARADO_AUTO').reduce((a, p) => a + num(p.monto), 0),
    cuotaCorreo, correosPendientes: db.Correos.filter((c) => c.estado === 'PENDIENTE').length,
  };
});
const coincide = (q, ...vals) => !q || vals.some((v) => String(v || '').toLowerCase().includes(q));
ruta('GET', /^\/api\/admin\/catequistas$/, (req, ctx) => {
  exigirAdmin(req);
  const q = (ctx.url.searchParams.get('q') || '').trim().toLowerCase();
  const estado = ctx.url.searchParams.get('estado') || '';
  const filtro = ['zona', 'vicaria', 'parroquia'].map((k) => [k, ctx.url.searchParams.get(k) || '']).filter(([, v]) => v);
  const orden = estado === 'PENDIENTE_APROBACION' ? 1 : -1; // la cola se atiende por orden de llegada
  const items = db.Catequistas
    .filter((c) => (!estado || c.estado === estado) && coincide(q, c.numero_catequista, c.nombres, c.apellidos, c.cedula, c.correo, c.parroquia))
    .map((c) => ({ c, k: terrActual().clasificar(c) }))
    .filter(({ k }) => filtro.every(([campo, v]) => k[campo] === v))
    .sort((a, b) => orden * a.c.numero_catequista.localeCompare(b.c.numero_catequista))
    .map(({ c, k }) => ({ id: c.id, numero: c.numero_catequista, nombre: nombreDe(c), cedula: c.cedula, correo: c.correo, parroquia: c.parroquia, vicaria_zona: k.vicaria, zona_pastoral: k.zona, estado: c.estado, fecha_registro: c.fecha_registro }));
  return { ok: true, items };
});
ruta('GET', /^\/api\/admin\/estadisticas$/, (req) => {
  exigirAdmin(req);
  return { ok: true, ...terrActual().estadisticas(db.Catequistas), generado: ahora() };
});
ruta('GET', /^\/api\/admin\/territorio$/, (req) => {
  exigirAdmin(req);
  return { ok: true, ...terrActual().catalogoAdmin(db.Catequistas) };
});
// Mismas validaciones y reglas que la API real; aquí las filas viven en memoria.
ruta('POST', /^\/api\/admin\/territorio\/(parroquia|vicaria)$/, (req, ctx) => {
  const a = exigirAdmin(req);
  const terr = terrActual();
  const b = ctx.cuerpo;
  const campos = {};
  const nombre = texto(b.nombre, 120).replace(/\s+/g, ' ');
  if (nombre.length < 3) campos.nombre = 'Escribe el nombre (mínimo 3 caracteres).';
  let tabla;
  let fila;
  let reglas;
  if (ctx.m[1] === 'parroquia') {
    tabla = 'Parroquias';
    const antes = b.id ? terr.parroquia(String(b.id)) : null;
    if (b.id && !antes) fallo(404, 'INEXISTENTE', 'Parroquia no encontrada.');
    const v = terr.vicaria(String(b.vicaria_id || ''));
    if (!v) campos.vicaria_id = 'Selecciona la vicaría.';
    const otra = terr.parroquiaPorNombre(nombre);
    if (otra && (!antes || otra.id !== antes.id)) campos.nombre = 'Ya existe una parroquia con ese nombre.';
    if (Object.keys(campos).length) fallo(400, 'VALIDACION', 'Revisa los datos marcados.', campos);
    const coordinador = texto(b.coordinador, 200);
    fila = { id: antes ? antes.id : terr.nuevoId(nombre, 'Parroquias'), nombre, vicaria_id: v.id, coordinador, propuesta: b.propuesta ? 'TRUE' : 'FALSE', activa: b.activa === false ? 'FALSE' : 'TRUE', orden: String(antes ? antes.orden : terr.maxOrden('Parroquias') + 1) };
    reglas = territorio.reglasParroquia(antes && { nombre: antes.nombre, vicaria: antes.vicaria.etiqueta, zona: antes.zona.etiqueta, coordinador: antes.coordinador }, { nombre, vicaria: v.etiqueta, zona: v.zona.etiqueta, coordinador });
  } else {
    tabla = 'Vicarias';
    const antes = b.id ? terr.vicaria(String(b.id)) : null;
    if (b.id && !antes) fallo(404, 'INEXISTENTE', 'Vicaría no encontrada.');
    const z = terr.zona(String(b.zona_id || ''));
    if (!z) campos.zona_id = 'Selecciona la zona pastoral.';
    const otra = terr.vicariaPorNombre(nombre);
    if (otra && (!antes || otra.id !== antes.id)) campos.nombre = 'Ya existe una vicaría con ese nombre.';
    if (antes && b.activa === false && antes.parroquias.some((p) => p.activa)) campos.activa = 'Desactiva o mueve antes sus parroquias activas.';
    if (Object.keys(campos).length) fallo(400, 'VALIDACION', 'Revisa los datos marcados.', campos);
    fila = { id: antes ? antes.id : terr.nuevoId(nombre, 'Vicarias'), nombre, zona_id: z.id, activa: b.activa === false ? 'FALSE' : 'TRUE', orden: String(antes ? antes.orden : terr.maxOrden('Vicarias') + 1) };
    reglas = territorio.reglasVicaria(antes && { etiqueta: antes.etiqueta, zona: antes.zona.etiqueta }, { etiqueta: 'Vicaría ' + nombre, zona: z.etiqueta });
  }
  const afectados = territorio.aplicarReglas(db.Catequistas.map((c) => ({ ...c })), reglas).length;
  if (b.simular) return { ok: true, simulado: true, afectados, id: fila.id };
  terrFilas = terrFilas || terr.filas();
  const t = ahora();
  const lista = terrFilas[tabla];
  const i = lista.findIndex((x) => x.id === fila.id);
  const nueva = { ...(i >= 0 ? lista[i] : {}), ...fila, actualizado_at: t, actualizado_por: a.email };
  if (i >= 0) lista[i] = nueva; else lista.push(nueva);
  const tocadas = territorio.aplicarReglas(db.Catequistas, reglas);
  tocadas.forEach((id) => { db.Catequistas.find((c) => c.id === id).actualizado_at = t; });
  auditar(a.email, i >= 0 ? 'EDITAR_TERRITORIO' : 'ALTA_TERRITORIO', tabla, fila.id, fila.nombre + ' · ' + tocadas.length + ' registros actualizados');
  return { ok: true, id: fila.id, actualizados: tocadas.length };
}, { idempotente: true });
ruta('GET', /^\/api\/admin\/cumpleanos$/, (req, ctx) => {
  exigirAdmin(req);
  const dias = Math.max(1, Math.min(90, Math.floor(num(ctx.url.searchParams.get('dias'))) || 30));
  const anio = hoyPanama().slice(0, 4);
  const saludos = new Map();
  db.Correos.forEach((m) => { if (m.tipo === 'CUMPLE' && String(m.fecha).slice(0, 4) === anio) saludos.set(m.referencia_id, { estado: m.estado, fecha: m.fecha }); });
  const items = db.Catequistas.filter((c) => c.estado === 'ACTIVO')
    .map((c) => ({ c, falta: diasHastaCumple(c.fecha_nacimiento) }))
    .filter(({ falta }) => falta >= 0 && falta <= dias)
    .sort((x, y) => x.falta - y.falta || nombreDe(x.c).localeCompare(nombreDe(y.c), 'es'))
    .map(({ c, falta }) => ({ id: c.id, numero: c.numero_catequista, nombre: nombreDe(c), parroquia: c.parroquia, correo: c.correo, fecha: fechaCumple(c.fecha_nacimiento, falta), dias: falta, edad: edadQueCumple(c.fecha_nacimiento, falta), saludo: saludos.get(c.id) || null }));
  return { ok: true, hoy: hoyPanama(), activo: bool(config.SALUDO_CUMPLEANOS ?? 'TRUE'), dias, items };
});
ruta('POST', /^\/api\/admin\/cumpleanos\/saludar$/, (req, ctx) => {
  const a = exigirAdmin(req);
  const c = db.Catequistas.find((x) => x.id === ctx.cuerpo.id);
  if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
  if (c.estado !== 'ACTIVO') fallo(409, 'NO_ACTIVO', 'Solo se saluda a catequistas aprobados.');
  const enviado = enviarCorreo(c.correo, '¡Feliz cumpleaños, ' + c.nombres.split(' ')[0] + '!', 'CUMPLE', c.id);
  auditar(a.email, 'SALUDO_CUMPLEANOS', 'Catequistas', c.id, enviado ? 'enviado' : 'pendiente');
  return { ok: true, enviado, mensaje: enviado ? 'Saludo enviado a ' + c.correo + '.' : 'Se agotó la cuota diaria: el saludo quedó pendiente y se reintentará.' };
}, { idempotente: true });
ruta('POST', /^\/api\/admin\/(aprobar|rechazar)$/, (req, ctx) => {
  const a = exigirAdmin(req);
  const aprobar = ctx.m[1] === 'aprobar';
  const motivo = texto(ctx.cuerpo.motivo, 300);
  if (!aprobar && motivo.length < 5) fallo(400, 'VALIDACION', 'Escribe el motivo del rechazo (mínimo 5 caracteres). Se enviará al catequista.', { motivo: 'Motivo obligatorio' });
  const c = db.Catequistas.find((x) => x.id === ctx.cuerpo.id);
  if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
  const t = ahora();
  if (aprobar) {
    if (c.estado === 'ACTIVO') return { ok: true, estado: 'ACTIVO', yaRevisado: true, correoEnviado: false, mensaje: 'Este registro ya estaba revisado.' };
    if (c.estado === 'PENDIENTE_DOCUMENTOS') fallo(409, 'SIN_DOCUMENTOS', 'Este registro aún no tiene documentos. Usa «Regenerar documentos» y vuelve a aprobarlo.');
    if (c.estado !== 'PENDIENTE_APROBACION') fallo(409, 'NO_PENDIENTE', 'Este registro no está pendiente de aprobación.');
    Object.assign(c, { estado: 'ACTIVO', revisado_at: t, revisado_por: a.email, motivo_rechazo: '', actualizado_at: t });
    auditar(a.email, 'APROBAR', 'Catequistas', c.id, c.numero_catequista);
  } else {
    if (c.estado === 'RECHAZADO') return { ok: true, estado: 'RECHAZADO', yaRevisado: true, correoEnviado: false, mensaje: 'Este registro ya estaba revisado.' };
    if (!['PENDIENTE_APROBACION', 'PENDIENTE_DOCUMENTOS'].includes(c.estado)) fallo(409, 'NO_PENDIENTE', 'Solo se rechazan registros pendientes de aprobación. Para retirar un registro activo, usa «Anular».');
    Object.assign(c, { estado: 'RECHAZADO', revisado_at: t, revisado_por: a.email, motivo_rechazo: motivo, actualizado_at: t, notas_admin: `${c.notas_admin ? c.notas_admin + ' | ' : ''}Rechazado ${t}: ${motivo}` });
    db.Pagos.filter((p) => p.referencia_id === c.id && !['ANULADO', 'RECHAZADO'].includes(p.estado)).forEach((p) => Object.assign(p, { estado: 'RECHAZADO', anulado_at: t, anulado_por: a.email, motivo_anulacion: motivo }));
    auditar(a.email, 'RECHAZAR', 'Catequistas', c.id, motivo);
  }
  const correoEnviado = correoRegistro(c);
  const mensaje = aprobar
    ? (correoEnviado ? 'Registro aprobado. Enviamos el carnet al catequista.' : 'Registro aprobado. El correo con el carnet quedó pendiente y se reintentará automáticamente.')
    : (correoEnviado ? 'Registro rechazado. Enviamos el motivo al catequista.' : 'Registro rechazado. El correo quedó pendiente y se reintentará automáticamente.');
  return { ok: true, estado: c.estado, yaRevisado: false, correoEnviado, mensaje };
}, { idempotente: true });
const SIN_ARCHIVOS = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.endsWith('_file_id') && k !== 'pase_file_id'));
ruta('GET', /^\/api\/admin\/catequistas\/([\w-]+)$/, (req, ctx) => {
  exigirAdmin(req);
  const c = db.Catequistas.find((x) => x.id === ctx.m[1]);
  if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
  const base = `/api/admin/archivo/catequistas/${c.id}/`;
  return {
    ok: true, item: SIN_ARCHIVOS(c),
    archivos: { foto: c.foto_file_id ? base + 'foto' : '', firma: c.firma_file_id ? base + 'firma' : '', comprobante: c.comprobante_file_id ? base + 'comprobante' : '', pdf: c.pdf_inscripcion_file_id ? base + 'pdf' : '', carnet: c.carnet_file_id ? base + 'carnet' : '' },
    pagos: db.Pagos.filter((p) => p.numero_catequista === c.numero_catequista).map(SIN_ARCHIVOS),
    semana: db.SemanaCatequista.filter((s) => s.catequista_id === c.id).map((s) => ({ id: s.id, numero: s.numero_inscripcion_semana, edicion: s.edicion, estado: s.estado, checkin_at: s.checkin_at })),
    correos: db.Correos.filter((m) => m.referencia_id === c.id),
    verificacionUrl: urlVerificacionCarnet(c),
  };
});
ruta('GET', /^\/api\/admin\/semana$/, (req, ctx) => {
  exigirAdmin(req);
  const q = (ctx.url.searchParams.get('q') || '').trim().toLowerCase();
  const items = db.SemanaCatequista
    .filter((s) => s.edicion === config.SEMANA_EDICION)
    .map((s) => ({ s, c: db.Catequistas.find((x) => x.id === s.catequista_id) || {} }))
    .filter(({ s, c }) => coincide(q, s.numero_inscripcion_semana, s.numero_catequista, c.nombres, c.apellidos, c.parroquia, s.correo))
    .sort((a, b) => b.s.numero_inscripcion_semana.localeCompare(a.s.numero_inscripcion_semana))
    .map(({ s, c }) => ({ id: s.id, numero: s.numero_inscripcion_semana, numero_catequista: s.numero_catequista, nombre: nombreDe(c), parroquia: c.parroquia, estado: s.estado, talla: s.talla_camiseta, restricciones: s.restricciones_alimentarias, checkin_at: s.checkin_at, fecha: s.fecha_inscripcion }));
  return { ok: true, items, edicion: config.SEMANA_EDICION };
});
ruta('GET', /^\/api\/admin\/semana\/([\w-]+)$/, (req, ctx) => {
  exigirAdmin(req);
  const s = db.SemanaCatequista.find((x) => x.id === ctx.m[1]);
  if (!s) fallo(404, 'INEXISTENTE', 'Inscripción no encontrada.');
  const c = db.Catequistas.find((x) => x.id === s.catequista_id) || {};
  const base = `/api/admin/archivo/semana/${s.id}/`;
  return { ok: true, item: { ...SIN_ARCHIVOS(s), nombre: nombreDe(c), parroquia: c.parroquia, vicaria_zona: c.vicaria_zona }, archivos: { foto: `/api/admin/archivo/catequistas/${c.id}/foto`, comprobante: base + 'comprobante', pase: s.pase_file_id ? base + 'pase' : '' }, pagos: db.Pagos.filter((p) => p.referencia_id === s.id).map(SIN_ARCHIVOS), correos: db.Correos.filter((m) => m.referencia_id === s.id), verificacionUrl: urlVerificacionPase(s) };
});
ruta('GET', /^\/api\/admin\/archivo\/(catequistas|semana)\/([\w-]+)\/(foto|firma|comprobante|pdf|carnet|pase)$/, (req, ctx) => {
  const staff = staffSesion(req);
  if (!staff) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
  const [, tabla, id, clave] = ctx.m;
  if (staff.rol !== 'admin' && clave !== 'foto') fallo(403, 'PROHIBIDO', 'Sin permiso.');
  const fila = (tabla === 'catequistas' ? db.Catequistas : db.SemanaCatequista).find((x) => x.id === id);
  if (!fila) fallo(404, 'INEXISTENTE', 'Archivo no encontrado.');
  const campo = { foto: 'foto_file_id', firma: 'firma_file_id', comprobante: 'comprobante_file_id', pdf: 'pdf_inscripcion_file_id', carnet: 'carnet_file_id', pase: 'pase_file_id' }[clave];
  return { archivo: fila[campo], descarga: ['pdf', 'carnet', 'pase'].includes(clave) };
});
ruta('POST', /^\/api\/admin\/anular$/, (req, ctx) => {
  const a = exigirAdmin(req);
  const { tipo, id } = ctx.cuerpo;
  const motivo = texto(ctx.cuerpo.motivo, 300);
  if (motivo.length < 5) fallo(400, 'VALIDACION', 'Escribe el motivo de la anulación (mínimo 5 caracteres).', { motivo: 'Motivo obligatorio' });
  const t = ahora();
  const anularPagos = (refId) => db.Pagos.filter((p) => p.referencia_id === refId && p.estado !== 'ANULADO').forEach((p) => Object.assign(p, { estado: 'ANULADO', anulado_at: t, anulado_por: a.email, motivo_anulacion: motivo }));
  if (tipo === 'catequista') {
    const c = db.Catequistas.find((x) => x.id === id);
    if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
    if (c.estado === 'ANULADO') return { ok: true, yaAnulado: true };
    c.estado = 'ANULADO'; c.actualizado_at = t; c.notas_admin = `${c.notas_admin ? c.notas_admin + ' | ' : ''}Anulado ${t}: ${motivo}`;
    anularPagos(c.id);
    db.SemanaCatequista.filter((s) => s.catequista_id === c.id && s.estado !== 'ANULADA').forEach((s) => { s.estado = 'ANULADA'; s.actualizado_at = t; anularPagos(s.id); });
    auditar(a.email, 'ANULAR', 'Catequistas', id, motivo);
  } else if (tipo === 'semana') {
    const s = db.SemanaCatequista.find((x) => x.id === id);
    if (!s) fallo(404, 'INEXISTENTE', 'Inscripción no encontrada.');
    if (s.estado === 'ANULADA') return { ok: true, yaAnulado: true };
    s.estado = 'ANULADA'; s.actualizado_at = t; s.notas_admin = `${s.notas_admin ? s.notas_admin + ' | ' : ''}Anulada ${t}: ${motivo}`;
    anularPagos(s.id);
    auditar(a.email, 'ANULAR', 'SemanaCatequista', id, motivo);
  } else fallo(400, 'VALIDACION', 'Tipo no válido.');
  return { ok: true };
}, { idempotente: true });
ruta('POST', /^\/api\/admin\/regenerar$/, (req, ctx) => {
  const a = exigirAdmin(req);
  const c = db.Catequistas.find((x) => x.id === ctx.cuerpo.id);
  if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
  if (c.estado === 'ANULADO') fallo(409, 'ANULADO', 'No se regeneran documentos de un registro anulado.');
  if (c.estado === 'RECHAZADO') fallo(409, 'RECHAZADO', 'No se regeneran documentos de un registro rechazado.');
  generarDocumentosCatequista(c);
  auditar(a.email, 'REGENERAR', 'Catequistas', c.id, c.numero_catequista);
  return { ok: true, estado: c.estado };
}, { idempotente: true });
ruta('POST', /^\/api\/admin\/reenviar$/, (req, ctx) => {
  const a = exigirAdmin(req);
  const { tipo, id } = ctx.cuerpo;
  let enviado;
  if (tipo === 'catequista') {
    const c = db.Catequistas.find((x) => x.id === id);
    if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
    if (!['ACTIVO', 'PENDIENTE_APROBACION', 'RECHAZADO'].includes(c.estado)) fallo(403, 'NO_ACTIVO', 'Este registro no tiene un correo que reenviar.');
    enviado = correoRegistro(c);
  } else {
    const s = db.SemanaCatequista.find((x) => x.id === id);
    if (!s) fallo(404, 'INEXISTENTE', 'Inscripción no encontrada.');
    if (s.estado === 'ANULADA') fallo(409, 'ANULADO', 'La inscripción está anulada.');
    enviado = enviarCorreo(s.correo, `Inscripción confirmada · Semana del Catequista ${s.edicion}`, 'SEMANA', s.id);
    if (enviado) s.correo_enviado_at = ahora();
  }
  auditar(a.email, 'REENVIAR', tipo, id, enviado ? 'enviado' : 'pendiente');
  return { ok: true, enviado, mensaje: enviado ? 'Correo enviado.' : 'Se agotó la cuota diaria: el correo quedó pendiente y se reintentará automáticamente.' };
}, { idempotente: true });

const FORMULA = /^[=+\-@\t\r]/;
function celdaCsv(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (FORMULA.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
ruta('GET', /^\/api\/admin\/exportar$/, (req, ctx) => {
  exigirAdmin(req);
  const tabla = ctx.url.searchParams.get('tabla');
  const fuentes = {
    catequistas: [db.Catequistas.map((c) => { const k = terrActual().clasificar(c); return { ...c, vicaria_zona: k.vicaria, zona_pastoral: k.zona }; }), ['numero_catequista', 'estado', 'fecha_registro', 'nombres', 'apellidos', 'cedula', 'fecha_nacimiento', 'sexo', 'telefono', 'correo', 'direccion', 'parroquia', 'vicaria_zona', 'zona_pastoral', 'anios_servicio', 'nivel_que_imparte', 'formacion_cenafca', 'coordinador_parroquial', 'yappy_referencia', 'vigencia_hasta', 'correo_enviado_at', 'revisado_at', 'revisado_por', 'motivo_rechazo']],
    semana: [db.SemanaCatequista.filter((s) => s.edicion === config.SEMANA_EDICION), ['numero_inscripcion_semana', 'numero_catequista', 'correo', 'edicion', 'estado', 'fecha_inscripcion', 'talla_camiseta', 'restricciones_alimentarias', 'yappy_referencia', 'checkin_at', 'checkin_por']],
    pagos: [db.Pagos, ['tipo', 'numero_catequista', 'monto', 'moneda', 'metodo', 'yappy_referencia', 'estado', 'creado_at', 'anulado_at', 'anulado_por', 'motivo_anulacion']],
  }[tabla];
  if (!fuentes) fallo(400, 'VALIDACION', 'Tabla no válida.');
  const [filas, cols] = fuentes;
  const csv = '﻿' + [cols.map(celdaCsv).join(','), ...filas.map((f) => cols.map((k) => celdaCsv(f[k])).join(','))].join('\r\n') + '\r\n';
  return { csv, nombre: `${tabla}_${ahora().slice(0, 10)}.csv` };
});

// ---------- Datos de ejemplo ----------

// Dos cuentas conocidas (prueba@ejemplo.com activa y jose@ejemplo.com por aprobar) y unos 40
// catequistas repartidos por el territorio, con estados variados, para el dashboard y la cola.
function sembrar() {
  if (process.env.SIM_SIN_DATOS === '1') return;
  const zonas = territorio.catalogoPublico().zonas;
  const parroquias = zonas.flatMap((z) => z.vicarias.flatMap((v) => v.parroquias));
  let semilla = 7;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; };
  const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
  const NOMBRES = ['Ana', 'Luis', 'Carmen', 'José', 'Rosa', 'Miguel', 'Elena', 'Carlos', 'Marta', 'Jorge', 'Lucía', 'Pedro', 'Isabel', 'Raúl', 'Yaneth', 'Itzel'];
  const APELLIDOS = ['González', 'Rodríguez', 'Pérez', 'Castillo', 'Sánchez', 'Herrera', 'Batista', 'Moreno', 'Vargas', 'Ríos', 'Quintero', 'Barría'];
  const ejemplos = [
    { nombres: 'María Fernanda', apellidos: 'Prueba Ríos', cedula: '8-123-4567', correo: 'prueba@ejemplo.com', parroquia_id: 'san-jose-altar-de-oro', estado: 'ACTIVO' },
    { nombres: 'José Luis', apellidos: 'Ejemplo Castillo', cedula: '4-765-1234', correo: 'jose@ejemplo.com', parroquia_id: 'cristo-rey', estado: 'PENDIENTE_APROBACION' },
  ];
  // Más catequistas en algunas parroquias para que el dashboard tenga contraste.
  const preferidas = ['san-judas-tadeo', 'santisima-trinidad', 'cristo-redentor-paraiso', 'san-francisco-de-paula-la-chorrera', 'don-bosco-pedregal'];
  for (let i = 0; i < 40; i++) {
    const p = i < 15 ? preferidas[i % preferidas.length] : elegir(parroquias).id;
    const r = azar();
    ejemplos.push({
      nombres: elegir(NOMBRES), apellidos: `${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`, cedula: `${1 + (i % 9)}-${700 + i}-${2000 + i}`,
      correo: `ejemplo${i + 1}@ejemplo.com`, parroquia_id: p, estado: r < 0.62 ? 'ACTIVO' : r < 0.86 ? 'PENDIENTE_APROBACION' : r < 0.95 ? 'RECHAZADO' : 'ANULADO',
    });
  }
  // Un registro antiguo (antes del catálogo) para ver cómo se clasifica.
  ejemplos.push({ nombres: 'Registro', apellidos: 'Antiguo', cedula: '2-111-3333', correo: 'antiguo@ejemplo.com', parroquia: 'Parroquia San José', vicaria_zona: 'Vicaría Cristo Redentor (San Miguelito)', estado: 'ACTIVO' });

  // Los primeros aprobados cumplen años hoy o en los próximos días (para ver la pestaña Cumpleaños).
  const DESFASES = [0, 0, 2, 5, 9, 14, 21, 33];
  let aprobados = 0;
  const cumpleEjemplo = (i) => {
    const e = ejemplos[i];
    if (e.estado !== 'ACTIVO' || aprobados >= DESFASES.length) return (1970 + (i % 30)) + '-04-12';
    const d = new Date(Date.now() + DESFASES[aprobados++] * 86400000);
    return (1972 + i) + '-' + hoyPanama(d).slice(5);
  };
  ejemplos.forEach((e, i) => {
    const t = new Date(Date.now() - (ejemplos.length - i) * 5 * 3600 * 1000).toISOString();
    const id = uid();
    const numero = siguienteNumero('CATEQUISTA');
    const lugar = e.parroquia_id ? territorio.resolverParroquia({ parroquia_id: e.parroquia_id }) : { parroquia: e.parroquia, vicaria_zona: e.vicaria_zona, zona_pastoral: '', coordinador: '' };
    const c = {
      id, numero_catequista: numero, estado: 'PENDIENTE_DOCUMENTOS', fecha_registro: t, nombres: e.nombres, apellidos: e.apellidos, cedula: e.cedula, correo: e.correo,
      parroquia: lugar.parroquia, vicaria_zona: lugar.vicaria_zona, zona_pastoral: lugar.zona_pastoral,
      fecha_nacimiento: cumpleEjemplo(i), sexo: i % 3 ? 'Femenino' : 'Masculino', telefono: '60001234', direccion: 'Ciudad de Panamá', anios_servicio: 1 + (i % 15), nivel_que_imparte: elegir(['Primera Comunión', 'Confirmación', 'Perseverancia', 'Catequesis familiar']), formacion_cenafca: 'En curso',
      coordinador_parroquial: lugar.coordinador || 'Hna. Ejemplo', foto_file_id: '', firma_file_id: '', comprobante_file_id: '', yappy_referencia: 'SIM' + numero.replace(/\D/g, ''), comprobante_sha256: 'sim-' + id,
      pdf_inscripcion_file_id: '', carnet_file_id: '', vigencia_hasta: vigencia(), correo_enviado_at: '', consentimiento_datos: t, consentimiento_imagen: t, creado_at: t, actualizado_at: t,
      notas_admin: 'Dato de ejemplo (simulado)', revisado_at: '', revisado_por: '', motivo_rechazo: '',
    };
    db.Catequistas.push(c);
    db.Pagos.push({ id: uid(), tipo: 'REGISTRO', referencia_id: id, numero_catequista: numero, monto: 1, moneda: 'B/.', metodo: 'YAPPY', yappy_referencia: c.yappy_referencia, comprobante_file_id: '', comprobante_sha256: c.comprobante_sha256, estado: 'DECLARADO_AUTO', creado_at: t, anulado_at: '', anulado_por: '', motivo_anulacion: '' });
    if (e.estado === 'ACTIVO' || e.estado === 'ANULADO') Object.assign(c, { revisado_at: t, revisado_por: 'aovv.26@gmail.com', correo_enviado_at: t });
    generarDocumentosCatequista(c);
    if (e.estado === 'RECHAZADO') Object.assign(c, { estado: 'RECHAZADO', revisado_at: t, revisado_por: 'aovv.26@gmail.com', motivo_rechazo: 'La foto no permite identificar a la persona (ejemplo).' });
    if (e.estado === 'ANULADO') c.estado = 'ANULADO';
    if (e.estado === 'RECHAZADO' || e.estado === 'ANULADO') db.Pagos.at(-1).estado = e.estado;
  });
}
sembrar();

// ---------- Despachador ----------

function enviarJson(res, status, cuerpo, cookiesSalida = []) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (cookiesSalida.length) h['set-cookie'] = cookiesSalida;
  res.writeHead(status, h);
  res.end(JSON.stringify(cuerpo));
}

async function manejar(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const ctx = { url, cookies: [], ip: req.socket.remoteAddress || '' };
  try {
    const r = rutas.find((x) => x.metodo === req.method && (ctx.m = x.patron.exec(url.pathname)));
    if (!r) fallo(404, 'NO_ENCONTRADO', 'Ruta no encontrada.');
    if (req.method !== 'GET') {
      // Anti-CSRF: cabecera propia y mismo origen.
      if (req.headers['x-cat-csrf'] !== '1') fallo(403, 'PROHIBIDO', 'Solicitud no permitida.');
      const origen = req.headers.origin;
      if (origen && new URL(origen).host !== req.headers.host) fallo(403, 'PROHIBIDO', 'Origen no permitido.');
      ctx.cuerpo = await leerCuerpo(req);
    }
    const clave = r.idempotente && req.headers['idempotency-key'];
    if (r.idempotente && !clave) fallo(400, 'IDEMPOTENCIA', 'Falta la clave de idempotencia.');
    if (clave && idempotencia.has(clave)) {
      const prev = idempotencia.get(clave);
      return enviarJson(res, prev.status, prev.cuerpo, prev.cookies);
    }
    if (LATENCIA_MS) await new Promise((ok) => setTimeout(ok, LATENCIA_MS));
    const salida = await r.fn(req, ctx);
    if (salida && 'archivo' in salida && !('ok' in salida)) {
      const a = salida.archivo && archivos.get(salida.archivo);
      if (!a) fallo(404, 'INEXISTENTE', 'El archivo aún no está disponible.');
      res.writeHead(200, { 'content-type': a.mime, 'cache-control': 'private, no-store', 'content-disposition': `${salida.descarga ? 'attachment' : 'inline'}; filename="${a.nombre || 'archivo'}"`, 'x-content-type-options': 'nosniff' });
      return res.end(a.bytes);
    }
    if (salida && 'csv' in salida) {
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${salida.nombre}"` });
      return res.end(salida.csv);
    }
    if (clave) idempotencia.set(clave, { status: 200, cuerpo: salida, cookies: ctx.cookies });
    return enviarJson(res, 200, salida, ctx.cookies);
  } catch (e) {
    if (e instanceof Fallo) return enviarJson(res, e.status, { ok: false, codigo: e.codigo, mensaje: e.message, campos: e.campos }, ctx.cookies);
    console.error('[api-simulada]', e);
    return enviarJson(res, 500, { ok: false, codigo: 'ERROR', mensaje: 'Error interno.' });
  }
}

module.exports = { manejar };
