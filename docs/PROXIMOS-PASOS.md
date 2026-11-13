# Próxima etapa

## Módulo de registro de catequistas

Hecho (rama `feature/registro-catequistas`):

- Frontend completo: registro, portal, Semana del Catequista, verificación, panel de administración, escáner QR y aviso de privacidad.
- API simulada en memoria que cumple el contrato de `docs/API-CONTRATO.md`, para probar todos los flujos sin Google.

Pendiente, en este orden:

1. **Credenciales de Google** (no existen en ningún repositorio local): cuenta de servicio con clave JSON y un ID de cliente OAuth de tipo *Aplicación web* en el proyecto `green-gearbox-495522-d8` o en uno nuevo. Activar las API de Sheets y Drive.
2. **API real en `api/`** (una sola función de Vercel con enrutador interno, por el límite de 12 funciones del plan Hobby): lectura de Sheets con la cuenta de servicio, cliente HMAC del escritor, sesiones firmadas, `zod`, generación de PDF (`pdf-lib`, fuentes TTF) y QR (`qrcode`), y pruebas con `vitest`. Debe pasar las mismas pruebas que la API simulada.
3. **Escritor de Apps Script** (`apps-script/Code.gs`): acciones `registrarCatequista`, `adjuntarDocumentos`, `inscribirSemana`, `registrarEntrada`, `anular`, `reenviarCorreo` y `recuperarNumero`, y activadores `procesarPendientes` y `respaldoDiario`. Requiere `clasp login` o pegarlo a mano.
4. Añadir a `Config` las claves opcionales `SEMANA_PEDIR_TALLA` y `SEMANA_PEDIR_RESTRICCIONES` (por defecto TRUE).
5. Revisión de la Comisión: aviso de privacidad, catálogo de niveles y de formación CENAFCA, nombres de las vicarías.
6. Mejora futura: sustituir el comprobante manual por el Botón de Pago Yappy de Banco General (requiere cuenta comercial).

## Sitio general

1. Validar con la Comisión textos, fotografías, zonas pastorales, responsables y datos de contacto.
2. Conectar el formulario «Únete» de la página de inicio, si se mantiene, con validación y protección frente a abuso.
3. Revisar accesibilidad, teclado, dispositivos móviles, permisos de imágenes y dominio definitivo antes de la publicación oficial.
