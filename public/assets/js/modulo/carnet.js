// Carnet digital (HTML/CSS) en proporción CR80 horizontal y QR en SVG.
// Usa qrcode-generator 1.4.4 (vendorizado, global `qrcode`).

import { escapar, fmtFecha, iniciales } from './comun.js';

/** Devuelve un <svg> escalable con el QR del texto indicado. */
export function qrSvg(texto, titulo = 'Código QR') {
  if (typeof window.qrcode !== 'function') return '';
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, title: titulo });
}

/**
 * @param {object} c datos del catequista: nombres, apellidos, numero, parroquia, vicaria_zona,
 *   vigencia_hasta, estado, fotoUrl, firmaUrl, verificacionUrl
 */
export function carnetHtml(c) {
  const nombre = `${c.nombres || ''} ${c.apellidos || ''}`.trim();
  const anulado = String(c.estado).toUpperCase() === 'ANULADO';
  const foto = c.fotoUrl
    ? `<img src="${escapar(c.fotoUrl)}" alt="Foto de ${escapar(nombre)}">`
    : `<div class="carnet__sinfoto" aria-hidden="true">${escapar(iniciales(c.nombres, c.apellidos))}</div>`;
  const firma = c.firmaUrl ? `<img src="${escapar(c.firmaUrl)}" alt="Firma de ${escapar(nombre)}">` : '';
  const zona = String(c.vicaria_zona || '').replace(/^Vicaría\s+/i, '');
  return `
  <div class="carnet-par">
    <article class="carnet${anulado ? ' carnet--anulado' : ''}" aria-label="Carnet de catequista, frente">
      <div class="carnet__frente">
        <div class="carnet__cabecera">
          <img src="/assets/images/catequistas-un-solo-corazon.png" alt="">
          <div><small>Catequistas con un solo corazón</small><b>Comisión Arquidiocesana de Catequesis</b></div>
        </div>
        <div class="carnet__foto">${foto}</div>
        <div class="carnet__datos">
          <p class="carnet__nombre">${escapar(nombre)}</p>
          <span class="carnet__num">${escapar(c.numero || '')}</span>
          <p class="carnet__linea"><b>Parroquia</b> ${escapar(c.parroquia || '')}</p>
          <p class="carnet__linea"><b>Vicaría</b> ${escapar(zona)}</p>
        </div>
        <div class="carnet__pie"><span>CATEQUISTA</span><span>Vigente hasta ${escapar(fmtFecha(c.vigencia_hasta))}</span></div>
      </div>
    </article>
    <article class="carnet${anulado ? ' carnet--anulado' : ''}" aria-label="Carnet de catequista, reverso">
      <div class="carnet__reverso">
        <div class="carnet__qr">${c.verificacionUrl ? qrSvg(c.verificacionUrl, 'QR de verificación del carnet') : ''}</div>
        <div class="carnet__rev-texto">
          <p><b>Arquidiócesis de Panamá</b><br>Este carnet acredita a su titular como catequista registrado. Escanea el código para verificar su vigencia.</p>
          <div>
            <div class="carnet__firma">${firma}</div>
            <p class="carnet__firma-txt">Firma del catequista</p>
          </div>
          <p>catequesispanama15@gmail.com · +507 6700-4543</p>
        </div>
      </div>
    </article>
  </div>`;
}
