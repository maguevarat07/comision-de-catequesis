// Panel de administración: cola de aprobación, dashboard territorial, listados y detalle.
import { api, nuevaClave, cargarConfig, marcarModo, $, $$, html, crudo, aviso, ocupado, errorCampo, fmtFecha, fmtMonto, insignaEstado, formatearTelefono } from './comun.js';
import { sesionStaff, pedirAcceso, salirStaff } from './staff.js';

let vista = 'aprobaciones';
let busquedaTimer = null;
let peticion = null;
let itemsActuales = [];
const filtroTerr = { zona: '', vicaria: '', parroquia: '' }; // filtro del listado de catequistas (desde el dashboard)

cargarConfig().then(marcarModo).catch(() => {});

(async function iniciar() {
  let s;
  try { s = await sesionStaff(); } catch (e) { aviso($('#estado-global'), 'error', e.message); return; }
  if (!s) {
    $('#vista-acceso').hidden = false;
    s = await pedirAcceso($('#vista-acceso'), { titulo: 'Panel de administración' });
    $('#vista-acceso').hidden = true;
  }
  if (s.rol !== 'admin') { location.replace('/admin/escanear/'); return; }
  $('#nav-admin').hidden = false;
  $('#usuario').textContent = s.email;
  $('#vista-panel').hidden = false;
  cargarResumen();
  cambiarVista('aprobaciones', false);
})();

$('#btn-salir').addEventListener('click', async () => { await salirStaff(); location.reload(); });

// ---------- Resumen ----------

async function cargarResumen() {
  try {
    const r = await api('/api/admin/resumen');
    const k = [
      ['Registrados', r.registrados], ['Aprobados', r.activos], ['Por aprobar', r.porAprobar, 'aprobaciones'],
      [`Inscritos Semana ${r.edicion}`, r.inscritosSemana], ['Recaudado', fmtMonto(r.recaudado, r.moneda)],
    ];
    $('#kpis').innerHTML = k.map(([t, v, ir]) => (ir
      ? html`<button type="button" class="m-kpi m-kpi--accion${v ? ' m-kpi--alerta' : ''}" data-ir="${ir}"><span>${t}</span><strong>${v}</strong></button>`
      : html`<div class="m-kpi"><span>${t}</span><strong>${v}</strong></div>`)).join('');
    const n = $('#n-aprobar');
    n.hidden = !r.porAprobar;
    n.textContent = r.porAprobar;
    const extras = [];
    if (r.entradas) extras.push(`${r.entradas} entradas a la Semana`);
    if (r.pendientes) extras.push(`${r.pendientes} con documentos pendientes`);
    if (r.rechazados) extras.push(`${r.rechazados} rechazados`);
    if (r.anulados) extras.push(`${r.anulados} anulados`);
    if (r.correosPendientes) extras.push(`${r.correosPendientes} correos en cola`);
    $('#cuota').textContent = `Cuota de correo restante hoy: ${r.cuotaCorreo ?? '—'}${extras.length ? ' · ' + extras.join(' · ') : ''}`;
  } catch (e) {
    aviso($('#estado-global'), 'error', e.message);
  }
}
$('#kpis').addEventListener('click', (e) => { const b = e.target.closest('[data-ir]'); if (b) cambiarVista(b.dataset.ir); });

// ---------- Pestañas ----------

const tabs = $$('.m-tab');
tabs.forEach((t) => t.addEventListener('click', () => cambiarVista(t.dataset.vista)));
$('.m-tabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = tabs.indexOf(document.activeElement);
  const sig = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  sig.focus();
  cambiarVista(sig.dataset.vista);
});

function cambiarVista(v, enfocar = true) {
  vista = v;
  tabs.forEach((x) => { const on = x.dataset.vista === v; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; if (on && enfocar && document.activeElement?.classList.contains('m-tab')) x.focus(); });
  const tab = tabs.find((x) => x.dataset.vista === v);
  const dash = v === 'dashboard';
  $('#panel-dashboard').hidden = !dash;
  $('#panel-lista').hidden = dash;
  if (dash) { cargarDashboard(); return; }
  $('#panel-lista').setAttribute('aria-labelledby', tab.id);
  $('#ayuda-aprobar').hidden = v !== 'aprobaciones';
  $('#filtro-estado').hidden = v !== 'catequistas';
  $('#exp-actual').href = `/api/admin/exportar?tabla=${v === 'semana' ? 'semana' : 'catequistas'}`;
  $('#tabla-caption').textContent = { aprobaciones: 'Registros por aprobar', catequistas: 'Catequistas registrados', semana: 'Inscritos en la Semana del Catequista' }[v];
  pintarFiltroTerritorio();
  cargarLista();
}

// ---------- Listados ----------

const num = (x) => crudo(html`<span class="m-num">${x.numero}</span>`);
const COLUMNAS = {
  aprobaciones: [['Número', num], ['Nombre', (x) => x.nombre], ['Parroquia', (x) => x.parroquia], ['Vicaría', (x) => x.vicaria_zona], ['Recibido', (x) => fmtFecha(x.fecha_registro, true)]],
  catequistas: [['Número', num], ['Nombre', (x) => x.nombre], ['Cédula', (x) => x.cedula], ['Parroquia', (x) => x.parroquia], ['Vicaría', (x) => x.vicaria_zona], ['Estado', (x) => crudo(insignaEstado(x.estado))], ['Registro', (x) => fmtFecha(x.fecha_registro)]],
  semana: [['Inscripción', num], ['Catequista', (x) => x.numero_catequista], ['Nombre', (x) => x.nombre], ['Parroquia', (x) => x.parroquia], ['Talla', (x) => x.talla || '—'], ['Estado', (x) => crudo(insignaEstado(x.estado))], ['Entrada', (x) => (x.checkin_at ? fmtFecha(x.checkin_at, true) : '—')]],
};

$('#form-buscar').addEventListener('submit', (e) => { e.preventDefault(); cargarLista(); });
$('#q').addEventListener('input', () => { clearTimeout(busquedaTimer); busquedaTimer = setTimeout(cargarLista, 250); });
$('#filtro-estado').addEventListener('change', cargarLista);

function urlLista() {
  const p = new URLSearchParams({ q: $('#q').value.trim() });
  if (vista === 'semana') return `/api/admin/semana?${p}`;
  if (vista === 'aprobaciones') p.set('estado', 'PENDIENTE_APROBACION');
  else {
    p.set('estado', $('#filtro-estado').value);
    Object.entries(filtroTerr).forEach(([k, v]) => { if (v) p.set(k, v); });
  }
  return `/api/admin/catequistas?${p}`;
}

async function cargarLista() {
  peticion?.abort();
  peticion = new AbortController();
  const cols = COLUMNAS[vista];
  $('#thead').innerHTML = `<tr>${cols.map(([t]) => html`<th scope="col">${t}</th>`).join('')}</tr>`;
  try {
    const r = await api(urlLista(), { señal: peticion.signal });
    itemsActuales = r.items;
    const vacio = vista === 'aprobaciones' ? 'No hay registros por aprobar.' : 'No hay resultados.';
    $('#tbody').innerHTML = r.items.length
      ? r.items.map((x) => html`<tr tabindex="0" data-id="${x.id}" aria-label="Abrir ${x.numero}">${crudo(cols.map(([, f]) => html`<td>${f(x)}</td>`).join(''))}</tr>`).join('')
      : html`<tr><td colspan="${cols.length}" class="m-vacio">${vacio}</td></tr>`;
    $('#conteo').textContent = `${r.items.length} ${r.items.length === 1 ? 'resultado' : 'resultados'}`;
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('#tbody').innerHTML = `<tr><td colspan="${cols.length}" class="m-vacio"></td></tr>`;
    $('#tbody td').textContent = e.message;
  }
}

$('#tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrirDetalle(tr.dataset.id); });
$('#tbody').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr[data-id]'); if (tr) { e.preventDefault(); abrirDetalle(tr.dataset.id); } } });

/** Chip con el filtro territorial que vino del dashboard. */
function pintarFiltroTerritorio() {
  const cont = $('#filtro-territorio');
  const activo = vista === 'catequistas' && (filtroTerr.zona || filtroTerr.vicaria || filtroTerr.parroquia);
  cont.hidden = !activo;
  if (!activo) return;
  const texto = filtroTerr.parroquia || filtroTerr.vicaria || filtroTerr.zona;
  cont.innerHTML = html`<span>Mostrando solo: <strong>${texto}</strong></span><button type="button" class="m-btn m-btn--texto m-btn--sm" id="quitar-filtro">Quitar filtro</button>`;
  $('#quitar-filtro').addEventListener('click', () => { Object.keys(filtroTerr).forEach((k) => { filtroTerr[k] = ''; }); pintarFiltroTerritorio(); cargarLista(); });
}

// ---------- Detalle ----------

const dlg = $('#dialogo');
$('#dlg-cerrar').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { if (dlg.dataset.cambio) { delete dlg.dataset.cambio; cargarResumen(); if (vista === 'dashboard') cargarDashboard(); else cargarLista(); } });

const tablaFilas = (filas) => `<dl class="m-datos">${filas.map(([k, v]) => html`<dt>${k}</dt><dd>${v === '' || v == null ? '—' : v}</dd>`).join('')}</dl>`;
const medio = (url, texto) => (url ? html`<figure><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${texto}" loading="lazy"></a>${texto}</figure>` : '');

async function abrirDetalle(id) {
  const tipo = vista === 'semana' ? 'semana' : 'catequista';
  $('#dlg-titulo').textContent = 'Cargando…';
  $('#dlg-cuerpo').innerHTML = '<p class="m-help">Cargando…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const r = await api(`/api/admin/${tipo === 'semana' ? 'semana' : 'catequistas'}/${encodeURIComponent(id)}`);
    tipo === 'catequista' ? pintarCatequista(r) : pintarSemana(r);
  } catch (e) {
    $('#dlg-cuerpo').innerHTML = '<div></div>';
    aviso($('#dlg-cuerpo div'), 'error', e.message);
  }
}

function seccionPagos(pagos) {
  if (!pagos.length) return '';
  return html`<h3 style="margin-top:22px">Pagos</h3><div class="m-tabla-wrap"><table class="m-tabla"><thead><tr><th>Tipo</th><th>Monto</th><th>Referencia</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${crudo(pagos.map((p) => html`<tr><td>${p.tipo}</td><td>${fmtMonto(p.monto, p.moneda)}</td><td>${p.yappy_referencia}</td><td>${p.estado}${p.motivo_anulacion ? ' · ' + p.motivo_anulacion : ''}</td><td>${fmtFecha(p.creado_at, true)}</td></tr>`).join(''))}</tbody></table></div>`;
}
function seccionCorreos(correos) {
  if (!correos || !correos.length) return '';
  return html`<h3 style="margin-top:22px">Correos</h3><ul style="margin:0;padding-left:18px">${crudo(correos.map((m) => html`<li>${fmtFecha(m.fecha, true)} · ${m.asunto} · <strong>${m.estado}</strong>${m.error ? ' · ' + m.error : ''}</li>`).join(''))}</ul>`;
}
function bloqueAnular(tipo) {
  return html`
    <details style="margin-top:22px" id="anular-zona">
      <summary class="m-btn m-btn--texto" style="color:var(--m-err)">Anular ${tipo === 'catequista' ? 'registro' : 'inscripción'}…</summary>
      <form class="m-form" id="form-anular" novalidate style="margin-top:10px">
        <div class="m-aviso m-aviso--warn"><p>${tipo === 'catequista' ? 'El carnet, la inscripción a la Semana y su QR dejarán de ser válidos.' : 'El pase y su QR dejarán de ser válidos.'} Queda registrado en la auditoría.</p></div>
        <div class="m-field"><label for="motivo">Motivo (obligatorio)</label><textarea id="motivo" maxlength="300" required></textarea></div>
        <button type="submit" class="m-btn m-btn--peligro">Confirmar anulación</button>
      </form>
    </details>`;
}

const MOTIVOS_RECHAZO = [
  'La foto no permite identificarte (debe ser de frente, con buena luz y sin gafas oscuras).',
  'El comprobante de Yappy no corresponde al pago del registro.',
  'Los datos personales están incompletos o no coinciden con la cédula.',
  'No pudimos confirmar tu servicio en la parroquia indicada.',
];

/** Bloque de revisión: aprobar / rechazar (registros pendientes) o resultado de la revisión. */
function bloqueRevision(c) {
  if (c.estado === 'PENDIENTE_APROBACION' || c.estado === 'PENDIENTE_DOCUMENTOS') {
    const sinDocs = c.estado === 'PENDIENTE_DOCUMENTOS';
    return html`
      <section class="m-revision" aria-labelledby="rev-titulo">
        <h3 id="rev-titulo" style="margin:0 0 6px">Revisión del registro</h3>
        <p class="m-help" style="margin:0 0 12px">${sinDocs ? 'Este registro aún no tiene ficha ni carnet. Regenera los documentos para poder aprobarlo, o recházalo.' : 'Comprueba la foto, los datos y el comprobante. Al aprobar se envía el carnet por correo.'}</p>
        <div class="m-acciones">
          ${sinDocs ? '' : crudo('<button type="button" class="m-btn m-btn--oro" id="btn-aprobar">Aprobar registro</button>')}
          <button type="button" class="m-btn m-btn--borde" id="btn-rechazar-abrir" aria-expanded="false" aria-controls="form-rechazar">Rechazar…</button>
        </div>
        <form class="m-form" id="form-rechazar" novalidate hidden style="margin-top:14px">
          <div class="m-field">
            <label for="motivo-rechazo">Motivo del rechazo (se envía al catequista)</label>
            <textarea id="motivo-rechazo" maxlength="300" required></textarea>
          </div>
          <div class="m-chips" aria-label="Motivos frecuentes">${crudo(MOTIVOS_RECHAZO.map((m) => html`<button type="button" class="m-chip-btn" data-motivo="${m}">${m.split(' (')[0]}</button>`).join(''))}</div>
          <p class="m-help">El correo y la cédula quedan libres para que la persona se registre de nuevo corrigiendo lo indicado.</p>
          <button type="submit" class="m-btn m-btn--peligro">Confirmar rechazo</button>
        </form>
        <div id="rev-aviso" hidden style="margin-top:12px"></div>
      </section>`;
  }
  if (c.estado === 'RECHAZADO') return html`<div class="m-aviso m-aviso--error" style="margin:12px 0"><p><strong>Rechazado</strong> por ${c.revisado_por || '—'} el ${fmtFecha(c.revisado_at, true)}.</p><p>Motivo: ${c.motivo_rechazo || '—'}</p></div>`;
  if (c.revisado_at && c.estado === 'ACTIVO') return html`<p class="m-help" style="margin:8px 0">Aprobado por ${c.revisado_por} el ${fmtFecha(c.revisado_at, true)}.</p>`;
  return '';
}

function pintarCatequista(r) {
  const c = r.item;
  $('#dlg-titulo').textContent = `${c.numero_catequista} · ${c.nombres} ${c.apellidos}`;
  const conCorreo = ['ACTIVO', 'PENDIENTE_APROBACION', 'RECHAZADO'].includes(c.estado);
  $('#dlg-cuerpo').innerHTML = html`
    <p style="margin:0 0 6px">${crudo(insignaEstado(c.estado))}</p>
    ${crudo(bloqueRevision(c))}
    <div class="m-medios">${crudo(medio(r.archivos.foto, 'Foto'))}${crudo(medio(r.archivos.firma, 'Firma'))}${crudo(medio(r.archivos.comprobante, 'Comprobante Yappy'))}</div>
    ${crudo(tablaFilas([
      ['Cédula', c.cedula], ['Nacimiento', fmtFecha(c.fecha_nacimiento)], ['Sexo', c.sexo], ['Celular', formatearTelefono(c.telefono)], ['Correo', c.correo], ['Dirección', c.direccion],
      ['Parroquia', c.parroquia], ['Vicaría', c.vicaria_zona], ['Zona pastoral', c.zona_pastoral], ['Años de servicio', c.anios_servicio], ['Nivel', c.nivel_que_imparte], ['CENAFCA', c.formacion_cenafca], ['Coordinador(a)', c.coordinador_parroquial],
      ['Ref. Yappy', c.yappy_referencia], ['Registro', fmtFecha(c.fecha_registro, true)], ['Vigencia', fmtFecha(c.vigencia_hasta)], ['Carnet enviado', c.correo_enviado_at ? fmtFecha(c.correo_enviado_at, true) : 'No'],
      ['Consentimientos', `${fmtFecha(c.consentimiento_datos, true)}`], ['Notas', c.notas_admin],
    ]))}
    <div class="m-acciones" style="margin-top:18px">
      ${r.archivos.carnet && c.estado === 'ACTIVO' ? crudo(html`<a class="m-btn m-btn--borde m-btn--sm" href="${r.archivos.carnet}" download>Carnet PDF</a>`) : ''}
      ${r.archivos.pdf ? crudo(html`<a class="m-btn m-btn--borde m-btn--sm" href="${r.archivos.pdf}" download>Ficha PDF</a>`) : ''}
      <a class="m-btn m-btn--texto m-btn--sm" href="${r.verificacionUrl}" target="_blank" rel="noopener">Ver verificación</a>
      ${!['ANULADO', 'RECHAZADO'].includes(c.estado) ? crudo('<button type="button" class="m-btn m-btn--primario m-btn--sm" data-accion="regenerar">Regenerar documentos</button>') : ''}
      ${conCorreo ? crudo('<button type="button" class="m-btn m-btn--primario m-btn--sm" data-accion="reenviar">Reenviar correo</button>') : ''}
    </div>
    <div id="dlg-aviso" hidden style="margin-top:12px"></div>
    ${crudo(r.semana.length ? html`<h3 style="margin-top:22px">Semana del Catequista</h3><ul style="margin:0;padding-left:18px">${crudo(r.semana.map((s) => html`<li>${s.numero} · ${s.edicion} · ${s.estado}${s.checkin_at ? ' · entró ' + fmtFecha(s.checkin_at, true) : ''}</li>`).join(''))}</ul>` : '')}
    ${crudo(seccionPagos(r.pagos))}
    ${crudo(seccionCorreos(r.correos))}
    ${c.estado === 'ACTIVO' ? crudo(bloqueAnular('catequista')) : ''}`;
  enlazarAcciones('catequista', c.id);
  enlazarRevision(c.id);
}

function pintarSemana(r) {
  const s = r.item;
  $('#dlg-titulo').textContent = `${s.numero_inscripcion_semana} · ${s.nombre}`;
  $('#dlg-cuerpo').innerHTML = html`
    <p style="margin:0 0 6px">${crudo(insignaEstado(s.estado))}</p>
    <div class="m-medios">${crudo(medio(r.archivos.foto, 'Foto'))}${crudo(medio(r.archivos.comprobante, 'Comprobante Yappy'))}</div>
    ${crudo(tablaFilas([
      ['Catequista', s.numero_catequista], ['Correo', s.correo], ['Parroquia', s.parroquia], ['Vicaría', s.vicaria_zona], ['Edición', s.edicion],
      ['Inscripción', fmtFecha(s.fecha_inscripcion, true)], ['Talla', s.talla_camiseta], ['Restricciones', s.restricciones_alimentarias], ['Ref. Yappy', s.yappy_referencia],
      ['Entrada', s.checkin_at ? `${fmtFecha(s.checkin_at, true)} · ${s.checkin_por}` : 'No'], ['Correo enviado', s.correo_enviado_at ? fmtFecha(s.correo_enviado_at, true) : 'No'], ['Notas', s.notas_admin],
    ]))}
    <div class="m-acciones" style="margin-top:18px">
      ${r.archivos.pase ? crudo(html`<a class="m-btn m-btn--borde m-btn--sm" href="${r.archivos.pase}" download>Pase PDF</a>`) : ''}
      <a class="m-btn m-btn--texto m-btn--sm" href="${r.verificacionUrl}" target="_blank" rel="noopener">Ver verificación</a>
      ${s.estado !== 'ANULADA' ? crudo('<button type="button" class="m-btn m-btn--primario m-btn--sm" data-accion="reenviar">Reenviar correo</button>') : ''}
    </div>
    <div id="dlg-aviso" hidden style="margin-top:12px"></div>
    ${crudo(seccionPagos(r.pagos))}
    ${crudo(seccionCorreos(r.correos))}
    ${s.estado !== 'ANULADA' ? crudo(bloqueAnular('semana')) : ''}`;
  enlazarAcciones('semana', s.id);
}

/** Siguiente registro de la cola después de `id` (para revisar uno tras otro). */
function siguienteEnCola(id) {
  if (vista !== 'aprobaciones') return null;
  const i = itemsActuales.findIndex((x) => x.id === id);
  return itemsActuales.slice(i + 1).find((x) => x.id !== id) || null;
}

function enlazarRevision(id) {
  const zona = $('#dlg-cuerpo .m-revision');
  if (!zona) return;
  const av = $('#rev-aviso');
  const fin = (r) => {
    dlg.dataset.cambio = '1';
    const sig = siguienteEnCola(id);
    zona.innerHTML = html`<div class="m-aviso m-aviso--${r.correoEnviado || r.yaRevisado ? 'ok' : 'warn'}"><p>${r.mensaje}</p></div>
      <div class="m-acciones" style="margin-top:12px">${sig ? crudo(html`<button type="button" class="m-btn m-btn--oro" id="btn-siguiente">Revisar el siguiente (${sig.numero})</button>`) : crudo('<p class="m-help" style="margin:0">No quedan más registros en la cola.</p>')}</div>`;
    const b = $('#btn-siguiente');
    if (b) { b.addEventListener('click', () => abrirDetalle(sig.id)); b.focus(); }
    $('#dlg-cuerpo').querySelector('p').innerHTML = insignaEstado(r.estado);
  };

  const ap = $('#btn-aprobar');
  if (ap) {
    const idem = nuevaClave();
    ap.addEventListener('click', async () => {
      ocupado(ap, true, 'Aprobando…');
      try {
        fin(await api('/api/admin/aprobar', { metodo: 'POST', idem, cuerpo: { id } }));
      } catch (e) {
        ocupado(ap, false);
        aviso(av, 'error', e.message);
      }
    });
  }

  const abrir = $('#btn-rechazar-abrir');
  const f = $('#form-rechazar');
  const motivo = $('#motivo-rechazo');
  abrir.addEventListener('click', () => {
    f.hidden = !f.hidden;
    abrir.setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) motivo.focus();
  });
  f.querySelectorAll('[data-motivo]').forEach((b) => b.addEventListener('click', () => { motivo.value = b.dataset.motivo; errorCampo(motivo, ''); motivo.focus(); }));
  const idemR = nuevaClave();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (motivo.value.trim().length < 5) { errorCampo(motivo, 'Escribe el motivo (mínimo 5 caracteres).'); motivo.focus(); return; }
    errorCampo(motivo, '');
    const b = f.querySelector('button[type=submit]');
    ocupado(b, true, 'Rechazando…');
    try {
      fin(await api('/api/admin/rechazar', { metodo: 'POST', idem: idemR, cuerpo: { id, motivo: motivo.value.trim() } }));
    } catch (err) {
      ocupado(b, false);
      aviso(av, 'error', err.message);
    }
  });
}

function enlazarAcciones(tipo, id) {
  const cuerpo = $('#dlg-cuerpo');
  const av = $('#dlg-aviso');
  cuerpo.querySelectorAll('[data-accion]').forEach((b) => {
    const idem = nuevaClave();
    b.addEventListener('click', async () => {
      ocupado(b, true);
      try {
        const r = b.dataset.accion === 'regenerar'
          ? await api('/api/admin/regenerar', { metodo: 'POST', idem, cuerpo: { id } })
          : await api('/api/admin/reenviar', { metodo: 'POST', idem, cuerpo: { tipo, id } });
        aviso(av, r.enviado === false ? 'warn' : 'ok', r.mensaje || 'Documentos regenerados.');
        dlg.dataset.cambio = '1';
        if (b.dataset.accion === 'regenerar') setTimeout(() => abrirDetalle(id), 600);
      } catch (e) {
        aviso(av, 'error', e.message);
      } finally {
        ocupado(b, false);
      }
    });
  });
  const f = cuerpo.querySelector('#form-anular');
  if (f) {
    const idem = nuevaClave();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const motivo = f.querySelector('#motivo');
      if (motivo.value.trim().length < 5) { errorCampo(motivo, 'Escribe el motivo (mínimo 5 caracteres).'); motivo.focus(); return; }
      errorCampo(motivo, '');
      const b = f.querySelector('button');
      ocupado(b, true, 'Anulando…');
      try {
        await api('/api/admin/anular', { metodo: 'POST', idem, cuerpo: { tipo, id, motivo: motivo.value.trim() } });
        dlg.dataset.cambio = '1';
        abrirDetalle(id);
      } catch (err) {
        ocupado(b, false);
        aviso(av, 'error', err.message);
      }
    });
  }
}

// ---------- Dashboard territorial ----------

const dash = { datos: null, zona: '', vicaria: '', orden: '', cargando: null };
const MEDIDA_TEXTO = { ACTIVO: 'aprobados', PENDIENTE_APROBACION: 'por aprobar', VIGENTES: 'vigentes' };
const medida = () => $('#dash-medida input:checked').value;
/** Conteo según la medida elegida. «Vigentes» = aprobados + por aprobar + documentos pendientes. */
const contar = (conteo, m = medida()) => (m === 'VIGENTES' ? (conteo.ACTIVO || 0) + (conteo.PENDIENTE_APROBACION || 0) + (conteo.PENDIENTE_DOCUMENTOS || 0) : conteo[m] || 0);
const conAlgo = (conteo) => Object.values(conteo).some((n) => n > 0);
const formato = new Intl.NumberFormat('es-PA');

async function cargarDashboard() {
  if (dash.cargando) return dash.cargando;
  $('#dash-zonas').innerHTML = '<p class="m-help">Cargando…</p>';
  dash.cargando = api('/api/admin/estadisticas')
    .then((r) => {
      // La zona «Sin clasificar» solo aparece si tiene registros (registros anteriores al catálogo).
      r.zonas = r.zonas.filter((z) => z.area || conAlgo(z.conteo));
      dash.datos = r;
      aviso($('#dash-aviso'), 'info', null);
      pintarDashboard();
    })
    .catch((e) => { $('#dash-zonas').innerHTML = ''; aviso($('#dash-aviso'), 'error', e.message); })
    .finally(() => { dash.cargando = null; });
  return dash.cargando;
}

$('#dash-medida').addEventListener('change', pintarDashboard);
$('#dash-ceros').addEventListener('change', pintarDashboard);
$('#dash-recargar').addEventListener('click', () => { cargarDashboard(); cargarResumen(); });

function pintarDashboard() {
  if (!dash.datos) return;
  pintarMigas();
  pintarZonas();
  pintarVicarias();
  pintarParroquias();
}

function pintarMigas() {
  const m = medida();
  const zonas = dash.datos.zonas;
  const z = zonas.find((x) => x.nombre === dash.zona);
  const v = z && z.vicarias.find((x) => x.nombre === dash.vicaria);
  const total = v ? contar(v.conteo) : z ? contar(z.conteo) : zonas.reduce((a, x) => a + contar(x.conteo), 0);
  const ambito = v ? v.nombre : z ? z.nombre : 'la Arquidiócesis';
  const migas = [html`<button type="button" class="m-miga" data-nivel="todo"${!z ? ' aria-current="true"' : ''}>Toda la Arquidiócesis</button>`];
  if (z) migas.push(html`<button type="button" class="m-miga" data-nivel="zona"${!v ? ' aria-current="true"' : ''}>${z.corto}</button>`);
  if (v) migas.push(html`<span class="m-miga" aria-current="true">${v.corto}</span>`);
  $('#dash-migas').innerHTML = html`<div class="m-migas__ruta">${crudo(migas.join('<span aria-hidden="true">›</span>'))}</div>
    <p class="m-dash-total"><strong>${formato.format(total)}</strong> catequistas ${MEDIDA_TEXTO[m]} en ${ambito}</p>`;
}
$('#dash-migas').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-nivel]');
  if (!b) return;
  if (b.dataset.nivel === 'todo') { dash.zona = ''; dash.vicaria = ''; } else dash.vicaria = '';
  pintarDashboard();
});

function pintarZonas() {
  const zonas = dash.datos.zonas;
  const max = Math.max(1, ...zonas.map((z) => contar(z.conteo)));
  $('#dash-zonas').innerHTML = zonas.map((z) => {
    const n = contar(z.conteo);
    const pend = z.conteo.PENDIENTE_APROBACION || 0;
    const on = dash.zona === z.nombre;
    return html`<button type="button" class="m-zona${on ? ' m-zona--on' : ''}" data-zona="${z.nombre}" aria-pressed="${on}" title="${`${z.nombre}: ${n} ${MEDIDA_TEXTO[medida()]}`}">
      <span class="m-zona__nombre">${z.corto}</span>
      <span class="m-zona__area">${z.area || 'Registros sin zona'}</span>
      <strong class="m-zona__n">${formato.format(n)}</strong>
      <span class="m-pista" aria-hidden="true"><span style="width:${(n / max) * 100}%"></span></span>
      <span class="m-zona__pie">${z.vicarias.length} ${z.vicarias.length === 1 ? 'vicaría' : 'vicarías'}${pend && medida() !== 'PENDIENTE_APROBACION' ? ` · ${pend} por aprobar` : ''}</span>
    </button>`;
  }).join('');
}
$('#dash-zonas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-zona]');
  if (!b) return;
  dash.zona = dash.zona === b.dataset.zona ? '' : b.dataset.zona;
  dash.vicaria = '';
  pintarDashboard();
});

function vicariasVisibles() {
  return dash.datos.zonas.filter((z) => !dash.zona || z.nombre === dash.zona).flatMap((z) => z.vicarias.map((v) => ({ ...v, zona: z })));
}

function pintarVicarias() {
  const vs = vicariasVisibles().sort((a, b) => contar(b.conteo) - contar(a.conteo) || a.corto.localeCompare(b.corto, 'es'));
  const max = Math.max(1, ...vs.map((v) => contar(v.conteo)));
  $('#dash-vic-titulo').textContent = dash.zona ? `Vicarías de la zona ${dash.datos.zonas.find((z) => z.nombre === dash.zona).corto}` : 'Por vicaría';
  $('#dash-vicarias').innerHTML = vs.map((v) => {
    const n = contar(v.conteo);
    const on = dash.vicaria === v.nombre;
    return html`<li><button type="button" class="m-barra${on ? ' m-barra--on' : ''}" data-vicaria="${v.nombre}" data-zona="${v.zona.nombre}" aria-pressed="${on}" title="${`${v.nombre}: ${n} ${MEDIDA_TEXTO[medida()]}`}">
      <span class="m-barra__txt"><span>${v.corto}</span>${dash.zona ? '' : crudo(html`<small>${v.zona.corto}</small>`)}</span>
      <span class="m-pista" aria-hidden="true"><span style="width:${(n / max) * 100}%"></span></span>
      <span class="m-barra__n">${formato.format(n)}</span>
    </button></li>`;
  }).join('') || '<li class="m-help">Sin vicarías.</li>';
}
$('#dash-vicarias').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vicaria]');
  if (!b) return;
  const misma = dash.vicaria === b.dataset.vicaria;
  dash.zona = b.dataset.zona;
  dash.vicaria = misma ? '' : b.dataset.vicaria;
  pintarDashboard();
});

function parroquiasVisibles() {
  return vicariasVisibles()
    .filter((v) => !dash.vicaria || v.nombre === dash.vicaria)
    .flatMap((v) => v.parroquias.map((p) => ({ ...p, vicaria: v, zona: v.zona })));
}

function pintarParroquias() {
  const todas = parroquiasVisibles();
  const ps = todas.filter((p) => $('#dash-ceros').checked || conAlgo(p.conteo));
  const o = dash.orden || medida();
  const clave = o === 'VIGENTES' ? (p) => contar(p.conteo, 'VIGENTES') : (p) => p.conteo[o] || 0;
  ps.sort((a, b) => (o === 'nombre' ? a.nombre.localeCompare(b.nombre, 'es') : clave(b) - clave(a) || a.nombre.localeCompare(b.nombre, 'es')));
  $$('.m-orden').forEach((b) => {
    const th = b.closest('th');
    if (b.dataset.orden === o) th.setAttribute('aria-sort', o === 'nombre' ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  });
  const celda = (n) => (n ? formato.format(n) : crudo('<span class="m-cero">0</span>'));
  $('#dash-parroquias').innerHTML = ps.length
    ? ps.map((p) => html`<tr tabindex="0" data-parroquia="${p.nombre}" aria-label="${`Ver catequistas de ${p.nombre}`}">
        <td><span class="m-par">${p.nombre}${p.propuesta ? crudo(' <span class="m-badge" title="Adscripción propuesta, pendiente de confirmación oficial">Propuesta</span>') : ''}${!p.catalogo ? crudo(' <span class="m-badge" title="Escrita por el catequista: no está en el catálogo">Fuera del catálogo</span>') : ''}</span>${dash.vicaria ? '' : crudo(html`<small class="m-par__vic">${p.vicaria.corto}</small>`)}</td>
        <td>${p.coordinador || '—'}</td>
        <td class="m-n">${celda(p.conteo.ACTIVO)}</td>
        <td class="m-n">${celda(p.conteo.PENDIENTE_APROBACION)}</td>
        <td class="m-n">${celda(p.conteo.RECHAZADO)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="m-vacio">Ninguna parroquia de este ámbito tiene catequistas registrados todavía.</td></tr>';
  const sinNadie = todas.filter((p) => !conAlgo(p.conteo)).length;
  $('#dash-par-pie').textContent = `${ps.length} de ${todas.length} parroquias${sinNadie ? ` · ${sinNadie} sin ningún registro` : ''}. Toca una parroquia para ver sus catequistas.`;
}
$$('.m-orden').forEach((b) => b.addEventListener('click', () => { dash.orden = b.dataset.orden; pintarParroquias(); }));

function verParroquia(tr) {
  const p = parroquiasVisibles().find((x) => x.nombre === tr.dataset.parroquia);
  if (!p) return;
  Object.assign(filtroTerr, { zona: p.zona.nombre, vicaria: p.vicaria.nombre, parroquia: p.nombre });
  $('#filtro-estado').value = '';
  $('#q').value = '';
  cambiarVista('catequistas');
}
$('#dash-parroquias').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-parroquia]'); if (tr) verParroquia(tr); });
$('#dash-parroquias').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr[data-parroquia]'); if (tr) { e.preventDefault(); verParroquia(tr); } } });

/** CSV de la tabla de parroquias del ámbito actual (todas, también las que están en cero). */
$('#dash-csv').addEventListener('click', () => {
  if (!dash.datos) return;
  const celda = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = [['zona', 'vicaria', 'parroquia', 'coordinador', 'aprobados', 'por_aprobar', 'documentos_pendientes', 'rechazados', 'anulados']]
    .concat(parroquiasVisibles().map((p) => [p.zona.nombre, p.vicaria.nombre, p.nombre, p.coordinador, p.conteo.ACTIVO, p.conteo.PENDIENTE_APROBACION, p.conteo.PENDIENTE_DOCUMENTOS, p.conteo.RECHAZADO, p.conteo.ANULADO]));
  const blob = new Blob([`﻿${filas.map((f) => f.map(celda).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `catequistas_por_parroquia_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
