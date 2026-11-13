// Cliente del escritor de Apps Script (apps-script/Code.gs). Firma cada solicitud con
// HMAC-SHA256 sobre el cuerpo, que incluye marca de tiempo y nonce.
'use strict';

const crypto = require('node:crypto');

/** Sobre firmado tal como lo espera doPost(). */
function sobreFirmado(secreto, accion, datos, { idem = '', urlSitio = '' } = {}) {
  // Solo ASCII (acentos escapados como á): el HMAC coincide sin depender del juego de caracteres de Apps Script.
  const body = JSON.stringify({ ts: Date.now(), nonce: crypto.randomUUID(), accion, datos, idem, urlSitio })
    .replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const signature = crypto.createHmac('sha256', secreto).update(body).digest('base64');
  return JSON.stringify({ body, signature });
}

/**
 * Escritor por HTTP. `enviar(sobre)` permite sustituir el transporte (pruebas locales).
 * Devuelve siempre un objeto { ok, ... } o { ok: false, codigo, mensaje }.
 */
function crearEscritor({ url, secreto, urlSitio, enviar }) {
  const transporte = enviar || (async (sobre) => {
    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), 55000);
    try {
      // Apps Script responde con una redirección 302 a googleusercontent: fetch la sigue con GET.
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: sobre, redirect: 'follow', signal: ctl.signal });
      const texto = await r.text();
      try { return JSON.parse(texto); } catch { return { ok: false, codigo: 'ESCRITOR', mensaje: `Respuesta no válida del escritor (${r.status})` }; }
    } finally {
      clearTimeout(reloj);
    }
  });
  const disponible = !!(enviar || (url && secreto && secreto.length >= 32));

  return {
    disponible,
    async llamar(accion, datos, idem, urlSitioPeticion) {
      if (!disponible) return { ok: false, codigo: 'NO_DISPONIBLE', mensaje: 'El escritor de Apps Script no está configurado.' };
      try {
        return await transporte(sobreFirmado(secreto, accion, datos, { idem, urlSitio: urlSitioPeticion || urlSitio }));
      } catch (e) {
        return { ok: false, codigo: 'ESCRITOR', mensaje: e.name === 'AbortError' ? 'El escritor tardó demasiado en responder.' : String(e.message || e) };
      }
    },
  };
}

module.exports = { crearEscritor, sobreFirmado };
