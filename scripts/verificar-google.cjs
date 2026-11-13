// Comprueba que la cuenta de servicio puede leer la hoja (GOOGLE_SHEET_ID).
//   npm run google:verificar
// Sin dependencias: firma el JWT con node:crypto y llama a la API de Sheets.
// No imprime la clave privada ni el token.
'use strict';

const crypto = require('node:crypto');
const { config, cuentaServicio } = require('../api/_lib/config.js');

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function tokenAcceso({ email, clavePrivada }) {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 600,
  })}`;
  const firma = crypto.sign('RSA-SHA256', Buffer.from(cuerpo), clavePrivada).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cuerpo}.${firma}` }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Google rechazó la cuenta de servicio: ${d.error || r.status} ${d.error_description || ''}`);
  return d.access_token;
}

(async () => {
  const cuenta = cuentaServicio();
  const { sheetId } = config();
  console.log(`Cuenta de servicio: ${cuenta.email} (desde ${cuenta.origen})`);
  if (!sheetId) throw new Error('Falta GOOGLE_SHEET_ID.');
  const token = await tokenAcceso(cuenta);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  if (!r.ok) {
    const pista = r.status === 403 ? ' (¿API de Sheets activada en el proyecto y hoja compartida con la cuenta?)' : r.status === 404 ? ' (revisa GOOGLE_SHEET_ID)' : '';
    throw new Error(`Sheets respondió ${r.status}: ${d.error?.message || ''}${pista}`);
  }
  console.log(`Hoja: "${d.properties.title}"`);
  console.log(`Pestañas: ${d.sheets.map((s) => s.properties.title).join(', ')}`);
  console.log('OK: la cuenta de servicio lee la hoja.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
