// Sesión del personal (administradores y verificadores).
// Modo real: Google Identity Services; el servidor verifica el ID token y la lista ADMIN_EMAILS / VERIFICADORES_EMAILS.
// Modo simulado: selector de cuenta de prueba (solo con la API simulada).

import { api, cargarConfig, html, aviso, ocupado, ApiError } from './comun.js';

export async function sesionStaff() {
  try {
    return await api('/api/auth/yo');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function salirStaff() {
  try { await api('/api/auth/salir', { metodo: 'POST', cuerpo: {} }); } catch { /* sin efecto */ }
}

function cargarGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.'));
    document.head.append(s);
  });
}

/** Pinta el acceso en `cont` y resuelve cuando la sesión queda iniciada. */
export async function pedirAcceso(cont, { titulo = 'Acceso del personal', texto = 'Entra con tu cuenta de Google autorizada por la Comisión.' } = {}) {
  const config = await cargarConfig();
  cont.innerHTML = html`
    <div class="m-card" style="max-width:520px;margin:0 auto">
      <h2 class="disp">${titulo}</h2>
      <p class="m-sub">${texto}</p>
      <div id="acceso-zona"></div>
      <div id="acceso-aviso" hidden style="margin-top:14px"></div>
    </div>`;
  const zona = cont.querySelector('#acceso-zona');
  const av = cont.querySelector('#acceso-aviso');

  return new Promise((resolve) => {
    if (config.modo === 'simulado') {
      zona.innerHTML = `
        <form class="m-form" id="form-sim" novalidate>
          <div class="m-aviso m-aviso--warn"><p>Modo de prueba: elige una cuenta. En producción se usa el botón de Google.</p></div>
          <div class="m-field"><label for="sim-email">Cuenta</label>
            <select id="sim-email">
              <option value="aovv.26@gmail.com">aovv.26@gmail.com (administrador)</option>
              <option value="verificador@ejemplo.com">verificador@ejemplo.com (solo escanear)</option>
              <option value="intruso@ejemplo.com">intruso@ejemplo.com (sin acceso)</option>
            </select></div>
          <button class="m-btn m-btn--primario" type="submit">Entrar</button>
        </form>`;
      zona.querySelector('#form-sim').addEventListener('submit', async (e) => {
        e.preventDefault();
        const b = e.target.querySelector('button');
        ocupado(b, true, 'Entrando…');
        try {
          await api('/api/auth/simulado', { metodo: 'POST', cuerpo: { email: zona.querySelector('#sim-email').value } });
          resolve(await sesionStaff());
        } catch (err) {
          aviso(av, 'error', err.message);
        } finally {
          ocupado(b, false);
        }
      });
      return;
    }
    if (!config.googleClientId) {
      aviso(av, 'error', 'Falta configurar el inicio de sesión con Google (GOOGLE_CLIENT_ID).');
      return;
    }
    zona.innerHTML = '<div id="gis-boton" style="min-height:44px"></div>';
    cargarGis().then(() => {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        ux_mode: 'popup',
        auto_select: false,
        callback: async ({ credential }) => {
          aviso(av, 'info', 'Verificando tu cuenta…');
          try {
            await api('/api/auth/google', { metodo: 'POST', cuerpo: { credential } });
            resolve(await sesionStaff());
          } catch (err) {
            aviso(av, 'error', err.message);
          }
        },
      });
      window.google.accounts.id.renderButton(zona.querySelector('#gis-boton'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es' });
    }).catch((err) => aviso(av, 'error', err.message));
  });
}
