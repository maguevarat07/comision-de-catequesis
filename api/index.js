// Función única de Vercel: todas las rutas /api/* llegan aquí (ver "rewrites" en vercel.json)
// y las resuelve el enrutador interno de api/_lib/app.js. Una sola función por el límite
// de 12 funciones del plan Hobby.
'use strict';

const { config, cuentaServicio } = require('./_lib/config.js');
const { crearCuentaServicio, verificarIdToken } = require('./_lib/google.js');
const { crearEscritor } = require('./_lib/escritor.js');
const { crearApi } = require('./_lib/app.js');

function construir() {
  const env = config();
  let sa = null;
  try {
    sa = crearCuentaServicio(cuentaServicio());
  } catch (e) {
    console.error('[api] cuenta de servicio:', e.message);
  }
  return crearApi({
    modo: 'google',
    env,
    cookiesSeguras: !!process.env.VERCEL || /^https:/.test(env.urlSitio),
    leer: async (pestanas) => {
      if (!sa || !env.sheetId) throw new Error('Faltan la cuenta de servicio o GOOGLE_SHEET_ID');
      return sa.leerPestanas(env.sheetId, pestanas);
    },
    descargar: async (id) => (sa ? sa.descargar(id) : null),
    escritor: crearEscritor({ url: env.escritorUrl, secreto: env.escritorSecreto, urlSitio: env.urlSitio }),
    verificarGoogle: (credencial) => verificarIdToken(credencial, env.googleClientId),
  });
}

let manejar = null;
module.exports = (req, res) => (manejar || (manejar = construir()))(req, res);
module.exports.construir = construir;
