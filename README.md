# Comisión de Catequesis

Prototipo de presentación de la Comisión de Catequesis de la Arquidiócesis de Panamá. Conserva el diseño y los recursos del HTML facilitado. Su finalidad actual es revisar el aspecto visual y las interacciones antes de desarrollar el sitio definitivo.

## Desarrollo local

Con Node.js 20.12 o superior, después de `npm install`:

| Comando | API en `/api/*` |
|---|---|
| `npm run dev` | API simulada en memoria (`scripts/api-simulada.cjs`), sin Google |
| `npm run dev:emulado` | API real (`api/`) con el escritor `apps-script/Code.gs` ejecutándose sobre Google emulado en memoria |
| `npm run dev:real` | API real contra la hoja, Drive y el escritor reales (`.env.local`). **Escribe en la hoja real** |

Abrir http://localhost:4173. En los dos primeros modos los datos se borran al reiniciar y no se envían correos; una franja amarilla lo indica.

Cuentas de prueba (modos simulado y emulado): catequista `prueba@ejemplo.com` con número `1` (aprobado) y `jose@ejemplo.com` con número `2` (por aprobar); panel con `aovv.26@gmail.com` (administrador) o `verificador@ejemplo.com` (solo escanear).

Variables de la API simulada: `SIM_LATENCIA_MS` (450 ms por defecto), `SIM_SIN_DATOS=1` (sin catequistas de ejemplo; también en el modo emulado) y `SIM_FALLAR_DOCUMENTOS=1` (registros en `PENDIENTE_DOCUMENTOS`).

```sh
npm test                  # API real + escritor sobre Google emulado (155 comprobaciones)
npm run google:verificar  # la cuenta de servicio lee la hoja real
npm run build             # genera dist/, la carpeta pública para Vercel
```

Configuración: copia `.env.example` como `.env.local`. En local, la clave de la cuenta de servicio se lee del JSON indicado en `GOOGLE_SERVICE_ACCOUNT_FILE` (fuera del repositorio). Despliegue paso a paso: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

## Estructura

- `public/index.html`: contenido y plantilla del componente.
- `public/css/styles.css`: tipografías, diseño y animaciones.
- `public/js/app.js`: estado e interacciones de la muestra.
- `public/assets/`: imágenes, fuentes y motor incluido en el archivo original.
- `api/`: función única de Vercel (`index.js`) y su código (`_lib/`): rutas, lectura de Google, cliente del escritor, PDF y QR.
- `apps-script/`: escritor de Apps Script (`Code.gs`) y su manifiesto.
- `scripts/`: servidor local, API simulada, Google emulado y utilidades.
- `tests/`: pruebas de la API.
- `vercel.json`: configuración de publicación y cabeceras de seguridad.

### Módulo de registro de catequistas

| Ruta | Qué es |
|---|---|
| `/registro/` | Registro en 7 pasos: datos (cédula, celular y correo con formato en vivo y sugerencia de correo), pastoral (parroquia con autocompletar → vicaría, zona y coordinador automáticos), foto (recorte 600×600), firma táctil, pago Yappy, consentimientos y revisión |
| `/portal/` | Acceso con correo + número; carnet digital CR80, descargas y estado de la Semana |
| `/portal/semana/` | Inscripción a la Semana del Catequista (solo catequistas `ACTIVO`) |
| `/verificar/` | Validez de carnets (`?c=`) y pases (`?t=`); con sesión de personal, datos y registro de entrada |
| `/admin/` | Panel: cola **Por aprobar** (aprobar o rechazar con motivo), **dashboard** de catequistas por zona, vicaría y parroquia, **Parroquias** (editar vicarías, parroquias y coordinadores con actualización automática de los registros), **Cumpleaños** (saludo diario por correo), búsqueda, detalle con archivos, anular, regenerar, reenviar y CSV |
| `/admin/escanear/` | Lector QR con la cámara (BarcodeDetector o jsQR) |
| `/recursos/` | Recursos: videoteca de la Semana del Catequista (2026, 2025 y 2024) con destacado, filas por edición, búsqueda y reproductor. Datos en `public/assets/js/recursos/videos.js` |
| `/privacidad/` | Aviso de privacidad (Ley 81 de 2019) — borrador para revisión |

Código del módulo en `public/assets/js/modulo/` (módulos ES sin compilación) y `public/css/modulo.css`. Librerías vendorizadas con versión exacta y licencia en `public/assets/vendor/`: `signature_pad` 5.0.4 (MIT), `jsQR` 1.4.0 (Apache-2.0) y `qrcode-generator` 1.4.4 (MIT, licencia en la cabecera del archivo). El contrato de la API está en [`docs/API-CONTRATO.md`](docs/API-CONTRATO.md).

El motor original utiliza React 18.3.1 y una plantilla declarativa. La pequeña clase dentro del HTML conecta la plantilla con `app.js`. Se conservó esta estructura para mantener fielmente el prototipo.

## Alcance de la muestra

El formulario «Únete» de la página de inicio **no envía ni guarda datos**; el registro real de catequistas está en `/registro/`. La agenda presenta actividades habituales, sin anunciar fechas ni sedes concretas. El mapa de zonas es referencial. La directiva `noindex` evita solicitar la indexación de esta etapa; no restringe el acceso a quien tenga el enlace. El código puede estar en un repositorio privado mientras el sitio de presentación es público.

## Fuentes del contenido

La misión, visión, funciones y actividades proceden de `QUIÉNES SOMOS.docx`; la información del equipo procede de `Reseña del Equipo de la Comisión Arquidiocesana de Catequesis.docx`; y la formación de CENAFCA procede de `CENTRO ARQUIDIOCESANO PARA LA FORMACIÓN DE CATEQUISTAS.docx`, facilitados por la Comisión. Los logos de la Sección, CENAFCA y «Catequistas con un solo corazón» se prepararon a partir de la carpeta `LOGOS CATEQUESIS` facilitada. El teléfono, la dirección y el enlace de Facebook se tomaron de la página anterior `https://www.labdev.space/cacp/`; el correo figura también en el documento de CENAFCA. Conviene confirmar que esos canales siguen vigentes antes del lanzamiento definitivo.

## Ampliación posterior

Ver `docs/PROXIMOS-PASOS.md`. Esta base admite contenido nuevo, formularios reales, servicios y API sin reemplazar el diseño. El registro de catequistas usa una sola función de Vercel; el resto del sitio sigue siendo estático.

## Recursos

Las demás imágenes y el motor proceden del archivo HTML original. Las licencias de fuentes se conservan en `public/assets/FONT-LICENSES.txt`; los archivos de React mantienen sus avisos originales.
