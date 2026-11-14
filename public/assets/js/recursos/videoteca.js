// Videoteca de Recursos: destacado, filas por edición con desplazamiento horizontal, búsqueda,
// «Vistos recientemente» (solo en este navegador) y reproductor en una ventana sobre la página.
// El reproductor de YouTube (dominio youtube-nocookie.com) se carga solo al elegir un video.

import { COLECCIONES, CANAL } from './videos.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CLAVE_VISTOS = 'rc-vistos-v1';

// ---------- Datos ----------

const fmtFecha = (iso, corta = false) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-PA', corta ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long', year: 'numeric' });
const minutos = (d) => { const p = d.split(':').map(Number); return p.length === 3 ? p[0] * 60 + p[1] : p[0]; };
const miniatura = (id, tam = 'mq') => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/${tam === 'max' ? 'maxresdefault' : tam === 'sd' ? 'sddefault' : 'mqdefault'}.jpg`;

/** Todos los videos con su colección, para buscar y para el reproductor. */
const VIDEOS = new Map();
for (const c of COLECCIONES) {
  for (const v of c.videos) {
    VIDEOS.set(v.id, {
      ...v, coleccion: c, titulo: `Día ${v.dia}`,
      buscar: sinAcentos(`dia ${v.dia} día ${v.dia} ${c.titulo} ${c.edicion} ${fmtFecha(v.fecha)} semana catequista catequesis`),
    });
  }
}

function leerVistos() {
  try { return JSON.parse(localStorage.getItem(CLAVE_VISTOS) || '[]').filter((id) => VIDEOS.has(id)); } catch { return []; }
}
function marcarVisto(id) {
  try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify([id, ...leerVistos().filter((x) => x !== id)].slice(0, 10))); } catch { /* sin almacenamiento */ }
}

// ---------- Destacado ----------

function pintarDestacado() {
  const c = COLECCIONES[0];
  const v = VIDEOS.get(c.videos[0].id);
  const total = c.videos.reduce((a, x) => a + minutos(x.duracion), 0);
  $('#rc-destacado').innerHTML = `
    <div class="rc-destacado__fondo" aria-hidden="true"><img src="${miniatura(v.id, 'max')}" alt="" fetchpriority="high"></div>
    <div class="rc-destacado__texto">
      <p class="rc-etiqueta">Edición más reciente</p>
      <h2 class="disp">${esc(c.titulo)}</h2>
      <p class="rc-meta"><span>${c.videos.length} jornadas</span><span>${Math.round(total / 60 * 10) / 10} horas</span><span>${esc(fmtFecha(c.videos[0].fecha, true))} – ${esc(fmtFecha(c.videos.at(-1).fecha))}</span></p>
      <p class="rc-destacado__desc">${esc(c.descripcion)}</p>
      <div class="rc-destacado__acciones">
        <button type="button" class="rc-btn rc-btn--claro" data-ver="${v.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>Ver el día 1</button>
        <a class="rc-btn rc-btn--sutil" href="#fila-${c.id}">Todas las jornadas</a>
      </div>
    </div>`;
}

// ---------- Filas ----------

function tarjeta(v, { mostrarEdicion = false } = {}) {
  return `<li class="rc-tarjeta" data-buscar="${esc(v.buscar)}">
    <button type="button" data-ver="${v.id}" aria-label="${esc(`Ver ${v.titulo} de la ${v.coleccion.titulo}, ${fmtFecha(v.fecha)}, ${minutos(v.duracion)} minutos`)}">
      <span class="rc-tarjeta__img">
        <img src="${miniatura(v.id)}" srcset="${miniatura(v.id)} 320w, ${miniatura(v.id, 'max')} 1280w" sizes="(max-width: 640px) 70vw, 300px" alt="" loading="lazy" decoding="async">
        <span class="rc-tarjeta__dia" aria-hidden="true">Día <strong>${v.dia}</strong></span>
        <span class="rc-tarjeta__dur" aria-hidden="true">${esc(v.duracion)}</span>
        <span class="rc-tarjeta__play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg></span>
      </span>
      <span class="rc-tarjeta__pie" aria-hidden="true">
        <strong>${esc(v.titulo)}${mostrarEdicion ? ` · ${v.coleccion.edicion}` : ''}</strong>
        <span>${esc(fmtFecha(v.fecha))} · ${minutos(v.duracion)} min</span>
      </span>
    </button>
  </li>`;
}

function fila(id, titulo, videos, extra = '') {
  return `<section class="rc-fila" id="fila-${id}" aria-labelledby="t-${id}">
    <div class="rc-fila__cab">
      <h2 id="t-${id}">${esc(titulo)}</h2>${extra}
    </div>
    <div class="rc-fila__carril">
      <button type="button" class="rc-flecha rc-flecha--izq" data-mover="-1" aria-label="${esc(`Anteriores de ${titulo}`)}" hidden>‹</button>
      <ul class="rc-fila__lista">${videos.join('')}</ul>
      <button type="button" class="rc-flecha rc-flecha--der" data-mover="1" aria-label="${esc(`Siguientes de ${titulo}`)}">›</button>
    </div>
  </section>`;
}

function pintarFilas() {
  const vistos = leerVistos().map((id) => VIDEOS.get(id));
  const html = [];
  if (vistos.length) html.push(fila('vistos', 'Vistos recientemente', vistos.map((v) => tarjeta(v, { mostrarEdicion: true }))));
  for (const c of COLECCIONES) {
    const enlace = `<a class="rc-fila__mas" href="https://www.youtube.com/playlist?list=${encodeURIComponent(c.lista)}" target="_blank" rel="noopener noreferrer">Lista en YouTube ↗</a>`;
    html.push(fila(c.id, c.titulo, c.videos.map((x) => tarjeta(VIDEOS.get(x.id))), enlace));
  }
  $('#rc-filas').innerHTML = html.join('');
  document.querySelectorAll('.rc-fila__lista').forEach((ul) => {
    ul.addEventListener('scroll', () => actualizarFlechas(ul), { passive: true });
    actualizarFlechas(ul);
  });
  filtrar();
}

function actualizarFlechas(ul) {
  const carril = ul.parentElement;
  const max = ul.scrollWidth - ul.clientWidth;
  carril.querySelector('.rc-flecha--izq').hidden = ul.scrollLeft <= 4;
  carril.querySelector('.rc-flecha--der').hidden = ul.scrollLeft >= max - 4;
}
window.addEventListener('resize', () => document.querySelectorAll('.rc-fila__lista').forEach(actualizarFlechas));

// ---------- Búsqueda ----------

function filtrar() {
  const palabras = sinAcentos($('#rc-q').value).split(/\s+/).filter(Boolean);
  let alguno = false;
  document.querySelectorAll('.rc-fila').forEach((f) => {
    let visibles = 0;
    f.querySelectorAll('.rc-tarjeta').forEach((t) => {
      const ok = palabras.every((p) => t.dataset.buscar.includes(p));
      t.hidden = !ok;
      if (ok) visibles++;
    });
    f.hidden = !visibles;
    if (visibles) alguno = true;
    actualizarFlechas(f.querySelector('.rc-fila__lista'));
  });
  $('#rc-destacado').hidden = palabras.length > 0;
  $('#rc-vacio').hidden = alguno;
}
$('#rc-q').addEventListener('input', filtrar);

// ---------- Reproductor ----------

const dlg = $('#rc-reproductor');

function abrir(id, { historial = true } = {}) {
  const v = VIDEOS.get(id);
  if (!v) return;
  const c = v.coleccion;
  $('#rc-video').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1" title="${esc(`${c.titulo} · ${v.titulo}`)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  $('#rc-rep-coleccion').textContent = c.titulo;
  $('#rc-rep-titulo').textContent = v.titulo;
  $('#rc-rep-meta').innerHTML = `<span>${esc(fmtFecha(v.fecha))}</span><span>${minutos(v.duracion)} min</span><span>Transmisión en directo</span>`;
  $('#rc-youtube').href = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&list=${encodeURIComponent(c.lista)}`;
  const i = c.videos.findIndex((x) => x.id === id);
  const sig = c.videos[i + 1];
  const bSig = $('#rc-siguiente');
  bSig.hidden = !sig;
  if (sig) { bSig.dataset.ver = sig.id; bSig.innerHTML = `Siguiente: día ${sig.dia} <span aria-hidden="true">›</span>`; }
  $('#rc-episodios').innerHTML = c.videos.map((x) => {
    const actual = x.id === id;
    return `<li><button type="button" data-ver="${x.id}"${actual ? ' aria-current="true"' : ''}>
      <span class="rc-ep__img"><img src="${miniatura(x.id)}" alt="" loading="lazy">${actual ? '<span class="rc-ep__ahora">Viendo</span>' : ''}</span>
      <span class="rc-ep__txt"><strong>Día ${x.dia}</strong><span>${esc(fmtFecha(x.fecha))} · ${minutos(x.duracion)} min</span></span>
    </button></li>`;
  }).join('');
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('.rc-reproductor__marco').scrollTop = 0;
  marcarVisto(id);
  if (historial) history.replaceState(null, '', `#ver=${id}`);
  document.title = `${c.titulo} · ${v.titulo} | Recursos`;
}

function cerrar() {
  $('#rc-video').innerHTML = ''; // detiene el video
  document.title = 'Recursos | Comisión de Catequesis';
  if (location.hash.startsWith('#ver=')) history.replaceState(null, '', location.pathname + location.search);
  pintarFilas(); // actualiza «Vistos recientemente»
}

dlg.addEventListener('close', cerrar);
$('#rc-cerrar').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

// Un solo manejador para todos los botones «ver» y las flechas.
document.addEventListener('click', (e) => {
  const ver = e.target.closest('[data-ver]');
  if (ver) { e.preventDefault(); abrir(ver.dataset.ver); return; }
  const mover = e.target.closest('[data-mover]');
  if (mover) {
    const ul = mover.parentElement.querySelector('.rc-fila__lista');
    ul.scrollBy({ left: Number(mover.dataset.mover) * ul.clientWidth * 0.85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
});

// ---------- Inicio ----------

$('#rc-canal').href = CANAL;
pintarDestacado();
pintarFilas();
// Enlace directo a un video: /recursos/#ver=ID (también si cambia el hash sin recargar la página).
function abrirDesdeHash() {
  const enlace = /^#ver=([\w-]{6,20})$/.exec(location.hash);
  const yaAbierto = dlg.open && ($('#rc-video iframe')?.src || '').includes(enlace?.[1]);
  if (enlace && VIDEOS.has(enlace[1]) && !yaAbierto) abrir(enlace[1], { historial: false });
}
window.addEventListener('hashchange', abrirDesdeHash);
abrirDesdeHash();
