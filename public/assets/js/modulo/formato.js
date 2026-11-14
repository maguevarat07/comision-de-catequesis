// Controles de formato en vivo para cédula, celular y correo: corrigen lo que se escribe
// (mayúsculas, guiones, dígitos), avisan al salir del campo y marcan el campo como válido.
// Las mismas reglas se vuelven a comprobar en el servidor.

import { errorCampo, cedulaValida, normalizarCedula, normalizarTelefono, telefonoValido, formatearTelefono, correoValido, escapar } from './comun.js';

/** Marca el campo como correcto (borde verde) sin anunciarlo; vacío o con error, lo desmarca. */
function marcar(input, valido) {
  input.classList.toggle('m-valido', !!valido);
  if (valido) errorCampo(input, '');
}

/** Valida al salir del campo (si tiene algo escrito) y, después del primer aviso, mientras se corrige. */
function enVivo(input, validar) {
  let avisado = false;
  const comprobar = (forzar) => {
    const vacio = !input.value.trim();
    const msg = vacio ? '' : validar(input.value);
    if (msg && (avisado || forzar)) { errorCampo(input, msg); avisado = true; }
    if (!msg) { if (avisado) errorCampo(input, ''); }
    marcar(input, !vacio && !msg);
  };
  input.addEventListener('blur', () => comprobar(true));
  input.addEventListener('input', () => comprobar(false));
}

// ---------- Cédula ----------

const RE_CEDULA_PARCIAL = /[^0-9A-Z-]/g;
export function mensajeCedula(v) {
  const c = normalizarCedula(v);
  if (cedulaValida(c)) return '';
  if (!/-/.test(c)) return 'Escribe la cédula con guiones, por ejemplo 8-123-4567.';
  return 'Formato no válido. Ejemplos: 8-123-4567, PE-12-345, E-8-12345, N-12-345 o 8AV-123-456.';
}

export function controlCedula(input) {
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const antes = input.value;
    // Mayúsculas, espacios o puntos como guion, sin guiones repetidos ni otros caracteres.
    const limpio = antes.toUpperCase().replace(/[\s._–—]+/g, '-').replace(RE_CEDULA_PARCIAL, '').replace(/-{2,}/g, '-').replace(/^-/, '');
    if (limpio !== antes) {
      input.value = limpio;
      const p = Math.max(0, (pos ?? limpio.length) - (antes.length - limpio.length));
      input.setSelectionRange(p, p);
    }
  });
  enVivo(input, mensajeCedula);
}

// ---------- Celular ----------

export function mensajeCelular(v) {
  const d = normalizarTelefono(v);
  if (telefonoValido(d)) return '';
  if (d.length && d[0] !== '6') return 'El celular debe empezar por 6 (por ejemplo 6000-0000).';
  return 'El celular debe tener 8 dígitos, por ejemplo 6000-0000.';
}

export function controlCelular(input) {
  input.setAttribute('maxlength', '13');
  input.addEventListener('input', (e) => {
    // Solo dígitos; se acepta +507 al pegar. Se formatea 6000-0000 mientras se escribe.
    let d = String(input.value).replace(/\D/g, '');
    if (d.length > 8 && d.startsWith('507')) d = d.slice(3);
    d = d.slice(0, 8);
    const borrando = e.inputType && e.inputType.startsWith('delete');
    const texto = d.length > 4 || (d.length === 4 && !borrando) ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
    if (texto !== input.value) input.value = texto;
  });
  enVivo(input, mensajeCelular);
  input.addEventListener('blur', () => { if (telefonoValido(input.value)) input.value = formatearTelefono(input.value); });
}

// ---------- Correo ----------

const DOMINIOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'hotmail.es', 'yahoo.es', 'outlook.es', 'msn.com', 'cableonda.net', 'me.com'];

/** Distancia de edición (Levenshtein) entre dos textos cortos. */
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Sugerencia para errores típicos de dominio (gmial.com, hotmail.con, gmail.co…). '' si no hay. */
export function sugerirCorreo(v) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(v || '').trim().toLowerCase());
  if (!m) return '';
  const [, usuario, dominio] = m;
  if (DOMINIOS.includes(dominio)) return '';
  let mejor = '';
  let dist = 3;
  for (const d of DOMINIOS) {
    const x = distancia(dominio, d);
    if (x < dist) { dist = x; mejor = d; }
  }
  return mejor ? `${usuario}@${mejor}` : '';
}

export function mensajeCorreo(v) {
  const s = String(v || '').trim();
  if (correoValido(s) && !/\.\./.test(s) && !/[^\w.@+-]/.test(s)) return '';
  if (!s.includes('@')) return 'Falta la @. Ejemplo: nombre@gmail.com';
  return 'Correo no válido. Ejemplo: nombre@gmail.com';
}

/**
 * Correo: sin espacios y en minúsculas; al salir del campo ofrece corregir dominios mal escritos.
 * `confirmacion` (opcional) es el campo «Confirma tu correo»: avisa si no coinciden.
 */
export function controlCorreo(input, confirmacion) {
  const limpiar = (el) => el.addEventListener('input', () => {
    const v = el.value.replace(/\s+/g, '').toLowerCase();
    if (v !== el.value) el.value = v;
  });
  limpiar(input);
  enVivo(input, mensajeCorreo);

  const sug = document.createElement('p');
  sug.className = 'm-sugerencia';
  sug.hidden = true;
  sug.setAttribute('aria-live', 'polite');
  (input.closest('.m-field') || input.parentElement).append(sug);
  input.addEventListener('blur', () => {
    const s = mensajeCorreo(input.value) ? '' : sugerirCorreo(input.value);
    sug.hidden = !s;
    if (!s) return;
    sug.innerHTML = `¿Quisiste decir <button type="button" class="m-btn m-btn--texto m-btn--sm">${escapar(s)}</button>?`;
    sug.querySelector('button').addEventListener('click', () => {
      input.value = s;
      sug.hidden = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      marcar(input, true);
      if (confirmacion && confirmacion.value) confirmacion.dispatchEvent(new Event('blur'));
      input.focus();
    });
  });
  input.addEventListener('input', () => { sug.hidden = true; });

  if (confirmacion) {
    limpiar(confirmacion);
    // No se valida antes de que la persona termine de escribir la confirmación.
    enVivo(confirmacion, (v) => (v.trim() !== input.value.trim() ? 'Los correos no coinciden.' : mensajeCorreo(v)));
  }
}
