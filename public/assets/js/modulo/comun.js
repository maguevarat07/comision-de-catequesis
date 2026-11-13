// Utilidades compartidas del módulo de catequistas: cliente de la API, validaciones,
// catálogos y pequeños ayudantes de interfaz. Sin dependencias ni compilación.

export const CSRF_HEADER = 'x-cat-csrf';

export class ApiError extends Error {
  constructor(status, cuerpo) {
    super((cuerpo && cuerpo.mensaje) || 'No se pudo completar la solicitud. Inténtalo de nuevo.');
    this.status = status;
    this.codigo = (cuerpo && cuerpo.codigo) || (status === 0 ? 'RED' : 'ERROR');
    this.campos = (cuerpo && cuerpo.campos) || null;
    this.datos = cuerpo || null;
  }
}

/** Llama a la API del sitio. Envía JSON, la cabecera anti-CSRF y, si se indica, la clave de idempotencia. */
export async function api(ruta, { metodo = 'GET', cuerpo, idem, señal } = {}) {
  const headers = { [CSRF_HEADER]: '1', accept: 'application/json' };
  if (cuerpo !== undefined) headers['content-type'] = 'application/json';
  if (idem) headers['idempotency-key'] = idem;
  let res;
  try {
    res = await fetch(ruta, {
      method: metodo,
      headers,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
      signal: señal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError(0, { codigo: 'RED', mensaje: 'No hay conexión con el servidor. Revisa tu internet e inténtalo otra vez; tus datos no se perderán.' });
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok || (datos && datos.ok === false)) throw new ApiError(res.status, datos);
  return datos;
}

export function nuevaClave() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

let configPromesa = null;
/** Configuración pública (costos, Yappy, Semana, modo). Se pide una vez por página. */
export function cargarConfig() {
  configPromesa ??= api('/api/config-publica').then((r) => r.config);
  return configPromesa;
}

/** Franja visible cuando la API funciona en modo simulado (sin Google). */
export function marcarModo(config) {
  if (!config || config.modo !== 'simulado' || document.querySelector('.m-simulado')) return;
  const d = document.createElement('div');
  d.className = 'm-simulado';
  d.setAttribute('role', 'note');
  d.textContent = 'Modo de prueba: los datos se guardan solo en memoria y no se envían correos reales.';
  document.body.prepend(d);
}

// ---------- Catálogos ----------

export const ZONAS = [
  'Vicaría San Francisco de Paula (Panamá Oeste)',
  'Vicaría Santa María la Antigua (Panamá Centro)',
  'Vicaría Cristo Redentor (San Miguelito)',
  'Vicaría Nuestra Señora del Carmen (Panamá Este)',
];

export const NIVELES = [
  'Iniciación cristiana de niños',
  'Primera Comunión',
  'Confirmación',
  'Perseverancia',
  'Catequesis familiar',
  'Catequesis de adultos / catecumenado',
  'Catequesis especial (inclusiva)',
  'Coordinación parroquial',
  'Otro',
];

export const FORMACION_CENAFCA = ['Sin formación CENAFCA', 'En curso', 'Primer nivel completo', 'Segundo nivel completo', 'Formación concluida', 'Otra formación catequética'];

export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// ---------- Validaciones ----------

/** Cédula panameña: 8-123-4567, PE-12-345, E-8-12345, N-12-345, 1PI-12-345, 8AV-123-456. */
export const RE_CEDULA = /^(?:(?:[1-9]|1[0-3])(?:AV|PI)?|PE|E|N)-\d{1,4}-\d{1,6}$/;

export function normalizarCedula(v) {
  return String(v || '').toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
}
export function cedulaValida(v) {
  return RE_CEDULA.test(normalizarCedula(v));
}
export function correoValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
}
/** Teléfono de Panamá: 7 u 8 dígitos (celular 6xxx-xxxx), con o sin +507. */
export function normalizarTelefono(v) {
  const d = String(v || '').replace(/[^\d]/g, '').replace(/^507(?=\d{7,8}$)/, '');
  return d;
}
export function telefonoValido(v) {
  return /^(?:6\d{7}|[2-9]\d{6})$/.test(normalizarTelefono(v));
}
export function formatearTelefono(v) {
  const d = normalizarTelefono(v);
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4)}` : d.length === 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}
/** Acepta CAT-00001, cat-1, cat1 o 1 → CAT-00001. Devuelve '' si no es válido. */
export function normalizarNumeroCatequista(v) {
  const m = String(v || '').trim().toUpperCase().match(/^(?:CAT)?[\s-]*0*(\d{1,7})$/);
  return m && Number(m[1]) > 0 ? `CAT-${m[1].padStart(5, '0')}` : '';
}
export function edad(fechaIso, hoy = new Date()) {
  const f = new Date(fechaIso + 'T00:00:00');
  if (Number.isNaN(f.getTime())) return NaN;
  let a = hoy.getFullYear() - f.getFullYear();
  const m = hoy.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) a--;
  return a;
}

// ---------- Formatos ----------

const TZ = 'America/Panama';
export function fmtFecha(iso, conHora = false) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-PA', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
export function fmtMonto(n, moneda = 'B/.') {
  return `${moneda} ${Number(n || 0).toFixed(2)}`;
}

// ---------- Interfaz ----------

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

export function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Plantilla segura: los valores interpolados se escapan salvo que se envuelvan con crudo(). */
const CRUDO = Symbol('crudo');
export const crudo = (html) => ({ [CRUDO]: String(html) });
export function html(partes, ...valores) {
  return partes.reduce((acc, p, i) => {
    if (i === 0) return p;
    const v = valores[i - 1];
    const s = v && v[CRUDO] !== undefined ? v[CRUDO] : Array.isArray(v) ? v.map((x) => (x && x[CRUDO] !== undefined ? x[CRUDO] : escapar(x))).join('') : escapar(v);
    return acc + s + p;
  }, '');
}

export function ocupado(boton, activo, texto) {
  if (!boton) return;
  if (activo) {
    boton.dataset.texto ??= boton.innerHTML;
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.innerHTML = `<span class="m-spin" aria-hidden="true"></span>${escapar(texto || 'Procesando…')}`;
  } else {
    boton.disabled = false;
    boton.removeAttribute('aria-busy');
    if (boton.dataset.texto !== undefined) boton.innerHTML = boton.dataset.texto;
    delete boton.dataset.texto;
  }
}

/** Marca un campo como inválido y muestra el mensaje en su <p class="m-error">. */
export function errorCampo(input, mensaje) {
  if (!input) return;
  const id = input.id + '-err';
  let p = document.getElementById(id);
  if (!p) {
    p = document.createElement('p');
    p.id = id;
    p.className = 'm-error';
    p.setAttribute('aria-live', 'polite');
    (input.closest('.m-field') || input.parentElement).append(p);
  }
  p.textContent = mensaje || '';
  if (mensaje) {
    input.setAttribute('aria-invalid', 'true');
    const prev = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (!prev.includes(id)) input.setAttribute('aria-describedby', [...prev, id].join(' '));
  } else {
    input.removeAttribute('aria-invalid');
  }
}

export function aviso(contenedor, tipo, mensaje) {
  if (!contenedor) return;
  if (!mensaje) {
    contenedor.hidden = true;
    contenedor.innerHTML = '';
    return;
  }
  contenedor.hidden = false;
  contenedor.className = `m-aviso m-aviso--${tipo}`;
  contenedor.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  contenedor.innerHTML = Array.isArray(mensaje) ? mensaje.map((m) => `<p>${escapar(m)}</p>`).join('') : `<p>${escapar(mensaje)}</p>`;
}

export function llenarSelect(select, opciones, placeholder = 'Selecciona una opción') {
  select.innerHTML = `<option value="">${escapar(placeholder)}</option>` + opciones.map((o) => `<option>${escapar(o)}</option>`).join('');
}

export function iniciales(nombres, apellidos) {
  return `${(nombres || '').trim()[0] || ''}${(apellidos || '').trim()[0] || ''}`.toUpperCase();
}

export function insignaEstado(estado) {
  const e = String(estado || '').toUpperCase();
  const tipo = e === 'ACTIVO' || e === 'CONFIRMADA' || e === 'VALIDO' ? 'ok' : e === 'ANULADO' || e === 'ANULADA' ? 'error' : 'warn';
  const texto = { ACTIVO: 'Activo', PENDIENTE_DOCUMENTOS: 'Documentos pendientes', ANULADO: 'Anulado', CONFIRMADA: 'Confirmada', ANULADA: 'Anulada', PENDIENTE_DOCUMENTOS_SEMANA: 'Pase pendiente' }[e] || e;
  return `<span class="m-badge m-badge--${tipo}">${escapar(texto)}</span>`;
}
