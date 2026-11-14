import {
  api, nuevaClave, cargarConfig, cargarTerritorio, OTRA_PARROQUIA, marcarModo, NIVELES, FORMACION_CENAFCA, $, $$, html, crudo,
  ocupado, errorCampo, aviso, llenarSelect, cedulaValida, normalizarCedula, correoValido, telefonoValido,
  formatearTelefono, normalizarTelefono, edad, fmtFecha, fmtMonto, ApiError,
} from './comun.js';
import { Recortador, reducir, sha256Hex, tamañoDataUrl } from './imagenes.js';
import { abrirFirma } from './firma.js';
import { crearAutocompletar } from './autocompletar.js';
import { controlCedula, controlCelular, controlCorreo, mensajeCedula, mensajeCelular, mensajeCorreo } from './formato.js';

const TOTAL = 7;
const CLAVE_BORRADOR = 'cat-registro-borrador-v3';
let buscador = null; // autocompletar de parroquias
const form = $('#asistente');
const pasos = $$('.m-paso', form);
let paso = 1;
let config = null;
let territorio = null;
let coordinadorSugerido = ''; // último valor puesto automáticamente en «Coordinador(a)»

const estado = {
  foto: null,        // data URL JPEG 600×600
  firma: null,       // data URL PNG transparente
  comprobante: null, // data URL JPEG ≤1600 px
  comprobanteSha: '',
  idem: nuevaClave(), // misma clave en todos los reintentos de este envío
};

// ---------- Inicio ----------

llenarSelect($('#formacion_cenafca'), FORMACION_CENAFCA);
$('#niveles').innerHTML = NIVELES.map((n, i) => html`<label class="m-chip"><input type="checkbox" name="nivel" value="${n}" id="nivel-${i}"><span>${n}</span></label>`).join('');
$('#fecha_nacimiento').max = new Date().toISOString().slice(0, 10);
controlCedula($('#cedula'));
controlCelular($('#telefono'));
controlCorreo($('#correo'), $('#correo2'));

(async function iniciar() {
  try {
    [config, territorio] = await Promise.all([cargarConfig(), cargarTerritorio()]);
  } catch (e) {
    aviso($('#estado-global'), 'error', e.message || 'No se pudo cargar la configuración. Recarga la página.');
    return;
  }
  pintarParroquias();
  marcarModo(config);
  if (!config.registroAbierto) {
    $('#cerrado').hidden = false;
    return;
  }
  $('#pago-monto').textContent = fmtMonto(config.costoRegistro, config.moneda);
  $('#pago-directorio').textContent = config.yappy.directorio || 'Por definir';
  $('#pago-telefono').textContent = config.yappy.telefono || '—';
  $('#pago-instrucciones').textContent = config.yappy.instrucciones || '';
  restaurarBorrador();
  restaurarParroquia();
  actualizarUbicacion({ completarCoordinador: false });
  form.hidden = false;
  mostrarPaso(1, false);
})();

// ---------- Parroquia → vicaría → zona y coordinador ----------

const OPCION_OTRA = { id: OTRA_PARROQUIA, titulo: 'Mi parroquia no está en la lista', detalle: 'Escribirás el nombre y elegirás la vicaría' };

/** Autocompletar de parroquias (busca por nombre, barrio, vicaría o zona) y vicarías para «otra». */
function pintarParroquias() {
  const opciones = [...territorio.parroquias.values()].map((p) => ({
    id: p.id, titulo: p.nombre, detalle: `${p.vicaria.etiqueta} · Zona ${p.zona.nombre}`, buscar: `${p.nombre} ${p.vicaria.nombre} ${p.zona.nombre} ${p.zona.area}`,
  }));
  buscador = crearAutocompletar({
    input: $('#parroquia_buscar'), lista: $('#parroquia_lista'), opciones: () => opciones, fija: OPCION_OTRA,
    alElegir: (o) => {
      $('#parroquia_id').value = o ? o.id : '';
      if (o) errorCampo($('#parroquia_buscar'), '');
      actualizarUbicacion();
      guardarBorrador();
      if (o && o.id === OTRA_PARROQUIA) $('#parroquia').focus();
    },
  });
  const vics = territorio.zonas.map((z) => html`<optgroup label="${`Zona ${z.nombre} (${z.area})`}">${crudo(z.vicarias.map((v) => html`<option value="${v.id}">${v.etiqueta}</option>`).join(''))}</optgroup>`);
  $('#vicaria_id').innerHTML = `<option value="">Selecciona la vicaría</option>${vics.join('')}`;
}

/** Vuelve a poner en el buscador la parroquia guardada en el borrador. */
function restaurarParroquia() {
  const id = $('#parroquia_id').value;
  const p = territorio.parroquias.get(id);
  if (p) buscador.fijar({ id: p.id, titulo: p.nombre });
  else if (id === OTRA_PARROQUIA) buscador.fijar(OPCION_OTRA);
  else $('#parroquia_id').value = ''; // parroquia retirada del catálogo
}

/** Muestra la vicaría y la zona de la parroquia elegida y propone su coordinador(a). */
function actualizarUbicacion({ completarCoordinador = true } = {}) {
  const id = $('#parroquia_id').value;
  const otra = id === OTRA_PARROQUIA;
  $('#campo-parroquia-otra').hidden = !otra;
  $('#campo-vicaria-otra').hidden = !otra;
  const p = territorio.parroquias.get(id);
  const v = p ? p.vicaria : otra ? territorio.vicarias.get($('#vicaria_id').value) : null;
  const z = p ? p.zona : v ? v.zona : null;
  $('#ubicacion').hidden = !v;
  $('#ubicacion-vicaria').textContent = v ? v.etiqueta : '—';
  $('#ubicacion-zona').textContent = z ? `${z.nombre} (${z.area})` : '—';

  const sugerido = p ? p.coordinador : '';
  const campo = $('#coordinador_parroquial');
  // Solo se reemplaza lo que pusimos nosotros (o un campo vacío): nunca lo que escribió la persona.
  if (completarCoordinador && (!campo.value.trim() || campo.value === coordinadorSugerido)) {
    campo.value = sugerido;
    if (sugerido) errorCampo(campo, '');
  }
  coordinadorSugerido = sugerido;
  $('#coordinador-ayuda').textContent = sugerido
    ? `Según la estructura de la Comisión: ${sugerido}. Corrígelo si en tu parroquia es otra persona.`
    : 'Escribe el nombre de quien coordina la catequesis en tu parroquia.';
}
$('#vicaria_id').addEventListener('change', () => actualizarUbicacion({ completarCoordinador: false }));

/** Texto legible de la parroquia elegida (revisión). */
function lugarElegido() {
  const id = $('#parroquia_id').value;
  const p = territorio.parroquias.get(id);
  if (p) return { parroquia: p.nombre, vicaria: p.vicaria.etiqueta, zona: `${p.zona.nombre} (${p.zona.area})` };
  const v = territorio.vicarias.get($('#vicaria_id').value);
  return { parroquia: $('#parroquia').value.trim(), vicaria: v ? v.etiqueta : '', zona: v ? `${v.zona.nombre} (${v.zona.area})` : '' };
}

// ---------- Borrador (solo campos de texto; nunca archivos) ----------

const CAMPOS_TEXTO = ['nombres', 'apellidos', 'cedula', 'fecha_nacimiento', 'telefono', 'direccion', 'correo', 'correo2', 'parroquia_id', 'parroquia', 'vicaria_id', 'anios_servicio', 'formacion_cenafca', 'coordinador_parroquial', 'yappy_referencia'];

function guardarBorrador() {
  try {
    const d = Object.fromEntries(CAMPOS_TEXTO.map((k) => [k, $('#' + k).value]));
    d.sexo = form.sexo.value;
    d.niveles = $$('input[name=nivel]:checked').map((x) => x.value);
    sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify(d));
  } catch { /* almacenamiento no disponible */ }
}
function restaurarBorrador() {
  try {
    const d = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR) || 'null');
    if (!d) return;
    CAMPOS_TEXTO.forEach((k) => { if (d[k] != null) $('#' + k).value = d[k]; });
    if (d.sexo) { const r = form.querySelector(`input[name=sexo][value="${CSS.escape(d.sexo)}"]`); if (r) r.checked = true; }
    (d.niveles || []).forEach((v) => { const c = form.querySelector(`input[name=nivel][value="${CSS.escape(v)}"]`); if (c) c.checked = true; });
  } catch { /* borrador dañado: se ignora */ }
}
function borrarBorrador() {
  try { sessionStorage.removeItem(CLAVE_BORRADOR); } catch { /* nada */ }
}
form.addEventListener('input', guardarBorrador);
form.addEventListener('change', guardarBorrador);

// ---------- Navegación ----------

function mostrarPaso(n, enfocar = true) {
  paso = n;
  pasos.forEach((p) => { p.hidden = Number(p.dataset.paso) !== n; });
  const actual = pasos[n - 1];
  $('#barra').style.width = `${Math.round((n / TOTAL) * 100)}%`;
  $('#paso-n').textContent = `Paso ${n} de ${TOTAL}`;
  $('#paso-titulo').textContent = actual.dataset.titulo;
  $('#btn-atras').hidden = n === 1;
  $('#btn-siguiente').hidden = n === TOTAL;
  $('#btn-enviar').hidden = n !== TOTAL;
  aviso($('#aviso-envio'), 'info', null);
  if (n === TOTAL) pintarRevision();
  if (n === 3) setTimeout(() => recortador.dibujar(), 0);
  document.title = `${actual.dataset.titulo} · Registro de catequistas`;
  if (enfocar) {
    form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    actual.focus({ preventScroll: true });
  }
}

$('#btn-siguiente').addEventListener('click', async () => {
  if (!(await validarPaso(paso))) return;
  mostrarPaso(paso + 1);
});
$('#btn-atras').addEventListener('click', () => mostrarPaso(paso - 1));
// Enter en un campo avanza en lugar de enviar.
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && paso < TOTAL) { e.preventDefault(); $('#btn-siguiente').click(); }
});

// ---------- Validación ----------

function enfocarPrimerError() {
  const p = pasos[paso - 1].querySelector('[aria-invalid=true]');
  if (!p) return;
  (p.matches('input,select,textarea') ? p : p.querySelector('input')).focus();
}

function validarPaso(n) {
  let ok = true;
  const chequear = (id, cond, msg) => {
    const el = $('#' + id);
    errorCampo(el, cond ? '' : msg);
    if (!cond) ok = false;
  };
  if (n === 1) {
    const v = (id) => $('#' + id).value.trim();
    chequear('nombres', v('nombres').length >= 2, 'Escribe tus nombres.');
    chequear('apellidos', v('apellidos').length >= 2, 'Escribe tus apellidos.');
    $('#cedula').value = normalizarCedula(v('cedula'));
    chequear('cedula', cedulaValida(v('cedula')), v('cedula') ? mensajeCedula(v('cedula')) : 'Escribe tu cédula, por ejemplo 8-123-4567.');
    const e = edad(v('fecha_nacimiento'));
    chequear('fecha_nacimiento', !Number.isNaN(e) && e >= 12 && e <= 100, v('fecha_nacimiento') ? 'Revisa la fecha de nacimiento.' : 'Indica tu fecha de nacimiento.');
    const sexoOk = !!form.sexo.value;
    $('#sexo').setAttribute('aria-invalid', String(!sexoOk));
    errorCampo($('#sexo'), sexoOk ? '' : 'Selecciona una opción.');
    if (!sexoOk) ok = false;
    chequear('telefono', telefonoValido(v('telefono')), v('telefono') ? mensajeCelular(v('telefono')) : 'Escribe tu celular, por ejemplo 6000-0000.');
    if (telefonoValido(v('telefono'))) $('#telefono').value = formatearTelefono(v('telefono'));
    chequear('correo', !mensajeCorreo(v('correo')), v('correo') ? mensajeCorreo(v('correo')) : 'Escribe tu correo.');
    chequear('correo2', v('correo2').toLowerCase() === v('correo').toLowerCase() && !!v('correo2'), v('correo2') ? 'Los correos no coinciden.' : 'Vuelve a escribir tu correo.');
  }
  if (n === 2) {
    const v = (id) => $('#' + id).value.trim();
    chequear('parroquia_buscar', !!v('parroquia_id'), v('parroquia_buscar') ? 'Elige tu parroquia de la lista de sugerencias.' : 'Escribe y elige tu parroquia.');
    if (v('parroquia_id') === OTRA_PARROQUIA) {
      chequear('parroquia', v('parroquia').length >= 3, 'Escribe el nombre de tu parroquia.');
      chequear('vicaria_id', !!v('vicaria_id'), 'Selecciona la vicaría de tu parroquia.');
    } else {
      errorCampo($('#parroquia'), '');
      errorCampo($('#vicaria_id'), '');
    }
    const anios = Number(v('anios_servicio'));
    chequear('anios_servicio', v('anios_servicio') !== '' && Number.isInteger(anios) && anios >= 0 && anios <= 80, 'Indica los años (0 si estás comenzando).');
    chequear('formacion_cenafca', !!v('formacion_cenafca'), 'Selecciona una opción.');
    const niveles = $$('input[name=nivel]:checked').length > 0;
    $('#niveles').setAttribute('aria-invalid', String(!niveles));
    errorCampo($('#niveles'), niveles ? '' : 'Marca al menos un nivel.');
    if (!niveles) ok = false;
    chequear('coordinador_parroquial', v('coordinador_parroquial').length >= 3, 'Indica quién coordina la catequesis en tu parroquia.');
  }
  if (n === 3) {
    if (recortador.cargado) estado.foto = recortador.exportar(600, 0.85);
    $('#foto-err').textContent = estado.foto ? '' : 'Toma o elige una foto para continuar.';
    ok = !!estado.foto;
  }
  if (n === 4) {
    $('#firma-err').textContent = estado.firma ? '' : 'Firma para continuar.';
    ok = !!estado.firma;
  }
  if (n === 5) {
    $('#comprobante-err').textContent = estado.comprobante ? '' : 'Adjunta la captura del comprobante.';
    if (!estado.comprobante) ok = false;
    const ref = $('#yappy_referencia');
    ref.value = ref.value.toUpperCase().replace(/\s+/g, '');
    chequear('yappy_referencia', /^[A-Z0-9-]{4,40}$/.test(ref.value), 'Escribe la referencia tal como aparece en Yappy (letras y números).');
  }
  if (n === 6) {
    const a = $('#consentimiento_datos').checked, b = $('#consentimiento_imagen').checked;
    $('#consentimientos-err').textContent = a && b ? '' : 'Debes aceptar ambos consentimientos para continuar.';
    ok = a && b;
  }
  if (!ok) enfocarPrimerError();
  return ok;
}

// ---------- Foto ----------

const recortador = new Recortador($('#recorte'), {
  alCambiar: () => { $('#zoom').value = String(recortador.zoom); },
});
$$('[data-elegir]').forEach((b) => b.addEventListener('click', () => $('#' + b.dataset.elegir).click()));
async function cargarFoto(e) {
  const archivo = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  $('#foto-err').textContent = '';
  try {
    await recortador.cargar(archivo);
    $('#recorte-vacio').hidden = true;
    $('#zoom').disabled = false;
    $('#zoom').value = '1';
    estado.foto = null; // se exporta al continuar, con el encuadre elegido
  } catch (err) {
    $('#foto-err').textContent = err.message;
  }
}
$('#foto-camara').addEventListener('change', cargarFoto);
$('#foto-galeria').addEventListener('change', cargarFoto);
$('#zoom').addEventListener('input', (e) => recortador.setZoom(Number(e.target.value)));

// ---------- Firma ----------

$('#btn-firmar').addEventListener('click', async () => {
  try {
    const png = await abrirFirma({ nombre: `${$('#nombres').value} ${$('#apellidos').value}`.trim() });
    if (!png) return;
    estado.firma = png;
    $('#firma-vista').innerHTML = `<img src="${png}" alt="Tu firma">`;
    $('#btn-firmar').textContent = '✍️ Firmar de nuevo';
    $('#firma-err').textContent = '';
  } catch (err) {
    $('#firma-err').textContent = err.message;
  }
});

// ---------- Comprobante ----------

$('#comprobante').addEventListener('change', async (e) => {
  const archivo = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  $('#comprobante-err').textContent = 'Procesando la imagen…';
  try {
    const dataUrl = await reducir(archivo, 1600, 0.85);
    if (tamañoDataUrl(dataUrl) > 2.4 * 1024 * 1024) throw new Error('La captura sigue siendo muy pesada. Recórtala e inténtalo de nuevo.');
    estado.comprobante = dataUrl;
    estado.comprobanteSha = await sha256Hex(dataUrl);
    const img = $('#comprobante-vista');
    img.src = dataUrl;
    img.hidden = false;
    $('[data-elegir=comprobante]').textContent = 'Cambiar captura';
    $('#comprobante-err').textContent = '';
  } catch (err) {
    $('#comprobante-err').textContent = err.message;
  }
});

// ---------- Revisión ----------

function pintarRevision() {
  const v = (id) => $('#' + id).value.trim();
  const lugar = lugarElegido();
  const filas = [
    ['Nombre', `${v('nombres')} ${v('apellidos')}`], ['Cédula', v('cedula')], ['Nacimiento', fmtFecha(v('fecha_nacimiento'))], ['Sexo', form.sexo.value],
    ['Celular', v('telefono')], ['Correo', v('correo')], ['Dirección', v('direccion') || '—'], ['Parroquia', lugar.parroquia],
    ['Vicaría', lugar.vicaria], ['Zona pastoral', lugar.zona], ['Años de servicio', v('anios_servicio')], ['Nivel', $$('input[name=nivel]:checked').map((x) => x.value).join(', ')],
    ['Formación CENAFCA', v('formacion_cenafca')], ['Coordinador(a)', v('coordinador_parroquial')],
    ['Pago', `${fmtMonto(config.costoRegistro, config.moneda)} · Ref. ${v('yappy_referencia')}`],
  ];
  $('#rev-datos').innerHTML = filas.map(([k, val]) => html`<div><dt>${k}</dt><dd>${val}</dd></div>`).join('');
  $('#rev-medios').innerHTML = [
    estado.foto && html`<figure><img src="${crudo(estado.foto)}" alt="Tu foto">Foto</figure>`,
    estado.firma && html`<figure><img src="${crudo(estado.firma)}" alt="Tu firma">Firma</figure>`,
    estado.comprobante && html`<figure><img src="${crudo(estado.comprobante)}" alt="Comprobante de Yappy">Comprobante</figure>`,
  ].filter(Boolean).join('');
}

// ---------- Envío ----------

const PASO_DE_CAMPO = { nombres: 1, apellidos: 1, cedula: 1, fecha_nacimiento: 1, sexo: 1, telefono: 1, correo: 1, parroquia_id: 2, parroquia: 2, vicaria_id: 2, nivel_que_imparte: 2, formacion_cenafca: 2, coordinador_parroquial: 2, anios_servicio: 2, foto: 3, firma: 4, comprobante: 5, yappy_referencia: 5, consentimiento_datos: 6, consentimiento_imagen: 6 };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  for (let n = 1; n < TOTAL; n++) {
    if (!(await validarPaso(n))) { mostrarPaso(n); validarPaso(n); return; }
  }
  const boton = $('#btn-enviar');
  ocupado(boton, true, 'Enviando…');
  aviso($('#aviso-envio'), 'info', 'Estamos guardando tu registro y generando tu carnet. No cierres esta página.');
  const v = (id) => $('#' + id).value.trim();
  try {
    const r = await api('/api/registro', {
      metodo: 'POST',
      idem: estado.idem,
      cuerpo: {
        datos: {
          nombres: v('nombres'), apellidos: v('apellidos'), cedula: normalizarCedula(v('cedula')), fecha_nacimiento: v('fecha_nacimiento'),
          sexo: form.sexo.value, telefono: normalizarTelefono(v('telefono')), correo: v('correo').toLowerCase(), direccion: v('direccion'),
          parroquia_id: v('parroquia_id'), parroquia: v('parroquia_id') === OTRA_PARROQUIA ? v('parroquia') : '', vicaria_id: v('parroquia_id') === OTRA_PARROQUIA ? v('vicaria_id') : '',
          anios_servicio: Number(v('anios_servicio')),
          nivel_que_imparte: $$('input[name=nivel]:checked').map((x) => x.value), formacion_cenafca: v('formacion_cenafca'),
          coordinador_parroquial: v('coordinador_parroquial'), yappy_referencia: v('yappy_referencia'),
          consentimiento_datos: $('#consentimiento_datos').checked, consentimiento_imagen: $('#consentimiento_imagen').checked,
        },
        foto: estado.foto,
        firma: estado.firma,
        comprobante: estado.comprobante,
        comprobante_sha256: estado.comprobanteSha,
      },
    });
    borrarBorrador();
    mostrarExito(r);
  } catch (err) {
    ocupado(boton, false);
    manejarError(err);
  }
});

function manejarError(err) {
  if (!(err instanceof ApiError)) { aviso($('#aviso-envio'), 'error', 'Ocurrió un error inesperado. Inténtalo de nuevo.'); return; }
  if (err.codigo === 'DUPLICADO') {
    form.hidden = true;
    $('#duplicado').hidden = false;
    $('#rec-correo').value = $('#correo').value.trim();
    $('#duplicado').focus();
    return;
  }
  if (err.codigo === 'VALIDACION' && err.campos) {
    const primero = Object.keys(err.campos).map((k) => PASO_DE_CAMPO[k] || TOTAL).sort((a, b) => a - b)[0];
    mostrarPaso(primero);
    Object.entries(err.campos).forEach(([k, msg]) => { const el = $('#' + (k === 'parroquia_id' ? 'parroquia_buscar' : k)); if (el) errorCampo(el, msg); });
    aviso($('#aviso-envio'), 'error', err.message);
    return;
  }
  if (err.codigo === 'COMPROBANTE_REPETIDO' || err.codigo === 'REFERENCIA_REPETIDA') {
    // Nuevo comprobante = nueva operación: nueva clave de idempotencia.
    estado.idem = nuevaClave();
    mostrarPaso(5);
    aviso($('#aviso-envio'), 'error', err.message);
    return;
  }
  aviso($('#aviso-envio'), 'error', err.message);
}

function mostrarExito(r) {
  form.hidden = true;
  const ex = $('#exito');
  ex.hidden = false;
  $('#exito-numero').textContent = r.numero;
  const carnet = $('#exito-carnet'), pdf = $('#exito-pdf');
  carnet.hidden = !r.documentos.carnet;
  pdf.hidden = !r.documentos.pdf;
  carnet.href = r.documentos.carnet || '#';
  pdf.href = r.documentos.pdf || '#';
  const msgs = [];
  const activo = r.estado === 'ACTIVO';
  $('#exito-titulo').textContent = activo ? '¡Bienvenido(a), catequista!' : '¡Recibimos tu registro!';
  if (r.vicaria_zona) msgs.push(`Parroquia ${r.parroquia} · ${r.vicaria_zona}${r.zona_pastoral ? ' · ' + r.zona_pastoral : ''}.`);
  if (activo) {
    msgs.push(r.correoEnviado ? `Enviamos tu carnet y tu ficha de inscripción a ${r.correo}. Si no lo ves, revisa la carpeta de spam.` : `Tu registro quedó guardado. El correo a ${r.correo} se enviará en cuanto sea posible.`);
  } else {
    msgs.push('La Comisión revisará tus datos y tu comprobante de pago. Cuando apruebe tu registro te enviaremos el carnet por correo.');
    msgs.push(r.correoEnviado ? `Te enviamos la confirmación y tu ficha de inscripción a ${r.correo}. Si no la ves, revisa la carpeta de spam.` : `El correo de confirmación a ${r.correo} se enviará en cuanto sea posible.`);
    if (r.estado === 'PENDIENTE_DOCUMENTOS') msgs.push('Estamos terminando de generar tus documentos; estarán en tu portal en unos minutos.');
  }
  msgs.push('Guarda tu número: lo necesitas, junto con tu correo, para entrar al portal y ver el estado de tu registro.');
  aviso($('#exito-aviso'), r.correoEnviado ? (activo ? 'ok' : 'info') : 'warn', msgs);
  document.title = `Registro completado · ${r.numero}`;
  ex.focus();
  ex.scrollIntoView({ block: 'start' });
}

// ---------- Recuperar número ----------

$('#btn-volver-form').addEventListener('click', () => { $('#duplicado').hidden = true; form.hidden = false; mostrarPaso(1); });
$('#form-recuperar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#rec-correo');
  if (!correoValido(input.value)) { errorCampo(input, 'Escribe un correo válido.'); input.focus(); return; }
  errorCampo(input, '');
  const b = $('#btn-recuperar');
  ocupado(b, true, 'Enviando…');
  try {
    const r = await api('/api/recuperar', { metodo: 'POST', cuerpo: { correo: input.value.trim().toLowerCase() } });
    aviso($('#rec-aviso'), 'ok', r.mensaje);
  } catch (err) {
    aviso($('#rec-aviso'), 'error', err.message);
  } finally {
    ocupado(b, false);
  }
});
