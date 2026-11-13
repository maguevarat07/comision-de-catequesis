// Acceso de solo lectura a Google con la cuenta de servicio (Sheets y Drive) y verificación
// de ID tokens de Google Identity Services. Sin dependencias: JWT firmado con node:crypto.
'use strict';

const crypto = require('node:crypto');

const ALCANCES = 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly';
const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function pedir(url, opciones = {}, intentos = 2) {
  for (let i = 0; ; i++) {
    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), opciones.timeout || 15000);
    try {
      const r = await fetch(url, { ...opciones, signal: ctl.signal });
      if (r.status >= 500 && i < intentos) continue;
      return r;
    } catch (e) {
      if (i >= intentos) throw e;
    } finally {
      clearTimeout(reloj);
    }
  }
}

function crearCuentaServicio(cuenta) {
  let token = null;
  let caduca = 0;

  async function tokenAcceso() {
    if (token && Date.now() < caduca - 60000) return token;
    const t = Math.floor(Date.now() / 1000);
    const cuerpo = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u({ iss: cuenta.email, scope: ALCANCES, aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 })}`;
    const firma = crypto.sign('RSA-SHA256', Buffer.from(cuerpo), cuenta.clavePrivada).toString('base64url');
    const r = await pedir('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cuerpo}.${firma}` }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(`Token de Google rechazado: ${d.error || r.status}`);
    token = d.access_token;
    caduca = Date.now() + (d.expires_in || 3600) * 1000;
    return token;
  }

  /** Lee varias pestañas completas en una sola llamada. Devuelve { pestaña: filas[][] }. */
  async function leerPestanas(sheetId, pestanas) {
    const qs = pestanas.map((p) => `ranges=${encodeURIComponent(`'${p}'`)}`).join('&');
    const r = await pedir(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, {
      headers: { authorization: `Bearer ${await tokenAcceso()}` },
    });
    const d = await r.json();
    if (!r.ok) throw new Error(`Sheets ${r.status}: ${d.error?.message || ''}`);
    const out = {};
    pestanas.forEach((p, i) => { out[p] = d.valueRanges[i].values || []; });
    return out;
  }

  /** Descarga un archivo de Drive. null si no existe o no es accesible. */
  async function descargar(fileId) {
    if (!fileId || !/^[\w-]{10,}$/.test(fileId)) return null;
    const auth = { authorization: `Bearer ${await tokenAcceso()}` };
    const meta = await pedir(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,trashed&supportsAllDrives=true`, { headers: auth });
    if (!meta.ok) return null;
    const m = await meta.json();
    if (m.trashed) return null;
    const r = await pedir(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: auth, timeout: 25000 });
    if (!r.ok) return null;
    return { mime: m.mimeType, nombre: m.name, bytes: Buffer.from(await r.arrayBuffer()) };
  }

  return { leerPestanas, descargar, tokenAcceso };
}

// ---------- ID tokens de Google Identity Services ----------

let claves = null;
let clavesCaducan = 0;
async function clavesGoogle() {
  if (claves && Date.now() < clavesCaducan) return claves;
  const r = await pedir('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('No se pudieron obtener las claves de Google');
  const d = await r.json();
  const edad = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  claves = Object.fromEntries(d.keys.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })]));
  clavesCaducan = Date.now() + (edad ? Number(edad[1]) * 1000 : 3600000);
  return claves;
}

/** Verifica firma, emisor, audiencia y caducidad. Devuelve el correo verificado o lanza un error. */
async function verificarIdToken(credencial, clientId) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID sin configurar');
  const partes = String(credencial || '').split('.');
  if (partes.length !== 3) throw new Error('Token mal formado');
  const cab = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'));
  const datos = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  if (cab.alg !== 'RS256') throw new Error('Algoritmo no permitido');
  const clave = (await clavesGoogle())[cab.kid];
  if (!clave) throw new Error('Clave desconocida');
  const valido = crypto.verify('RSA-SHA256', Buffer.from(`${partes[0]}.${partes[1]}`), clave, Buffer.from(partes[2], 'base64url'));
  if (!valido) throw new Error('Firma no válida');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(datos.iss)) throw new Error('Emisor no válido');
  if (datos.aud !== clientId) throw new Error('Audiencia no válida');
  const ahora = Date.now() / 1000;
  if (!(datos.exp > ahora - 30) || (datos.iat && datos.iat > ahora + 300)) throw new Error('Token caducado');
  if (!datos.email || datos.email_verified === false || datos.email_verified === 'false') throw new Error('Correo no verificado');
  return String(datos.email).toLowerCase();
}

module.exports = { crearCuentaServicio, verificarIdToken };
