// Documentos PDF del módulo: ficha de inscripción (carta), carnet CR80 horizontal y pase de la Semana.
// pdf-lib con fuentes estándar (WinAnsi: cubre los acentos y la ñ). El QR se dibuja como vector.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const MM = 72 / 25.4;
const CR80 = { w: 85.6 * MM, h: 53.98 * MM };
const NAVY = rgb(0x0e / 255, 0x1b / 255, 0x3d / 255);
const GOLD = rgb(0xf0 / 255, 0xb5 / 255, 0x44 / 255);
const GOLD_INK = rgb(0x7f / 255, 0x56 / 255, 0);
const MUTED = rgb(0x44 / 255, 0x50 / 255, 0x6b / 255);
const LINE = rgb(0xd6 / 255, 0xdd / 255, 0xec / 255);
const BLANCO = rgb(1, 1, 1);

let logoBytes = null;
function logo() {
  if (!logoBytes) logoBytes = fs.readFileSync(path.join(__dirname, '..', '_assets', 'logo.png'));
  return logoBytes;
}

// WinAnsi: deja Latin-1 y la puntuación tipográfica habitual; lo demás se aproxima o se quita.
const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function txt(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[\r\n\t]+/g, ' ')
    .split('')
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.includes(ch)) return ch;
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return /^[\x20-\x7e]$/.test(base) ? base : '';
    })
    .join('')
    .trim();
}

const fechaCorta = (iso) => {
  const s = String(iso || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  // en-CA da AAAA-MM-DD en la zona de Panamá; es-PA usaría MM/DD.
  return fechaCorta(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d));
};

/** Corta un texto en líneas que caben en `ancho`. Si hay más de `max`, termina con "…". */
function lineas(fuente, texto, tam, ancho, max = 99) {
  const palabras = txt(texto).split(/\s+/).filter(Boolean);
  const out = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) { actual = prueba; continue; }
    if (actual) out.push(actual);
    actual = p;
    while (fuente.widthOfTextAtSize(actual, tam) > ancho && actual.length > 1) {
      let corte = actual.length - 1;
      while (corte > 1 && fuente.widthOfTextAtSize(actual.slice(0, corte), tam) > ancho) corte--;
      out.push(actual.slice(0, corte));
      actual = actual.slice(corte);
    }
  }
  if (actual) out.push(actual);
  if (out.length > max) {
    const resto = out.slice(0, max);
    let ultima = resto[max - 1];
    while (ultima.length > 1 && fuente.widthOfTextAtSize(ultima + '…', tam) > ancho) ultima = ultima.slice(0, -1);
    resto[max - 1] = ultima + '…';
    return resto;
  }
  return out;
}

/** Tamaño de letra mayor (entre min y max) con el que el texto cabe en `maxLineas` líneas. */
function ajustar(fuente, texto, ancho, maxTam, minTam, maxLineas) {
  for (let t = maxTam; t >= minTam; t -= 0.5) {
    const l = lineas(fuente, texto, t, ancho);
    if (l.length <= maxLineas) return { tam: t, lineas: l };
  }
  return { tam: minTam, lineas: lineas(fuente, texto, minTam, ancho, maxLineas) };
}

function dibujarQr(pagina, texto, x, y, lado, color = NAVY) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const margen = 2;
  const m = lado / (n + margen * 2);
  pagina.drawRectangle({ x, y, width: lado, height: lado, color: BLANCO });
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(f, c)) pagina.drawRectangle({ x: x + (c + margen) * m, y: y + lado - (f + 1 + margen) * m, width: m + 0.01, height: m + 0.01, color });
    }
  }
}

async function incrustar(doc, img) {
  if (!img || !img.bytes || !img.bytes.length) return null;
  try {
    return img.mime === 'image/png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  } catch {
    return null; // imagen dañada: el documento se genera igual, sin ella
  }
}

function imagenCentrada(pagina, imagen, x, y, w, h) {
  const k = Math.min(w / imagen.width, h / imagen.height);
  const iw = imagen.width * k;
  const ih = imagen.height * k;
  pagina.drawImage(imagen, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
}

async function base(titulo) {
  const doc = await PDFDocument.create();
  doc.setTitle(txt(titulo));
  doc.setAuthor('Comisión Arquidiocesana de Catequesis · Arquidiócesis de Panamá');
  doc.setCreator('Registro de catequistas');
  doc.setProducer('Registro de catequistas');
  const fuentes = { normal: await doc.embedFont(StandardFonts.Helvetica), negrita: await doc.embedFont(StandardFonts.HelveticaBold) };
  const imgLogo = await doc.embedPng(logo());
  return { doc, f: fuentes, imgLogo };
}

function encabezadoCarta(pagina, { f, imgLogo }, titulo, subtitulo) {
  const { width, height } = pagina.getSize();
  pagina.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: NAVY });
  pagina.drawRectangle({ x: 0, y: height - 100, width, height: 4, color: GOLD });
  pagina.drawImage(imgLogo, { x: 40, y: height - 86, width: 76, height: 76 });
  pagina.drawText(txt('COMISIÓN ARQUIDIOCESANA DE CATEQUESIS'), { x: 132, y: height - 40, size: 9, font: f.negrita, color: GOLD });
  pagina.drawText(txt(titulo), { x: 132, y: height - 62, size: 19, font: f.negrita, color: BLANCO });
  if (subtitulo) pagina.drawText(txt(subtitulo), { x: 132, y: height - 80, size: 10, font: f.normal, color: BLANCO });
}

function pieCarta(pagina, { f }, texto) {
  const { width } = pagina.getSize();
  pagina.drawLine({ start: { x: 40, y: 48 }, end: { x: width - 40, y: 48 }, thickness: 0.5, color: LINE });
  lineas(f.normal, texto, 7.5, width - 80, 3).forEach((l, i) => pagina.drawText(l, { x: 40, y: 36 - i * 10, size: 7.5, font: f.normal, color: MUTED }));
}

const nombreDe = (c) => `${c.nombres || ''} ${c.apellidos || ''}`.trim();

/** Ficha de inscripción en tamaño carta. */
async function fichaInscripcion(c, { foto, firma, moneda = 'B/.', costo = '', urlVerificacion = '' }) {
  const ctx = await base(`Ficha de inscripción ${c.numero_catequista}`);
  const { doc, f } = ctx;
  const p = doc.addPage([612, 792]);
  encabezadoCarta(p, ctx, 'Ficha de inscripción de catequista', `Número ${c.numero_catequista} · Registrado el ${fechaCorta(c.fecha_registro)}`);

  const imgFoto = await incrustar(doc, foto);
  const fx = 612 - 40 - 120;
  const fy = 792 - 130 - 150;
  p.drawRectangle({ x: fx, y: fy, width: 120, height: 150, borderColor: LINE, borderWidth: 1, color: BLANCO });
  if (imgFoto) imagenCentrada(p, imgFoto, fx + 4, fy + 4, 112, 142);

  let y = 792 - 140;
  const seccion = (titulo) => {
    y -= 8;
    p.drawText(txt(titulo).toUpperCase(), { x: 40, y, size: 8.5, font: f.negrita, color: GOLD_INK });
    y -= 6;
    p.drawLine({ start: { x: 40, y }, end: { x: y > fy ? fx - 16 : 572, y }, thickness: 0.6, color: LINE });
    y -= 14;
  };
  const campo = (etiqueta, valor) => {
    const anchoValor = (y > fy - 10 ? fx - 16 : 572) - 190;
    const ls = lineas(f.normal, valor || '—', 10, anchoValor, 3);
    p.drawText(txt(etiqueta), { x: 40, y, size: 8.5, font: f.negrita, color: MUTED });
    ls.forEach((l, i) => p.drawText(l, { x: 190, y: y - i * 13, size: 10, font: f.normal, color: NAVY }));
    y -= Math.max(1, ls.length) * 13 + 5;
  };

  seccion('Datos personales');
  campo('Nombres', c.nombres);
  campo('Apellidos', c.apellidos);
  campo('Cédula', c.cedula);
  campo('Fecha de nacimiento', fechaCorta(c.fecha_nacimiento));
  campo('Sexo', c.sexo);
  campo('Teléfono', c.telefono);
  campo('Correo', c.correo);
  campo('Dirección', c.direccion);
  seccion('Servicio catequético');
  campo('Parroquia', c.parroquia);
  campo('Vicaría', c.vicaria_zona);
  if (c.zona_pastoral) campo('Zona pastoral', c.zona_pastoral);
  campo('Años de servicio', String(c.anios_servicio ?? ''));
  campo('Nivel que imparte', c.nivel_que_imparte);
  campo('Formación CENAFCA', c.formacion_cenafca);
  campo('Coordinador parroquial', c.coordinador_parroquial);
  seccion('Pago y consentimientos');
  campo('Pago de registro', `${moneda} ${Number(costo || 0).toFixed(2)} por Yappy · referencia ${c.yappy_referencia}`);
  campo('Tratamiento de datos', `Aceptado el ${fechaCorta(c.consentimiento_datos || c.fecha_registro)}`);
  campo('Uso de la fotografía', `Aceptado el ${fechaCorta(c.consentimiento_imagen || c.fecha_registro)}`);
  campo('Vigencia del carnet', `Hasta el ${fechaCorta(c.vigencia_hasta)}`);

  const imgFirma = await incrustar(doc, firma);
  const yFirma = Math.min(y - 10, 150);
  if (imgFirma) imagenCentrada(p, imgFirma, 40, yFirma, 220, 64);
  p.drawLine({ start: { x: 40, y: yFirma - 4 }, end: { x: 260, y: yFirma - 4 }, thickness: 0.8, color: NAVY });
  p.drawText(txt(`Firma de ${nombreDe(c)}`), { x: 40, y: yFirma - 16, size: 8.5, font: f.normal, color: MUTED });
  if (urlVerificacion) {
    dibujarQr(p, urlVerificacion, 612 - 40 - 84, yFirma - 20, 84);
    p.drawText(txt('Verificar carnet'), { x: 612 - 40 - 84 + 12, y: yFirma - 30, size: 7.5, font: f.normal, color: MUTED });
  }
  pieCarta(p, ctx, `Documento generado el ${fechaCorta(new Date().toISOString())}. Los datos personales se tratan según la Ley 81 de 2019 de protección de datos personales de la República de Panamá y el aviso de privacidad del sitio.`);
  return Buffer.from(await doc.save());
}

/** Carnet en tamaño CR80 (85,6 × 54 mm), horizontal, con anverso y reverso. */
async function carnet(c, { foto, firma, urlVerificacion }) {
  const ctx = await base(`Carnet ${c.numero_catequista}`);
  const { doc, f, imgLogo } = ctx;
  const W = CR80.w;
  const H = CR80.h;
  const m = 2.6 * MM;

  // Anverso
  const p = doc.addPage([W, H]);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BLANCO });
  const banda = 11 * MM;
  p.drawRectangle({ x: 0, y: H - banda, width: W, height: banda, color: NAVY });
  p.drawRectangle({ x: 0, y: H - banda - 1.2, width: W, height: 1.2, color: GOLD });
  const lado = banda - 2.4 * MM;
  p.drawImage(imgLogo, { x: m, y: H - banda + 1.2 * MM, width: lado, height: lado });
  p.drawText(txt('COMISIÓN ARQUIDIOCESANA DE CATEQUESIS'), { x: m + lado + 2 * MM, y: H - 4.6 * MM, size: 5.2, font: f.negrita, color: GOLD });
  p.drawText(txt('Carnet de catequista'), { x: m + lado + 2 * MM, y: H - 8.6 * MM, size: 9.5, font: f.negrita, color: BLANCO });

  const fotoW = 21 * MM;
  const fotoH = 21 * MM;
  const fotoY = H - banda - 2.2 * MM - fotoH;
  p.drawRectangle({ x: m, y: fotoY, width: fotoW, height: fotoH, color: rgb(0.95, 0.95, 0.97), borderColor: LINE, borderWidth: 0.5 });
  const imgFoto = await incrustar(doc, foto);
  if (imgFoto) imagenCentrada(p, imgFoto, m, fotoY, fotoW, fotoH);

  const imgFirma = await incrustar(doc, firma);
  const firmaY = 4.6 * MM;
  if (imgFirma) imagenCentrada(p, imgFirma, m, firmaY + 0.4 * MM, fotoW, fotoY - firmaY - 1.4 * MM);
  p.drawLine({ start: { x: m, y: firmaY }, end: { x: m + fotoW, y: firmaY }, thickness: 0.4, color: MUTED });
  p.drawText('Firma', { x: m, y: firmaY - 2.4 * MM, size: 4.5, font: f.normal, color: MUTED });

  const qrLado = 19 * MM;
  const qrX = W - m - qrLado;
  const qrY = 2.4 * MM;
  dibujarQr(p, urlVerificacion, qrX, qrY, qrLado);

  const tx = m + fotoW + 2.6 * MM;
  const anchoTexto = W - tx - m;
  let y = H - banda - 5 * MM;
  const nombre = ajustar(f.negrita, nombreDe(c), anchoTexto, 9.5, 6.5, 2);
  nombre.lineas.forEach((l) => { p.drawText(l, { x: tx, y, size: nombre.tam, font: f.negrita, color: NAVY }); y -= nombre.tam + 1.2; });
  y -= 1.6;
  p.drawText(txt(c.numero_catequista), { x: tx, y: y - 3, size: 12.5, font: f.negrita, color: GOLD_INK });
  y -= 9.5;
  const anchoBajoQr = qrX - tx - 2 * MM;
  const linea = (texto, tam, fuente = f.normal, maxL = 1, ancho = anchoBajoQr) => {
    lineas(fuente, texto, tam, ancho, maxL).forEach((l) => { p.drawText(l, { x: tx, y, size: tam, font: fuente, color: NAVY }); y -= tam + 1.4; });
  };
  y -= 1.5;
  linea(c.parroquia, 6.2, f.negrita, 2);
  linea(c.vicaria_zona, 5.4, f.normal, 2);
  y = qrY + 3.2 * MM;
  p.drawText(txt('VIGENTE HASTA'), { x: tx, y: y + 6.2, size: 4.6, font: f.negrita, color: MUTED });
  p.drawText(txt(fechaCorta(c.vigencia_hasta)), { x: tx, y: y - 1, size: 7.5, font: f.negrita, color: NAVY });
  p.drawRectangle({ x: 0, y: 0, width: W, height: 1.2 * MM, color: GOLD });

  // Reverso
  const r = doc.addPage([W, H]);
  r.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });
  r.drawRectangle({ x: 0, y: 0, width: W, height: 1.2 * MM, color: GOLD });
  r.drawImage(imgLogo, { x: W / 2 - 8 * MM, y: H - 19 * MM, width: 16 * MM, height: 16 * MM });
  let ry = H - 23.5 * MM;
  const parrafo = (texto, tam, fuente, color) => {
    lineas(fuente, texto, tam, W - 2 * m - 6 * MM, 4).forEach((l) => {
      r.drawText(l, { x: (W - fuente.widthOfTextAtSize(l, tam)) / 2, y: ry, size: tam, font: fuente, color });
      ry -= tam + 1.8;
    });
  };
  parrafo('Arquidiócesis de Panamá', 7.5, f.negrita, GOLD);
  ry -= 1;
  parrafo('Este carnet identifica a su titular como catequista registrado(a) de la Comisión Arquidiocesana de Catequesis. Es personal e intransferible.', 5.6, f.normal, BLANCO);
  ry -= 1;
  parrafo('Para confirmar su validez, escanee el código QR del anverso.', 5.6, f.normal, BLANCO);
  return Buffer.from(await doc.save());
}

/** Pase de acceso a la Semana del Catequista (carta, para imprimir o mostrar en el celular). */
async function pase(s, c, semana, urlVerificacion) {
  const ctx = await base(`Pase ${s.numero_inscripcion_semana}`);
  const { doc, f } = ctx;
  const p = doc.addPage([612, 792]);
  encabezadoCarta(p, ctx, `Semana del Catequista ${s.edicion}`, 'Pase de acceso');
  const lado = 250;
  const qy = 792 - 130 - lado;
  dibujarQr(p, urlVerificacion, (612 - lado) / 2, qy, lado);
  let y = qy - 34;
  const centro = (texto, tam, fuente, color = NAVY) => {
    lineas(fuente, texto, tam, 500, 2).forEach((l) => { p.drawText(l, { x: (612 - fuente.widthOfTextAtSize(l, tam)) / 2, y, size: tam, font: fuente, color }); y -= tam + 6; });
  };
  centro(nombreDe(c), 22, f.negrita);
  centro(`${c.numero_catequista} · Inscripción ${s.numero_inscripcion_semana}`, 12, f.normal, MUTED);
  y -= 6;
  centro(c.parroquia, 11, f.normal);
  y -= 14;
  const filas = [['Fechas', semana.fechas], ['Sede', semana.sede]];
  if (s.talla_camiseta) filas.push(['Talla de camiseta', s.talla_camiseta]);
  const caja = 612 - 160;
  const alto = filas.length * 22 + 18;
  p.drawRectangle({ x: 80, y: y - alto + 12, width: caja, height: alto, borderColor: LINE, borderWidth: 1 });
  y -= 8;
  for (const [k, v] of filas) {
    p.drawText(txt(k), { x: 100, y, size: 9, font: f.negrita, color: MUTED });
    p.drawText(lineas(f.normal, v || 'Por confirmar', 11, caja - 170, 1)[0] || '', { x: 230, y, size: 11, font: f.normal, color: NAVY });
    y -= 22;
  }
  pieCarta(p, ctx, 'Presenta este pase, impreso o en tu celular, en la entrada. Es personal e intransferible y se valida al escanear el código QR.');
  return Buffer.from(await doc.save());
}

/** PNG del QR (para el correo de la Semana y la carpeta 07_QR de Drive). */
function qrPng(texto) {
  return QRCode.toBuffer(texto, { errorCorrectionLevel: 'M', margin: 2, width: 440, color: { dark: '#0E1B3D', light: '#FFFFFF' } });
}

module.exports = { fichaInscripcion, carnet, pase, qrPng, txt };
