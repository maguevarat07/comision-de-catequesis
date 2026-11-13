# Comisión de Catequesis

Prototipo de presentación de la Comisión de Catequesis de la Arquidiócesis de Panamá. Conserva el diseño y los recursos del HTML facilitado. Su finalidad actual es revisar el aspecto visual y las interacciones antes de desarrollar el sitio definitivo.

## Desarrollo local

Con Node.js 20 o superior:

```sh
npm run dev
```

Abrir http://127.0.0.1:4173. No necesita instalar dependencias. Las rutas `/api/*` las atiende una **API simulada en memoria** (`scripts/api-simulada.cjs`): los datos se borran al reiniciar y no se envían correos. Una franja amarilla lo indica en las páginas del módulo.

Variables útiles de la API simulada: `SIM_LATENCIA_MS` (latencia artificial, 450 ms por defecto), `SIM_SIN_DATOS=1` (arranca sin los dos catequistas de ejemplo) y `SIM_FALLAR_DOCUMENTOS=1` (deja los registros en `PENDIENTE_DOCUMENTOS` para probar «Regenerar documentos»).

Cuentas de prueba: catequista `prueba@ejemplo.com` con número `1`; panel con `aovv.26@gmail.com` (administrador) o `verificador@ejemplo.com` (solo escanear).

```sh
npm run build
```

Genera `dist/`, la carpeta pública para Vercel.

## Estructura

- `public/index.html`: contenido y plantilla del componente.
- `public/css/styles.css`: tipografías, diseño y animaciones.
- `public/js/app.js`: estado e interacciones de la muestra.
- `public/assets/`: imágenes, fuentes y motor incluido en el archivo original.
- `scripts/`: servidor local, API simulada y preparación para publicación.
- `vercel.json`: configuración de publicación y cabeceras de seguridad.

### Módulo de registro de catequistas (rama `feature/registro-catequistas`)

| Ruta | Qué es |
|---|---|
| `/registro/` | Registro en 7 pasos: datos, pastoral, foto (recorte 600×600), firma táctil, pago Yappy, consentimientos y revisión |
| `/portal/` | Acceso con correo + número; carnet digital CR80, descargas y estado de la Semana |
| `/portal/semana/` | Inscripción a la Semana del Catequista (solo catequistas `ACTIVO`) |
| `/verificar/` | Validez de carnets (`?c=`) y pases (`?t=`); con sesión de personal, datos y registro de entrada |
| `/admin/` | Panel: contadores, búsqueda, detalle con archivos, anular, regenerar, reenviar y CSV |
| `/admin/escanear/` | Lector QR con la cámara (BarcodeDetector o jsQR) |
| `/privacidad/` | Aviso de privacidad (Ley 81 de 2019) — borrador para revisión |

Código del módulo en `public/assets/js/modulo/` (módulos ES sin compilación) y `public/css/modulo.css`. Librerías vendorizadas con versión exacta y licencia en `public/assets/vendor/`: `signature_pad` 5.0.4 (MIT), `jsQR` 1.4.0 (Apache-2.0) y `qrcode-generator` 1.4.4 (MIT, licencia en la cabecera del archivo). El contrato de la API está en [`docs/API-CONTRATO.md`](docs/API-CONTRATO.md).

El motor original utiliza React 18.3.1 y una plantilla declarativa. La pequeña clase dentro del HTML conecta la plantilla con `app.js`. Se conservó esta estructura para mantener fielmente el prototipo.

## Alcance de la muestra

El formulario «Únete» de la página de inicio **no envía ni guarda datos**; el registro real de catequistas está en `/registro/`. La agenda presenta actividades habituales, sin anunciar fechas ni sedes concretas. El mapa de zonas es referencial. La directiva `noindex` evita solicitar la indexación de esta etapa; no restringe el acceso a quien tenga el enlace. El código puede estar en un repositorio privado mientras el sitio de presentación es público.

## Fuentes del contenido

La misión, visión, funciones y actividades proceden de `QUIÉNES SOMOS.docx`; la información del equipo procede de `Reseña del Equipo de la Comisión Arquidiocesana de Catequesis.docx`; y la formación de CENAFCA procede de `CENTRO ARQUIDIOCESANO PARA LA FORMACIÓN DE CATEQUISTAS.docx`, facilitados por la Comisión. Los logos de la Sección, CENAFCA y «Catequistas con un solo corazón» se prepararon a partir de la carpeta `LOGOS CATEQUESIS` facilitada. El teléfono, la dirección y el enlace de Facebook se tomaron de la página anterior `https://www.labdev.space/cacp/`; el correo figura también en el documento de CENAFCA. Conviene confirmar que esos canales siguen vigentes antes del lanzamiento definitivo.

## Ampliación posterior

Ver `docs/PROXIMOS-PASOS.md`. Esta base admite contenido nuevo, formularios reales, servicios y API sin reemplazar el diseño. No se ha añadido un servidor innecesario para esta presentación.

## Recursos

Las demás imágenes y el motor proceden del archivo HTML original. Las licencias de fuentes se conservan en `public/assets/FONT-LICENSES.txt`; los archivos de React mantienen sus avisos originales.
