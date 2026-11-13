import { $, aviso, cargarConfig, marcarModo } from './comun.js';
import { sesionStaff, pedirAcceso, salirStaff } from './staff.js';
import { verificar, pintarResultado, leerCodigo } from './verificacion.js';

let flujo = null;
let detector = null;
let pausado = false;
let ultimo = { texto: '', t: 0 };
const lienzo = document.createElement('canvas');
const ctx = lienzo.getContext('2d', { willReadFrequently: true });

cargarConfig().then(marcarModo).catch(() => {});

(async function iniciar() {
  let s;
  try { s = await sesionStaff(); } catch (e) { aviso($('#estado-global'), 'error', e.message); return; }
  if (!s) {
    $('#vista-acceso').hidden = false;
    s = await pedirAcceso($('#vista-acceso'), { titulo: 'Control de acceso', texto: 'Entra con tu cuenta de Google autorizada para verificar pases.' });
    $('#vista-acceso').hidden = true;
  }
  $('#nav-admin').hidden = false;
  $('#nav-panel').hidden = s.rol !== 'admin';
  $('#usuario').textContent = s.email;
  $('#vista-escaner').hidden = false;
  if ('BarcodeDetector' in window) {
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      if (formatos.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch { detector = null; }
  }
})();

$('#btn-salir').addEventListener('click', async () => { detener(); await salirStaff(); location.reload(); });

async function activarCamara() {
  aviso($('#camara-aviso'), 'info', null);
  if (!navigator.mediaDevices?.getUserMedia) {
    aviso($('#camara-aviso'), 'error', 'Este navegador no permite usar la cámara. Usa la opción de escribir el código o abre la página en Chrome o Safari actualizados.');
    return;
  }
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const v = $('#video');
    v.srcObject = flujo;
    await v.play();
    $('#btn-camara').hidden = true;
    pausado = false;
    requestAnimationFrame(bucle);
  } catch (e) {
    const msg = e && e.name === 'NotAllowedError'
      ? 'Permiso de cámara denegado. Actívalo en la configuración del navegador para este sitio.'
      : 'No se pudo abrir la cámara. Verifica que ninguna otra aplicación la esté usando.';
    aviso($('#camara-aviso'), 'error', msg);
  }
}
$('#btn-camara').addEventListener('click', activarCamara);

function detener() {
  flujo?.getTracks().forEach((t) => t.stop());
  flujo = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { detener(); $('#btn-camara').hidden = false; }
});

let ultimoCuadro = 0;
async function bucle(ts) {
  if (!flujo) return;
  if (!pausado && ts - ultimoCuadro > 180) {
    ultimoCuadro = ts;
    const texto = await leerCuadro();
    if (texto) await procesar(texto);
  }
  requestAnimationFrame(bucle);
}

async function leerCuadro() {
  const v = $('#video');
  if (v.readyState < 2) return null;
  if (detector) {
    try {
      const r = await detector.detect(v);
      return r[0]?.rawValue || null;
    } catch { detector = null; }
  }
  if (typeof window.jsQR !== 'function') return null;
  const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
  lienzo.width = Math.round(v.videoWidth * k);
  lienzo.height = Math.round(v.videoHeight * k);
  ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
  const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  return window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

async function procesar(texto) {
  const ahora = Date.now();
  if (texto === ultimo.texto && ahora - ultimo.t < 4000) return;
  ultimo = { texto, t: ahora };
  const codigo = leerCodigo(texto);
  const res = $('#resultado');
  res.hidden = false;
  if (!codigo) {
    res.innerHTML = '<div class="m-aviso m-aviso--error"><p>El código no pertenece a la Comisión de Catequesis.</p></div>';
    return;
  }
  pausado = true;
  $('#btn-siguiente').hidden = false;
  if (navigator.vibrate) navigator.vibrate(40);
  res.innerHTML = '<p class="m-help">Verificando…</p>';
  try {
    const r = await verificar(codigo);
    pintarResultado(res, r, codigo.t);
    res.querySelector('#btn-entrada')?.focus();
  } catch (e) {
    res.innerHTML = '<div></div>';
    aviso(res.firstElementChild, 'error', e.message);
  }
  res.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

$('#btn-siguiente').addEventListener('click', () => {
  pausado = false;
  ultimo = { texto: '', t: 0 };
  $('#resultado').hidden = true;
  $('#btn-siguiente').hidden = true;
  $('#camara-caja').scrollIntoView({ block: 'start', behavior: 'smooth' });
});

$('#form-manual').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#codigo').value.trim();
  if (t) { ultimo = { texto: '', t: 0 }; procesar(t); }
});
