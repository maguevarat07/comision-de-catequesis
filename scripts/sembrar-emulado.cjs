// Datos de ejemplo para el modo emulado: registra dos catequistas por la API real
// (mismo flujo que el formulario), así quedan con PDF, carnet y correo generados.
// prueba@ejemplo.com se aprueba desde el panel (queda ACTIVO); jose@ejemplo.com queda por aprobar.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const img = (archivo, mime) => `data:${mime};base64,${fs.readFileSync(path.join(__dirname, '..', archivo)).toString('base64')}`;

async function pedir(base, ruta, cuerpo, cookie = '') {
  const r = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cat-csrf': '1', 'idempotency-key': crypto.randomUUID(), cookie },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${await r.text()}`);
  return { datos: await r.json(), cookie: (r.headers.getSetCookie?.() || []).map((s) => s.split(';')[0]).join('; ') };
}

module.exports = async function sembrar(base) {
  const foto = img('public/assets/images/comunidad.jpg', 'image/jpeg');
  const firma = img('api/_assets/logo.png', 'image/png');
  const ejemplos = [
    { nombres: 'María Fernanda', apellidos: 'Prueba Ríos', cedula: '8-123-4567', correo: 'prueba@ejemplo.com', parroquia_id: 'san-jose-altar-de-oro', aprobar: true },
    { nombres: 'José Luis', apellidos: 'Ejemplo Castillo', cedula: '4-765-1234', correo: 'jose@ejemplo.com', parroquia_id: 'cristo-rey', aprobar: false },
  ];
  const { cookie: admin } = await pedir(base, '/api/auth/simulado', { email: 'aovv.26@gmail.com' });
  for (const [i, { aprobar, ...e }] of ejemplos.entries()) {
    // Comprobante distinto en cada uno (el SHA-256 debe ser único).
    const comp = Buffer.concat([fs.readFileSync(path.join(__dirname, '..', 'api/_assets/logo.png')), Buffer.from(`ejemplo-${i}`)]);
    const { datos } = await pedir(base, '/api/registro', {
      datos: { ...e, fecha_nacimiento: '1985-04-12', sexo: 'Femenino', telefono: '60001234', direccion: 'Ciudad de Panamá', anios_servicio: 6, nivel_que_imparte: ['Primera Comunión'], formacion_cenafca: 'En curso', coordinador_parroquial: '', yappy_referencia: `EJEMPLO${i + 1}`, consentimiento_datos: true, consentimiento_imagen: true },
      foto, firma, comprobante: `data:image/png;base64,${comp.toString('base64')}`,
    });
    if (!aprobar) continue;
    const lista = await fetch(`${base}/api/admin/catequistas?q=${encodeURIComponent(datos.numero)}`, { headers: { cookie: admin } }).then((r) => r.json());
    await pedir(base, '/api/admin/aprobar', { id: lista.items[0].id }, admin);
  }
};
