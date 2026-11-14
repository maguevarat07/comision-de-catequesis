import {
  api, cargarConfig, marcarModo, $, html, crudo, ocupado, errorCampo, aviso, correoValido,
  normalizarNumeroCatequista, fmtFecha, fmtMonto, insignaEstado, formatearTelefono, ApiError,
} from './comun.js';
import { carnetHtml, qrSvg } from './carnet.js';

cargarConfig().then(marcarModo).catch(() => {});

async function cargarPanel() {
  try {
    const r = await api('/api/portal/yo');
    pintarPanel(r);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return mostrarAcceso();
    aviso($('#estado-global'), 'error', e.message);
  }
}

function mostrarAcceso() {
  $('#vista-panel').hidden = true;
  $('#vista-acceso').hidden = false;
  $('#titulo').textContent = 'Portal del catequista';
  $('#subtitulo').textContent = 'Entra con el correo con el que te registraste y tu número de catequista.';
  document.title = 'Portal del catequista | Comisión de Catequesis';
}

function pintarPanel({ catequista: c, documentos: d, semana: s }) {
  $('#vista-acceso').hidden = true;
  $('#vista-panel').hidden = false;
  $('#titulo').textContent = `Hola, ${c.nombres.split(' ')[0]}`;
  $('#subtitulo').textContent = `Catequista ${c.numero} · ${c.parroquia}`;
  document.title = `${c.numero} · Portal del catequista`;
  $('#estado-registro').innerHTML = `Estado del registro: ${insignaEstado(c.estado)}`;

  // El carnet (en pantalla y en PDF) se entrega cuando la Comisión aprueba el registro.
  $('#carnet').innerHTML = c.estado === 'ACTIVO'
    ? carnetHtml(c)
    : '<div class="m-aviso m-aviso--info"><p><strong>Tu registro está en revisión.</strong></p><p>La Comisión revisará tus datos y tu comprobante de pago. Cuando lo apruebe, tu carnet aparecerá aquí y te lo enviaremos por correo.</p></div>';

  const docs = [
    d.carnet && html`<li><a href="${d.carnet}" download>Carnet para imprimir (PDF) <span aria-hidden="true">↓</span></a></li>`,
    d.pdf && html`<li><a href="${d.pdf}" download>Ficha de inscripción (PDF) <span aria-hidden="true">↓</span></a></li>`,
    s.inscripcion && s.inscripcion.pase && html`<li><a href="${s.inscripcion.pase}" download>Pase de la Semana ${s.edicion} (PDF) <span aria-hidden="true">↓</span></a></li>`,
  ].filter(Boolean);
  $('#descargas').innerHTML = docs.length ? docs.join('') : '<li class="m-help">Tus documentos se están generando. Vuelve a entrar en unos minutos.</li>';

  const filas = [['Número', c.numero], ['Nombre', `${c.nombres} ${c.apellidos}`], ['Correo', c.correo], ['Celular', formatearTelefono(c.telefono)], ['Parroquia', c.parroquia], ['Vicaría', c.vicaria_zona], ['Zona pastoral', c.zona_pastoral || '—'], ['Registro', fmtFecha(c.fecha_registro)], ['Vigencia', fmtFecha(c.vigencia_hasta)]];
  $('#datos').innerHTML = filas.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`).join('');

  pintarSemana(c, s);
}

function pintarSemana(c, s) {
  const t = $('#tarjeta-semana');
  const cab = html`<h2 class="disp" id="semana">Semana del Catequista ${s.edicion}</h2>`;
  const info = html`<dl class="m-datos" style="margin:12px 0 18px"><dt>Fechas</dt><dd>${s.fechas || 'Por anunciar'}</dd><dt>Sede</dt><dd>${s.sede || 'Por anunciar'}</dd></dl>`;
  if (s.inscripcion) {
    const i = s.inscripcion;
    const anulada = i.estado === 'ANULADA';
    t.innerHTML = cab + html`
      <p style="margin:6px 0 14px">${crudo(insignaEstado(i.estado))} Inscripción <strong>${i.numero}</strong></p>
      ${crudo(info)}
      ${anulada ? crudo('<div class="m-aviso m-aviso--error"><p>Esta inscripción fue anulada. Si crees que es un error, escribe a la Comisión.</p></div>') : crudo(html`
      <div class="m-pase">
        <div class="m-pase__qr">${crudo(qrSvg(i.verificacionUrl, 'QR de acceso a la Semana del Catequista'))}</div>
        <div>
          <p style="margin:0 0 6px;font-weight:800">Tu pase de acceso</p>
          <p class="m-help" style="margin:0 0 10px">Presenta este código en la entrada. También te lo enviamos por correo.</p>
          ${i.checkin_at ? crudo(html`<p class="m-badge m-badge--ok">Entrada registrada · ${fmtFecha(i.checkin_at, true)}</p>`) : ''}
        </div>
      </div>`)}`;
    return;
  }
  if (c.estado !== 'ACTIVO') {
    t.innerHTML = cab + info + '<div class="m-aviso m-aviso--warn"><p>Podrás inscribirte cuando la Comisión apruebe tu registro.</p></div>';
  } else if (!s.abierta) {
    t.innerHTML = cab + info + '<div class="m-aviso m-aviso--info"><p>La inscripción aún no está abierta. Te avisaremos por los canales oficiales.</p></div>';
  } else if (!s.hayCupo) {
    t.innerHTML = cab + info + '<div class="m-aviso m-aviso--warn"><p>Se agotaron los cupos de esta edición.</p></div>';
  } else {
    t.innerHTML = cab + info + html`<p class="m-sub">La inscripción cuesta <strong>${fmtMonto(s.costo, s.moneda)}</strong>${s.cupo ? ` · Quedan ${s.cupo - s.inscritos} cupos` : ''}.</p>
      <a class="m-btn m-btn--oro" href="/portal/semana/">Inscribirme en la Semana</a>`;
  }
}

// ---------- Acceso ----------

$('#form-acceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const correo = $('#acc-correo'), numero = $('#acc-numero');
  const n = normalizarNumeroCatequista(numero.value);
  errorCampo(correo, correoValido(correo.value) ? '' : 'Escribe un correo válido.');
  errorCampo(numero, n ? '' : 'Escribe tu número, por ejemplo CAT-00001.');
  if (!correoValido(correo.value) || !n) return (correoValido(correo.value) ? numero : correo).focus();
  numero.value = n;
  const b = $('#btn-entrar');
  ocupado(b, true, 'Entrando…');
  aviso($('#acc-aviso'), 'info', null);
  try {
    await api('/api/portal/entrar', { metodo: 'POST', cuerpo: { correo: correo.value.trim().toLowerCase(), numero: n } });
    await cargarPanel();
  } catch (err) {
    aviso($('#acc-aviso'), 'error', err.message);
  } finally {
    ocupado(b, false);
  }
});

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

$('#btn-salir').addEventListener('click', async () => {
  try { await api('/api/portal/salir', { metodo: 'POST', cuerpo: {} }); } catch { /* se cierra igual en pantalla */ }
  mostrarAcceso();
  $('#acc-correo').focus();
});

cargarPanel();
