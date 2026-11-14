// Estructura territorial de la Arquidiócesis de Panamá: zona pastoral → vicaría → parroquia.
//
// Fuente: «Estructura territorial de la Arquidiócesis de Panamá» facilitada por la Comisión.
// Las parroquias con `propuesta: true` son adscripciones propuestas por afinidad territorial,
// pendientes de confirmación oficial. El directorio consultado identifica 11 vicarías,
// aunque la institución informa 13.
//
// Estos datos son el catálogo INICIAL. Desde el panel se editan vicarías, parroquias y
// coordinadores; los cambios se guardan en las pestañas «Vicarias» y «Parroquias» del libro y,
// en cuanto tienen filas, mandan sobre este archivo (ver desdeHoja). Los coordinadores iniciales
// salen de la sección «Equipo» de la portada (public/index.html).
//
// Lo usan la API real (api/_lib/app.js) y la simulada (scripts/api-simulada.cjs):
//   - GET /api/territorio sirve el catálogo al formulario de registro;
//   - el registro resuelve en el servidor la vicaría y la zona de la parroquia elegida;
//   - el panel agrega los catequistas por zona, vicaría y parroquia y edita el catálogo.
'use strict';

const CATALOGO_INICIAL = [
  {
    id: 'santa-maria-la-antigua', nombre: 'Santa María la Antigua', area: 'Panamá Centro',
    vicarias: [
      { id: 'la-merced-santa-maria', nombre: 'La Merced–Santa María', parroquias: [
        'Nuestra Señora de la Merced',
        'Catedral Basílica Santa María la Antigua',
        'Basílica Menor Don Bosco — Calidonia',
        'San José — Altar de Oro',
        'Santa Ana',
        'Nuestra Señora de Fátima — El Chorrillo',
        'San Vicente de Paúl — 5 de Mayo',
        'San José — Paraíso',
        'San Miguel Arcángel — San Miguel',
        'Santa Teresita — El Marañón',
        'María Reina — Curundú',
        'Sagrado Corazón de Jesús — Ancón',
        'Santa María — Balboa',
        'San Francisco de Asís',
      ] },
      { id: 'cristo-rey', nombre: 'Cristo Rey', parroquias: [
        'Cristo Rey',
        'Nuestra Señora del Carmen — Vía España',
        'Santuario Nacional del Inmaculado Corazón de María',
        'Nuestra Señora de Guadalupe — Calle 50',
        'San Mateo Evangelista — Punta Paitilla',
        'San Francisco de Asís — La Caleta',
      ] },
      { id: 'santa-eduviges', nombre: 'Santa Eduviges', parroquias: [
        'Santa Eduviges',
        'Santa Marta',
        'Nuestra Señora de los Ángeles',
        'San Pablo Apóstol',
        'Santa María la Antigua (parroquia, distinta de la Catedral)',
        'Santísima Trinidad',
        'San Antonio de Padua — Miraflores',
        'Nuestra Señora del Perpetuo Socorro — El Ingenio',
        'Nuestra Señora de la Esperanza — Condado del Rey',
      ] },
      { id: 'la-asuncion', nombre: 'La Asunción', parroquias: [
        'Nuestra Señora de la Asunción',
        'San Gerardo Mayela',
        'Nuestra Señora de Lourdes',
        'San Antonio María Claret',
        'María Auxiliadora',
        'San Juan Bautista y Santa Mónica — Iglesia de Piedra',
        'Santiago Apóstol',
        'San Lucas Evangelista — Costa del Este',
      ] },
    ],
  },
  {
    id: 'cristo-redentor', nombre: 'Cristo Redentor', area: 'Panamá Norte',
    vicarias: [
      { id: 'cristo-redentor', nombre: 'Cristo Redentor', parroquias: [
        'Cristo Redentor — Paraíso',
        'Cristo Resucitado — Monte Oscuro',
        'Cristo Hijo del Hombre — Villa Guadalupe',
        'Cristo Hijo de Dios — Samaria',
        'El Señor de los Milagros',
        'La Natividad de María — Cerro Viento',
        'San Antonio — Ciudad Jardín',
        'San Juan Apóstol y Evangelista — Brisas del Golf',
        'María Reina de la Paz — Los Andes 2',
        'Cristo Luz del Mundo — Pan de Azúcar',
        'San Marcos Evangelista — 9 de Enero',
        'Cristo Servidor — El Crisol',
        'San José — Veranillo',
        'Medalla Milagrosa — Veranillo (cuasiparroquia)',
      ] },
      { id: 'santa-cruz-chilibre', nombre: 'Santa Cruz–Chilibre', parroquias: [
        'Santa Cruz — Chilibre',
        'Sagrada Familia — San Isidro',
        'Nuestra Señora de la Medalla Milagrosa — Alcalde Díaz',
        'San Agustín — Villa Zaíta',
        'San Juan María Vianney — Las Cumbres',
        'San Martín de Porres — Cerro Batea',
        'San Jerónimo',
        'La Transfiguración del Señor — Santa Librada',
        'Nuestra Señora del Rosario — Torrijos Carter',
      ] },
    ],
  },
  {
    id: 'nuestra-senora-del-carmen', nombre: 'Nuestra Señora del Carmen', area: 'Panamá Este',
    vicarias: [
      { id: 'carmen-juan-diaz', nombre: 'Nuestra Señora del Carmen–Juan Díaz', parroquias: [
        'Nuestra Señora del Carmen — Juan Díaz',
        'San Judas Tadeo',
        'Nuestra Señora de la Candelaria',
        'San Pedro y San Cristóbal',
        'Inmaculada Concepción — Juan Díaz',
        'Santa María del Camino',
        'Santa María de Guadalupe',
        'Santa María Madre de Dios',
        'Santa Rita de Casia — Juan Díaz',
      ] },
      { id: 'san-juan-bosco-pedregal', nombre: 'San Juan Bosco — Pedregal', parroquias: [
        'Don Bosco — Pedregal',
        'San Antonio de Padua — Tocumen',
        'San Pío de Pietrelcina — La Siesta, Tocumen',
        'Espíritu Santo — 24 de Diciembre',
        'La Ascensión del Señor',
        'San Joaquín',
        'Nuestra Señora de Belén',
        'San Andrés Kim, mártir',
        'San Juan XXIII — 24 de Diciembre',
        { nombre: 'San Carlo Acutis — Nuevo Tocumen', propuesta: true },
      ] },
      { id: 'san-cristobal', nombre: 'San Cristóbal', parroquias: [
        'San Cristóbal — Chepo',
        'Cuerpo y Sangre de Cristo — Tortí',
        'Inmaculada Concepción — Pacora',
        'Jesús Buen Pastor',
        { nombre: 'Virgen de Guadalupe — Las Garzas–Pacora', propuesta: true },
        { nombre: 'San Isidro Labrador — Cañita', propuesta: true },
        'San Miguel Arcángel — Archipiélago de las Perlas',
        'San Pedro — Isla de Taboga',
      ] },
    ],
  },
  {
    id: 'san-francisco-de-paula', nombre: 'San Francisco de Paula', area: 'Panamá Oeste',
    vicarias: [
      { id: 'san-francisco-de-paula', nombre: 'San Francisco de Paula', parroquias: [
        'San Francisco de Paula — La Chorrera',
        'Santa Rita de Casia — Panamá Oeste',
        'San Nicolás de Bari — Arraiján',
        'Nuestra Señora de los Dolores — Nuevo Emperador, Arraiján',
        'Inmaculada Concepción — La Chorrera',
        'Nuestra Señora de Guadalupe — Guadalupe, La Chorrera',
        'San Martín de Porres — El Espino',
        'Inmaculada Concepción — Veracruz',
        { nombre: 'San Pablo VI — Howard', propuesta: true },
      ] },
      { id: 'san-jose-chame', nombre: 'San José–Chame', parroquias: [
        'San José — Chame',
        'San Carlos Borromeo — San Carlos',
        'María Auxiliadora — Bejuco',
        'San Isidro Labrador — Capira',
      ] },
    ],
  },
];

// Coordinadores de catequesis por parroquia (sección «Equipo» de la portada).
// «Nuestra Señora del Carmen (Pasadena)» se asignó a la parroquia de Juan Díaz: confirmar.
const COORDINADORES = {
  'San Juan Apóstol y Evangelista — Brisas del Golf': ['Roxanna de Samudio'],
  'Cristo Redentor — Paraíso': ['Mitzi Castillo'],
  'San Judas Tadeo': ['Pamela Rodríguez', 'Ariadne Abrego', 'Dalet González'],
  'Santísima Trinidad': ['Omaraida Medina', 'Anayansi Rodríguez'],
  'Nuestra Señora de la Candelaria': ['Silvia de Greco'],
  'Santa María Madre de Dios': ['Rosalba Chiu'],
  'San Francisco de Paula — La Chorrera': ['Jaime Bernal'],
  'San Antonio de Padua — Miraflores': ['Eyra García de Sabán'],
  'San Juan María Vianney — Las Cumbres': ['Abigail Palacios'],
  'Santuario Nacional del Inmaculado Corazón de María': ['Angela Rodriguez'],
  'San Antonio — Ciudad Jardín': ['Jenny Jiménez'],
  'Santa Marta': ['Katia Velarde'],
  'Inmaculada Concepción — Juan Díaz': ['Carmen Polanco'],
  'San Jerónimo': ['Rodrigo Gil'],
  'Nuestra Señora del Carmen — Juan Díaz': ['Diana López'],
  'La Natividad de María — Cerro Viento': ['Grace Rodríguez'],
  'San Mateo Evangelista — Punta Paitilla': ['Rolando Degracia', 'Velia Villeros'],
  'Don Bosco — Pedregal': ['Dilcia Bermúdez'],
};

const OTRA = 'otra';
const SIN_CLASIFICAR = 'Sin clasificar';
const ESTADOS = ['ACTIVO', 'PENDIENTE_APROBACION', 'PENDIENTE_DOCUMENTOS', 'RECHAZADO', 'ANULADO'];
const VIGENTES = ['ACTIVO', 'PENDIENTE_APROBACION', 'PENDIENTE_DOCUMENTOS'];

// Columnas de las pestañas del libro (las crea asegurarEsquema_ en apps-script/Code.gs).
const COLUMNAS = {
  Vicarias: ['id', 'nombre', 'zona_id', 'activa', 'orden', 'actualizado_at', 'actualizado_por'],
  Parroquias: ['id', 'nombre', 'vicaria_id', 'coordinador', 'propuesta', 'activa', 'orden', 'actualizado_at', 'actualizado_por'],
};

// Las cuatro zonas pastorales son fijas; vicarías y parroquias se editan.
const ZONAS = CATALOGO_INICIAL.map(({ id, nombre, area }) => ({ id, nombre, area, etiqueta: `Zona ${nombre} (${area})` }));

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const unirNombres = (n) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`);
const vicariaEtiqueta = (nombre) => `Vicaría ${nombre}`;
const verdadero = (v) => ['TRUE', 'true', '1', 'si', 'sí', 'SI', 'SÍ'].includes(String(v).trim());
const clave = (s) => String(s || '').trim().toLowerCase();

/** Filas iniciales (mismo formato que las pestañas) a partir de CATALOGO_INICIAL. */
function semilla() {
  const Vicarias = [];
  const Parroquias = [];
  for (const z of CATALOGO_INICIAL) {
    for (const v of z.vicarias) {
      Vicarias.push({ id: v.id, nombre: v.nombre, zona_id: z.id, activa: 'TRUE', orden: String(Vicarias.length + 1), actualizado_at: '', actualizado_por: '' });
      for (const p of v.parroquias) {
        const base = typeof p === 'string' ? { nombre: p } : p;
        Parroquias.push({
          id: slug(base.nombre), nombre: base.nombre, vicaria_id: v.id, coordinador: unirNombres(COORDINADORES[base.nombre] || []),
          propuesta: base.propuesta ? 'TRUE' : 'FALSE', activa: 'TRUE', orden: String(Parroquias.length + 1), actualizado_at: '', actualizado_por: '',
        });
      }
    }
  }
  return { Vicarias, Parroquias };
}

/**
 * Catálogo construido a partir de filas de Vicarias y Parroquias.
 * Las inactivas no se ofrecen en el registro, pero siguen clasificando los registros existentes.
 */
function crearTerritorio({ Vicarias, Parroquias }, origen = 'hoja') {
  const porOrden = (a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0);
  const zonas = ZONAS.map((z) => ({ ...z, vicarias: [] }));
  const zonaPorId = new Map(zonas.map((z) => [z.id, z]));
  const vicarias = new Map();
  const parroquias = new Map();
  const porNombre = new Map();
  const activo = (v) => v === '' || v === undefined || verdadero(v);
  for (const f of [...Vicarias].sort(porOrden)) {
    const z = zonaPorId.get(f.zona_id);
    if (!f.id || !z) continue;
    const v = { id: f.id, nombre: f.nombre, etiqueta: vicariaEtiqueta(f.nombre), activa: activo(f.activa), orden: Number(f.orden) || 0, zona: z, parroquias: [] };
    vicarias.set(v.id, v);
    z.vicarias.push(v);
  }
  for (const f of [...Parroquias].sort(porOrden)) {
    const v = vicarias.get(f.vicaria_id);
    if (!f.id || !v) continue;
    const p = { id: f.id, nombre: f.nombre, coordinador: f.coordinador || '', propuesta: verdadero(f.propuesta), activa: activo(f.activa), orden: Number(f.orden) || 0, vicaria: v, zona: v.zona };
    parroquias.set(p.id, p);
    porNombre.set(clave(p.nombre), p);
    v.parroquias.push(p);
  }

  /** Catálogo para el formulario: solo vicarías y parroquias activas. */
  function catalogoPublico() {
    return {
      zonas: zonas.map((z) => ({
        id: z.id, nombre: z.nombre, area: z.area, etiqueta: z.etiqueta,
        vicarias: z.vicarias.filter((v) => v.activa).map((v) => ({
          id: v.id, nombre: v.nombre, etiqueta: v.etiqueta,
          parroquias: v.parroquias.filter((p) => p.activa).map((p) => ({ id: p.id, nombre: p.nombre, coordinador: p.coordinador, propuesta: p.propuesta })),
        })),
      })),
    };
  }

  /**
   * Resuelve en el servidor la parroquia elegida en el formulario.
   * - `parroquia_id` del catálogo → nombre, vicaría y zona del catálogo (no se confía en el cliente).
   * - `parroquia_id: 'otra'` → nombre escrito + `vicaria_id` (la zona sale de la vicaría).
   * Devuelve { parroquia, vicaria_zona, zona_pastoral, coordinador } o { error: { campo: mensaje } }.
   */
  function resolverParroquia({ parroquia_id: id, parroquia: texto, vicaria_id: vicariaId } = {}) {
    const pid = String(id || '').trim();
    const de = (p) => ({ parroquia: p.nombre, vicaria_zona: p.vicaria.etiqueta, zona_pastoral: p.zona.etiqueta, coordinador: p.coordinador });
    if (pid && pid !== OTRA) {
      const p = parroquias.get(pid);
      if (!p || !p.activa) return { error: { parroquia_id: 'Selecciona tu parroquia de la lista.' } };
      return de(p);
    }
    if (pid !== OTRA) return { error: { parroquia_id: 'Selecciona tu parroquia de la lista.' } };
    const nombre = String(texto || '').trim().slice(0, 120);
    const v = vicarias.get(String(vicariaId || '').trim());
    const error = {};
    if (nombre.length < 3) error.parroquia = 'Escribe el nombre de tu parroquia.';
    if (!v || !v.activa) error.vicaria_id = 'Selecciona la vicaría de tu parroquia.';
    if (Object.keys(error).length) return { error };
    // Si escribió el nombre exacto de una parroquia del catálogo, se usa la del catálogo.
    const conocida = porNombre.get(clave(nombre));
    if (conocida) return de(conocida);
    return { parroquia: nombre, vicaria_zona: v.etiqueta, zona_pastoral: v.zona.etiqueta, coordinador: '' };
  }

  /** Zona, vicaría y parroquia de un registro: por la parroquia del catálogo o por las columnas guardadas. */
  function clasificar(c) {
    const p = porNombre.get(clave(c.parroquia));
    if (p) return { zona: p.zona.etiqueta, vicaria: p.vicaria.etiqueta, parroquia: p.nombre };
    const vic = [...vicarias.values()].find((v) => v.etiqueta === c.vicaria_zona) || null;
    const zona = (vic && vic.zona) || zonas.find((z) => z.etiqueta === c.zona_pastoral)
      // Registros anteriores al catálogo: «Vicaría Cristo Redentor (San Miguelito)», etc.
      || zonas.find((z) => String(c.vicaria_zona || '').includes(z.nombre)) || null;
    return {
      zona: zona ? zona.etiqueta : SIN_CLASIFICAR,
      vicaria: vic ? vic.etiqueta : SIN_CLASIFICAR,
      parroquia: String(c.parroquia || '').trim() || SIN_CLASIFICAR,
    };
  }

  /**
   * Agrega los catequistas por zona → vicaría → parroquia. Incluye todo el catálogo (con cero),
   * las parroquias escritas a mano y una zona «Sin clasificar». Cada nodo lleva `conteo` por estado.
   */
  function estadisticas(catequistas) {
    const conteoVacio = () => Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    const sumar = (conteo, estado) => { conteo[estado] = (conteo[estado] || 0) + 1; };
    const arbol = new Map();
    const nodo = (mapa, k, extra) => {
      if (!mapa.has(k)) mapa.set(k, { nombre: k, conteo: conteoVacio(), ...extra });
      return mapa.get(k);
    };
    for (const z of zonas) {
      const zn = nodo(arbol, z.etiqueta, { id: z.id, corto: z.nombre, area: z.area, vicarias: new Map() });
      for (const v of z.vicarias) {
        const vn = nodo(zn.vicarias, v.etiqueta, { id: v.id, corto: v.nombre, parroquias: new Map() });
        for (const p of v.parroquias) nodo(vn.parroquias, p.nombre, { id: p.id, coordinador: p.coordinador, propuesta: p.propuesta, catalogo: true });
      }
    }
    const total = conteoVacio();
    for (const c of catequistas) {
      const k = clasificar(c);
      const estado = String(c.estado || '');
      const zn = nodo(arbol, k.zona, { id: slug(k.zona), corto: k.zona, area: '', vicarias: new Map() });
      const vn = nodo(zn.vicarias, k.vicaria, { id: slug(k.vicaria), corto: k.vicaria.replace(/^Vicaría\s+/, ''), parroquias: new Map() });
      const pn = nodo(vn.parroquias, k.parroquia, { id: slug(k.parroquia), coordinador: '', propuesta: false, catalogo: false });
      [total, zn.conteo, vn.conteo, pn.conteo].forEach((x) => sumar(x, estado));
    }
    return {
      estados: ESTADOS,
      total,
      zonas: [...arbol.values()].map((z) => ({ ...z, vicarias: [...z.vicarias.values()].map((v) => ({ ...v, parroquias: [...v.parroquias.values()] })) })),
    };
  }

  /** Catálogo completo para el panel (incluye inactivas), con catequistas vigentes y parroquias escritas a mano. */
  function catalogoAdmin(catequistas) {
    const cuenta = new Map();
    const fuera = new Map();
    for (const c of catequistas) {
      if (!VIGENTES.includes(c.estado)) continue;
      const p = porNombre.get(clave(c.parroquia));
      if (p) { cuenta.set(p.id, (cuenta.get(p.id) || 0) + 1); continue; }
      const k = clasificar(c);
      const id = `${clave(c.parroquia)}|${k.vicaria}`;
      const vic = [...vicarias.values()].find((v) => v.etiqueta === k.vicaria);
      const f = fuera.get(id) || { nombre: String(c.parroquia || '').trim(), vicaria: k.vicaria, vicaria_id: vic ? vic.id : '', zona: k.zona, catequistas: 0 };
      f.catequistas++;
      fuera.set(id, f);
    }
    return {
      origen,
      zonas: zonas.map((z) => ({
        id: z.id, nombre: z.nombre, area: z.area, etiqueta: z.etiqueta,
        vicarias: z.vicarias.map((v) => ({
          id: v.id, nombre: v.nombre, etiqueta: v.etiqueta, activa: v.activa,
          parroquias: v.parroquias.map((p) => ({ id: p.id, nombre: p.nombre, coordinador: p.coordinador, propuesta: p.propuesta, activa: p.activa, catequistas: cuenta.get(p.id) || 0 })),
        })),
      })),
      fuera: [...fuera.values()].filter((f) => f.nombre).sort((a, b) => b.catequistas - a.catequistas || a.nombre.localeCompare(b.nombre, 'es')),
    };
  }

  /** Filas actuales (formato de las pestañas), para sembrar el libro en la primera edición. */
  function filas() {
    return {
      Vicarias: [...vicarias.values()].map((v) => ({ id: v.id, nombre: v.nombre, zona_id: v.zona.id, activa: v.activa ? 'TRUE' : 'FALSE', orden: String(v.orden), actualizado_at: '', actualizado_por: '' })),
      Parroquias: [...parroquias.values()].map((p) => ({ id: p.id, nombre: p.nombre, vicaria_id: p.vicaria.id, coordinador: p.coordinador, propuesta: p.propuesta ? 'TRUE' : 'FALSE', activa: p.activa ? 'TRUE' : 'FALSE', orden: String(p.orden), actualizado_at: '', actualizado_por: '' })),
    };
  }

  return {
    origen, zonas, catalogoPublico, resolverParroquia, clasificar, estadisticas, catalogoAdmin, filas,
    parroquia: (id) => parroquias.get(id) || null,
    vicaria: (id) => vicarias.get(id) || null,
    parroquiaPorNombre: (n) => porNombre.get(clave(n)) || null,
    vicariaPorNombre: (n) => [...vicarias.values()].find((v) => clave(v.nombre) === clave(n)) || null,
    zona: (id) => zonas.find((z) => z.id === id) || null,
    maxOrden: (tipo) => Math.max(0, ...[...(tipo === 'Vicarias' ? vicarias : parroquias).values()].map((x) => x.orden)),
    nuevoId: (nombre, tipo) => {
      const mapa = tipo === 'Vicarias' ? vicarias : parroquias;
      const base = slug(nombre) || 'sin-nombre';
      let id = base;
      for (let i = 2; mapa.has(id) || id === OTRA; i++) id = `${base}-${i}`;
      return id;
    },
  };
}

const BASE = crearTerritorio(semilla(), 'base');
for (const nombre of Object.keys(COORDINADORES)) {
  if (!BASE.parroquiaPorNombre(nombre)) throw new Error(`Coordinador asignado a una parroquia que no está en el catálogo: ${nombre}`);
}
if (new Set(semilla().Parroquias.map((p) => p.id)).size !== semilla().Parroquias.length) throw new Error('Parroquias duplicadas en el catálogo inicial');

/**
 * Catálogo vigente a partir de las pestañas leídas del libro ({ Vicarias, Parroquias } como objetos).
 * Mientras alguna de las dos no tenga filas, se usa el catálogo inicial.
 */
function desdeHoja(tablas) {
  if (!tablas || !Array.isArray(tablas.Parroquias) || !tablas.Parroquias.length || !Array.isArray(tablas.Vicarias) || !tablas.Vicarias.length) return BASE;
  return crearTerritorio(tablas, 'hoja');
}

// ---------- Propagación de cambios a los registros de catequistas ----------

/**
 * Reglas que mantienen los registros al día tras editar el catálogo. Cada regla es
 * { donde: { columna: valor | [valores] }, poner: { columna: valor } } y se aplican en orden
 * (una regla ve los cambios de la anterior). El escritor (Code.gs, aplicarReglas_) aplica
 * exactamente lo mismo bajo bloqueo.
 *
 * antes/despues: { nombre, vicaria (etiqueta), zona (etiqueta), coordinador } o null si es nueva.
 */
function reglasParroquia(antes, despues) {
  const reglas = [];
  const ubicacion = { parroquia: despues.nombre, vicaria_zona: despues.vicaria, zona_pastoral: despues.zona };
  if (!antes) {
    // Parroquia nueva: los registros que la habían escrito a mano pasan a la del catálogo.
    reglas.push({ donde: { parroquia: despues.nombre }, poner: ubicacion });
    if (despues.coordinador) reglas.push({ donde: { parroquia: despues.nombre, coordinador_parroquial: '' }, poner: { coordinador_parroquial: despues.coordinador } });
    return reglas;
  }
  if (antes.nombre !== despues.nombre || antes.vicaria !== despues.vicaria || antes.zona !== despues.zona) reglas.push({ donde: { parroquia: antes.nombre }, poner: ubicacion });
  // El coordinador cambia en los registros que tenían el anterior (o ninguno); se respeta el que escribió otra persona.
  if (antes.coordinador !== despues.coordinador) reglas.push({ donde: { parroquia: despues.nombre, coordinador_parroquial: [antes.coordinador, ''] }, poner: { coordinador_parroquial: despues.coordinador } });
  return reglas;
}

/** Igual para una vicaría: { etiqueta, zona (etiqueta) } antes y después. */
function reglasVicaria(antes, despues) {
  const reglas = [];
  if (!antes) return reglas;
  if (antes.etiqueta !== despues.etiqueta) reglas.push({ donde: { vicaria_zona: antes.etiqueta }, poner: { vicaria_zona: despues.etiqueta } });
  if (antes.zona !== despues.zona) reglas.push({ donde: { vicaria_zona: despues.etiqueta }, poner: { zona_pastoral: despues.zona } });
  return reglas;
}

/** Aplica las reglas sobre filas en memoria (las modifica). Devuelve los ids de las filas cambiadas. */
function aplicarReglas(filasCatequistas, reglas) {
  const tocadas = new Set();
  for (const r of reglas) {
    for (const f of filasCatequistas) {
      const cumple = Object.entries(r.donde).every(([k, v]) => (Array.isArray(v) ? v.includes(String(f[k] ?? '')) : String(f[k] ?? '') === v));
      if (!cumple) continue;
      const cambios = Object.entries(r.poner).filter(([k, v]) => String(f[k] ?? '') !== String(v));
      if (!cambios.length) continue;
      cambios.forEach(([k, v]) => { f[k] = v; });
      tocadas.add(f.id);
    }
  }
  return [...tocadas];
}

module.exports = {
  BASE, ZONAS, COLUMNAS, OTRA, SIN_CLASIFICAR, ESTADOS, VIGENTES,
  semilla, crearTerritorio, desdeHoja, reglasParroquia, reglasVicaria, aplicarReglas, slug,
  // Atajos sobre el catálogo inicial (pruebas).
  catalogoPublico: () => BASE.catalogoPublico(),
  resolverParroquia: (d) => BASE.resolverParroquia(d),
  clasificar: (c) => BASE.clasificar(c),
  estadisticas: (cs) => BASE.estadisticas(cs),
};
