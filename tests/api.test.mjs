// Pruebas de la API real (api/_lib/app.js) con el escritor real (apps-script/Code.gs)
// ejecutándose sobre Google emulado en memoria. No necesita credenciales ni red.
//   npm test
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crearApi } = require('../api/_lib/app.js');
const { crearEscritor, sobreFirmado } = require('../api/_lib/escritor.js');
const { crearGoogleEmulado } = require('../scripts/google-emulado.cjs');

const google = crearGoogleEmulado();
const silencio = { error: () => {} };
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
const B = `http://127.0.0.1:${servidor.address().port}`;

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
const datos = (correo, cedula, ref) => ({ nombres: 'Ana', apellidos: 'Prueba', cedula, fecha_nacimiento: '1990-01-02', sexo: 'Femenino', telefono: '6123-4567', correo, direccion: '', parroquia: 'San José', vicaria_zona: 'Vicaría Cristo Redentor (San Miguelito)', anios_servicio: 3, nivel_que_imparte: ['Confirmación'], formacion_cenafca: 'En curso', coordinador_parroquial: 'Juan Pérez', yappy_referencia: ref, consentimiento_datos: true, consentimiento_imagen: true });
const filas = (pestana) => { const [cab, ...resto] = google.hojas[pestana]; return resto.map((f) => Object.fromEntries(cab.map((h, i) => [h, f[i]]))); };
const pdfOk = (r) => r.s === 200 && r.t.includes('pdf') && r.d.subarray(0, 5).toString() === '%PDF-';

// ---------------- Contrato (mismas comprobaciones que la API simulada) ----------------

const cfg = await req(null, '/api/config-publica');
ok(cfg.s === 200 && cfg.d.config.costoRegistro === 1 && cfg.d.config.semana.edicion === '2026' && cfg.d.config.urlSitio === 'https://catequesis.test', 'config-publica lee Config del libro');

const j = jar();
const comp = jpg();
const idem = crypto.randomUUID();
const cuerpo = { datos: datos('ana@ejemplo.com', '8-111-2222', 'REF0001'), foto: jpg(), firma: png(), comprobante: comp };
const r1 = await req(j, '/api/registro', { metodo: 'POST', cuerpo, idem });
ok(r1.s === 200 && r1.d.numero === 'CAT-00001' && r1.d.estado === 'ACTIVO' && r1.d.correoEnviado, `registro → ${r1.d.numero} ${r1.d.estado}, correo ${r1.d.correoEnviado}`);
const r1b = await req(jar(), '/api/registro', { metodo: 'POST', cuerpo, idem });
ok(r1b.s === 200 && r1b.d.numero === r1.d.numero, 'reintento con la misma clave devuelve el mismo número');
ok(filas('Catequistas').length === 1 && google.buzon.length === 1, 'el reintento no duplica la fila ni el correo');
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
const falso = await req(null, '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { ...cuerpo, datos: datos('y@ejemplo.com', '8-555-5555', 'REF5555'), comprobante: 'data:image/jpeg;base64,' + Buffer.from('<script>').toString('base64') } });
ok(falso.s === 400, 'archivo con firma mágica falsa → rechazado');
ok((await req(null, '/api/registro', { metodo: 'POST', cuerpo, idem: crypto.randomUUID(), csrf: false })).s === 403, 'sin cabecera anti-CSRF → 403');
ok((await req(null, '/api/registro', { metodo: 'POST', cuerpo, idem: crypto.randomUUID(), origen: 'https://malicioso.example' })).s === 403, 'origen ajeno → 403');

const yo = await req(j, '/api/portal/yo');
ok(yo.s === 200 && yo.d.catequista.numero === r1.d.numero && yo.d.semana.puedeInscribirse, 'portal/yo con la sesión creada al registrarse');
ok(yo.d.catequista.verificacionUrl.startsWith('https://catequesis.test/verificar/?c='), 'URL de verificación usa PUBLIC_SITE_URL');
ok(pdfOk(await req(j, '/api/portal/archivo/carnet')), 'descarga del carnet (PDF de Drive) con sesión');
ok(pdfOk(await req(j, '/api/portal/archivo/pdf')), 'descarga de la ficha (PDF de Drive) con sesión');
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
const tokenCarnet = new URL(yo.d.catequista.verificacionUrl).searchParams.get('c');
ok((await req(null, `/api/verificar?c=${tokenCarnet}`)).d.estado === 'VALIDO', 'carnet válido');
ok((await req(null, `/api/verificar?t=${tokenCarnet}`)).d.estado === 'INEXISTENTE', 'token de carnet usado como pase → rechazado');

ok((await req(jar(), '/api/auth/simulado', { metodo: 'POST', cuerpo: { email: 'intruso@ejemplo.com' } })).s === 403, 'cuenta fuera de ADMIN_EMAILS → 403');
const v = jar();
await req(v, '/api/auth/simulado', { metodo: 'POST', cuerpo: { email: 'verificador@ejemplo.com' } });
ok((await req(v, '/api/admin/resumen')).s === 403, 'verificador no accede al panel');
const vd = await req(v, `/api/verificar?t=${token}`);
ok(vd.d.staff && vd.d.detalle && vd.d.detalle.nombre === 'Ana Prueba', 'verificador ve nombre y foto');
const e1 = await req(v, '/api/verificar/entrada', { metodo: 'POST', cuerpo: { t: token } });
const e2 = await req(v, '/api/verificar/entrada', { metodo: 'POST', cuerpo: { t: token } });
ok(e1.d.yaHabiaEntrado === false && e2.d.yaHabiaEntrado === true && e2.d.checkin_por === 'verificador@ejemplo.com', 'entrada registrada y aviso de reingreso');

const a = jar();
await req(a, '/api/auth/simulado', { metodo: 'POST', cuerpo: { email: 'aovv.26@gmail.com' } });
const res = await req(a, '/api/admin/resumen');
ok(res.s === 200 && res.d.registrados === 1 && res.d.inscritosSemana === 1 && res.d.entradas === 1 && res.d.recaudado === 2 && res.d.cuotaCorreo === 98, `resumen: ${JSON.stringify({ r: res.d.registrados, s: res.d.inscritosSemana, e: res.d.entradas, $: res.d.recaudado, cuota: res.d.cuotaCorreo })}`);
const lst = await req(a, '/api/admin/catequistas?q=ana');
const anaId = lst.d.items.find((x) => x.numero === r1.d.numero)?.id;
ok(!!anaId, 'búsqueda en admin');
const det = await req(a, `/api/admin/catequistas/${anaId}`);
ok(det.s === 200 && det.d.archivos.comprobante && !('foto_file_id' in det.d.item) && det.d.correos.length === 1, 'detalle con enlaces protegidos, sin IDs de Drive y con el correo enviado');
ok((await req(a, `/api/admin/archivo/catequistas/${anaId}/comprobante`)).s === 200, 'admin descarga el comprobante');
ok((await req(v, `/api/admin/archivo/catequistas/${anaId}/comprobante`)).s === 403, 'verificador no descarga el comprobante');
ok((await req(v, `/api/admin/archivo/catequistas/${anaId}/foto`)).s === 200, 'verificador sí ve la foto');

const carnetAntes = filas('Catequistas')[0].carnet_file_id;
const reg = await req(a, '/api/admin/regenerar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { id: anaId } });
const carnetDespues = filas('Catequistas')[0].carnet_file_id;
ok(reg.s === 200 && reg.d.estado === 'ACTIVO' && carnetDespues !== carnetAntes && google.archivos.get(carnetAntes).papelera, 'regenerar crea documentos nuevos y manda los viejos a la papelera');
const ree = await req(a, '/api/admin/reenviar', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { tipo: 'semana', id: filas('SemanaCatequista')[0].id } });
ok(ree.s === 200 && ree.d.enviado === true, 'reenviar el correo de la Semana');

ok((await req(a, '/api/admin/anular', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { tipo: 'catequista', id: anaId, motivo: 'x' } })).s === 400, 'anular sin motivo suficiente → 400');
ok((await req(a, '/api/admin/anular', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { tipo: 'catequista', id: anaId, motivo: 'Comprobante no válido (prueba)' } })).s === 200, 'anulación con motivo');
ok((await req(null, `/api/verificar?t=${token}`)).d.estado === 'ANULADO', 'tras anular: el pase queda ANULADO');
ok((await req(null, `/api/verificar?c=${tokenCarnet}`)).d.estado === 'ANULADO', 'tras anular: el carnet queda ANULADO');
ok((await req(j, '/api/portal/yo')).s === 401, 'tras anular: la sesión del portal deja de valer');
ok(filas('Pagos').every((p) => p.estado === 'ANULADO' && p.anulado_por === 'aovv.26@gmail.com'), 'tras anular: los pagos quedan ANULADO con autor');
ok((await req(v, '/api/verificar/entrada', { metodo: 'POST', cuerpo: { t: token } })).d.codigo === 'ANULADO', 'tras anular: la entrada se rechaza');
const csv = await req(a, '/api/admin/exportar?tabla=catequistas');
ok(csv.s === 200 && csv.t.includes('text/csv') && csv.d.toString('utf8').includes('numero_catequista'), 'exportación CSV');

// ---------------- Propias del backend real ----------------

const rf = await req(jar(), '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { datos: { ...datos('formula@ejemplo.com', '8-777-7777', 'REF7070'), parroquia: '=HYPERLINK("http://x")' }, foto: jpg(), firma: png(), comprobante: jpg() } });
const fila = filas('Catequistas').find((c) => c.correo === 'formula@ejemplo.com');
ok(rf.s === 200 && fila.parroquia === '=HYPERLINK("http://x")', 'el texto con "=" se guarda como texto, no como fórmula');
const csv2 = await req(a, '/api/admin/exportar?tabla=catequistas');
ok(csv2.d.toString('utf8').includes(`"'=HYPERLINK(""http://x"")"`), 'CSV neutraliza fórmulas');

const correoReg = google.buzon[0];
ok(correoReg.asunto === 'Bienvenido(a), catequista CAT-00001' && correoReg.adjuntos.join() === 'CAT-00001_inscripcion.pdf,CAT-00001_carnet.pdf' && correoReg.replyTo === 'aovv.26@gmail.com', 'correo de registro con los dos PDF y Reply-To');
ok(correoReg.html.includes('https://catequesis.test/portal/'), 'el correo enlaza al portal con la URL del sitio');
const correoSem = google.buzon.find((m) => m.asunto.startsWith('Inscripción confirmada'));
ok(correoSem && correoSem.inline.includes('qr') && correoSem.adjuntos.join() === 'SEM26-0001_pase.pdf', 'correo de la Semana con QR incrustado y pase adjunto');
const nombres = [...google.archivos.values()].filter((x) => !x.papelera).map((x) => x.nombre);
ok(['CAT-00001_foto.jpg', 'CAT-00001_firma.png', 'CAT-00001_yappy.jpg', 'SEM26-0001_qr.png'].every((n) => nombres.includes(n)) && !nombres.some((n) => n.startsWith('pendiente_')), 'archivos de Drive renombrados con el número');
const secuencias = filas('Secuencias');
ok(secuencias.find((s) => s.nombre === 'CATEQUISTA').siguiente === 3 && secuencias.find((s) => s.nombre === 'SEMANA_2026').siguiente === 2, 'Secuencias avanzan sin saltos');
ok(Number(google.hojas._meta[0][1]) > 0, '_meta registra la versión del libro');
ok(filas('Auditoria').some((x) => x.accion === 'ANULAR') && filas('Auditoria').some((x) => x.accion === 'CHECKIN'), 'Auditoria registra anulación y entrada');
const huerfanos = [...google.archivos.values()].filter((x) => !x.papelera && x.nombre.startsWith('pendiente_'));
ok(huerfanos.length === 0, 'los rechazos no dejan archivos huérfanos en Drive');

// Recuperar número (respuesta genérica y correo solo si existe)
const antes = google.buzon.length;
const rec1 = await req(null, '/api/recuperar', { metodo: 'POST', cuerpo: { correo: 'formula@ejemplo.com' } });
const rec2 = await req(null, '/api/recuperar', { metodo: 'POST', cuerpo: { correo: 'nadie@ejemplo.com' } });
ok(rec1.d.mensaje === rec2.d.mensaje && google.buzon.length === antes + 1 && google.buzon.at(-1).asunto === 'Tu número de catequista: CAT-00002', 'recuperar: misma respuesta y correo solo al registrado');

// Cuota agotada → PENDIENTE y reintento por el activador
google.fijarCuota(0);
const rq = await req(jar(), '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { datos: datos('cuota@ejemplo.com', '8-888-8888', 'REF8888'), foto: jpg(), firma: png(), comprobante: jpg() } });
ok(rq.s === 200 && rq.d.estado === 'ACTIVO' && rq.d.correoEnviado === false, 'sin cuota: el registro se completa y el correo queda pendiente');
ok(filas('Correos').some((c) => c.estado === 'PENDIENTE' && c.destinatario === 'cuota@ejemplo.com'), 'Correos marca el envío como PENDIENTE');
google.fijarCuota(10);
google.gas.procesarPendientes();
ok(filas('Correos').every((c) => c.estado !== 'PENDIENTE') && google.buzon.at(-1).para === 'cuota@ejemplo.com', 'procesarPendientes envía el correo pendiente');
ok(filas('Catequistas').find((c) => c.correo === 'cuota@ejemplo.com').correo_enviado_at !== '', 'y anota correo_enviado_at');

// Seguridad del escritor
const escribir = (sobre) => google.enviar(sobre);
ok((await escribir(sobreFirmado('otro-secreto-de-mas-de-32-caracteres!!', 'estado', {}))).codigo === 'FIRMA', 'escritor: firma de otro secreto → rechazada');
const sobre = sobreFirmado(google.secreto, 'estado', {});
ok((await escribir(sobre)).ok === true && (await escribir(sobre)).codigo === 'REPETIDA', 'escritor: nonce repetido → rechazado');
const viejo = JSON.stringify({ ts: Date.now() - 10 * 60 * 1000, nonce: crypto.randomUUID(), accion: 'estado', datos: {} });
ok((await escribir(JSON.stringify({ body: viejo, signature: crypto.createHmac('sha256', google.secreto).update(viejo).digest('base64') }))).codigo === 'CADUCADA', 'escritor: solicitud de hace 10 minutos → caducada');

// 20 registros seguidos → consecutivos únicos y sin huecos
const numeros = await Promise.all(Array.from({ length: 20 }, (_, i) => req(jar(), '/api/registro', { metodo: 'POST', idem: crypto.randomUUID(), cuerpo: { datos: datos(`lote${i}@ejemplo.com`, `3-${100 + i}-${1000 + i}`, `LOTE${1000 + i}`), foto: jpg(), firma: png(), comprobante: jpg() } }).then((r) => r.d.numero)));
const ordenados = numeros.map((n) => Number(n.slice(4))).sort((x, y) => x - y);
ok(new Set(numeros).size === 20 && ordenados.every((n, i) => i === 0 || n === ordenados[i - 1] + 1), `20 registros simultáneos → ${numeros.length} números únicos y consecutivos`);

servidor.close();
console.log(fallos ? `\n${fallos} de ${total} FALLARON` : `\nTODO OK (${total} comprobaciones)`);
process.exit(fallos ? 1 : 0);
