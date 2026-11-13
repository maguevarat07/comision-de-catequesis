// Prepara las variables de producción para pegarlas en Vercel (Settings → Environment Variables:
// pegar el contenido del archivo en el campo "Key" las importa todas a la vez).
//   npm run vercel:env -- <ruta de salida FUERA del repositorio>
// Toma los valores de .env.local y la clave privada del JSON de la cuenta de servicio.
// No imprime ningún valor: solo los nombres de las variables y las que faltan.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { config, cuentaServicio } = require('../api/_lib/config.js');

const RAIZ = path.resolve(__dirname, '..');
const URL_PRODUCCION = 'https://comision-de-catequesis.vercel.app';

const salida = process.argv[2];
if (!salida) {
  console.error('Uso: npm run vercel:env -- <ruta del archivo de salida, fuera del repositorio>');
  process.exit(1);
}
const destino = path.resolve(salida);
if (destino.startsWith(RAIZ + path.sep)) {
  console.error('El archivo contiene secretos: guárdalo fuera del repositorio.');
  process.exit(1);
}

const env = config();
const cuenta = cuentaServicio();
const variables = {
  GOOGLE_SHEET_ID: env.sheetId,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: cuenta.email,
  GOOGLE_PRIVATE_KEY: cuenta.clavePrivada.replace(/\r?\n/g, '\\n'),
  GOOGLE_CLIENT_ID: env.googleClientId,
  APPS_SCRIPT_WRITER_URL: env.escritorUrl,
  APPS_SCRIPT_WRITER_SECRET: env.escritorSecreto,
  SESSION_SECRET: env.sesionSecreto,
  QR_SECRET: env.qrSecreto,
  ADMIN_EMAILS: env.adminEmails.join(','),
  VERIFICADORES_EMAILS: env.verificadoresEmails.join(','),
  PUBLIC_SITE_URL: URL_PRODUCCION,
};

const lineas = Object.entries(variables).filter(([, v]) => v).map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`);
fs.writeFileSync(destino, lineas.join('\n') + '\n', { mode: 0o600 });
const faltan = Object.entries(variables).filter(([k, v]) => !v && k !== 'VERIFICADORES_EMAILS').map(([k]) => k);
console.log(`Escrito: ${destino}`);
console.log(`Incluye: ${Object.keys(variables).filter((k) => variables[k]).join(', ')}`);
if (faltan.length) console.log(`Faltan (complétalas en .env.local y vuelve a ejecutar): ${faltan.join(', ')}`);
