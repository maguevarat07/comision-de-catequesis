// Fechas de cumpleaños en la zona horaria de Panamá. Misma regla que el escritor
// (apps-script/Code.gs, diasDesdeCumple_): quien nació un 29 de febrero celebra el 28 en años no bisiestos.
'use strict';

const ZONA = 'America/Panama';
const hoyPanama = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora); // yyyy-mm-dd
const bisiesto = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DIA_MS = 86400000;

function partes(fechaNacimiento) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaNacimiento || ''));
  return m ? { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) } : null;
}

/** Fecha (UTC a medianoche) del cumpleaños en el año `y`. */
function enAnio(p, y) {
  const dia = p.mes === 2 && p.dia === 29 && !bisiesto(y) ? 28 : p.dia;
  return Date.UTC(y, p.mes - 1, dia);
}

function hoyUtc(ahora) {
  const [y, m, d] = hoyPanama(ahora).split('-').map(Number);
  return { y, t: Date.UTC(y, m - 1, d) };
}

/** Días desde el cumpleaños de este año: 0 = hoy, negativo = todavía no llega. NaN sin fecha. */
function diasDesdeCumple(fechaNacimiento, ahora = new Date()) {
  const p = partes(fechaNacimiento);
  if (!p) return NaN;
  const h = hoyUtc(ahora);
  return Math.round((h.t - enAnio(p, h.y)) / DIA_MS);
}

/** Días que faltan para el próximo cumpleaños (0 = hoy). NaN sin fecha. */
function diasHastaCumple(fechaNacimiento, ahora = new Date()) {
  const p = partes(fechaNacimiento);
  if (!p) return NaN;
  const h = hoyUtc(ahora);
  let t = enAnio(p, h.y);
  if (t < h.t) t = enAnio(p, h.y + 1);
  return Math.round((t - h.t) / DIA_MS);
}

/** yyyy-mm-dd del cumpleaños que cae dentro de `falta` días. */
function fechaCumple(fechaNacimiento, falta, ahora = new Date()) {
  const h = hoyUtc(ahora);
  return new Date(h.t + falta * DIA_MS).toISOString().slice(0, 10);
}

/** Años que cumple en ese próximo cumpleaños. */
function edadQueCumple(fechaNacimiento, falta, ahora = new Date()) {
  const p = partes(fechaNacimiento);
  if (!p) return null;
  return Number(fechaCumple(fechaNacimiento, falta, ahora).slice(0, 4)) - p.anio;
}

module.exports = { hoyPanama, diasDesdeCumple, diasHastaCumple, fechaCumple, edadQueCumple };
