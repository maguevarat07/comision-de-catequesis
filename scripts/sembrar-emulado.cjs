// Datos de ejemplo para el modo emulado: registra dos catequistas por la API real
// (mismo flujo que el formulario), así quedan con PDF, carnet y correo generados.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const img = (archivo, mime) => `data:${mime};base64,${fs.readFileSync(path.join(__dirname, '..', archivo)).toString('base64')}`;

module.exports = async function sembrar(base) {
  const foto = img('public/assets/images/comunidad.jpg', 'image/jpeg');
  const firma = img('api/_assets/logo.png', 'image/png');
  const ejemplos = [
    { nombres: 'María Fernanda', apellidos: 'Prueba Ríos', cedula: '8-123-4567', correo: 'prueba@ejemplo.com', parroquia: 'Parroquia San José', vicaria_zona: 'Vicaría Santa María la Antigua (Panamá Centro)' },
    { nombres: 'José Luis', apellidos: 'Ejemplo Castillo', cedula: '4-765-1234', correo: 'jose@ejemplo.com', parroquia: 'Parroquia Cristo Rey', vicaria_zona: 'Vicaría Cristo Redentor (San Miguelito)' },
  ];
  for (const [i, e] of ejemplos.entries()) {
    // Comprobante distinto en cada uno (el SHA-256 debe ser único).
    const comp = Buffer.concat([fs.readFileSync(path.join(__dirname, '..', 'api/_assets/logo.png')), Buffer.from(`ejemplo-${i}`)]);
    const r = await fetch(`${base}/api/registro`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cat-csrf': '1', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        datos: { ...e, fecha_nacimiento: '1985-04-12', sexo: 'Femenino', telefono: '60001234', direccion: 'Ciudad de Panamá', anios_servicio: 6, nivel_que_imparte: ['Primera Comunión'], formacion_cenafca: 'En curso', coordinador_parroquial: 'Hna. Ejemplo', yappy_referencia: `EJEMPLO${i + 1}`, consentimiento_datos: true, consentimiento_imagen: true },
        foto, firma, comprobante: `data:image/png;base64,${comp.toString('base64')}`,
      }),
    });
    if (!r.ok) throw new Error(`${e.correo}: ${r.status} ${await r.text()}`);
  }
};
