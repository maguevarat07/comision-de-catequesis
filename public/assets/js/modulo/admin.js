import { api, nuevaClave, cargarConfig, marcarModo, $, $$, html, crudo, aviso, ocupado, errorCampo, fmtFecha, fmtMonto, insignaEstado, formatearTelefono } from './comun.js';
import { sesionStaff, pedirAcceso, salirStaff } from './staff.js';

let tabla = 'catequistas';
let busquedaTimer = null;
let peticion = null;

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
  cargarLista();
})();

$('#btn-salir').addEventListener('click', async () => { await salirStaff(); location.reload(); });

// ---------- Resumen ----------

async function cargarResumen() {
  try {
    const r = await api('/api/admin/resumen');
    const k = [
      ['Registrados', r.registrados], ['Activos', r.activos], [`Inscritos Semana ${r.edicion}`, r.inscritosSemana],
      ['Entradas registradas', r.entradas], ['Recaudado', fmtMonto(r.recaudado, r.moneda)],
    ];
    $('#kpis').innerHTML = k.map(([t, v]) => html`<div class="m-kpi"><span>${t}</span><strong>${v}</strong></div>`).join('');
    const extras = [];
    if (r.pendientes) extras.push(`${r.pendientes} con documentos pendientes`);
    if (r.anulados) extras.push(`${r.anulados} anulados`);
    if (r.correosPendientes) extras.push(`${r.correosPendientes} correos en cola`);
    $('#cuota').textContent = `Cuota de correo restante hoy: ${r.cuotaCorreo}${extras.length ? ' · ' + extras.join(' · ') : ''}`;
  } catch (e) {
    aviso($('#estado-global'), 'error', e.message);
  }
}

// ---------- Pestañas y lista ----------

const COLUMNAS = {
  catequistas: [['Número', (x) => crudo(html`<span class="m-num">${x.numero}</span>`)], ['Nombre', (x) => x.nombre], ['Cédula', (x) => x.cedula], ['Parroquia', (x) => x.parroquia], ['Estado', (x) => crudo(insignaEstado(x.estado))], ['Registro', (x) => fmtFecha(x.fecha_registro)]],
  semana: [['Inscripción', (x) => crudo(html`<span class="m-num">${x.numero}</span>`)], ['Catequista', (x) => x.numero_catequista], ['Nombre', (x) => x.nombre], ['Parroquia', (x) => x.parroquia], ['Talla', (x) => x.talla || '—'], ['Estado', (x) => crudo(insignaEstado(x.estado))], ['Entrada', (x) => (x.checkin_at ? fmtFecha(x.checkin_at, true) : '—')]],
};

$$('.m-tab').forEach((t) => t.addEventListener('click', () => cambiarTab(t)));
$('.m-tabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = $$('.m-tab');
  const i = tabs.indexOf(document.activeElement);
  const sig = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  sig.focus();
  cambiarTab(sig);
});
function cambiarTab(t) {
  $$('.m-tab').forEach((x) => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
  $('#panel-lista').setAttribute('aria-labelledby', t.id);
  tabla = t.dataset.tabla;
  $('#filtro-estado').hidden = tabla !== 'catequistas';
  $('#exp-actual').href = `/api/admin/exportar?tabla=${tabla}`;
  $('#tabla-caption').textContent = tabla === 'catequistas' ? 'Catequistas registrados' : 'Inscritos en la Semana del Catequista';
  cargarLista();
}

$('#form-buscar').addEventListener('submit', (e) => { e.preventDefault(); cargarLista(); });
$('#q').addEventListener('input', () => { clearTimeout(busquedaTimer); busquedaTimer = setTimeout(cargarLista, 250); });
$('#filtro-estado').addEventListener('change', cargarLista);

async function cargarLista() {
  peticion?.abort();
  peticion = new AbortController();
  const q = encodeURIComponent($('#q').value.trim());
  const estado = tabla === 'catequistas' ? `&estado=${encodeURIComponent($('#filtro-estado').value)}` : '';
  const cols = COLUMNAS[tabla];
  $('#thead').innerHTML = `<tr>${cols.map(([t]) => html`<th scope="col">${t}</th>`).join('')}</tr>`;
  try {
    const r = await api(`/api/admin/${tabla}?q=${q}${estado}`, { señal: peticion.signal });
    $('#tbody').innerHTML = r.items.length
      ? r.items.map((x) => html`<tr tabindex="0" data-id="${x.id}" aria-label="Abrir ${x.numero}">${crudo(cols.map(([, f]) => html`<td>${f(x)}</td>`).join(''))}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="m-vacio">No hay resultados.</td></tr>`;
    $('#conteo').textContent = `${r.items.length} ${r.items.length === 1 ? 'resultado' : 'resultados'}`;
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('#tbody').innerHTML = `<tr><td colspan="${cols.length}" class="m-vacio"></td></tr>`;
    $('#tbody td').textContent = e.message;
  }
}

$('#tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrirDetalle(tr.dataset.id); });
$('#tbody').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr[data-id]'); if (tr) { e.preventDefault(); abrirDetalle(tr.dataset.id); } } });

// ---------- Detalle ----------

const dlg = $('#dialogo');
$('#dlg-cerrar').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { if (dlg.dataset.cambio) { delete dlg.dataset.cambio; cargarResumen(); cargarLista(); } });

const tablaFilas = (filas) => `<dl class="m-datos">${filas.map(([k, v]) => html`<dt>${k}</dt><dd>${v === '' || v == null ? '—' : v}</dd>`).join('')}</dl>`;
const medio = (url, texto) => (url ? html`<figure><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${texto}" loading="lazy"></a>${texto}</figure>` : '');

async function abrirDetalle(id) {
  const tipo = tabla === 'catequistas' ? 'catequista' : 'semana';
  $('#dlg-titulo').textContent = 'Cargando…';
  $('#dlg-cuerpo').innerHTML = '<p class="m-help">Cargando…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const r = await api(`/api/admin/${tabla}/${encodeURIComponent(id)}`);
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

function pintarCatequista(r) {
  const c = r.item;
  $('#dlg-titulo').textContent = `${c.numero_catequista} · ${c.nombres} ${c.apellidos}`;
  const activo = c.estado === 'ACTIVO';
  $('#dlg-cuerpo').innerHTML = html`
    <p style="margin:0 0 6px">${crudo(insignaEstado(c.estado))}</p>
    <div class="m-medios">${crudo(medio(r.archivos.foto, 'Foto'))}${crudo(medio(r.archivos.firma, 'Firma'))}${crudo(medio(r.archivos.comprobante, 'Comprobante Yappy'))}</div>
    ${crudo(tablaFilas([
      ['Cédula', c.cedula], ['Nacimiento', fmtFecha(c.fecha_nacimiento)], ['Sexo', c.sexo], ['Celular', formatearTelefono(c.telefono)], ['Correo', c.correo], ['Dirección', c.direccion],
      ['Parroquia', c.parroquia], ['Vicaría', c.vicaria_zona], ['Años de servicio', c.anios_servicio], ['Nivel', c.nivel_que_imparte], ['CENAFCA', c.formacion_cenafca], ['Coordinador(a)', c.coordinador_parroquial],
      ['Ref. Yappy', c.yappy_referencia], ['Registro', fmtFecha(c.fecha_registro, true)], ['Vigencia', fmtFecha(c.vigencia_hasta)], ['Correo enviado', c.correo_enviado_at ? fmtFecha(c.correo_enviado_at, true) : 'No'],
      ['Consentimientos', `${fmtFecha(c.consentimiento_datos, true)}`], ['Notas', c.notas_admin],
    ]))}
    <div class="m-acciones" style="margin-top:18px">
      ${r.archivos.carnet ? crudo(html`<a class="m-btn m-btn--borde m-btn--sm" href="${r.archivos.carnet}" download>Carnet PDF</a>`) : ''}
      ${r.archivos.pdf ? crudo(html`<a class="m-btn m-btn--borde m-btn--sm" href="${r.archivos.pdf}" download>Ficha PDF</a>`) : ''}
      <a class="m-btn m-btn--texto m-btn--sm" href="${r.verificacionUrl}" target="_blank" rel="noopener">Ver verificación</a>
      ${c.estado !== 'ANULADO' ? crudo('<button type="button" class="m-btn m-btn--primario m-btn--sm" data-accion="regenerar">Regenerar documentos</button>') : ''}
      ${activo ? crudo('<button type="button" class="m-btn m-btn--primario m-btn--sm" data-accion="reenviar">Reenviar correo</button>') : ''}
    </div>
    <div id="dlg-aviso" hidden style="margin-top:12px"></div>
    ${crudo(r.semana.length ? html`<h3 style="margin-top:22px">Semana del Catequista</h3><ul style="margin:0;padding-left:18px">${crudo(r.semana.map((s) => html`<li>${s.numero} · ${s.edicion} · ${s.estado}${s.checkin_at ? ' · entró ' + fmtFecha(s.checkin_at, true) : ''}</li>`).join(''))}</ul>` : '')}
    ${crudo(seccionPagos(r.pagos))}
    ${crudo(seccionCorreos(r.correos))}
    ${c.estado !== 'ANULADO' ? crudo(bloqueAnular('catequista')) : ''}`;
  enlazarAcciones('catequista', c.id);
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
