# Próxima etapa

## Módulo de registro de catequistas

Hecho:

- Frontend completo: registro, portal, Semana del Catequista, verificación, panel de administración, escáner QR y aviso de privacidad.
- API real en `api/` (una función de Vercel): lectura de la hoja y Drive con la cuenta de servicio, sesiones firmadas, login con Google Identity Services, PDF (ficha, carnet CR80 y pase) y QR.
- Escritor de Apps Script (`apps-script/Code.gs`): consecutivos bajo bloqueo, unicidad, Drive, correos con cuota y reintentos (`procesarPendientes`), anulaciones, entradas y respaldo diario.
- Pruebas: `npm test` (68 comprobaciones de la API con el escritor sobre Google emulado) y la prueba de navegador en emulación móvil.
- Cuenta de servicio `lector-inscripciones@catequesispanama.iam.gserviceaccount.com` configurada y leyendo la hoja.

Pendiente, en este orden (detalle en `docs/DESPLIEGUE.md`):

1. Compartir la carpeta raíz de Drive con la cuenta de servicio (Lector).
2. Desplegar el escritor de Apps Script (clasp o a mano), poner sus propiedades, autorizarlo, instalar los activadores y anotar la URL `/exec`.
3. Crear el ID de cliente OAuth de tipo Aplicación web y ponerlo en `GOOGLE_CLIENT_ID`.
4. Completar en `Config` los valores POR DEFINIR (Yappy, fechas y sede de la Semana, URL del sitio).
5. Cargar las variables en Vercel (`npm run vercel:env`) y publicar.
6. Prueba en un celular real (idealmente iPhone/Safari) contra producción; dejar la hoja sin datos de prueba.
7. Revisión de la Comisión: aviso de privacidad, catálogo de niveles y de formación CENAFCA, nombres de las vicarías.
8. Mejora futura: sustituir el comprobante manual por el Botón de Pago Yappy de Banco General (requiere cuenta comercial).

## Sitio general

1. Validar con la Comisión textos, fotografías, zonas pastorales, responsables y datos de contacto.
2. Conectar el formulario «Únete» de la página de inicio, si se mantiene, con validación y protección frente a abuso.
3. Revisar accesibilidad, teclado, dispositivos móviles, permisos de imágenes y dominio definitivo antes de la publicación oficial.
