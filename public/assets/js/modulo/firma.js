// Firma táctil a pantalla completa con signature_pad 5.0.4 (vendorizado, global `SignaturePad`).
// Funciona con el dedo, lápiz o ratón; en vertical y en horizontal. Al girar el teléfono
// el trazo se reescala para no perderlo. Exporta un PNG con fondo transparente y recortado.

const TINTA = '#0b1f4d';

function recortarTransparente(lienzo, margen = 12, maxAncho = 1200) {
  const ctx = lienzo.getContext('2d');
  const { width: w, height: h } = lienzo;
  const datos = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (datos[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - margen);
  y0 = Math.max(0, y0 - margen);
  x1 = Math.min(w - 1, x1 + margen);
  y1 = Math.min(h - 1, y1 + margen);
  const aw = x1 - x0 + 1, ah = y1 - y0 + 1;
  const k = Math.min(1, maxAncho / aw);
  const out = document.createElement('canvas');
  out.width = Math.round(aw * k);
  out.height = Math.round(ah * k);
  out.getContext('2d').drawImage(lienzo, x0, y0, aw, ah, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/**
 * Abre el lienzo de firma. Resuelve con el PNG (data URL) al confirmar, o null si se cancela.
 * @param {{nombre?: string}} opciones
 */
export function abrirFirma({ nombre = '' } = {}) {
  if (typeof window.SignaturePad !== 'function') return Promise.reject(new Error('No se cargó el componente de firma.'));
  const anterior = document.activeElement;
  const modal = document.createElement('div');
  modal.className = 'm-firma-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Firma del catequista');
  modal.innerHTML = `
    <div class="m-firma-modal__barra">
      <strong>Firma dentro del recuadro</strong>
      <span style="font-size:13px;opacity:.85">Gira el teléfono si necesitas más espacio</span>
    </div>
    <div class="m-firma-modal__lienzo">
      <canvas aria-label="Lienzo de firma. Dibuja tu firma con el dedo o el ratón."></canvas>
      <div class="m-firma-modal__linea" aria-hidden="true"><span></span></div>
    </div>
    <div class="m-firma-modal__pie">
      <button type="button" class="m-btn m-btn--texto" data-accion="cancelar">Cancelar</button>
      <button type="button" class="m-btn m-btn--borde" data-accion="limpiar">Limpiar</button>
      <button type="button" class="m-btn m-btn--primario" data-accion="confirmar" disabled>Confirmar firma</button>
    </div>`;
  modal.querySelector('.m-firma-modal__linea span').textContent = nombre ? `Firma de ${nombre}` : 'Firma';
  document.body.append(modal);
  const overflowPrevio = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const lienzo = modal.querySelector('canvas');
  const btnConfirmar = modal.querySelector('[data-accion=confirmar]');
  const pad = new window.SignaturePad(lienzo, { penColor: TINTA, minWidth: 1, maxWidth: 3.2, velocityFilterWeight: 0.6, backgroundColor: 'rgba(0,0,0,0)' });
  pad.addEventListener('endStroke', () => { btnConfirmar.disabled = pad.isEmpty(); });

  let tamaño = { w: 0, h: 0 };
  function ajustar() {
    const r = lienzo.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const datos = pad.toData();
    const prev = tamaño;
    lienzo.width = Math.round(r.width * dpr);
    lienzo.height = Math.round(r.height * dpr);
    lienzo.getContext('2d').scale(dpr, dpr);
    pad.clear();
    if (datos.length && prev.w && prev.h) {
      const kx = r.width / prev.w, ky = r.height / prev.h, k = Math.min(kx, ky);
      pad.fromData(datos.map((g) => ({ ...g, points: g.points.map((p) => ({ ...p, x: p.x * k, y: p.y * k })) })));
    }
    tamaño = { w: r.width, h: r.height };
    btnConfirmar.disabled = pad.isEmpty();
  }
  const ro = new ResizeObserver(() => ajustar());
  ro.observe(lienzo);

  return new Promise((resolve) => {
    function cerrar(valor) {
      ro.disconnect();
      pad.off();
      document.removeEventListener('keydown', teclado);
      document.body.style.overflow = overflowPrevio;
      modal.remove();
      if (anterior && anterior.focus) anterior.focus();
      resolve(valor);
    }
    function teclado(e) {
      if (e.key === 'Escape') cerrar(null);
      if (e.key === 'Tab') {
        const f = [...modal.querySelectorAll('button:not([disabled])')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener('keydown', teclado);
    modal.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accion]')?.dataset.accion;
      if (a === 'cancelar') cerrar(null);
      if (a === 'limpiar') { pad.clear(); btnConfirmar.disabled = true; }
      if (a === 'confirmar' && !pad.isEmpty()) cerrar(recortarTransparente(lienzo));
    });
    modal.querySelector('[data-accion=limpiar]').focus();
  });
}
