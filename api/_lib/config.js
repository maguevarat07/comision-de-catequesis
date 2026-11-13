// Carga de configuración del backend.
//
// Orden de carga:
//   1. Variables ya presentes en process.env (Vercel, o exportadas en la terminal).
//   2. .env.local en la raíz del proyecto, solo en local (no sobrescribe lo anterior).
//
// Credenciales de la cuenta de servicio:
//   - Producción (Vercel): GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.
//   - Local: GOOGLE_SERVICE_ACCOUNT_FILE con la ruta al JSON descargado de Google Cloud,
//     guardado FUERA del repositorio. La clave se lee del archivo en memoria y nunca se
//     copia a disco ni se imprime.
// Si están las dos variantes, mandan GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
let cargado = false;

function cargarEnvLocal() {
  if (cargado) return;
  cargado = true;
  if (process.env.VERCEL) return;
  const archivo = path.join(RAIZ, '.env.local');
  if (fs.existsSync(archivo)) process.loadEnvFile(archivo);
}

function leerArchivoCuenta(ruta) {
  const absoluta = path.resolve(RAIZ, ruta);
  if (absoluta.startsWith(RAIZ + path.sep)) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE apunta dentro del repositorio; guarda el JSON fuera de él.');
  }
  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(absoluta, 'utf8'));
  } catch (e) {
    throw new Error(`No se pudo leer GOOGLE_SERVICE_ACCOUNT_FILE (${absoluta}): ${e.code || 'JSON inválido'}`);
  }
  if (datos.type !== 'service_account' || !datos.client_email || !datos.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE no es una clave JSON de cuenta de servicio.');
  }
  return { email: datos.client_email, clavePrivada: datos.private_key, proyecto: datos.project_id || '' };
}

/** Credenciales de la cuenta de servicio (lectura de Sheets y Drive). */
function cuentaServicio() {
  cargarEnvLocal();
  const env = process.env;
  const email = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const clave = env.GOOGLE_PRIVATE_KEY ? env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '';

  if (email && clave) return { email, clavePrivada: clave, proyecto: '', origen: 'variables' };

  if (env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const cuenta = leerArchivoCuenta(env.GOOGLE_SERVICE_ACCOUNT_FILE);
    if (email && email !== cuenta.email) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_EMAIL (${email}) no coincide con el archivo (${cuenta.email}).`);
    }
    return { ...cuenta, origen: 'archivo' };
  }
  throw new Error('Faltan credenciales: define GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY, o GOOGLE_SERVICE_ACCOUNT_FILE en local.');
}

/** Configuración general (sin secretos de la cuenta de servicio). */
function config() {
  cargarEnvLocal();
  const env = process.env;
  const lista = (v) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    sheetId: env.GOOGLE_SHEET_ID || '',
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    escritorUrl: env.APPS_SCRIPT_WRITER_URL || '',
    escritorSecreto: env.APPS_SCRIPT_WRITER_SECRET || '',
    sesionSecreto: env.SESSION_SECRET || '',
    qrSecreto: env.QR_SECRET || '',
    adminEmails: lista(env.ADMIN_EMAILS),
    verificadoresEmails: lista(env.VERIFICADORES_EMAILS),
    urlSitio: env.PUBLIC_SITE_URL || '',
  };
}

module.exports = { config, cuentaServicio, cargarEnvLocal };
