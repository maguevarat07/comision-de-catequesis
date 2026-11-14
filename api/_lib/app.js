// API real del módulo de registro de catequistas (contrato: docs/API-CONTRATO.md).
//
// Lee el libro con la cuenta de servicio y escribe solo a través del escritor de Apps Script.
// No guarda estado propio: sesiones en cookies firmadas, idempotencia resuelta por el escritor
// y tokens de verificación firmados con QR_SECRET. Así funciona igual en una o varias
// instancias de Vercel.
//
// crearApi(deps) recibe sus dependencias para poder probarla sin Google (scripts/google-emulado.cjs).
'use strict';

const crypto = require('node:crypto');
const pdf = require('./pdf.js');
const territorio = require('./territorio.js');

const LIMITE_CUERPO = 4.5 * 1024 * 1024;
const COOKIE_CAT = 'cat_sesion';
const COOKIE_STAFF = 'cat_staff';
const SESION_CAT_S = 2 * 3600;
const SESION_STAFF_S = 8 * 3600;
const PESTANAS = ['Config', 'Catequistas', 'SemanaCatequista', 'Pagos', 'Correos'];

class Fallo extends Error {
  constructor(status, codigo, mensaje, campos) { super(mensaje); this.status = status; this.codigo = codigo; this.campos = campos; }
}
const fallo = (status, codigo, mensaje, campos) => { throw new Fallo(status, codigo, mensaje, campos); };

const ahora = () => new Date().toISOString();
const hoyPanama = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(new Date());
const bool = (v) => ['TRUE', 'true', '1', 'si', 'sí'].includes(String(v).trim());
const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const lista = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const RE_CEDULA = /^(?:(?:[1-9]|1[0-3])(?:AV|PI)?|PE|E|N)-\d{1,4}-\d{1,6}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_ID = /^[\w-]{8,64}$/;
const texto = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const normCorreo = (v) => texto(v, 160).toLowerCase();
const normCedula = (v) => texto(v, 20).toUpperCase().replace(/\s+/g, '');
const normTel = (v) => String(v || '').replace(/\D/g, '').replace(/^507(?=\d{7,8}$)/, '');
function normNumero(v) {
  const m = String(v || '').trim().toUpperCase().match(/^(?:CAT)?[\s-]*0*(\d{1,7})$/);
  return m && Number(m[1]) > 0 ? `CAT-${m[1].padStart(5, '0')}` : '';
}
const normRef = (v) => texto(v, 40).toUpperCase().replace(/\s+/g, '');
const nombreDe = (c) => `${c.nombres || ''} ${c.apellidos || ''}`.trim();

// Códigos del escritor → HTTP. Lo no listado es un fallo interno del escritor.
const HTTP_ESCRITOR = { DUPLICADO: 409, COMPROBANTE_REPETIDO: 409, REFERENCIA_REPETIDA: 409, YA_INSCRITO: 409, CERRADO: 409, SIN_CUPO: 409, ANULADO: 409, RECHAZADO: 409, NO_PENDIENTE: 409, SIN_DOCUMENTOS: 409, NO_ACTIVO: 403, INEXISTENTE: 404, VALIDACION: 400, OCUPADO: 503 };
// Estados en los que el registro ya no existe para el catequista (portal, recuperar número, unicidad).
const FUERA = ['ANULADO', 'RECHAZADO'];

function crearApi(deps) {
  const { env, leer, descargar, escritor, verificarGoogle, modo = 'google' } = deps;
  const log = deps.log || console;
  const seguro = !!deps.cookiesSeguras;

  // ---------- Secretos y firmas ----------

  function secreto(nombre) {
    const v = env[nombre];
    if (!v || v.length < 32) fallo(503, 'CONFIG', 'El servicio está en configuración. Inténtalo más tarde.');
    return v;
  }
  const hmac = (clave, datos) => crypto.createHmac('sha256', clave).update(datos).digest('base64url');
  const igual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  /** Token de verificación: base64url(JSON) + "." + HMAC(QR_SECRET) truncado a 22. */
  function firmarToken(payload) {
    const datos = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${datos}.${hmac(secreto('qrSecreto'), datos).slice(0, 22)}`;
  }
  function leerToken(token) {
    const [datos, firma] = String(token || '').split('.');
    if (!datos || !firma) return null;
    if (!igual(hmac(secreto('qrSecreto'), datos).slice(0, 22), firma)) return null;
    try { return JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')); } catch { return null; }
  }

  /** Cookie de sesión sin estado: base64url(JSON) + "." + HMAC(SESSION_SECRET). */
  function cookieSesion(nombre, payload, maxAge) {
    const valor = payload ? (() => { const d = Buffer.from(JSON.stringify({ ...payload, x: Date.now() + maxAge * 1000 })).toString('base64url'); return `${d}.${hmac(secreto('sesionSecreto'), `${nombre}:${d}`)}`; })() : '';
    return `${nombre}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${payload ? maxAge : 0}${seguro ? '; Secure' : ''}`;
  }
  function leerCookie(req, nombre) {
    const crudo = String(req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${nombre}=`));
    if (!crudo) return null;
    const [d, firma] = crudo.slice(nombre.length + 1).split('.');
    if (!d || !firma || !igual(hmac(secreto('sesionSecreto'), `${nombre}:${d}`), firma)) return null;
    try {
      const p = JSON.parse(Buffer.from(d, 'base64url').toString('utf8'));
      return p.x > Date.now() ? p : null;
    } catch { return null; }
  }

  // ---------- Datos ----------

  function aObjetos(filas) {
    const [cab = [], ...resto] = filas;
    return resto
      .filter((f) => f.some((v) => v !== '' && v !== null && v !== undefined))
      .map((f) => Object.fromEntries(cab.map((h, i) => [String(h), f[i] === undefined || f[i] === null ? '' : String(f[i])])));
  }

  /** Lee Config y las pestañas pedidas. Config se relee en cada petición (roles, costos, apertura). */
  async function datos(...pestanas) {
    const pedir = ['Config', ...pestanas.filter((p) => p !== 'Config')];
    let crudo;
    try {
      crudo = await leer(pedir);
    } catch (e) {
      log.error('[api] lectura del libro:', e.message);
      fallo(503, 'NO_DISPONIBLE', 'No pudimos consultar la base de datos. Inténtalo de nuevo en unos minutos.');
    }
    const config = {};
    for (const f of (crudo.Config || []).slice(1)) if (f[0]) config[String(f[0]).trim()] = String(f[1] ?? '').trim();
    const out = { config };
    for (const p of pestanas) if (p !== 'Config') out[p] = aObjetos(crudo[p] || []);
    return out;
  }

  function urlSitio(config, req) {
    const deEnv = String(env.urlSitio || '').replace(/\/+$/, '');
    if (deEnv) return deEnv;
    const deConfig = String(config.URL_SITIO || '');
    if (/^https?:\/\//.test(deConfig)) return deConfig.replace(/\/+$/, '');
    return `${seguro ? 'https' : 'http'}://${req.headers.host}`;
  }

  function roles(config) {
    return {
      admin: lista(config.ADMIN_EMAILS).length ? lista(config.ADMIN_EMAILS) : env.adminEmails || [],
      verificador: lista(config.VERIFICADORES_EMAILS).length ? lista(config.VERIFICADORES_EMAILS) : env.verificadoresEmails || [],
    };
  }
  function rolDe(config, email) {
    const r = roles(config);
    return r.admin.includes(email) ? 'admin' : r.verificador.includes(email) ? 'verificador' : null;
  }

  async function escribir(accion, datosEscritor, idem, base) {
    const r = await escritor.llamar(accion, datosEscritor, idem, base);
    if (r && r.ok) return r;
    const codigo = (r && r.codigo) || 'ESCRITOR';
    if (HTTP_ESCRITOR[codigo]) fallo(HTTP_ESCRITOR[codigo], codigo, r.mensaje);
    log.error(`[api] escritor ${accion}:`, codigo, r && r.mensaje);
    if (codigo === 'NO_DISPONIBLE') fallo(503, 'NO_DISPONIBLE', 'El registro aún no está habilitado. Inténtalo más tarde.');
    fallo(502, 'ESCRITOR', 'No pudimos guardar la información. Inténtalo de nuevo en unos minutos.');
  }

  // ---------- Sesiones ----------

  function catequistaDe(req, d) {
    const s = leerCookie(req, COOKIE_CAT);
    const c = s && s.k === 'cat' && d.Catequistas.find((x) => x.id === s.i);
    return c && !FUERA.includes(c.estado) ? c : null;
  }
  function staffDe(req, config) {
    const s = leerCookie(req, COOKIE_STAFF);
    if (!s || s.k !== 'stf') return null;
    const rol = rolDe(config, s.e); // los roles se releen en cada petición
    return rol ? { email: s.e, rol } : null;
  }
  function exigirAdmin(req, config) {
    const s = staffDe(req, config);
    if (!s) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
    if (s.rol !== 'admin') fallo(403, 'PROHIBIDO', 'Tu cuenta solo puede verificar pases.');
    return s;
  }

  // ---------- Límite de intentos (por instancia; la espera fija protege igualmente) ----------

  const intentos = new Map();
  function limitarIntentos(clave) {
    const r = intentos.get(clave);
    if (r && r.hasta > Date.now() && r.n >= 5) fallo(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.');
  }
  function registrarFallo(clave) {
    const r = intentos.get(clave);
    const vigente = r && r.hasta > Date.now();
    intentos.set(clave, { n: vigente ? r.n + 1 : 1, hasta: vigente ? r.hasta : Date.now() + 15 * 60 * 1000 });
    if (intentos.size > 5000) for (const [k, v] of intentos) if (v.hasta < Date.now()) intentos.delete(k);
  }

  // ---------- Archivos ----------

  function archivoDataUrl(dataUrl, tiposPermitidos, maxBytes, etiqueta) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) fallo(400, 'VALIDACION', `${etiqueta}: archivo no válido.`, { [etiqueta]: 'Archivo no válido' });
    if (!tiposPermitidos.includes(m[1])) fallo(400, 'VALIDACION', `${etiqueta}: formato no permitido.`);
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > maxBytes) fallo(400, 'VALIDACION', `${etiqueta}: el archivo supera el tamaño máximo.`);
    const ok = (m[1] === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) || (m[1] === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50) || (m[1] === 'image/webp' && bytes.subarray(8, 12).toString() === 'WEBP');
    if (!ok) fallo(400, 'VALIDACION', `${etiqueta}: el contenido no coincide con el tipo de archivo.`);
    return { mime: m[1], bytes, b64: m[2], sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  const paraEscritor = (a) => ({ mime: a.mime, b64: a.bytes.toString('base64') });

  // ---------- Vistas ----------

  const urlCarnet = (base, c) => `${base}/verificar/?c=${firmarToken({ k: 'c', i: c.id })}`;
  const urlPase = (base, s) => `${base}/verificar/?t=${s.qr_token}`;

  function semanaPublica(config, semana) {
    const edicion = String(config.SEMANA_EDICION || '');
    const inscritos = semana.filter((s) => s.edicion === edicion && s.estado !== 'ANULADA').length;
    const cupo = num(config.SEMANA_CUPO);
    const definido = (v) => (v && v !== 'POR DEFINIR' ? v : 'Por confirmar');
    return {
      edicion, abierta: bool(config.SEMANA_ABIERTA), fechas: definido(config.SEMANA_FECHAS), sede: definido(config.SEMANA_SEDE),
      cupo, inscritos, hayCupo: cupo === 0 || inscritos < cupo, costo: num(config.COSTO_SEMANA), moneda: config.MONEDA || 'B/.',
      campos: { talla: config.SEMANA_PEDIR_TALLA === undefined ? true : bool(config.SEMANA_PEDIR_TALLA), restricciones: config.SEMANA_PEDIR_RESTRICCIONES === undefined ? true : bool(config.SEMANA_PEDIR_RESTRICCIONES) },
    };
  }

  function inscripcionVigente(semana, c, edicion) {
    return semana.find((s) => s.catequista_id === c.id && s.edicion === edicion && s.estado !== 'ANULADA');
  }

  function vistaPortal(d, c, base) {
    const sp = semanaPublica(d.config, d.SemanaCatequista);
    const insc = inscripcionVigente(d.SemanaCatequista, c, sp.edicion);
    return {
      catequista: {
        numero: c.numero_catequista, nombres: c.nombres, apellidos: c.apellidos, correo: c.correo, telefono: c.telefono,
        parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, zona_pastoral: territorio.clasificar(c).zona.replace(territorio.SIN_CLASIFICAR, ''), estado: c.estado, fecha_registro: c.fecha_registro, vigencia_hasta: c.vigencia_hasta,
        fotoUrl: c.foto_file_id ? '/api/portal/archivo/foto' : '', firmaUrl: c.firma_file_id ? '/api/portal/archivo/firma' : '',
        verificacionUrl: urlCarnet(base, c),
      },
      // El carnet se entrega solo cuando la Comisión aprueba el registro.
      documentos: { pdf: c.pdf_inscripcion_file_id ? '/api/portal/archivo/pdf' : '', carnet: c.carnet_file_id && c.estado === 'ACTIVO' ? '/api/portal/archivo/carnet' : '' },
      semana: {
        ...sp,
        puedeInscribirse: c.estado === 'ACTIVO' && sp.abierta && sp.hayCupo && !insc,
        inscripcion: insc ? {
          numero: insc.numero_inscripcion_semana, estado: insc.estado, fecha: insc.fecha_inscripcion, talla: insc.talla_camiseta,
          restricciones: insc.restricciones_alimentarias, verificacionUrl: urlPase(base, insc), checkin_at: insc.checkin_at, pase: '/api/portal/archivo/pase',
        } : null,
      },
    };
  }

  // ---------- Documentos ----------

  async function documentosCatequista(c, config, base, foto, firma) {
    const urlVerificacion = urlCarnet(base, c);
    const [ficha, carnet] = await Promise.all([
      pdf.fichaInscripcion(c, { foto, firma, moneda: config.MONEDA || 'B/.', costo: config.COSTO_REGISTRO, urlVerificacion }),
      pdf.carnet(c, { foto, firma, urlVerificacion }),
    ]);
    return { pdf: ficha.toString('base64'), carnet: carnet.toString('base64') };
  }

  async function documentoPase(s, c, config, base) {
    return pdf.pase(s, c, semanaPublica(config, []), urlPase(base, s));
  }

  // ---------- Rutas ----------

  const rutas = [];
  const ruta = (metodo, patron, fn, opciones = {}) => rutas.push({ metodo, patron, fn, ...opciones });

  ruta('GET', /^\/api\/salud$/, async () => {
    let configLeida = false;
    try { configLeida = Object.keys((await datos()).config).length > 0; } catch { /* configLeida = false */ }
    return { ok: true, modo, configLeida, escritor: escritor.disponible, hora: ahora() };
  });

  // Catálogo zona → vicaría → parroquia (con coordinador sugerido) para el formulario de registro.
  ruta('GET', /^\/api\/territorio$/, () => ({ ok: true, ...territorio.catalogoPublico() }));

  ruta('GET', /^\/api\/config-publica$/, async (req) => {
    const d = await datos('SemanaCatequista');
    const c = d.config;
    return {
      ok: true,
      config: {
        modo, googleClientId: env.googleClientId || '', urlSitio: urlSitio(c, req),
        registroAbierto: bool(c.REGISTRO_ABIERTO) && escritor.disponible, costoRegistro: num(c.COSTO_REGISTRO), costoSemana: num(c.COSTO_SEMANA), moneda: c.MONEDA || 'B/.',
        yappy: { directorio: c.YAPPY_DIRECTORIO, telefono: c.YAPPY_TELEFONO, instrucciones: c.YAPPY_INSTRUCCIONES },
        semana: semanaPublica(c, d.SemanaCatequista),
      },
    };
  });

  // Registro de catequista
  ruta('POST', /^\/api\/registro$/, async (req, ctx) => {
    const b = ctx.cuerpo;
    const dd = b.datos || {};
    const campos = {};
    const exigir = (k, ok, msg) => { if (!ok) campos[k] = msg; };
    const v = {
      nombres: texto(dd.nombres, 80), apellidos: texto(dd.apellidos, 80), cedula: normCedula(dd.cedula), fecha_nacimiento: texto(dd.fecha_nacimiento, 10),
      sexo: texto(dd.sexo, 20), telefono: normTel(dd.telefono), correo: normCorreo(dd.correo), direccion: texto(dd.direccion, 200),
      anios_servicio: Math.max(0, Math.min(80, Math.floor(num(dd.anios_servicio)))),
      nivel_que_imparte: (Array.isArray(dd.nivel_que_imparte) ? dd.nivel_que_imparte : [dd.nivel_que_imparte]).map((x) => texto(x, 60)).filter(Boolean).slice(0, 10).join('; '),
      formacion_cenafca: texto(dd.formacion_cenafca, 60), coordinador_parroquial: texto(dd.coordinador_parroquial, 120),
      yappy_referencia: normRef(dd.yappy_referencia),
    };
    // Parroquia del catálogo: la vicaría y la zona se toman del catálogo, no del cliente.
    const lugar = territorio.resolverParroquia(dd);
    if (lugar.error) Object.assign(campos, lugar.error);
    else Object.assign(v, { parroquia: lugar.parroquia, vicaria_zona: lugar.vicaria_zona, zona_pastoral: lugar.zona_pastoral, coordinador_parroquial: v.coordinador_parroquial || lugar.coordinador });
    exigir('nombres', v.nombres.length >= 2, 'Escribe tus nombres.');
    exigir('apellidos', v.apellidos.length >= 2, 'Escribe tus apellidos.');
    exigir('cedula', RE_CEDULA.test(v.cedula), 'Cédula con formato no válido.');
    exigir('fecha_nacimiento', /^\d{4}-\d{2}-\d{2}$/.test(v.fecha_nacimiento), 'Fecha no válida.');
    exigir('sexo', ['Femenino', 'Masculino'].includes(v.sexo), 'Selecciona una opción.');
    exigir('telefono', /^(?:6\d{7}|[2-9]\d{6})$/.test(v.telefono), 'Teléfono no válido.');
    exigir('correo', RE_CORREO.test(v.correo), 'Correo no válido.');
    exigir('nivel_que_imparte', !!v.nivel_que_imparte, 'Selecciona al menos un nivel.');
    exigir('formacion_cenafca', !!v.formacion_cenafca, 'Selecciona una opción.');
    exigir('yappy_referencia', /^[A-Z0-9-]{4,40}$/.test(v.yappy_referencia), 'Referencia de Yappy no válida.');
    exigir('consentimiento_datos', dd.consentimiento_datos === true, 'Debes aceptar el tratamiento de datos.');
    exigir('consentimiento_imagen', dd.consentimiento_imagen === true, 'Debes aceptar el uso de la foto.');
    if (Object.keys(campos).length) fallo(400, 'VALIDACION', 'Revisa los datos marcados.', campos);

    const foto = archivoDataUrl(b.foto, ['image/jpeg'], 700 * 1024, 'foto');
    const firma = archivoDataUrl(b.firma, ['image/png'], 700 * 1024, 'firma');
    const comp = archivoDataUrl(b.comprobante, ['image/jpeg', 'image/png', 'image/webp'], 2.5 * 1024 * 1024, 'comprobante');
    if (b.comprobante_sha256 && b.comprobante_sha256 !== comp.sha256) fallo(400, 'VALIDACION', 'El comprobante llegó dañado. Vuelve a adjuntarlo.');

    const d = await datos('Catequistas', 'Pagos');
    const base = urlSitio(d.config, req);
    if (!bool(d.config.REGISTRO_ABIERTO)) fallo(409, 'CERRADO', 'El registro de catequistas está cerrado en este momento.');
    // Comprobación previa (respuesta rápida, sin subir archivos). La definitiva la hace el escritor bajo bloqueo.
    // Un registro rechazado (y su pago) no bloquea un registro nuevo corregido.
    let conflicto = null;
    const pagosVigentes = d.Pagos.filter((p) => p.estado !== 'RECHAZADO');
    if (d.Catequistas.some((c) => c.estado !== 'RECHAZADO' && (c.correo.toLowerCase() === v.correo || c.cedula.toUpperCase() === v.cedula))) {
      conflicto = [409, 'DUPLICADO', 'Ya existe un registro con estos datos. Si ya te registraste, puedes recuperar tu número de catequista por correo.'];
    } else if (pagosVigentes.some((p) => p.comprobante_sha256 === comp.sha256)) {
      conflicto = [409, 'COMPROBANTE_REPETIDO', 'Este comprobante ya fue utilizado en otro registro. Adjunta el comprobante de tu propio pago.'];
    } else if (pagosVigentes.some((p) => normRef(p.yappy_referencia) === v.yappy_referencia)) {
      conflicto = [409, 'REFERENCIA_REPETIDA', 'Esta referencia de Yappy ya fue registrada. Revisa el número de confirmación de tu pago.'];
    }

    // 1) Escritor: archivos + consecutivo + fila PENDIENTE_DOCUMENTOS + pago.
    // Si hay conflicto puede ser un reintento de este mismo envío: el escritor responde solo desde su caché.
    let r1;
    if (conflicto) {
      r1 = await escritor.llamar('registrarCatequista', { soloCache: true }, ctx.idem, base);
      if (!r1.ok) fallo(...conflicto);
    } else {
      r1 = await escribir('registrarCatequista', { campos: v, foto: paraEscritor(foto), firma: paraEscritor(firma), comprobante: paraEscritor(comp), comprobante_sha256: comp.sha256 }, ctx.idem, base);
    }
    const c = { ...v, id: r1.id, numero_catequista: r1.numero, fecha_registro: r1.fecha_registro, vigencia_hasta: r1.vigencia_hasta, consentimiento_datos: r1.fecha_registro, consentimiento_imagen: r1.fecha_registro };

    // 2) y 3) Documentos + estado + correo. El escritor deja el registro PENDIENTE_APROBACION (correo de
    // «recibido») o ACTIVO si Config no exige aprobación. Si fallan, queda PENDIENTE_DOCUMENTOS y se
    // regenera desde el panel.
    let r2 = null;
    try {
      const docs = await documentosCatequista(c, d.config, base, foto, firma);
      r2 = await escritor.llamar('adjuntarDocumentos', { id: c.id, ...docs, enviarCorreo: true }, ctx.idem, base);
      if (!r2.ok) log.error('[api] adjuntarDocumentos:', r2.codigo, r2.mensaje);
    } catch (e) {
      log.error('[api] documentos del registro:', e.message);
    }
    const listo = !!(r2 && r2.ok);
    const estado = listo ? r2.estado || 'ACTIVO' : 'PENDIENTE_DOCUMENTOS';
    ctx.cookies.push(cookieSesion(COOKIE_CAT, { k: 'cat', i: c.id }, SESION_CAT_S));
    return {
      ok: true, numero: c.numero_catequista, estado, correoEnviado: !!(listo && r2.correoEnviado), correo: c.correo,
      parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, zona_pastoral: c.zona_pastoral,
      documentos: { pdf: listo ? '/api/portal/archivo/pdf' : '', carnet: estado === 'ACTIVO' ? '/api/portal/archivo/carnet' : '' },
    };
  }, { idempotente: true });

  ruta('POST', /^\/api\/recuperar$/, async (req, ctx) => {
    const correo = normCorreo(ctx.cuerpo.correo);
    if (!RE_CORREO.test(correo)) fallo(400, 'VALIDACION', 'Escribe un correo válido.', { correo: 'Correo no válido' });
    limitarIntentos(`rec:${correo}`);
    registrarFallo(`rec:${correo}`);
    const inicio = Date.now();
    const r = await escritor.llamar('recuperarNumero', { correo }, '', urlSitio((await datos()).config, req));
    if (!r.ok) log.error('[api] recuperarNumero:', r.codigo, r.mensaje);
    await espera(Math.max(0, 400 - (Date.now() - inicio)));
    return { ok: true, mensaje: 'Si el correo está registrado, recibirás tu número de catequista en unos minutos. Revisa también la carpeta de spam.' };
  });

  // Portal del catequista
  ruta('POST', /^\/api\/portal\/entrar$/, async (req, ctx) => {
    const correo = normCorreo(ctx.cuerpo.correo);
    const numero = normNumero(ctx.cuerpo.numero);
    const claves = [`acc:${correo}`, `ip:${ctx.ip}`];
    claves.forEach(limitarIntentos);
    const inicio = Date.now();
    const d = await datos('Catequistas');
    const c = d.Catequistas.find((x) => x.correo.toLowerCase() === correo && x.numero_catequista === numero && !FUERA.includes(x.estado));
    await espera(Math.max(0, 700 - (Date.now() - inicio))); // espera fija, con y sin acierto
    if (!c) {
      claves.forEach(registrarFallo);
      fallo(401, 'CREDENCIALES', 'No pudimos validar los datos. Revisa tu correo y tu número de catequista.');
    }
    claves.forEach((k) => intentos.delete(k));
    ctx.cookies.push(cookieSesion(COOKIE_CAT, { k: 'cat', i: c.id }, SESION_CAT_S));
    return { ok: true };
  });
  ruta('POST', /^\/api\/portal\/salir$/, (req, ctx) => {
    ctx.cookies.push(cookieSesion(COOKIE_CAT, null, 0));
    return { ok: true };
  });
  ruta('GET', /^\/api\/portal\/yo$/, async (req) => {
    const d = await datos('Catequistas', 'SemanaCatequista');
    const c = catequistaDe(req, d);
    if (!c) fallo(401, 'NO_AUTENTICADO', 'Tu sesión terminó. Vuelve a entrar.');
    return { ok: true, ...vistaPortal(d, c, urlSitio(d.config, req)) };
  });
  ruta('GET', /^\/api\/portal\/archivo\/(foto|firma|pdf|carnet|pase)$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista');
    const c = catequistaDe(req, d);
    if (!c) fallo(401, 'NO_AUTENTICADO', 'Tu sesión terminó. Vuelve a entrar.');
    const clave = ctx.m[1];
    if (clave === 'pase') {
      const s = inscripcionVigente(d.SemanaCatequista, c, String(d.config.SEMANA_EDICION || ''));
      if (!s) fallo(404, 'INEXISTENTE', 'El archivo aún no está disponible.');
      return { generado: { mime: 'application/pdf', bytes: await documentoPase(s, c, d.config, urlSitio(d.config, req)), nombre: `${s.numero_inscripcion_semana}_pase.pdf` }, descarga: true };
    }
    if (clave === 'carnet' && c.estado !== 'ACTIVO') fallo(404, 'INEXISTENTE', 'Tu carnet estará disponible cuando la Comisión apruebe tu registro.');
    const fileId = { foto: c.foto_file_id, firma: c.firma_file_id, pdf: c.pdf_inscripcion_file_id, carnet: c.carnet_file_id }[clave];
    return { archivo: fileId, descarga: clave === 'pdf' || clave === 'carnet' };
  });

  // Semana del Catequista
  ruta('POST', /^\/api\/semana\/inscribir$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista', 'Pagos');
    const c = catequistaDe(req, d);
    if (!c) fallo(401, 'NO_AUTENTICADO', 'Tu sesión terminó. Vuelve a entrar.');
    if (c.estado !== 'ACTIVO') fallo(403, 'NO_ACTIVO', 'Tu registro aún no está activo. Contacta a la Comisión.');
    const sp = semanaPublica(d.config, d.SemanaCatequista);
    // Id determinista por clave de idempotencia: un reintento produce el mismo token de QR.
    const id = crypto.createHash('sha256').update(`semana:${c.id}:${ctx.idem}`).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5');
    const yaEsta = d.SemanaCatequista.find((s) => s.id === id);
    if (!yaEsta) {
      if (!sp.abierta) fallo(409, 'CERRADO', 'La inscripción a la Semana del Catequista está cerrada.');
      if (!sp.hayCupo) fallo(409, 'SIN_CUPO', 'Se agotaron los cupos de esta edición.');
      if (inscripcionVigente(d.SemanaCatequista, c, sp.edicion)) fallo(409, 'YA_INSCRITO', 'Ya estás inscrito(a) en esta edición.');
    }
    const b = ctx.cuerpo;
    const campos = {};
    const tel = normTel(b.telefono);
    if (!/^(?:6\d{7}|[2-9]\d{6})$/.test(tel)) campos.telefono = 'Teléfono no válido.';
    const ref = normRef(b.yappy_referencia);
    if (!/^[A-Z0-9-]{4,40}$/.test(ref)) campos.yappy_referencia = 'Referencia de Yappy no válida.';
    if (sp.campos.talla && !['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(b.talla_camiseta)) campos.talla_camiseta = 'Selecciona una talla.';
    if (Object.keys(campos).length) fallo(400, 'VALIDACION', 'Revisa los datos marcados.', campos);
    const comp = archivoDataUrl(b.comprobante, ['image/jpeg', 'image/png', 'image/webp'], 2.5 * 1024 * 1024, 'comprobante');
    if (!yaEsta) {
      if (d.Pagos.some((p) => p.comprobante_sha256 === comp.sha256)) fallo(409, 'COMPROBANTE_REPETIDO', 'Este comprobante ya fue utilizado. Adjunta el comprobante de este pago.');
      if (d.Pagos.some((p) => normRef(p.yappy_referencia) === ref)) fallo(409, 'REFERENCIA_REPETIDA', 'Esta referencia de Yappy ya fue registrada.');
    }

    const qr_token = firmarToken({ k: 't', i: id, n: c.numero_catequista, e: sp.edicion });
    const base = urlSitio(d.config, req);
    const r1 = await escribir('inscribirSemana', {
      id, catequista_id: c.id, telefono: tel, talla_camiseta: sp.campos.talla ? b.talla_camiseta : '',
      restricciones_alimentarias: sp.campos.restricciones ? texto(b.restricciones_alimentarias, 300) : '',
      yappy_referencia: ref, comprobante: paraEscritor(comp), comprobante_sha256: comp.sha256, qr_token,
    }, ctx.idem, base);

    const s = { id, numero_inscripcion_semana: r1.numero, edicion: r1.edicion || sp.edicion, talla_camiseta: sp.campos.talla ? b.talla_camiseta : '', qr_token };
    let correoEnviado = false;
    try {
      const [qr, pase] = await Promise.all([pdf.qrPng(urlPase(base, s)), documentoPase(s, c, d.config, base)]);
      const r2 = await escritor.llamar('adjuntarPase', { id, qr: qr.toString('base64'), pase: pase.toString('base64'), enviarCorreo: true }, ctx.idem, base);
      if (!r2.ok) log.error('[api] adjuntarPase:', r2.codigo, r2.mensaje);
      correoEnviado = !!(r2.ok && r2.correoEnviado);
    } catch (e) {
      log.error('[api] pase de la Semana:', e.message);
    }
    return { ok: true, numero: r1.numero, verificacionUrl: urlPase(base, s), correoEnviado };
  }, { idempotente: true });

  // Verificación pública
  ruta('GET', /^\/api\/verificar$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista');
    const staff = staffDe(req, d.config);
    const tc = ctx.url.searchParams.get('c');
    const tt = ctx.url.searchParams.get('t');
    const p = leerToken(tc || tt);
    const tipo = tc ? 'carnet' : 'pase';
    if (!p || (tc && p.k !== 'c') || (tt && p.k !== 't')) return { ok: true, tipo, estado: 'INEXISTENTE', staff: !!staff };
    if (p.k === 'c') {
      const c = d.Catequistas.find((x) => x.id === p.i);
      if (!c) return { ok: true, tipo, estado: 'INEXISTENTE', staff: !!staff };
      const vencido = c.vigencia_hasta && c.vigencia_hasta < hoyPanama();
      const estado = FUERA.includes(c.estado) ? 'ANULADO' : vencido ? 'VENCIDO' : c.estado === 'ACTIVO' ? 'VALIDO' : 'PENDIENTE';
      return {
        ok: true, tipo, estado, staff: !!staff, publico: { numero: c.numero_catequista, vigencia_hasta: c.vigencia_hasta },
        detalle: staff ? { nombre: nombreDe(c), numero: c.numero_catequista, parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, fotoUrl: `/api/admin/archivo/catequistas/${c.id}/foto` } : undefined,
      };
    }
    const s = d.SemanaCatequista.find((x) => x.id === p.i);
    const c = s && d.Catequistas.find((x) => x.id === s.catequista_id);
    if (!s || !c || s.qr_token !== tt) return { ok: true, tipo, estado: 'INEXISTENTE', staff: !!staff };
    const estado = s.estado === 'ANULADA' || c.estado === 'ANULADO' ? 'ANULADO' : s.edicion !== String(d.config.SEMANA_EDICION) ? 'OTRA_EDICION' : 'VALIDO';
    return {
      ok: true, tipo, estado, staff: !!staff, publico: { edicion: s.edicion },
      detalle: staff ? { nombre: nombreDe(c), numero: c.numero_catequista, numeroInscripcion: s.numero_inscripcion_semana, parroquia: c.parroquia, vicaria_zona: c.vicaria_zona, edicion: s.edicion, talla: s.talla_camiseta, restricciones: s.restricciones_alimentarias, checkin_at: s.checkin_at, checkin_por: s.checkin_por, fotoUrl: `/api/admin/archivo/catequistas/${c.id}/foto` } : undefined,
    };
  });
  ruta('POST', /^\/api\/verificar\/entrada$/, async (req, ctx) => {
    const d = await datos();
    const staff = staffDe(req, d.config);
    if (!staff) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión como verificador para registrar entradas.');
    const p = leerToken(ctx.cuerpo.t);
    if (!p || p.k !== 't' || !RE_ID.test(String(p.i))) fallo(404, 'INEXISTENTE', 'Pase inexistente.');
    const r = await escribir('registrarEntrada', { id: p.i, por: staff.email }, '', urlSitio(d.config, req));
    return { ok: true, yaHabiaEntrado: r.yaHabiaEntrado, checkin_at: r.checkin_at, checkin_por: r.checkin_por };
  });

  // Autenticación del personal
  ruta('POST', /^\/api\/auth\/google$/, async (req, ctx) => {
    let email;
    try {
      email = await verificarGoogle(ctx.cuerpo.credential);
    } catch (e) {
      log.error('[api] ID token:', e.message);
      fallo(401, 'NO_AUTENTICADO', 'No pudimos verificar tu cuenta de Google. Inténtalo de nuevo.');
    }
    const d = await datos();
    if (!rolDe(d.config, email)) fallo(403, 'PROHIBIDO', 'Esta cuenta no tiene acceso al panel.');
    ctx.cookies.push(cookieSesion(COOKIE_STAFF, { k: 'stf', e: email }, SESION_STAFF_S));
    return { ok: true };
  });
  if (modo === 'simulado') {
    // Solo con Google emulado (pruebas locales): selector de cuenta sin Google.
    ruta('POST', /^\/api\/auth\/simulado$/, async (req, ctx) => {
      const email = normCorreo(ctx.cuerpo.email);
      const d = await datos();
      if (!rolDe(d.config, email)) fallo(403, 'PROHIBIDO', 'Esta cuenta no tiene acceso al panel.');
      ctx.cookies.push(cookieSesion(COOKIE_STAFF, { k: 'stf', e: email }, SESION_STAFF_S));
      return { ok: true };
    });
  }
  ruta('POST', /^\/api\/auth\/salir$/, (req, ctx) => {
    ctx.cookies.push(cookieSesion(COOKIE_STAFF, null, 0));
    return { ok: true };
  });
  ruta('GET', /^\/api\/auth\/yo$/, async (req) => {
    const d = await datos();
    const s = staffDe(req, d.config);
    if (!s) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
    return { ok: true, email: s.email, rol: s.rol };
  });

  // Administración
  ruta('GET', /^\/api\/admin\/resumen$/, async (req) => {
    const d = await datos('Catequistas', 'SemanaCatequista', 'Pagos', 'Correos');
    exigirAdmin(req, d.config);
    const ed = String(d.config.SEMANA_EDICION || '');
    const cat = d.Catequistas;
    const sem = d.SemanaCatequista.filter((s) => s.edicion === ed);
    const est = await escritor.llamar('estado', {});
    return {
      ok: true, edicion: ed, moneda: d.config.MONEDA || 'B/.',
      registrados: cat.length, activos: cat.filter((c) => c.estado === 'ACTIVO').length,
      porAprobar: cat.filter((c) => c.estado === 'PENDIENTE_APROBACION').length, rechazados: cat.filter((c) => c.estado === 'RECHAZADO').length,
      pendientes: cat.filter((c) => c.estado === 'PENDIENTE_DOCUMENTOS').length, anulados: cat.filter((c) => c.estado === 'ANULADO').length,
      inscritosSemana: sem.filter((s) => s.estado !== 'ANULADA').length, entradas: sem.filter((s) => s.checkin_at && s.estado !== 'ANULADA').length,
      recaudado: d.Pagos.filter((p) => p.estado === 'DECLARADO_AUTO').reduce((a, p) => a + num(p.monto), 0),
      cuotaCorreo: est.ok ? est.cuotaCorreo : null,
      correosPendientes: d.Correos.filter((c) => c.estado === 'PENDIENTE').length,
    };
  });
  const coincide = (q, ...vals) => !q || vals.some((x) => String(x || '').toLowerCase().includes(q));
  ruta('GET', /^\/api\/admin\/catequistas$/, async (req, ctx) => {
    const d = await datos('Catequistas');
    exigirAdmin(req, d.config);
    const q = (ctx.url.searchParams.get('q') || '').trim().toLowerCase();
    const estado = ctx.url.searchParams.get('estado') || '';
    // Filtros del dashboard: zona, vicaría o parroquia exactas (como las agrupa territorio.clasificar).
    const filtro = ['zona', 'vicaria', 'parroquia'].map((k) => [k, ctx.url.searchParams.get(k) || '']).filter(([, val]) => val);
    // La cola de aprobación se atiende por orden de llegada; el resto, del más reciente al más antiguo.
    const orden = estado === 'PENDIENTE_APROBACION' ? 1 : -1;
    const items = d.Catequistas
      .filter((c) => (!estado || c.estado === estado) && coincide(q, c.numero_catequista, c.nombres, c.apellidos, c.cedula, c.correo, c.parroquia))
      .map((c) => ({ c, k: territorio.clasificar(c) }))
      .filter(({ k }) => filtro.every(([campo, val]) => k[campo] === val))
      .sort((a, b) => orden * a.c.numero_catequista.localeCompare(b.c.numero_catequista))
      .map(({ c, k }) => ({ id: c.id, numero: c.numero_catequista, nombre: nombreDe(c), cedula: c.cedula, correo: c.correo, parroquia: c.parroquia, vicaria_zona: k.vicaria, zona_pastoral: k.zona, estado: c.estado, fecha_registro: c.fecha_registro }));
    return { ok: true, items };
  });

  // Dashboard: catequistas por zona → vicaría → parroquia, con el conteo por estado en cada nivel.
  ruta('GET', /^\/api\/admin\/estadisticas$/, async (req) => {
    const d = await datos('Catequistas');
    exigirAdmin(req, d.config);
    return { ok: true, ...territorio.estadisticas(d.Catequistas), generado: ahora() };
  });

  // Aprobación o rechazo de un registro pendiente.
  ruta('POST', /^\/api\/admin\/(aprobar|rechazar)$/, async (req, ctx) => {
    const d = await datos('Catequistas');
    const a = exigirAdmin(req, d.config);
    const decision = ctx.m[1] === 'aprobar' ? 'APROBAR' : 'RECHAZAR';
    const id = String(ctx.cuerpo.id || '');
    const motivo = texto(ctx.cuerpo.motivo, 300);
    if (decision === 'RECHAZAR' && motivo.length < 5) fallo(400, 'VALIDACION', 'Escribe el motivo del rechazo (mínimo 5 caracteres). Se enviará al catequista.', { motivo: 'Motivo obligatorio' });
    const c = RE_ID.test(id) && d.Catequistas.find((x) => x.id === id);
    if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
    const r = await escribir('revisar', { id, decision, motivo, por: a.email }, ctx.idem, urlSitio(d.config, req));
    const aviso = r.yaRevisado ? 'Este registro ya estaba revisado.'
      : decision === 'APROBAR' ? (r.correoEnviado ? 'Registro aprobado. Enviamos el carnet al catequista.' : 'Registro aprobado. El correo con el carnet quedó pendiente y se reintentará automáticamente.')
        : (r.correoEnviado ? 'Registro rechazado. Enviamos el motivo al catequista.' : 'Registro rechazado. El correo quedó pendiente y se reintentará automáticamente.');
    return { ok: true, estado: r.estado, yaRevisado: !!r.yaRevisado, correoEnviado: !!r.correoEnviado, mensaje: aviso };
  }, { idempotente: true });
  const SIN_ARCHIVOS = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.endsWith('_file_id') && k !== 'qr_token' && k !== 'comprobante_sha256'));
  ruta('GET', /^\/api\/admin\/catequistas\/([\w-]+)$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista', 'Pagos', 'Correos');
    exigirAdmin(req, d.config);
    const c = d.Catequistas.find((x) => x.id === ctx.m[1]);
    if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
    const base = `/api/admin/archivo/catequistas/${c.id}/`;
    return {
      ok: true, item: SIN_ARCHIVOS(c),
      archivos: { foto: c.foto_file_id ? `${base}foto` : '', firma: c.firma_file_id ? `${base}firma` : '', comprobante: c.comprobante_file_id ? `${base}comprobante` : '', pdf: c.pdf_inscripcion_file_id ? `${base}pdf` : '', carnet: c.carnet_file_id ? `${base}carnet` : '' },
      pagos: d.Pagos.filter((p) => p.numero_catequista === c.numero_catequista).map(SIN_ARCHIVOS),
      semana: d.SemanaCatequista.filter((s) => s.catequista_id === c.id).map((s) => ({ id: s.id, numero: s.numero_inscripcion_semana, edicion: s.edicion, estado: s.estado, checkin_at: s.checkin_at })),
      correos: d.Correos.filter((m) => m.referencia_id === c.id),
      verificacionUrl: urlCarnet(urlSitio(d.config, req), c),
    };
  });
  ruta('GET', /^\/api\/admin\/semana$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista');
    exigirAdmin(req, d.config);
    const ed = String(d.config.SEMANA_EDICION || '');
    const q = (ctx.url.searchParams.get('q') || '').trim().toLowerCase();
    const items = d.SemanaCatequista
      .filter((s) => s.edicion === ed)
      .map((s) => ({ s, c: d.Catequistas.find((x) => x.id === s.catequista_id) || {} }))
      .filter(({ s, c }) => coincide(q, s.numero_inscripcion_semana, s.numero_catequista, c.nombres, c.apellidos, c.parroquia, s.correo))
      .sort((a, b) => b.s.numero_inscripcion_semana.localeCompare(a.s.numero_inscripcion_semana))
      .map(({ s, c }) => ({ id: s.id, numero: s.numero_inscripcion_semana, numero_catequista: s.numero_catequista, nombre: nombreDe(c), parroquia: c.parroquia, estado: s.estado, talla: s.talla_camiseta, restricciones: s.restricciones_alimentarias, checkin_at: s.checkin_at, fecha: s.fecha_inscripcion }));
    return { ok: true, items, edicion: ed };
  });
  ruta('GET', /^\/api\/admin\/semana\/([\w-]+)$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista', 'Pagos', 'Correos');
    exigirAdmin(req, d.config);
    const s = d.SemanaCatequista.find((x) => x.id === ctx.m[1]);
    if (!s) fallo(404, 'INEXISTENTE', 'Inscripción no encontrada.');
    const c = d.Catequistas.find((x) => x.id === s.catequista_id) || {};
    const base = `/api/admin/archivo/semana/${s.id}/`;
    return {
      ok: true, item: { ...SIN_ARCHIVOS(s), nombre: nombreDe(c), parroquia: c.parroquia, vicaria_zona: c.vicaria_zona },
      archivos: { foto: `/api/admin/archivo/catequistas/${c.id}/foto`, comprobante: `${base}comprobante`, pase: `${base}pase` },
      pagos: d.Pagos.filter((p) => p.referencia_id === s.id).map(SIN_ARCHIVOS), correos: d.Correos.filter((m) => m.referencia_id === s.id),
      verificacionUrl: urlPase(urlSitio(d.config, req), s),
    };
  });
  ruta('GET', /^\/api\/admin\/archivo\/(catequistas|semana)\/([\w-]+)\/(foto|firma|comprobante|pdf|carnet|pase)$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista');
    const staff = staffDe(req, d.config);
    if (!staff) fallo(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
    const [, tabla, id, clave] = ctx.m;
    if (staff.rol !== 'admin' && clave !== 'foto') fallo(403, 'PROHIBIDO', 'Sin permiso.');
    const fila = (tabla === 'catequistas' ? d.Catequistas : d.SemanaCatequista).find((x) => x.id === id);
    if (!fila) fallo(404, 'INEXISTENTE', 'Archivo no encontrado.');
    if (tabla === 'semana' && clave === 'pase') {
      const c = d.Catequistas.find((x) => x.id === fila.catequista_id);
      if (!c) fallo(404, 'INEXISTENTE', 'Archivo no encontrado.');
      return { generado: { mime: 'application/pdf', bytes: await documentoPase(fila, c, d.config, urlSitio(d.config, req)), nombre: `${fila.numero_inscripcion_semana}_pase.pdf` }, descarga: true };
    }
    const campo = { foto: 'foto_file_id', firma: 'firma_file_id', comprobante: 'comprobante_file_id', pdf: 'pdf_inscripcion_file_id', carnet: 'carnet_file_id' }[clave];
    return { archivo: fila[campo], descarga: ['pdf', 'carnet'].includes(clave) };
  });
  ruta('POST', /^\/api\/admin\/anular$/, async (req, ctx) => {
    const d = await datos();
    const a = exigirAdmin(req, d.config);
    const { tipo, id } = ctx.cuerpo;
    const motivo = texto(ctx.cuerpo.motivo, 300);
    if (motivo.length < 5) fallo(400, 'VALIDACION', 'Escribe el motivo de la anulación (mínimo 5 caracteres).', { motivo: 'Motivo obligatorio' });
    if (!['catequista', 'semana'].includes(tipo)) fallo(400, 'VALIDACION', 'Tipo no válido.');
    if (!RE_ID.test(String(id || ''))) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
    const r = await escribir('anular', { tipo, id, motivo, por: a.email }, ctx.idem, urlSitio(d.config, req));
    return r.yaAnulado ? { ok: true, yaAnulado: true } : { ok: true };
  }, { idempotente: true });
  ruta('POST', /^\/api\/admin\/regenerar$/, async (req, ctx) => {
    const d = await datos('Catequistas');
    const a = exigirAdmin(req, d.config);
    const c = d.Catequistas.find((x) => x.id === ctx.cuerpo.id);
    if (!c) fallo(404, 'INEXISTENTE', 'Registro no encontrado.');
    if (c.estado === 'ANULADO') fallo(409, 'ANULADO', 'No se regeneran documentos de un registro anulado.');
    if (c.estado === 'RECHAZADO') fallo(409, 'RECHAZADO', 'No se regeneran documentos de un registro rechazado.');
    const [foto, firma] = await Promise.all([descargar(c.foto_file_id), descargar(c.firma_file_id)]);
    if (!foto || !firma) log.error('[api] regenerar: no se pudo leer la foto o la firma de Drive', c.numero_catequista);
    const docs = await documentosCatequista(c, d.config, urlSitio(d.config, req), foto, firma);
    const r = await escribir('adjuntarDocumentos', { id: c.id, ...docs, enviarCorreo: false, por: a.email }, ctx.idem, urlSitio(d.config, req));
    return { ok: true, estado: r.estado };
  }, { idempotente: true });
  ruta('POST', /^\/api\/admin\/reenviar$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista');
    const a = exigirAdmin(req, d.config);
    const { tipo, id } = ctx.cuerpo;
    if (!['catequista', 'semana'].includes(tipo)) fallo(400, 'VALIDACION', 'Tipo no válido.');
    let pase = '';
    if (tipo === 'semana') {
      const s = d.SemanaCatequista.find((x) => x.id === id);
      if (!s) fallo(404, 'INEXISTENTE', 'Inscripción no encontrada.');
      const c = d.Catequistas.find((x) => x.id === s.catequista_id);
      if (c && s.estado !== 'ANULADA') pase = (await documentoPase(s, c, d.config, urlSitio(d.config, req))).toString('base64');
    }
    const r = await escribir('reenviarCorreo', { tipo, id, pase, por: a.email }, ctx.idem, urlSitio(d.config, req));
    return { ok: true, enviado: r.enviado, mensaje: r.enviado ? 'Correo enviado.' : 'Se agotó la cuota diaria: el correo quedó pendiente y se reintentará automáticamente.' };
  }, { idempotente: true });

  const FORMULA = /^[=+\-@\t\r]/;
  function celdaCsv(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (FORMULA.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  ruta('GET', /^\/api\/admin\/exportar$/, async (req, ctx) => {
    const d = await datos('Catequistas', 'SemanaCatequista', 'Pagos');
    exigirAdmin(req, d.config);
    const tabla = ctx.url.searchParams.get('tabla');
    const fuentes = {
      catequistas: [d.Catequistas.map((c) => ({ ...c, ...(({ zona, vicaria }) => ({ zona_pastoral: zona, vicaria_zona: vicaria }))(territorio.clasificar(c)) })), ['numero_catequista', 'estado', 'fecha_registro', 'nombres', 'apellidos', 'cedula', 'fecha_nacimiento', 'sexo', 'telefono', 'correo', 'direccion', 'parroquia', 'vicaria_zona', 'zona_pastoral', 'anios_servicio', 'nivel_que_imparte', 'formacion_cenafca', 'coordinador_parroquial', 'yappy_referencia', 'vigencia_hasta', 'correo_enviado_at', 'revisado_at', 'revisado_por', 'motivo_rechazo']],
      semana: [d.SemanaCatequista.filter((s) => s.edicion === String(d.config.SEMANA_EDICION || '')), ['numero_inscripcion_semana', 'numero_catequista', 'correo', 'edicion', 'estado', 'fecha_inscripcion', 'talla_camiseta', 'restricciones_alimentarias', 'yappy_referencia', 'checkin_at', 'checkin_por']],
      pagos: [d.Pagos, ['tipo', 'numero_catequista', 'monto', 'moneda', 'metodo', 'yappy_referencia', 'estado', 'creado_at', 'anulado_at', 'anulado_por', 'motivo_anulacion']],
    }[tabla];
    if (!fuentes) fallo(400, 'VALIDACION', 'Tabla no válida.');
    const [filas, cols] = fuentes;
    const csv = `﻿${[cols.map(celdaCsv).join(','), ...filas.map((f) => cols.map((k) => celdaCsv(f[k])).join(','))].join('\r\n')}\r\n`;
    return { csv, nombre: `${tabla}_${hoyPanama()}.csv` };
  });

  // ---------- Despachador ----------

  function leerCuerpo(req) {
    if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body || {});
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

  function enviarJson(res, status, cuerpo, cookies = []) {
    const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    if (cookies.length) h['set-cookie'] = cookies;
    res.writeHead(status, h);
    res.end(JSON.stringify(cuerpo));
  }
  const nombreSeguro = (n) => String(n || 'archivo').replace(/[^\w.-]+/g, '_');

  return async function manejar(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
    const ctx = { url, cookies: [], ip };
    try {
      const r = rutas.find((x) => x.metodo === req.method && (ctx.m = x.patron.exec(pathname)));
      if (!r) fallo(404, 'NO_ENCONTRADO', 'Ruta no encontrada.');
      if (req.method !== 'GET') {
        // Anti-CSRF: cabecera propia y mismo origen.
        if (req.headers['x-cat-csrf'] !== '1') fallo(403, 'PROHIBIDO', 'Solicitud no permitida.');
        const origen = req.headers.origin;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (origen) {
          let h = '';
          try { h = new URL(origen).host; } catch { /* origen mal formado */ }
          if (h !== host) fallo(403, 'PROHIBIDO', 'Origen no permitido.');
        }
        ctx.cuerpo = await leerCuerpo(req);
      }
      if (r.idempotente) {
        ctx.idem = String(req.headers['idempotency-key'] || '');
        if (!/^[\w-]{8,100}$/.test(ctx.idem)) fallo(400, 'IDEMPOTENCIA', 'Falta la clave de idempotencia.');
      }
      const salida = await r.fn(req, ctx);
      if (salida && ('archivo' in salida || 'generado' in salida) && !('ok' in salida)) {
        const a = salida.generado || (salida.archivo ? await descargar(salida.archivo) : null);
        if (!a) fallo(404, 'INEXISTENTE', 'El archivo aún no está disponible.');
        res.writeHead(200, {
          'content-type': a.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
          'content-disposition': `${salida.descarga ? 'attachment' : 'inline'}; filename="${nombreSeguro(a.nombre)}"`,
        });
        return res.end(a.bytes);
      }
      if (salida && 'csv' in salida) {
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${salida.nombre}"` });
        return res.end(salida.csv);
      }
      return enviarJson(res, 200, salida, ctx.cookies);
    } catch (e) {
      if (e instanceof Fallo) return enviarJson(res, e.status, { ok: false, codigo: e.codigo, mensaje: e.message, campos: e.campos }, ctx.cookies);
      log.error('[api]', e && e.stack ? e.stack : e);
      return enviarJson(res, 500, { ok: false, codigo: 'ERROR', mensaje: 'Error interno. Inténtalo de nuevo.' });
    }
  };
}

module.exports = { crearApi };
