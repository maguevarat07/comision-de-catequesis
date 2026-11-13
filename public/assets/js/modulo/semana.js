import {
  api, nuevaClave, cargarConfig, marcarModo, TALLAS, $, $$, html, ocupado, errorCampo, aviso,
  telefonoValido, formatearTelefono, normalizarTelefono, fmtMonto, ApiError,
} from './comun.js';
import { reducir, sha256Hex, tamañoDataUrl } from './imagenes.js';
import { qrSvg } from './carnet.js';

const form = $('#form-semana');
const estado = { comprobante: null, sha: '', idem: nuevaClave(), campos: { talla: true, restricciones: true } };

$('#talla_camiseta').innerHTML = TALLAS.map((t) => html`<label class="m-chip"><input type="radio" name="talla" value="${t}"><span>${t}</span></label>`).join('');

(async function iniciar() {
  let datos, config;
  try {
    [datos, config] = await Promise.all([api('/api/portal/yo'), cargarConfig()]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { location.replace('/portal/?volver=semana'); return; }
    aviso($('#estado-global'), 'error', e.message);
    return;
  }
  marcarModo(config);
  const { catequista: c, semana: s } = datos;
  $('#titulo').textContent = `Semana del Catequista ${s.edicion}`;
  $('#evento').innerHTML = html`<dt>Fechas</dt><dd>${s.fechas || 'Por anunciar'}</dd><dt>Sede</dt><dd>${s.sede || 'Por anunciar'}</dd>`;

  if (s.inscripcion) {
    aviso($('#estado-global'), 'ok', [`Ya estás inscrito(a): ${s.inscripcion.numero}.`, 'Tu pase está en el portal.']);
    $('#estado-global').insertAdjacentHTML('beforeend', '<p style="margin-top:10px"><a class="m-btn m-btn--primario m-btn--sm" href="/portal/#semana">Ver mi pase</a></p>');
    return;
  }
  if (!s.puedeInscribirse) {
    const motivo = c.estado !== 'ACTIVO' ? 'Podrás inscribirte cuando tu registro esté activo.' : !s.abierta ? 'La inscripción no está abierta en este momento.' : 'Se agotaron los cupos de esta edición.';
    aviso($('#estado-global'), 'warn', motivo);
    return;
  }

  estado.campos = s.campos;
  $('#campo-talla').hidden = !s.campos.talla;
  $('#campo-restricciones').hidden = !s.campos.restricciones;
  $('#grupo-extra').hidden = !s.campos.talla && !s.campos.restricciones;
  if ($('#grupo-extra').hidden) {
    // Renumerar el paso de pago.
    $$('legend', form)[2].textContent = '2. Pago por Yappy';
  }
  $('#nombre').value = `${c.nombres} ${c.apellidos}`;
  $('#correo').value = c.correo;
  $('#telefono').value = formatearTelefono(c.telefono);
  $('#pago-monto').textContent = fmtMonto(s.costo, config.moneda);
  $('#pago-directorio').textContent = config.yappy.directorio || 'Por definir';
  $('#pago-telefono').textContent = config.yappy.telefono || '—';
  $('#pago-instrucciones').textContent = (config.yappy.instrucciones || '').replace(/B\/\.\s?[\d.,]+/, fmtMonto(s.costo, config.moneda));
  form.hidden = false;
})();

$('#btn-comprobante').addEventListener('click', () => $('#comprobante').click());
$('#comprobante').addEventListener('change', async (e) => {
  const archivo = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  $('#comprobante-err').textContent = 'Procesando la imagen…';
  try {
    const dataUrl = await reducir(archivo, 1600, 0.85);
    if (tamañoDataUrl(dataUrl) > 2.4 * 1024 * 1024) throw new Error('La captura sigue siendo muy pesada. Recórtala e inténtalo de nuevo.');
    estado.comprobante = dataUrl;
    estado.sha = await sha256Hex(dataUrl);
    $('#comprobante-vista').src = dataUrl;
    $('#comprobante-vista').hidden = false;
    $('#btn-comprobante').textContent = 'Cambiar captura';
    $('#comprobante-err').textContent = '';
  } catch (err) {
    $('#comprobante-err').textContent = err.message;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let ok = true;
  const tel = $('#telefono');
  errorCampo(tel, telefonoValido(tel.value) ? '' : 'Escribe un celular de Panamá, por ejemplo 6000-0000.');
  if (!telefonoValido(tel.value)) ok = false;
  const talla = form.talla.value;
  if (estado.campos.talla) {
    errorCampo($('#talla_camiseta'), talla ? '' : 'Selecciona una talla.');
    $('#talla_camiseta').setAttribute('aria-invalid', String(!talla));
    if (!talla) ok = false;
  }
  $('#comprobante-err').textContent = estado.comprobante ? '' : 'Adjunta la captura del comprobante.';
  if (!estado.comprobante) ok = false;
  const ref = $('#yappy_referencia');
  ref.value = ref.value.toUpperCase().replace(/\s+/g, '');
  errorCampo(ref, /^[A-Z0-9-]{4,40}$/.test(ref.value) ? '' : 'Escribe la referencia tal como aparece en Yappy.');
  if (!/^[A-Z0-9-]{4,40}$/.test(ref.value)) ok = false;
  if (!ok) {
    const primero = form.querySelector('[aria-invalid=true]');
    (primero && (primero.matches('input,textarea') ? primero : primero.querySelector('input')))?.focus();
    return;
  }

  const b = $('#btn-enviar');
  ocupado(b, true, 'Inscribiendo…');
  aviso($('#aviso-envio'), 'info', 'Estamos confirmando tu inscripción y generando tu pase. No cierres esta página.');
  try {
    const r = await api('/api/semana/inscribir', {
      metodo: 'POST',
      idem: estado.idem,
      cuerpo: {
        telefono: normalizarTelefono(tel.value), talla_camiseta: estado.campos.talla ? talla : '',
        restricciones_alimentarias: estado.campos.restricciones ? $('#restricciones_alimentarias').value.trim() : '',
        yappy_referencia: ref.value, comprobante: estado.comprobante, comprobante_sha256: estado.sha,
      },
    });
    form.hidden = true;
    $('#exito').hidden = false;
    $('#exito-numero').textContent = r.numero;
    $('#exito-qr').innerHTML = qrSvg(r.verificacionUrl, 'QR de acceso');
    aviso($('#exito-aviso'), r.correoEnviado ? 'ok' : 'warn', r.correoEnviado ? `Enviamos tu pase con el código QR a ${$('#correo').value}.` : 'Tu inscripción quedó guardada; el correo con tu pase se enviará en cuanto sea posible. También puedes verlo en el portal.');
    $('#exito').focus();
  } catch (err) {
    ocupado(b, false);
    if (err.codigo === 'COMPROBANTE_REPETIDO' || err.codigo === 'REFERENCIA_REPETIDA') estado.idem = nuevaClave();
    if (err.status === 401) { location.replace('/portal/'); return; }
    if (err.campos) Object.entries(err.campos).forEach(([k, m]) => { const el = $('#' + k); if (el) errorCampo(el, m); });
    aviso($('#aviso-envio'), 'error', err.message);
  }
});
