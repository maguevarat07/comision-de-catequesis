// Presentación del resultado de verificación (carnet o pase) y registro de entrada.
// La usan /verificar/ y el escáner de /admin/escanear/.

import { api, html, crudo, fmtFecha, ocupado, nuevaClave } from './comun.js';

const TEXTOS = {
  carnet: {
    VALIDO: ['ok', '✓', 'Carnet válido', 'El titular es catequista registrado de la Arquidiócesis de Panamá.'],
    VENCIDO: ['warn', '!', 'Carnet vencido', 'El carnet existe, pero su vigencia terminó.'],
    PENDIENTE: ['warn', '…', 'Registro en proceso', 'El registro existe y sus documentos aún se están generando.'],
    ANULADO: ['error', '✕', 'Carnet anulado', 'Este carnet fue anulado y no es válido.'],
    INEXISTENTE: ['error', '?', 'Carnet no reconocido', 'El código no corresponde a ningún carnet emitido por la Comisión.'],
  },
  pase: {
    VALIDO: ['ok', '✓', 'Pase válido', 'Pase de acceso a la Semana del Catequista.'],
    OTRA_EDICION: ['warn', '!', 'Pase de otra edición', 'Este pase no corresponde a la edición actual.'],
    ANULADO: ['error', '✕', 'Pase anulado', 'Este pase fue anulado. No permitas la entrada.'],
    INEXISTENTE: ['error', '?', 'Pase no reconocido', 'El código no corresponde a ningún pase emitido.'],
  },
};

/** Extrae {c} o {t} de una URL de verificación o del propio token. */
export function leerCodigo(texto) {
  const s = String(texto || '').trim();
  try {
    const u = new URL(s, location.origin);
    const c = u.searchParams.get('c'), t = u.searchParams.get('t');
    if (c || t) return { c, t };
  } catch { /* no es URL */ }
  return /^[\w-]+\.[\w-]+$/.test(s) ? { t: s } : null;
}

export async function verificar({ c, t }) {
  const qs = c ? `c=${encodeURIComponent(c)}` : `t=${encodeURIComponent(t)}`;
  return api(`/api/verificar?${qs}`);
}

/** Pinta el resultado en `cont`. Si hay sesión de personal y es un pase válido, ofrece registrar la entrada. */
export function pintarResultado(cont, r, token) {
  const [tipo, icono, titulo, texto] = (TEXTOS[r.tipo] || TEXTOS.pase)[r.estado] || TEXTOS.pase.INEXISTENTE;
  const d = r.detalle;
  const persona = d ? html`
    <div class="m-persona">
      <img src="${d.fotoUrl}" alt="Foto de ${d.nombre}">
      <div>
        <p style="margin:0;font-weight:800;font-size:18px">${d.nombre}</p>
        <p style="margin:2px 0 0" class="m-help">${d.numero}${d.numeroInscripcion ? ' · ' + d.numeroInscripcion : ''}</p>
        <p style="margin:2px 0 0" class="m-help">${d.parroquia}</p>
        ${d.talla ? crudo(html`<p style="margin:2px 0 0" class="m-help">Talla ${d.talla}${d.restricciones ? ' · ' + d.restricciones : ''}</p>`) : ''}
      </div>
    </div>` : '';
  const puedeEntrar = r.staff && r.tipo === 'pase' && r.estado === 'VALIDO';
  const entrada = puedeEntrar ? html`
    <div id="zona-entrada" style="margin-top:18px">
      ${d && d.checkin_at ? crudo(html`<div class="m-aviso m-aviso--warn"><p><strong>Ya registró su entrada</strong> el ${fmtFecha(d.checkin_at, true)} (${d.checkin_por}).</p></div>`) : crudo('<button type="button" class="m-btn m-btn--oro" id="btn-entrada" style="width:100%">Registrar entrada</button>')}
    </div>` : '';
  const publico = !r.staff && r.publico ? html`<p class="m-help" style="margin-top:10px">${r.publico.numero ? `Catequista ${r.publico.numero}` : ''}${r.publico.vigencia_hasta ? ` · vigente hasta ${fmtFecha(r.publico.vigencia_hasta)}` : ''}${r.publico.edicion ? `Edición ${r.publico.edicion}` : ''}</p>` : '';
  cont.innerHTML = html`
    <div class="m-veredicto m-veredicto--${tipo}">
      <div class="m-veredicto__icono" aria-hidden="true">${icono}</div>
      <h1 class="disp" style="margin:0 0 6px;font-size:clamp(28px,5vw,40px)">${titulo}</h1>
      <p style="margin:0;color:var(--m-muted)">${texto}</p>
      ${crudo(publico)}
      ${crudo(persona)}
    </div>
    ${crudo(entrada)}
    <div id="entrada-aviso" style="margin-top:12px" hidden></div>`;
  cont.querySelectorAll('.m-persona img').forEach((img) => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }));
  const b =cont.querySelector('#btn-entrada');
  if (b) {
    const idem = nuevaClave();
    b.addEventListener('click', async () => {
      ocupado(b, true, 'Registrando…');
      const av = cont.querySelector('#entrada-aviso');
      try {
        const e = await api('/api/verificar/entrada', { metodo: 'POST', cuerpo: { t: token }, idem });
        av.hidden = false;
        av.className = `m-aviso m-aviso--${e.yaHabiaEntrado ? 'warn' : 'ok'}`;
        av.textContent = e.yaHabiaEntrado ? `Ya había entrado el ${fmtFecha(e.checkin_at, true)} (${e.checkin_por}).` : `Entrada registrada a las ${fmtFecha(e.checkin_at, true)}.`;
        b.remove();
        if (navigator.vibrate) navigator.vibrate(e.yaHabiaEntrado ? [80, 60, 80] : 120);
      } catch (err) {
        ocupado(b, false);
        av.hidden = false;
        av.className = 'm-aviso m-aviso--error';
        av.textContent = err.message;
      }
    });
  }
}
