// Pruebas de la API real (api/_lib/app.js) con el escritor real (apps-script/Code.gs)
// ejecutándose sobre Google emulado en memoria. No necesita credenciales ni red.
//   npm test
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crearApi } = require('../api/_lib/app.js');
const { crearEscritor, sobreFirmado } = require('../api/_lib/escritor.js');
const { crearGoogleEmulado, COLUMNAS_NUEVAS } = require('../scripts/google-emulado.cjs');

const silencio = { error: () => {} };

/** Levanta la API real sobre un Google emulado. Devuelve { google, B, cerrar }. */
async function levantar(opciones = {}) {
  const google = crearGoogleEmulado(opciones);
  const manejar = crearApi({
    modo: 'simulado',
    env: { sesionSecreto: 's'.repeat(40), qrSecreto: 'q'.repeat(40), urlSitio: 'https://catequesis.test', googleClientId: '' },
    leer: google.leer, descargar: google.descargar,
    escritor: crearEscritor({ secreto: google.secreto, enviar: google.enviar }),
    verificarGoogle: async () => { throw new Error('no'); },
    log: silencio,
  });
  const servidor = http.createServer(manejar);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  return { google, B: `http://127.0.0.1:${servidor.address().port}`, cerrar: () => servidor.close() };
}

const principal = await levantar();
const { google } = principal;
let B = principal.B;

let fallos = 0;
let total = 0;
const ok = (c, m) => { total++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fallos++; };

function jar() {
  const c = {};
  return {
    h: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '),
    set: (res) => (res.headers.getSetCookie?.() || []).forEach((s) => { const [kv] = s.split(';'); const [k, ...v] = kv.split('='); c[k] = v.join('='); }),
  };
}
async function req(j, ruta, { metodo = 'GET', cuerpo, idem, csrf = true, origen } = {}) {
  const h = { cookie: j ? j.h() : '' };
  if (csrf) h['x-cat-csrf'] = '1';
  if (cuerpo) h['content-type'] = 'application/json';
  if (idem) h['idempotency-key'] = idem;
  if (origen) h.origin = origen;
  const r = await fetch(B + ruta, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (j) j.set(r);
  const t = r.headers.get('content-type') || '';
  return { s: r.status, d: t.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), t, h: r.headers };
}
const jpg = () => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(200)]).toString('base64');
const png = () => 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), crypto.randomBytes(100)]).toString('base64');
// parroquia_id del catálogo (api/_lib/territorio.js). Lo que mande el cliente en vicaria_zona se ignora.
const datos = (correo, cedula, ref, parroquia_id = 'san-judas-tadeo') => ({ nombres: 'Ana', apellidos: 'Prueba', cedula, fecha_nacimiento: '1990-01-02', sexo: 'Femenino', telefono: '6123-4567', correo, direccion: '', parroquia_id, vicaria_zona: 'Vicaría inventada', anios_servicio: 3, nivel_que_imparte: ['Confirmación'], formacion_cenafca: 'En curso', coordinador_parroquial: '', yappy_referencia: ref, consentimiento_datos: true, consentimiento_imagen: true });
const filas = (pestana, g = google) => { const [cab, ...resto] = g.hojas[pestana]; return resto.map((f) => Object.fromEntries(cab.map((h, i) => [h, f[i]]))); };
const pdfOk = (r) => r.s === 200 && r.t.includes('pdf') && r.d.subarray(0, 5).toString() === '%PDF-';
const registrar = (correo, cedula, ref, extra = {}) => req(jar(), '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { datos: { ...datos(correo, cedula, ref), ...extra }, foto: jpg(), firma: png(), comprobante: jpg() } });
const idDe = (correo) => filas('Catequistas').find((c) => c.correo === correo).id;

// ---------------- Catálogo territorial ----------------

const terr = await req(null, '/api/territorio');
const todas = terr.d.zonas.flatMap((z) => z.vicarias.flatMap((v) => v.parroquias));
ok(terr.s === 200 && terr.d.zonas.length === 4 && terr.d.zonas.reduce((a, z) => a + z.vicarias.length, 0) === 11 && todas.length === 100, 'territorio: 4 zonas, 11 vicarías y 100 parroquias');
ok(todas.find((p) => p.id === 'san-judas-tadeo').coordinador === 'Pamela Rodríguez, Ariadne Abrego y Dalet González', 'territorio: coordinadores de la estructura de la Comisión');
ok(new Set(todas.map((p) => p.id)).size === todas.length, 'territorio: identificadores de parroquia únicos');

// ---------------- Contrato (mismas comprobaciones que la API simulada) ----------------

const cfg = await req(null, '/api/config-publica');
ok(cfg.s === 200 && cfg.d.config.costoRegistro === 1 && cfg.d.config.semana.edicion === '2026' && cfg.d.config.urlSitio === 'https://catequesis.test', 'config-publica lee Config del libro');

const j = jar();
const comp = jpg();
const idem = crypto.randomUUID();
const cuerpo = { datos: datos('ana@ejemplo.com', '8-111-2222', 'REF0001'), foto: jpg(), firma: png(), comprobante: comp };
const r1 = await req(j, '/api/registro', { metodo: 'POST', cuerpo, idem });
ok(r1.s === 200 && r1.d.numero === 'CAT-00001' && r1.d.estado === 'PENDIENTE_APROBACION' && r1.d.correoEnviado, `registro → ${r1.d.numero} ${r1.d.estado}, correo ${r1.d.correoEnviado}`);
ok(r1.d.documentos.pdf && !r1.d.documentos.carnet, 'antes de aprobar: ficha disponible, carnet no');
const anaFila = filas('Catequistas')[0];
ok(anaFila.parroquia === 'San Judas Tadeo' && anaFila.vicaria_zona === 'Vicaría Nuestra Señora del Carmen–Juan Díaz' && anaFila.zona_pastoral === 'Zona Nuestra Señora del Carmen (Panamá Este)', 'la vicaría y la zona salen del catálogo, no del cliente');
ok(anaFila.coordinador_parroquial === 'Pamela Rodríguez, Ariadne Abrego y Dalet González', 'coordinador vacío → se usa el del catálogo');
const r1b = await req(jar(), '/api/registro', { metodo: 'POST', cuerpo, idem });
ok(r1b.s === 200 && r1b.d.numero === r1.d.numero, 'reintento con la misma clave devuelve el mismo número');
ok(filas('Catequistas').length === 1 && google.buzon.length === 1, 'el reintento no duplica la fila ni el correo');
ok(google.buzon[0].asunto === 'Recibimos tu registro · CAT-00001' && google.buzon[0].adjuntos.join() === 'CAT-00001_inscripcion.pdf', 'correo de «recibido» con la ficha y sin carnet');
const sinIdem = await req(null, '/api/registro', { metodo: 'POST', cuerpo });
ok(sinIdem.s === 400 && sinIdem.d.codigo === 'IDEMPOTENCIA', 'sin clave de idempotencia → 400');
const dup = await req(null, '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { ...cuerpo, datos: datos('ANA@ejemplo.com', '8-999-9999', 'REF0009'), comprobante: jpg() } });
ok(dup.s === 409 && dup.d.codigo === 'DUPLICADO' && !dup.d.mensaje.includes('ana@'), 'correo repetido → DUPLICADO sin revelar el dato');
const rep = await req(null, '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { ...cuerpo, datos: datos('otra@ejemplo.com', '8-333-4444', 'REF0002') } });
ok(rep.d.codigo === 'COMPROBANTE_REPETIDO', 'comprobante repetido (SHA-256) → rechazado');
const ref = await req(null, '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { ...cuerpo, comprobante: jpg(), datos: datos('otra@ejemplo.com', '8-333-4444', 'ref0001') } });
ok(ref.d.codigo === 'REFERENCIA_REPETIDA', 'referencia Yappy repetida (sin distinguir mayúsculas) → rechazada');
const val = await req(null, '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { ...cuerpo, comprobante: jpg(), datos: { ...datos('x@ejemplo.com', '8-12', 'REF7777'), consentimiento_imagen: false } } });
ok(val.s === 400 && val.d.campos.cedula && val.d.campos.consentimiento_imagen, 'validación del servidor marca campos');
const parX = await registrar('x@ejemplo.com', '8-121-1212', 'REF7778', { parroquia_id: 'parroquia-inventada' });
ok(parX.s === 400 && parX.d.campos.parroquia_id, 'parroquia fuera del catálogo → 400 en parroquia_id');
const otraSin = await registrar('x@ejemplo.com', '8-121-1212', 'REF7778', { parroquia_id: 'otra', parroquia: '' });
ok(otraSin.s === 400 && otraSin.d.campos.parroquia && otraSin.d.campos.vicaria_id, '«otra parroquia» exige nombre y vicaría');
const falso = await req(null, '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { ...cuerpo, datos: datos('y@ejemplo.com', '8-555-5555', 'REF5555'), comprobante: 'data:image/jpeg;base64,' + Buffer.from('<script>').toString('base64') } });
ok(falso.s === 400, 'archivo con firma mágica falsa → rechazado');
ok((await req(null, '/api/registro', { metodo: 'POST', cuerpo, idem: crypto.randomUUID(), csrf: false })).s === 403, 'sin cabecera anti-CSRF → 403');
ok((await req(null, '/api/registro', { metodo: 'POST', cuerpo, idem: crypto.randomUUID(), origen: 'https://malicioso.example' })).s === 403, 'origen ajeno → 403');

// ---------------- Antes de la aprobación ----------------

const yo0 = await req(j, '/api/portal/yo');
ok(yo0.s === 200 && yo0.d.catequista.estado === 'PENDIENTE_APROBACION' && !yo0.d.semana.puedeInscribirse && !yo0.d.documentos.carnet, 'portal: registro por aprobar, sin carnet ni Semana');
ok((await req(j, '/api/portal/archivo/carnet')).s === 404, 'portal: el carnet no se descarga antes de aprobar');
ok(pdfOk(await req(j, '/api/portal/archivo/pdf')), 'portal: la ficha sí se descarga antes de aprobar');
const tokenCarnet = new URL(yo0.d.catequista.verificacionUrl).searchParams.get('c');
ok((await req(null, `/api/verificar?c=${tokenCarnet}`)).d.estado === 'PENDIENTE', 'verificación: carnet por aprobar → PENDIENTE');
const semNo = await req(j, '/api/semana/inscribir', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { telefono: '61234567', talla_camiseta: 'M', yappy_referencia: 'SEMNO01', comprobante: jpg() } });
ok(semNo.s === 403 && semNo.d.codigo === 'NO_ACTIVO', 'Semana: no se inscribe sin aprobación');

// ---------------- Aprobación ----------------

ok((await req(jar(), '/api/auth/simulado', { metodo: 'POST', cuerpo: { email: 'intruso@ejemplo.com' } })).s === 403, 'cuenta fuera de ADMIN_EMAILS → 403');
const v = jar();
await req(v, '/api/auth/simulado', { metodo: 'POST', cuerpo: { email: 'verificador@ejemplo.com' } });
const a = jar();
await req(a, '/api/auth/simulado', { metodo: 'POST', cuerpo: { email: 'aovv.26@gmail.com' } });
const anaId = idDe('ana@ejemplo.com');

const cola = await req(a, '/api/admin/catequistas?estado=PENDIENTE_APROBACION');
ok(cola.s === 200 && cola.d.items.length === 1 && cola.d.items[0].zona_pastoral === 'Zona Nuestra Señora del Carmen (Panamá Este)', 'cola de aprobación con zona y vicaría');
ok((await req(v, '/api/admin/aprobar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: anaId } })).s === 403, 'verificador no puede aprobar');
ok((await req(a, '/api/admin/aprobar', { metodo: 'POST', cuerpo: { id: anaId } })).d.codigo === 'IDEMPOTENCIA', 'aprobar exige clave de idempotencia');
const idemAp = crypto.randomUUID();
const ap = await req(a, '/api/admin/aprobar', { metodo: 'POST', idem: idemAp, cuerpo: { id: anaId } });
ok(ap.s === 200 && ap.d.estado === 'ACTIVO' && ap.d.correoEnviado, `aprobar → ${ap.d.estado}, correo ${ap.d.correoEnviado}`);
const apB = await req(a, '/api/admin/aprobar', { metodo: 'POST', idem: idemAp, cuerpo: { id: anaId } });
ok(apB.s === 200 && google.buzon.filter((m) => m.asunto.startsWith('Bienvenido')).length === 1, 'reintento de la aprobación no repite el correo');
const ap2 = await req(a, '/api/admin/aprobar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: anaId } });
ok(ap2.s === 200 && ap2.d.yaRevisado, 'aprobar un registro ya activo → yaRevisado');
const anaAprobada = filas('Catequistas')[0];
ok(anaAprobada.estado === 'ACTIVO' && anaAprobada.revisado_por === 'aovv.26@gmail.com' && anaAprobada.revisado_at, 'la aprobación guarda quién y cuándo');
const correoCarnet = google.buzon.find((m) => m.asunto === 'Bienvenido(a), catequista CAT-00001');
ok(correoCarnet && correoCarnet.adjuntos.join() === 'CAT-00001_inscripcion.pdf,CAT-00001_carnet.pdf' && correoCarnet.replyTo === 'aovv.26@gmail.com' && correoCarnet.html.includes('fue aprobado'), 'correo de aprobación con los dos PDF y Reply-To');
ok(correoCarnet.html.includes('https://catequesis.test/portal/'), 'el correo enlaza al portal con la URL del sitio');
ok(filas('Auditoria').some((x) => x.accion === 'APROBAR' && x.entidad_id === anaId), 'Auditoria registra la aprobación');

// ---------------- Portal, Semana y verificación (catequista aprobado) ----------------

const yo = await req(j, '/api/portal/yo');
ok(yo.s === 200 && yo.d.catequista.numero === r1.d.numero && yo.d.semana.puedeInscribirse && yo.d.documentos.carnet, 'portal/yo tras aprobar: carnet y Semana disponibles');
ok(yo.d.catequista.verificacionUrl.startsWith('https://catequesis.test/verificar/?c='), 'URL de verificación usa PUBLIC_SITE_URL');
ok(pdfOk(await req(j, '/api/portal/archivo/carnet')), 'descarga del carnet (PDF de Drive) con sesión');
const fotoPortal = await req(j, '/api/portal/archivo/foto');
ok(fotoPortal.s === 200 && fotoPortal.t === 'image/jpeg', 'foto servida por la API');
ok((await req(null, '/api/portal/archivo/carnet')).s === 401, 'descarga sin sesión → 401');
const cookieFalsa = { h: () => 'cat_sesion=' + Buffer.from(JSON.stringify({ k: 'cat', i: yo.d.catequista.numero, x: Date.now() + 1e6 })).toString('base64url') + '.firmafalsa', set: () => {} };
ok((await req(cookieFalsa, '/api/portal/yo')).s === 401, 'cookie de sesión alterada → 401');

const j2 = jar();
const malo = await req(j2, '/api/portal/entrar', { metodo: 'POST', cuerpo: { correo: 'ana@ejemplo.com', numero: '999' } });
ok(malo.s === 401 && malo.d.codigo === 'CREDENCIALES', 'acceso con número incorrecto → error genérico');
ok((await req(j2, '/api/portal/entrar', { metodo: 'POST', cuerpo: { correo: 'ANA@ejemplo.com', numero: 'cat-1' } })).s === 200, 'acceso con "cat-1" normalizado');

const idemSem = crypto.randomUUID();
const cuerpoSem = { telefono: '61234567', talla_camiseta: 'M', restricciones_alimentarias: 'Vegetariana', yappy_referencia: 'SEMREF01', comprobante: jpg() };
const sem = await req(j, '/api/semana/inscribir', { metodo: 'POST', idem: idemSem, cuerpo: cuerpoSem });
ok(sem.s === 200 && sem.d.numero === 'SEM26-0001' && sem.d.correoEnviado, `inscripción Semana → ${sem.d.numero}, correo ${sem.d.correoEnviado}`);
const semB = await req(j, '/api/semana/inscribir', { metodo: 'POST', idem: idemSem, cuerpo: cuerpoSem });
ok(semB.s === 200 && semB.d.numero === sem.d.numero && semB.d.verificacionUrl === sem.d.verificacionUrl, 'reintento de la Semana devuelve el mismo número y QR');
const sem2 = await req(j, '/api/semana/inscribir', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { ...cuerpoSem, yappy_referencia: 'SEMREF02', comprobante: jpg() } });
ok(sem2.d.codigo === 'YA_INSCRITO', 'segunda inscripción en la misma edición → YA_INSCRITO');
ok(pdfOk(await req(j, '/api/portal/archivo/pase')), 'pase en PDF desde el portal');

const token = new URL(sem.d.verificacionUrl).searchParams.get('t');
const pub = await req(null, `/api/verificar?t=${token}`);
ok(pub.d.estado === 'VALIDO' && !pub.d.detalle, 'verificación pública: válido y sin datos personales');
const alterado = token.slice(0, -3) + (token.endsWith('AAA') ? 'BBB' : 'AAA');
ok((await req(null, `/api/verificar?t=${alterado}`)).d.estado === 'INEXISTENTE', 'QR alterado → INEXISTENTE');
ok((await req(null, `/api/verificar?c=${tokenCarnet}`)).d.estado === 'VALIDO', 'carnet válido tras aprobar');
ok((await req(null, `/api/verificar?t=${tokenCarnet}`)).d.estado === 'INEXISTENTE', 'token de carnet usado como pase → rechazado');

ok((await req(v, '/api/admin/resumen')).s === 403, 'verificador no accede al panel');
const vd = await req(v, `/api/verificar?t=${token}`);
ok(vd.d.staff && vd.d.detalle && vd.d.detalle.nombre === 'Ana Prueba', 'verificador ve nombre y foto');
const e1 = await req(v, '/api/verificar/entrada', { metodo: 'POST', cuerpo: { t: token } });
const e2 = await req(v, '/api/verificar/entrada', { metodo: 'POST', cuerpo: { t: token } });
ok(e1.d.yaHabiaEntrado === false && e2.d.yaHabiaEntrado === true && e2.d.checkin_por === 'verificador@ejemplo.com', 'entrada registrada y aviso de reingreso');

// ---------------- Rechazo ----------------

const rRech = await registrar('rech@ejemplo.com', '8-444-1010', 'RECH001');
const rechId = idDe('rech@ejemplo.com');
const jRech = jar();
await req(jRech, '/api/portal/entrar', { metodo: 'POST', cuerpo: { correo: 'rech@ejemplo.com', numero: rRech.d.numero } });
ok((await req(a, '/api/admin/rechazar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: rechId, motivo: 'no' } })).s === 400, 'rechazar sin motivo suficiente → 400');
const rActivo = await req(a, '/api/admin/rechazar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: anaId, motivo: 'Prueba de rechazo' } });
ok(rActivo.s === 409 && rActivo.d.codigo === 'NO_PENDIENTE', 'no se rechaza un registro activo (se anula)');
const rch = await req(a, '/api/admin/rechazar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: rechId, motivo: 'La foto no permite identificarte' } });
ok(rch.s === 200 && rch.d.estado === 'RECHAZADO' && rch.d.correoEnviado, 'rechazar con motivo → RECHAZADO y correo');
const filaRech = filas('Catequistas').find((c) => c.id === rechId);
ok(filaRech.motivo_rechazo === 'La foto no permite identificarte' && filaRech.revisado_por === 'aovv.26@gmail.com', 'el rechazo guarda motivo y autor');
ok(filas('Pagos').find((p) => p.referencia_id === rechId).estado === 'RECHAZADO', 'el pago del registro rechazado queda RECHAZADO');
const correoRech = google.buzon.at(-1);
ok(correoRech.para === 'rech@ejemplo.com' && correoRech.asunto.includes('necesita correcciones') && correoRech.html.includes('La foto no permite identificarte') && correoRech.html.includes('/registro/'), 'correo de rechazo con el motivo y el enlace para registrarse de nuevo');
ok((await req(jRech, '/api/portal/yo')).s === 401, 'tras rechazar: la sesión del portal deja de valer');
ok((await req(a, '/api/admin/aprobar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: rechId } })).d.codigo === 'NO_PENDIENTE', 'no se aprueba un registro rechazado');
ok((await req(a, '/api/admin/regenerar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: rechId } })).d.codigo === 'RECHAZADO', 'no se regeneran documentos de un rechazado');
// Mismo correo, cédula y comprobante: el rechazo libera los datos.
const compRech = filas('Pagos').find((p) => p.referencia_id === rechId).comprobante_sha256;
const reReg = await registrar('rech@ejemplo.com', '8-444-1010', 'RECH001');
ok(reReg.s === 200 && reReg.d.estado === 'PENDIENTE_APROBACION' && reReg.d.numero !== rRech.d.numero, `tras rechazar se puede registrar de nuevo con los mismos datos → ${reReg.d.numero}`);
ok(compRech && filas('Pagos').filter((p) => p.yappy_referencia === 'RECH001').length === 2, 'la referencia del pago rechazado se acepta en el nuevo registro');

// ---------------- Dashboard ----------------

await registrar('trini@ejemplo.com', '8-500-5000', 'TRIN001', { parroquia_id: 'santisima-trinidad' });
await registrar('otra@ejemplo.com', '8-500-5001', 'OTRA001', { parroquia_id: 'otra', parroquia: 'Capilla Nueva Esperanza', vicaria_id: 'san-cristobal' });
const est = await req(a, '/api/admin/estadisticas');
const zonaEste = est.d.zonas.find((z) => z.id === 'nuestra-senora-del-carmen');
const vicJD = zonaEste.vicarias.find((x) => x.id === 'carmen-juan-diaz');
const parSJ = vicJD.parroquias.find((p) => p.nombre === 'San Judas Tadeo');
ok(est.s === 200 && est.d.total.ACTIVO === 1 && est.d.total.PENDIENTE_APROBACION === 3 && est.d.total.RECHAZADO === 1, `estadísticas: total por estado ${JSON.stringify(est.d.total)}`);
ok(parSJ.conteo.ACTIVO === 1 && parSJ.conteo.RECHAZADO === 1 && parSJ.conteo.PENDIENTE_APROBACION === 1 && parSJ.coordinador.startsWith('Pamela'), 'estadísticas por parroquia con coordinador');
ok(vicJD.conteo.ACTIVO === 1 && zonaEste.conteo.PENDIENTE_APROBACION === 2, 'estadísticas por vicaría y por zona (incluye «otra parroquia» en su vicaría)');
const otraNodo = zonaEste.vicarias.find((x) => x.id === 'san-cristobal').parroquias.find((p) => p.nombre === 'Capilla Nueva Esperanza');
ok(otraNodo && !otraNodo.catalogo && otraNodo.conteo.PENDIENTE_APROBACION === 1, 'parroquia escrita a mano aparece bajo la vicaría elegida');
ok(est.d.zonas.find((z) => z.id === 'santa-maria-la-antigua').vicarias.find((x) => x.id === 'santa-eduviges').parroquias.find((p) => p.nombre === 'Santísima Trinidad').conteo.PENDIENTE_APROBACION === 1, 'Santísima Trinidad cuenta en Santa Eduviges / Santa María la Antigua');
ok(est.d.zonas.every((z) => z.vicarias.every((x) => x.parroquias.length > 0)), 'el catálogo completo aparece aunque no haya registros');
ok((await req(v, '/api/admin/estadisticas')).s === 403, 'verificador no ve las estadísticas');
const porPar = await req(a, `/api/admin/catequistas?parroquia=${encodeURIComponent('San Judas Tadeo')}`);
ok(porPar.d.items.length === 3 && porPar.d.items.every((x) => x.parroquia === 'San Judas Tadeo'), 'listado filtrado por parroquia (desde el dashboard)');
const porZona = await req(a, `/api/admin/catequistas?zona=${encodeURIComponent('Zona Santa María la Antigua (Panamá Centro)')}`);
ok(porZona.d.items.length === 1, 'listado filtrado por zona');
const colaOrden = await req(a, '/api/admin/catequistas?estado=PENDIENTE_APROBACION');
ok(colaOrden.d.items.map((x) => x.numero).join() === [...colaOrden.d.items.map((x) => x.numero)].sort().join(), 'la cola de aprobación sale del más antiguo al más reciente');

// ---------------- Administración ----------------

const res = await req(a, '/api/admin/resumen');
ok(res.s === 200 && res.d.registrados === 5 && res.d.activos === 1 && res.d.porAprobar === 3 && res.d.rechazados === 1 && res.d.inscritosSemana === 1 && res.d.entradas === 1 && res.d.recaudado === 5, `resumen: ${JSON.stringify({ r: res.d.registrados, act: res.d.activos, apr: res.d.porAprobar, rech: res.d.rechazados, $: res.d.recaudado })}`);
const det = await req(a, `/api/admin/catequistas/${anaId}`);
ok(det.s === 200 && det.d.archivos.comprobante && !('foto_file_id' in det.d.item) && det.d.correos.length === 2, 'detalle con enlaces protegidos, sin IDs de Drive y con los dos correos');
ok((await req(a, `/api/admin/archivo/catequistas/${anaId}/comprobante`)).s === 200, 'admin descarga el comprobante');
ok((await req(v, `/api/admin/archivo/catequistas/${anaId}/comprobante`)).s === 403, 'verificador no descarga el comprobante');
ok((await req(v, `/api/admin/archivo/catequistas/${anaId}/foto`)).s === 200, 'verificador sí ve la foto');

const carnetAntes = filas('Catequistas')[0].carnet_file_id;
const reg = await req(a, '/api/admin/regenerar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: anaId } });
const carnetDespues = filas('Catequistas')[0].carnet_file_id;
ok(reg.s === 200 && reg.d.estado === 'ACTIVO' && carnetDespues !== carnetAntes && google.archivos.get(carnetAntes).papelera, 'regenerar un activo lo deja ACTIVO y manda los documentos viejos a la papelera');
const trId = idDe('trini@ejemplo.com');
const regP = await req(a, '/api/admin/regenerar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: trId } });
ok(regP.d.estado === 'PENDIENTE_APROBACION', 'regenerar uno por aprobar no lo aprueba');
const ree = await req(a, '/api/admin/reenviar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { tipo: 'semana', id: filas('SemanaCatequista')[0].id } });
ok(ree.s === 200 && ree.d.enviado === true, 'reenviar el correo de la Semana');
const reeP = await req(a, '/api/admin/reenviar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { tipo: 'catequista', id: trId } });
ok(reeP.d.enviado && google.buzon.at(-1).asunto.startsWith('Recibimos tu registro'), 'reenviar a uno por aprobar manda el correo de «recibido»');

ok((await req(a, '/api/admin/anular', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { tipo: 'catequista', id: anaId, motivo: 'x' } })).s === 400, 'anular sin motivo suficiente → 400');
ok((await req(a, '/api/admin/anular', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { tipo: 'catequista', id: anaId, motivo: 'Comprobante no válido (prueba)' } })).s === 200, 'anulación con motivo');
ok((await req(null, `/api/verificar?t=${token}`)).d.estado === 'ANULADO', 'tras anular: el pase queda ANULADO');
ok((await req(null, `/api/verificar?c=${tokenCarnet}`)).d.estado === 'ANULADO', 'tras anular: el carnet queda ANULADO');
ok((await req(j, '/api/portal/yo')).s === 401, 'tras anular: la sesión del portal deja de valer');
ok(filas('Pagos').filter((p) => p.numero_catequista === 'CAT-00001').every((p) => p.estado === 'ANULADO' && p.anulado_por === 'aovv.26@gmail.com'), 'tras anular: los pagos quedan ANULADO con autor');
ok((await req(v, '/api/verificar/entrada', { metodo: 'POST', cuerpo: { t: token } })).d.codigo === 'ANULADO', 'tras anular: la entrada se rechaza');
const csv = await req(a, '/api/admin/exportar?tabla=catequistas');
const csvTxt = csv.d.toString('utf8');
ok(csv.s === 200 && csv.t.includes('text/csv') && csvTxt.includes('numero_catequista') && csvTxt.includes('zona_pastoral') && csvTxt.includes('motivo_rechazo'), 'exportación CSV con zona y revisión');

// ---------------- Propias del backend real ----------------

const rf = await registrar('formula@ejemplo.com', '8-777-7777', 'REF7070', { parroquia_id: 'otra', parroquia: '=HYPERLINK("http://x")', vicaria_id: 'cristo-rey' });
const fila = filas('Catequistas').find((c) => c.correo === 'formula@ejemplo.com');
ok(rf.s === 200 && fila.parroquia === '=HYPERLINK("http://x")', 'el texto con "=" se guarda como texto, no como fórmula');
const csv2 = await req(a, '/api/admin/exportar?tabla=catequistas');
ok(csv2.d.toString('utf8').includes(`"'=HYPERLINK(""http://x"")"`), 'CSV neutraliza fórmulas');

const correoSem = google.buzon.find((m) => m.asunto.startsWith('Inscripción confirmada'));
ok(correoSem && correoSem.inline.includes('qr') && correoSem.adjuntos.join() === 'SEM26-0001_pase.pdf', 'correo de la Semana con QR incrustado y pase adjunto');
const nombres = [...google.archivos.values()].filter((x) => !x.papelera).map((x) => x.nombre);
ok(['CAT-00001_foto.jpg', 'CAT-00001_firma.png', 'CAT-00001_yappy.jpg', 'SEM26-0001_qr.png'].every((n) => nombres.includes(n)) && !nombres.some((n) => n.startsWith('pendiente_')), 'archivos de Drive renombrados con el número');
const secuencias = filas('Secuencias');
ok(secuencias.find((s) => s.nombre === 'CATEQUISTA').siguiente === 7 && secuencias.find((s) => s.nombre === 'SEMANA_2026').siguiente === 2, 'Secuencias avanzan sin saltos');
ok(Number(google.hojas._meta[0][1]) > 0, '_meta registra la versión del libro');
ok(['ANULAR', 'CHECKIN', 'RECHAZAR'].every((acc) => filas('Auditoria').some((x) => x.accion === acc)), 'Auditoria registra anulación, rechazo y entrada');
const huerfanos = [...google.archivos.values()].filter((x) => !x.papelera && x.nombre.startsWith('pendiente_'));
ok(huerfanos.length === 0, 'los rechazos no dejan archivos huérfanos en Drive');

// Recuperar número (respuesta genérica y correo solo si existe)
const antes = google.buzon.length;
const rec1 = await req(null, '/api/recuperar', { metodo: 'POST', cuerpo: { correo: 'formula@ejemplo.com' } });
const rec2 = await req(null, '/api/recuperar', { metodo: 'POST', cuerpo: { correo: 'nadie@ejemplo.com' } });
ok(rec1.d.mensaje === rec2.d.mensaje && google.buzon.length === antes + 1 && google.buzon.at(-1).asunto === `Tu número de catequista: ${rf.d.numero}`, 'recuperar: misma respuesta y correo solo al registrado');
await req(null, '/api/recuperar', { metodo: 'POST', cuerpo: { correo: 'rech@ejemplo.com' } });
ok(google.buzon.at(-1).asunto === `Tu número de catequista: ${reReg.d.numero}`, 'recuperar ignora el registro rechazado y envía el vigente');

// Cuota agotada → PENDIENTE y reintento por el activador (correo de «recibido» y de aprobación)
google.fijarCuota(0);
const rq = await registrar('cuota@ejemplo.com', '8-888-8888', 'REF8888');
ok(rq.s === 200 && rq.d.estado === 'PENDIENTE_APROBACION' && rq.d.correoEnviado === false, 'sin cuota: el registro se completa y el correo queda pendiente');
const apq = await req(a, '/api/admin/aprobar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: idDe('cuota@ejemplo.com') } });
ok(apq.s === 200 && apq.d.correoEnviado === false && apq.d.mensaje.includes('pendiente'), 'sin cuota: la aprobación se guarda y avisa que el correo quedó pendiente');
ok(filas('Correos').filter((c) => c.estado === 'PENDIENTE' && c.destinatario === 'cuota@ejemplo.com').length === 2, 'Correos marca los dos envíos como PENDIENTE');
google.fijarCuota(10);
google.gas.procesarPendientes();
ok(filas('Correos').filter((c) => c.destinatario === 'cuota@ejemplo.com').every((c) => c.estado === 'DESCARTADO' || c.estado === 'ENVIADO') && google.buzon.at(-1).para === 'cuota@ejemplo.com', 'procesarPendientes envía el pendiente vigente y descarta el de «recibido» ya superado');
ok(filas('Catequistas').find((c) => c.correo === 'cuota@ejemplo.com').correo_enviado_at !== '', 'y anota correo_enviado_at');

// Seguridad del escritor
const escribir = (sobre) => google.enviar(sobre);
ok((await escribir(sobreFirmado('otro-secreto-de-mas-de-32-caracteres!!', 'estado', {}))).codigo === 'FIRMA', 'escritor: firma de otro secreto → rechazada');
const sobre = sobreFirmado(google.secreto, 'estado', {});
ok((await escribir(sobre)).ok === true && (await escribir(sobre)).codigo === 'REPETIDA', 'escritor: nonce repetido → rechazado');
const viejo = JSON.stringify({ ts: Date.now() - 10 * 60 * 1000, nonce: crypto.randomUUID(), accion: 'estado', datos: {} });
ok((await escribir(JSON.stringify({ body: viejo, signature: crypto.createHmac('sha256', google.secreto).update(viejo).digest('base64') }))).codigo === 'CADUCADA', 'escritor: solicitud de hace 10 minutos → caducada');

// 20 registros seguidos → consecutivos únicos y sin huecos
const numeros = await Promise.all(Array.from({ length: 20 }, (_, i) => registrar(`lote${i}@ejemplo.com`, `3-${100 + i}-${1000 + i}`, `LOTE${1000 + i}`).then((r) => r.d.numero)));
const ordenados = numeros.map((n) => Number(n.slice(4))).sort((x, y) => x - y);
ok(new Set(numeros).size === 20 && ordenados.every((n, i) => i === 0 || n === ordenados[i - 1] + 1), `20 registros simultáneos → ${numeros.length} números únicos y consecutivos`);
principal.cerrar();

// ---------------- Libro anterior a la aprobación (migración) y aprobación desactivada ----------------

const antiguo = await levantar({ esquemaAntiguo: true, config: { REQUIERE_APROBACION: false } });
B = antiguo.B;
ok(!COLUMNAS_NUEVAS.some((c) => antiguo.google.hojas.Catequistas[0].includes(c)), 'libro antiguo: Catequistas sin las columnas nuevas');
const rAnt = await registrar('antiguo@ejemplo.com', '8-900-9000', 'ANT0001');
const cabAnt = antiguo.google.hojas.Catequistas[0];
ok(COLUMNAS_NUEVAS.every((c) => cabAnt.includes(c)), 'asegurarEsquema_ agrega las columnas que faltan');
ok(filas('Catequistas', antiguo.google)[0].zona_pastoral === 'Zona Nuestra Señora del Carmen (Panamá Este)', 'y el primer registro ya guarda la zona');
ok(rAnt.s === 200 && rAnt.d.estado === 'ACTIVO' && antiguo.google.buzon[0].asunto.startsWith('Bienvenido'), 'REQUIERE_APROBACION en FALSE: el registro queda ACTIVO y recibe el carnet');
antiguo.cerrar();

console.log(fallos ? `\n${fallos} de ${total} FALLARON` : `\nTODO OK (${total} comprobaciones)`);
process.exit(fallos ? 1 : 0);
