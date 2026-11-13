import { $, aviso, cargarConfig, marcarModo } from './comun.js';
import { verificar, pintarResultado, leerCodigo } from './verificacion.js';

cargarConfig().then(marcarModo).catch(() => {});

(async function () {
  const cont = $('#resultado');
  const codigo = leerCodigo(location.href);
  if (!codigo) {
    cont.innerHTML = '<div class="m-veredicto m-veredicto--error"><div class="m-veredicto__icono" aria-hidden="true">?</div><h1 class="disp" style="margin:0 0 6px;font-size:32px">Falta el código</h1><p style="margin:0;color:var(--m-muted)">Escanea el código QR del carnet o del pase para verificarlo.</p></div>';
    return;
  }
  try {
    const r = await verificar(codigo);
    pintarResultado(cont, r, codigo.t);
    document.title = `${r.estado === 'VALIDO' ? 'Válido' : 'No válido'} · Verificación`;
    if (r.staff) {
      $('#nav-escanear').hidden = false;
      $('#nota-publica').hidden = true;
    }
  } catch (e) {
    cont.innerHTML = '';
    const d = document.createElement('div');
    cont.append(d);
    aviso(d, 'error', e.message);
  }
})();
