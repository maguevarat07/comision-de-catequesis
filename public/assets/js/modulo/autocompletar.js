// Autocompletar accesible (patrón combobox de WAI-ARIA): se escribe, aparecen sugerencias,
// se elige con el ratón, el dedo o el teclado (↑ ↓ Enter Esc). Búsqueda sin acentos ni mayúsculas
// y con varias palabras en cualquier orden.

import { escapar } from './comun.js';

export const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Resalta en `texto` las palabras buscadas (sin distinguir acentos). Devuelve HTML escapado. */
function resaltar(texto, palabras) {
  const base = sinAcentos(texto);
  const marcas = new Array(texto.length).fill(false);
  for (const p of palabras) {
    let i = base.indexOf(p);
    while (i >= 0 && p) { for (let k = i; k < i + p.length; k++) marcas[k] = true; i = base.indexOf(p, i + p.length); }
  }
  let out = '';
  let abierto = false;
  for (let i = 0; i < texto.length; i++) {
    if (marcas[i] && !abierto) { out += '<mark>'; abierto = true; }
    if (!marcas[i] && abierto) { out += '</mark>'; abierto = false; }
    out += escapar(texto[i]);
  }
  return out + (abierto ? '</mark>' : '');
}

/**
 * @param {object} o
 * @param {HTMLInputElement} o.input   campo de texto (recibe role=combobox)
 * @param {HTMLUListElement} o.lista   lista de sugerencias (recibe role=listbox)
 * @param {() => Array<{id, titulo, detalle, buscar}>} o.opciones  todas las opciones
 * @param {{id, titulo, detalle}} [o.fija]  opción que siempre aparece al final (p. ej. «No está en la lista»)
 * @param {(opcion|null) => void} o.alElegir  se llama al elegir (o con null si se borra la elección)
 * @param {number} [o.maximo=8]
 */
export function crearAutocompletar({ input, lista, opciones, fija, alElegir, maximo = 8 }) {
  let visibles = [];
  let activa = -1;
  let elegida = null;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', lista.id);
  input.setAttribute('autocomplete', 'off');
  lista.setAttribute('role', 'listbox');

  function filtrar(texto) {
    const palabras = sinAcentos(texto).split(/\s+/).filter(Boolean);
    if (!palabras.length) return { res: [], palabras };
    const res = opciones()
      .map((o) => ({ o, b: sinAcentos(o.buscar || o.titulo), t: sinAcentos(o.titulo) }))
      .filter(({ b }) => palabras.every((p) => b.includes(p)))
      // Primero las que empiezan por lo escrito; luego las que lo contienen en el nombre.
      .sort((x, y) => Number(!x.t.startsWith(palabras[0])) - Number(!y.t.startsWith(palabras[0])) || Number(!x.t.includes(palabras[0])) - Number(!y.t.includes(palabras[0])))
      .slice(0, maximo)
      .map(({ o }) => o);
    return { res, palabras };
  }

  function abrir(texto) {
    const { res, palabras } = filtrar(texto);
    visibles = fija && texto.trim() ? [...res, fija] : res;
    activa = -1;
    lista.innerHTML = visibles.map((o, i) => `<li role="option" id="${lista.id}-${i}" data-i="${i}" aria-selected="false" class="${o === fija ? 'm-combo__fija' : ''}">
        <span class="m-combo__titulo">${o === fija ? escapar(o.titulo) : resaltar(o.titulo, palabras)}</span>${o.detalle ? `<span class="m-combo__detalle">${escapar(o.detalle)}</span>` : ''}</li>`).join('')
      + (texto.trim() && !res.length ? '<li class="m-combo__vacio" aria-hidden="true">Ninguna parroquia coincide con lo escrito.</li>' : '');
    const hay = visibles.length > 0;
    lista.hidden = !hay;
    input.setAttribute('aria-expanded', String(hay));
    input.removeAttribute('aria-activedescendant');
  }

  function cerrar() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activa = -1;
  }

  function mover(i) {
    if (!visibles.length) return;
    activa = (i + visibles.length) % visibles.length;
    lista.querySelectorAll('[role=option]').forEach((li, k) => li.setAttribute('aria-selected', String(k === activa)));
    const li = lista.querySelector(`#${lista.id}-${activa}`);
    input.setAttribute('aria-activedescendant', li.id);
    li.scrollIntoView({ block: 'nearest' });
  }

  function elegir(o) {
    elegida = o;
    input.value = o.titulo;
    cerrar();
    alElegir(o);
  }

  input.addEventListener('input', () => {
    if (elegida && input.value !== elegida.titulo) { elegida = null; alElegir(null); }
    abrir(input.value);
  });
  input.addEventListener('focus', () => { if (input.value && !elegida) abrir(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) abrir(input.value); mover(activa + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); mover(activa - 1); } else if (e.key === 'Enter' && !lista.hidden) {
      e.preventDefault();
      e.stopPropagation();
      const o = visibles[activa >= 0 ? activa : 0];
      if (o) elegir(o);
    } else if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); cerrar(); }
  });
  input.addEventListener('blur', () => setTimeout(cerrar, 150));
  // mousedown evita que el campo pierda el foco antes de elegir.
  lista.addEventListener('mousedown', (e) => e.preventDefault());
  lista.addEventListener('click', (e) => {
    const li = e.target.closest('[role=option]');
    if (li) elegir(visibles[Number(li.dataset.i)]);
  });

  return {
    /** Fija la elección sin abrir la lista (borrador restaurado). */
    fijar(o) { elegida = o; input.value = o ? o.titulo : ''; },
    get elegida() { return elegida; },
  };
}
