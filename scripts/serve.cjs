// Servidor local de desarrollo: sirve public/ y enruta /api/* a la API.
//   npm run dev          → API simulada en memoria (scripts/api-simulada.cjs), sin Google.
//   npm run dev:emulado  → API real (api/) contra Google emulado en memoria: ejecuta el
//                          escritor apps-script/Code.gs en Node. No toca la hoja real.
//   npm run dev:real     → API real contra Google (.env.local): hoja, Drive y escritor reales.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../public');
const PUERTO = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};

const MODO = process.env.API_MODO || process.argv[2] || 'simulado';
let api;
let sembrar = null;
if (MODO === 'real') {
  const { construir } = require('../api/index.js');
  api = { manejar: construir() };
} else if (MODO === 'emulado') {
  const { crearGoogleEmulado } = require('./google-emulado.cjs');
  const { crearEscritor } = require('../api/_lib/escritor.js');
  const { crearApi } = require('../api/_lib/app.js');
  const crypto = require('node:crypto');
  const google = crearGoogleEmulado();
  const env = { sesionSecreto: crypto.randomBytes(32).toString('hex'), qrSecreto: crypto.randomBytes(32).toString('hex'), urlSitio: '', googleClientId: '' };
  api = { manejar: crearApi({ modo: 'simulado', env, leer: google.leer, descargar: google.descargar, escritor: crearEscritor({ secreto: google.secreto, enviar: google.enviar }), verificarGoogle: async () => { throw new Error('Sin Google en modo emulado'); } }) };
  api.google = google;
  if (process.env.SIM_SIN_DATOS !== '1') sembrar = () => require('./sembrar-emulado.cjs')(`http://127.0.0.1:${PUERTO}`);
} else {
  api = require('./api-simulada.cjs');
}
module.exports = { api };

// Cámara solo en las rutas que la usan (mismo criterio que vercel.json).
function permisos(pathname) {
  const camara = /^\/admin\/escanear\//.test(pathname);
  return `camera=${camara ? '(self)' : '()'}, microphone=(), geolocation=()`;
}

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (pathname.startsWith('/api/')) { api.manejar(req, res); return; }
  // /registro → /registro/ (como en Vercel con cleanUrls/trailingSlash)
  if (!path.extname(pathname) && !pathname.endsWith('/')) {
    const dir = path.resolve(root, '.' + pathname);
    if (dir.startsWith(root + path.sep) && fs.existsSync(path.join(dir, 'index.html'))) { res.writeHead(308, { location: pathname + '/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }).end(); return; }
  }
  const route = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado'); return; }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': permisos(pathname),
    });
    res.end(data);
  });
}).listen(PUERTO, '127.0.0.1', async () => {
  const textos = { simulado: 'API simulada en /api (datos en memoria)', emulado: 'API real con Google emulado (Code.gs en memoria)', real: 'API real contra Google (.env.local)' };
  console.log(`Local: http://localhost:${PUERTO}  ·  ${textos[MODO] || MODO}`);
  if (sembrar) {
    try { await sembrar(); console.log('Datos de ejemplo: prueba@ejemplo.com / CAT-00001 y jose@ejemplo.com / CAT-00002'); } catch (e) { console.error('No se pudieron sembrar los datos de ejemplo:', e.message); }
  }
});
