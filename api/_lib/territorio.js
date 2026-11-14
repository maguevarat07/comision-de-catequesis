// Estructura territorial de la Arquidiócesis de Panamá: zona pastoral → vicaría → parroquia.
//
// Fuente: «Estructura territorial de la Arquidiócesis de Panamá» facilitada por la Comisión.
// Las parroquias con `propuesta: true` son adscripciones propuestas por afinidad territorial,
// pendientes de confirmación oficial. El directorio consultado identifica 11 vicarías,
// aunque la institución informa 13.
//
// Los coordinadores parroquiales salen de la sección «Equipo» de la portada (public/index.html).
// Si cambia el equipo, actualiza los dos sitios.
//
// Lo usan la API real (api/_lib/app.js) y la simulada (scripts/api-simulada.cjs):
//   - GET /api/territorio sirve el catálogo al formulario de registro;
//   - el registro resuelve en el servidor la vicaría y la zona de la parroquia elegida;
//   - el panel agrega los catequistas por zona, vicaría y parroquia.
'use strict';

const ZONAS = [
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

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const unirNombres = (n) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`);

// ---------- Índices (se construyen una vez) ----------

const zonaEtiqueta = (z) => `Zona ${z.nombre} (${z.area})`;
const vicariaEtiqueta = (v) => `Vicaría ${v.nombre}`;

const parroquias = new Map(); // id → { id, nombre, coordinador, propuesta, vicaria, zona }
const vicarias = new Map(); // id → { id, nombre, etiqueta, zona }
const porNombre = new Map(); // nombre de parroquia (minúsculas) → parroquia

for (const z of ZONAS) {
  z.etiqueta = zonaEtiqueta(z);
  for (const v of z.vicarias) {
    const vic = { id: v.id, nombre: v.nombre, etiqueta: vicariaEtiqueta(v), zona: z };
    if (vicarias.has(v.id)) throw new Error(`Vicaría duplicada en el catálogo: ${v.id}`);
    vicarias.set(v.id, vic);
    v.parroquias = v.parroquias.map((p) => {
      const base = typeof p === 'string' ? { nombre: p } : p;
      const coordinadores = COORDINADORES[base.nombre] || [];
      const par = { id: slug(base.nombre), nombre: base.nombre, coordinador: unirNombres(coordinadores), coordinadores, propuesta: !!base.propuesta, vicaria: vic, zona: z };
      if (parroquias.has(par.id)) throw new Error(`Parroquia duplicada en el catálogo: ${base.nombre}`);
      parroquias.set(par.id, par);
      porNombre.set(base.nombre.toLowerCase(), par);
      return par;
    });
  }
}
for (const nombre of Object.keys(COORDINADORES)) {
  if (!porNombre.has(nombre.toLowerCase())) throw new Error(`Coordinador asignado a una parroquia que no está en el catálogo: ${nombre}`);
}

// ---------- Catálogo público ----------

let publico = null;
/** Catálogo para el formulario: zonas → vicarías → parroquias (con coordinador sugerido). */
function catalogoPublico() {
  publico ??= {
    zonas: ZONAS.map((z) => ({
      id: z.id, nombre: z.nombre, area: z.area, etiqueta: z.etiqueta,
      vicarias: z.vicarias.map((v) => ({
        id: v.id, nombre: v.nombre, etiqueta: vicariaEtiqueta(v),
        parroquias: v.parroquias.map((p) => ({ id: p.id, nombre: p.nombre, coordinador: p.coordinador, propuesta: p.propuesta })),
      })),
    })),
  };
  return publico;
}

// ---------- Registro ----------

/**
 * Resuelve en el servidor la parroquia elegida en el formulario.
 * - `parroquia_id` del catálogo → nombre, vicaría y zona del catálogo (no se confía en el cliente).
 * - `parroquia_id: 'otra'` → nombre escrito + `vicaria_id` del catálogo (la zona sale de la vicaría).
 * Devuelve { parroquia, vicaria_zona, zona_pastoral, coordinador } o { error: { campo: mensaje } }.
 */
function resolverParroquia({ parroquia_id: id, parroquia: texto, vicaria_id: vicariaId } = {}) {
  const pid = String(id || '').trim();
  if (pid && pid !== OTRA) {
    const p = parroquias.get(pid);
    if (!p) return { error: { parroquia_id: 'Selecciona tu parroquia de la lista.' } };
    return { parroquia: p.nombre, vicaria_zona: p.vicaria.etiqueta, zona_pastoral: p.zona.etiqueta, coordinador: p.coordinador };
  }
  if (pid !== OTRA) return { error: { parroquia_id: 'Selecciona tu parroquia de la lista.' } };
  const nombre = String(texto || '').trim().slice(0, 120);
  const v = vicarias.get(String(vicariaId || '').trim());
  const error = {};
  if (nombre.length < 3) error.parroquia = 'Escribe el nombre de tu parroquia.';
  if (!v) error.vicaria_id = 'Selecciona la vicaría de tu parroquia.';
  if (Object.keys(error).length) return { error };
  // Si escribió el nombre exacto de una parroquia del catálogo, se usa la del catálogo.
  const conocida = porNombre.get(nombre.toLowerCase());
  if (conocida) return { parroquia: conocida.nombre, vicaria_zona: conocida.vicaria.etiqueta, zona_pastoral: conocida.zona.etiqueta, coordinador: conocida.coordinador };
  return { parroquia: nombre, vicaria_zona: v.etiqueta, zona_pastoral: v.zona.etiqueta, coordinador: '' };
}

// ---------- Estadísticas ----------

/** Zona y vicaría de un registro: columnas guardadas o, en registros antiguos, por el nombre de la parroquia. */
function clasificar(c) {
  const p = porNombre.get(String(c.parroquia || '').trim().toLowerCase());
  const vic = [...vicarias.values()].find((v) => v.etiqueta === c.vicaria_zona) || (p && p.vicaria) || null;
  const zona = ZONAS.find((z) => z.etiqueta === c.zona_pastoral) || (vic && vic.zona)
    // Registros anteriores al catálogo: «Vicaría Cristo Redentor (San Miguelito)», etc.
    || ZONAS.find((z) => String(c.vicaria_zona || '').includes(z.nombre)) || null;
  return {
    zona: zona ? zona.etiqueta : SIN_CLASIFICAR,
    vicaria: vic && (!zona || vic.zona === zona) ? vic.etiqueta : SIN_CLASIFICAR,
    parroquia: p ? p.nombre : String(c.parroquia || '').trim() || SIN_CLASIFICAR,
  };
}

const ESTADOS = ['ACTIVO', 'PENDIENTE_APROBACION', 'PENDIENTE_DOCUMENTOS', 'RECHAZADO', 'ANULADO'];
const conteoVacio = () => Object.fromEntries(ESTADOS.map((e) => [e, 0]));
function sumar(conteo, estado) {
  if (estado in conteo) conteo[estado]++;
  else conteo[estado] = 1;
}

/**
 * Agrega los catequistas por zona → vicaría → parroquia. Incluye todas las parroquias del
 * catálogo (con cero) y las que se escribieron a mano, y una zona «Sin clasificar» para los
 * registros que no se pueden ubicar. Cada nodo lleva `conteo` por estado.
 */
function estadisticas(catequistas) {
  const arbol = new Map(); // zona → { ..., vicarias: Map(vicaría → { ..., parroquias: Map }) }
  const nodo = (mapa, clave, extra) => {
    if (!mapa.has(clave)) mapa.set(clave, { nombre: clave, conteo: conteoVacio(), ...extra });
    return mapa.get(clave);
  };
  for (const z of ZONAS) {
    const zn = nodo(arbol, z.etiqueta, { id: z.id, corto: z.nombre, area: z.area, vicarias: new Map() });
    for (const v of z.vicarias) {
      const vn = nodo(zn.vicarias, vicariaEtiqueta(v), { id: v.id, corto: v.nombre, parroquias: new Map() });
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
    zonas: [...arbol.values()].map((z) => ({
      ...z,
      vicarias: [...z.vicarias.values()].map((v) => ({ ...v, parroquias: [...v.parroquias.values()] })),
    })),
  };
}

module.exports = { catalogoPublico, resolverParroquia, clasificar, estadisticas, OTRA, SIN_CLASIFICAR, ESTADOS };
