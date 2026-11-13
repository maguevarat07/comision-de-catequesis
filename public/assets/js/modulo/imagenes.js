// Procesamiento de imágenes en el navegador: así cada envío queda muy por debajo del
// límite de 4,5 MB por petición de Vercel.
//  - Foto: recorte cuadrado 600×600, JPEG calidad 0,85.
//  - Comprobante: lado mayor ≤ 1600 px, JPEG calidad 0,85.

export const MAX_ARCHIVO_ORIGEN = 15 * 1024 * 1024; // 15 MB antes de comprimir

/** Decodifica un archivo de imagen respetando la orientación EXIF. */
export async function decodificar(archivo) {
  if (!archivo || !/^image\//.test(archivo.type || 'image/')) throw new Error('El archivo debe ser una imagen (JPG, PNG o similar).');
  if (archivo.size > MAX_ARCHIVO_ORIGEN) throw new Error('La imagen es demasiado grande (máximo 15 MB).');
  try {
    if ('createImageBitmap' in window) return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    // Algunos navegadores no aceptan opciones: se intenta con <img>.
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con una foto en formato JPG o PNG.');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const anchoDe = (img) => img.width || img.naturalWidth;
const altoDe = (img) => img.height || img.naturalHeight;

/** Reduce la imagen para que su lado mayor no supere `maxLado` y la exporta como JPEG. */
export async function reducir(archivo, maxLado = 1600, calidad = 0.85) {
  const img = await decodificar(archivo);
  const w = anchoDe(img), h = altoDe(img);
  const k = Math.min(1, maxLado / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', calidad);
}

export function bytesDeDataUrl(dataUrl) {
  const b64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function tamañoDataUrl(dataUrl) {
  const b64 = String(dataUrl).split(',')[1] || '';
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

/** SHA-256 en hexadecimal del archivo final (el que se sube). El servidor lo vuelve a calcular. */
export async function sha256Hex(dataUrl) {
  const hash = await crypto.subtle.digest('SHA-256', bytesDeDataUrl(dataUrl));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Recortador cuadrado táctil: arrastrar para mover, deslizador o pellizco para el zoom.
 * El lienzo visible usa la resolución del dispositivo; la exportación es independiente.
 */
export class Recortador {
  constructor(contenedor, { alCambiar } = {}) {
    this.cont = contenedor;
    this.lienzo = contenedor.querySelector('canvas');
    this.ctx = this.lienzo.getContext('2d');
    this.img = null;
    this.zoom = 1; // 1 = la imagen cubre el cuadro
    this.cx = 0.5; // centro visible, en fracción de la imagen
    this.cy = 0.5;
    this.alCambiar = alCambiar || (() => {});
    this.punteros = new Map();
    this._enlazar();
    new ResizeObserver(() => this.dibujar()).observe(contenedor);
  }

  async cargar(archivo) {
    this.img = await decodificar(archivo);
    this.zoom = 1;
    this.cx = this.cy = 0.5;
    this.dibujar();
    this.alCambiar();
  }

  get cargado() {
    return !!this.img;
  }

  setZoom(z) {
    this.zoom = Math.min(4, Math.max(1, z));
    this._limitar();
    this.dibujar();
  }

  /** Lado de la ventana de recorte, en píxeles de la imagen original. */
  _ladoFuente() {
    return Math.min(anchoDe(this.img), altoDe(this.img)) / this.zoom;
  }

  _limitar() {
    if (!this.img) return;
    const w = anchoDe(this.img), h = altoDe(this.img), l = this._ladoFuente();
    const mx = l / 2 / w, my = l / 2 / h;
    this.cx = Math.min(1 - mx, Math.max(mx, this.cx));
    this.cy = Math.min(1 - my, Math.max(my, this.cy));
  }

  _pintar(ctx, lado) {
    const w = anchoDe(this.img), h = altoDe(this.img), l = this._ladoFuente();
    const sx = this.cx * w - l / 2, sy = this.cy * h - l / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.img, sx, sy, l, l, 0, 0, lado, lado);
  }

  dibujar() {
    const r = this.cont.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const lado = Math.max(1, Math.round(r.width * dpr));
    if (this.lienzo.width !== lado) this.lienzo.width = this.lienzo.height = lado;
    this.ctx.clearRect(0, 0, lado, lado);
    if (this.img) this._pintar(this.ctx, lado);
  }

  exportar(lado = 600, calidad = 0.85) {
    if (!this.img) return null;
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lado, lado);
    this._pintar(ctx, lado);
    return c.toDataURL('image/jpeg', calidad);
  }

  _enlazar() {
    const el = this.cont;
    let distInicial = 0, zoomInicial = 1;
    el.addEventListener('pointerdown', (e) => {
      if (!this.img) return;
      el.setPointerCapture(e.pointerId);
      this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.punteros.size === 2) {
        const [a, b] = [...this.punteros.values()];
        distInicial = Math.hypot(a.x - b.x, a.y - b.y);
        zoomInicial = this.zoom;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = this.punteros.get(e.pointerId);
      if (!prev || !this.img) return;
      const act = { x: e.clientX, y: e.clientY };
      this.punteros.set(e.pointerId, act);
      if (this.punteros.size === 2) {
        const [a, b] = [...this.punteros.values()];
        if (distInicial) this.setZoom(zoomInicial * (Math.hypot(a.x - b.x, a.y - b.y) / distInicial));
        this.alCambiar();
        return;
      }
      const ancho = el.getBoundingClientRect().width;
      const k = this._ladoFuente() / ancho; // píxeles de imagen por píxel de pantalla
      this.cx -= ((act.x - prev.x) * k) / anchoDe(this.img);
      this.cy -= ((act.y - prev.y) * k) / altoDe(this.img);
      this._limitar();
      this.dibujar();
    });
    const fin = (e) => {
      this.punteros.delete(e.pointerId);
      if (this.punteros.size < 2) distInicial = 0;
    };
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
    el.addEventListener('wheel', (e) => {
      if (!this.img) return;
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
      this.alCambiar();
    }, { passive: false });
    // Teclado: flechas mueven, +/- hacen zoom.
    el.tabIndex = 0;
    el.addEventListener('keydown', (e) => {
      if (!this.img) return;
      const paso = 0.02 / this.zoom;
      const mapa = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
      if (mapa[e.key]) {
        e.preventDefault();
        this.cx += mapa[e.key][0];
        this.cy += mapa[e.key][1];
        this._limitar();
        this.dibujar();
      } else if (e.key === '+' || e.key === '=') {
        this.setZoom(this.zoom * 1.1);
        this.alCambiar();
      } else if (e.key === '-') {
        this.setZoom(this.zoom / 1.1);
        this.alCambiar();
      }
    });
  }
}
