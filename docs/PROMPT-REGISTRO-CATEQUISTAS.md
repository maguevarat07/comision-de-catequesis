# Prompt para Claude Code · Registro de Catequistas y Semana del Catequista

> Copia todo lo que está debajo de la línea y pégalo en Claude Code, abierto en
> `C:\Users\ahc_0\OneDrive\Documentos\Proyectos_Digital\comision-catequesis\comision-de-catequesis`.

---

## Rol y objetivo

Eres el ingeniero principal de este proyecto. Debes desarrollar, de punta a punta, un **módulo de registro de catequistas** y un **módulo de inscripción a la Semana del Catequista** dentro del sitio de la Comisión Arquidiocesana de Catequesis. Todo debe funcionar con **mi cuenta de Google (aovv.26@gmail.com)**: los datos van a Google Sheets, los archivos a Google Drive y los correos salen de mi Gmail.

Responde en español. Antes de escribir código, lee este prompt completo, explora los repositorios de referencia indicados y entrégame un **plan por fases** con los archivos que vas a crear o modificar. Espera mi visto bueno antes de implementar. Si un requisito es ambiguo, pregúntame.

## 1. Proyecto actual (dónde trabajas)

- Repo: `comision-de-catequesis` (remoto `https://github.com/maguevarat07/comision-de-catequesis.git`, rama `main`). **Crea la rama `feature/registro-catequistas`. No hagas commit, push ni despliegues sin que te lo pida.**
- Hoy es un **prototipo estático**: `public/index.html` + `public/css/styles.css` + `public/js/app.js`, con el motor de plantillas `public/assets/vendor/dc-runtime.js` y React 18.3.1 *vendorizado* (sin CDN). `scripts/serve.cjs` sirve `public/` en `http://127.0.0.1:4173`; `scripts/build.cjs` copia `public/` a `dist/`. Se publica en **Vercel** (`vercel.json`, cabecera `noindex`).
- Ya existe un formulario de "Únete" que **no envía datos** y un paso "Camina en comunidad" que menciona la **Semana de Catequesis**. Conecta esos CTA con las nuevas secciones.
- Lee `README.md` y `docs/PROXIMOS-PASOS.md`: el punto 5 ya prevé una API en `api/` con funciones de Vercel. Esa es la ruta a seguir.
- Mantén la identidad visual: tokens y tipografías de `styles.css` (Fraunces + Plus Jakarta Sans, azul `#0E1B3D`, dorado `#F0B544`) y los logos de `public/assets/images/` (`catequesis-logo.png`, `arquidiocesis.png`, `catequistas-un-solo-corazon.png`).

## 2. Repositorios de referencia (misma carpeta `Proyectos_Digital`)

Revísalos antes de diseñar. **Reutiliza sus patrones; no copies datos de negocio.**

| Repo | Qué tomar de él |
|---|---|
| `Move On Panama/` | **Referencia principal de integración con Google.** `server/store/sheets.ts` (auth con cuenta de servicio, lectura de Sheets), `apps-script/Code.gs` (escritor único con firma HMAC, nonce, `LockService`, `batchUpdate` atómico, respaldo diario), `server/sheetsSetup.ts`, `server/http/` (cookie de sesión firmada, anti-CSRF, idempotencia), login con **Google Identity Services** (`AUTH_MODE=google`), `docs/DESPLIEGUE.md`, `.env.example`. |
| `Move On Panama/.env` | **Credenciales que debes reutilizar**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `GOOGLE_CLIENT_ID` del mismo proyecto de Google Cloud. Léelas solo para copiarlas al `.env.local` de este repo. **Nunca imprimas la clave privada en la terminal ni en el chat, ni la subas a git.** Si alguna está vacía, dímelo. |
| `Move On Panama/Guia-Claude-Codex.md` | Mi flujo de trabajo Claude + Codex. Respétalo si tengo configurada la skill `delegar-a-codex`. |
| `parroquia-esperanza/` | Sitio parroquial en React + Vite + Tailwind. Sirve como referencia de tono y de componentes de formulario responsivos. |
| `pdf-drive-converter-web/` | `backend/app.py`: ejemplo previo de subida de archivos a Drive. |
| `budget-dashboard/` | Lectura de Google Sheets desde el frontend/función. |

## 3. Recursos de Google ya creados (en mi Drive)

Ya los creé. **No crees otros; usa estos IDs.**

- Carpeta raíz del módulo: **Comisión de Catequesis · Registro de Catequistas**
  https://drive.google.com/drive/folders/16rN1mUHJ79gLQasHiaTY5-QeEslZPCvz
  - `01_Fotos`: https://drive.google.com/drive/folders/17Pr0EgqxYCXSHoEU1-LhZ1I54i_MwMeD
  - `02_Firmas`: https://drive.google.com/drive/folders/1aINwqu8mV_Y2FnO1PqAk9AmH2qth9yES
  - `03_Comprobantes_Yappy_Registro`: https://drive.google.com/drive/folders/1gW1GBr2-B2Ya9QdJYGYRXGozwThfghS7
  - `04_Comprobantes_Yappy_Semana`: https://drive.google.com/drive/folders/1ek6CqyHbdYH9cVrnQ1JPv7mxCzWV86JP
  - `05_PDF_Inscripcion`: https://drive.google.com/drive/folders/10JO-vdgw-5skHblpFp9pBwwg8qcuqgxh
  - `06_Carnets`: https://drive.google.com/drive/folders/1j0Y7enwePrXrAs8xv4XOONIJfXD_QycN
  - `07_QR_Semana_Catequista`: https://drive.google.com/drive/folders/1pbNIyyUxA8ZJBKiAD1miOvkcpRxOs63c
  - `99_Respaldos`: https://drive.google.com/drive/folders/18FBHdLapwhjo589iY1BUhqU69vYw62aG
- Base de datos: **Catequesis · Base de Registro** (zona horaria America/Panama)
  https://docs.google.com/spreadsheets/d/14CKL3JQ34CDsxN-e-wQoRq2VOkooYUa3byPB1GQhv6c/edit
  `GOOGLE_SHEET_ID=14CKL3JQ34CDsxN-e-wQoRq2VOkooYUa3byPB1GQhv6c`

Pestañas y encabezados (fila 1 ya escrita; **respeta los nombres exactos de columna** y localiza cada columna por nombre, no por posición):

- `Catequistas`: id, numero_catequista, estado, fecha_registro, nombres, apellidos, cedula, fecha_nacimiento, sexo, telefono, correo, direccion, parroquia, vicaria_zona, anios_servicio, nivel_que_imparte, formacion_cenafca, coordinador_parroquial, foto_file_id, firma_file_id, comprobante_file_id, yappy_referencia, comprobante_sha256, pdf_inscripcion_file_id, carnet_file_id, vigencia_hasta, correo_enviado_at, consentimiento_datos, consentimiento_imagen, creado_at, actualizado_at, notas_admin
- `SemanaCatequista`: id, numero_inscripcion_semana, catequista_id, numero_catequista, correo, edicion, estado, fecha_inscripcion, talla_camiseta, restricciones_alimentarias, comprobante_file_id, yappy_referencia, comprobante_sha256, qr_token, qr_file_id, correo_enviado_at, checkin_at, checkin_por, creado_at, actualizado_at, notas_admin
- `Pagos`: id, tipo (`REGISTRO`/`SEMANA`), referencia_id, numero_catequista, monto, moneda, metodo, yappy_referencia, comprobante_file_id, comprobante_sha256, estado, creado_at, anulado_at, anulado_por, motivo_anulacion
- `Config` (clave/valor/descripcion): COSTO_REGISTRO=1.00, COSTO_SEMANA=1.00, MONEDA, YAPPY_DIRECTORIO, YAPPY_TELEFONO, YAPPY_INSTRUCCIONES, REGISTRO_ABIERTO, SEMANA_EDICION=2026, SEMANA_SECUENCIA, SEMANA_ABIERTA, SEMANA_FECHAS, SEMANA_SEDE, SEMANA_CUPO, CARNET_VIGENCIA_MESES, REMITENTE_NOMBRE, CORREO_RESPUESTA, ADMIN_EMAILS, VERIFICADORES_EMAILS, URL_SITIO y los IDs de todas las carpetas de Drive (`DRIVE_*`). Los valores marcados **POR DEFINIR** los completo yo; el sistema debe leer `Config` en cada arranque (con caché corta) y no tener esos valores fijos en el código. Lee los booleanos y números de forma tolerante (`TRUE`/`true`/`1`, `1`/`1.00`).
- `Secuencias`: nombre, prefijo, siguiente, relleno, descripcion. Filas: `CATEQUISTA` → `CAT-00001`; `SEMANA_2026` → `SEM26-0001`.
- `Correos` (bitácora de envíos), `Auditoria` (quién hizo qué) y `_meta` (version, ultima_escritura, version_esquema), igual que en Move On Panama.

## 4. Arquitectura que espero

```
Navegador (páginas estáticas en public/, mismo estilo del sitio)
   │  fotos y comprobantes comprimidos en el cliente · firma en <canvas>
   ▼
Funciones de Vercel en api/ (Node 20, TypeScript)
   │  validación · sesión firmada · generación de PDF (pdf-lib) y QR (qrcode)
   ├─ LECTURAS → Google Sheets API con la cuenta de servicio reutilizada
   └─ ESCRITURAS, ARCHIVOS Y CORREOS → Apps Script "escritor" (HMAC), que corre como aovv.26@gmail.com
                                        ├─ escribe filas con LockService y asigna el consecutivo
                                        ├─ guarda archivos en las carpetas de Drive anteriores
                                        └─ envía los correos con GmailApp desde mi cuenta
```

Por qué así: una cuenta de servicio **no tiene cuota de almacenamiento en "Mi unidad"** y mi cuenta es Gmail personal, sin unidades compartidas. Por eso los archivos y los correos los gestiona Apps Script en nombre de mi cuenta. La cuenta de servicio solo lee la hoja y descarga archivos. Es el mismo patrón de escritor único de `Move On Panama/apps-script/Code.gs`; amplíalo con acciones propias.

Decisiones técnicas:

- **Sin build pesado.** Conserva `scripts/serve.cjs`/`build.cjs`. Las páginas nuevas son HTML + JS modular en `public/` (por ejemplo, `public/registro/`, `public/portal/`, `public/semana/`, `public/verificar/` y `public/admin/`). Para el desarrollo local con API usa `vercel dev`, o extiende `serve.cjs` para que enrute `/api/*`. Explica cuál elegiste.
- **Librerías del navegador vendorizadas** en `public/assets/vendor/`, con versión exacta y su licencia, como ya se hizo con React: `signature_pad` para la firma y un lector QR (`jsQR` o la API `BarcodeDetector` con respaldo).
- **Dependencias del servidor** en `package.json`: `googleapis`/`google-auth-library` (igual que Move On Panama), `pdf-lib`, `qrcode` y `zod`. Prueba con `vitest`.
- **Límite de 4.5 MB por petición en Vercel:** comprime en el cliente. La foto se recorta cuadrada a 600×600 en JPEG (calidad 0.85); el comprobante se reduce a un máximo de 1600 px y la firma se guarda en PNG con fondo transparente. Valida tipo y tamaño también en el servidor.
- **Idempotencia** en cada envío, con una clave por acción, para evitar dobles registros por doble clic o reintentos.

## 5. Funcionalidades

### A. Registro de catequista (público, optimizado para celular)

Formulario por pasos con barra de progreso:

1. **Datos personales:** nombres, apellidos, cédula (formato panameño), fecha de nacimiento, sexo, teléfono y correo (dos veces, para confirmarlo).
2. **Datos pastorales:** parroquia, vicaría o zona pastoral (lista desplegable reutilizando las zonas del sitio), años de servicio, nivel que imparte, formación CENAFCA y coordinador parroquial.
3. **Foto:** cámara frontal del celular (`capture="user"`) o galería, con vista previa y recorte cuadrado.
4. **Firma:** lienzo táctil a pantalla completa, con botones **Limpiar** y **Confirmar firma**. Debe funcionar con el dedo en Android y iOS, en vertical y en horizontal.
5. **Pago:** muestra el costo (`COSTO_REGISTRO`) y las instrucciones de Yappy (`YAPPY_*` de Config). Pide la captura del comprobante y el número de referencia o confirmación de Yappy.
6. **Consentimientos** (obligatorios): tratamiento de datos personales, conforme a la Ley 81 de 2019 de Panamá, y uso de la foto en el carnet. Enlaza a un aviso de privacidad breve que debes redactar.
7. **Revisión y envío.**

Reglas:

- Un correo y una cédula solo pueden registrarse una vez. Si ya existen, muestra un mensaje que no revele datos y ofrece **"Recuperar mi número"**, que lo envía por correo.
- **El pago se acepta automáticamente** al subir el comprobante; no hay aprobación manual. Para reducir el fraude:
  - calcula el SHA-256 del comprobante y rechaza el registro si ya existe en `Pagos`;
  - rechaza una `yappy_referencia` repetida;
  - guarda todo en `Pagos` con el estado `DECLARADO_AUTO`.

  El administrador puede **anular** después. Al anular, el carnet y el QR quedan inválidos y se registra en `Auditoria`.
- Al registrarse, en este orden y de forma recuperable:
  1. el escritor guarda la foto, la firma y el comprobante en Drive (nombres `CAT-00001_foto.jpg`, `CAT-00001_firma.png` y `CAT-00001_yappy.jpg`), asigna el **número consecutivo** bajo `LockService` y escribe la fila con el estado `PENDIENTE_DOCUMENTOS`;
  2. la API genera el **PDF de inscripción** y el **carnet**;
  3. el escritor los guarda en `05_PDF_Inscripcion` y `06_Carnets`, cambia el estado a `ACTIVO`, calcula `vigencia_hasta` y envía el correo.

  Si falla el paso 2 o el 3, la fila queda en `PENDIENTE_DOCUMENTOS` y un activador horario de Apps Script o el botón **"Regenerar documentos"** del panel la completa. Nunca se repite un número ni se pierde un consecutivo asignado.
- La pantalla final muestra el número de catequista, el botón para descargar el carnet y el aviso de que se envió un correo.

### B. PDF de inscripción (generado automáticamente)

Tamaño carta y vertical. Incluye el encabezado con los logos de la Arquidiócesis y de la Comisión, el título "Ficha de Inscripción de Catequista", el número y la fecha, la foto, todos los datos, los consentimientos aceptados con fecha y hora, la **firma digital** del catequista, el monto pagado con la referencia de Yappy y un pie de página con un código de verificación.

### C. Carnet de catequista (horizontal)

- Tamaño de tarjeta **CR80 (85.6 × 54 mm) horizontal**, en un PDF de 2 páginas (frente y reverso), y además una hoja carta con el carnet en tamaño real y marcas de corte para imprimir.
- **Frente:** logo de la Comisión y "Catequistas con un solo corazón", foto, nombre completo, **número de catequista** destacado, parroquia, vicaría o zona y vigencia.
- **Reverso:** QR que lleva a `/verificar/?c=<token>` (verificación del carnet), firma del catequista, texto institucional y contacto.
- Además, una versión **digital** en el portal: el carnet en HTML/CSS, listo para mostrar en el celular.

### D. Portal de catequistas registrados

- Acceso con el **correo registrado + número de catequista** (acepta `CAT-00001`, `cat-1` o `1`). Usa un mensaje de error genérico, una espera fija ante fallos y un límite de intentos por correo e IP (guarda el contador en `CacheService` del escritor o en la función). Al validar, crea una cookie `HttpOnly` firmada con 2 horas de vigencia, como la sesión de Move On Panama.
- Muestra el carnet digital, la descarga del PDF de inscripción y del carnet, y el estado de la Semana del Catequista.
- **La inscripción a la Semana del Catequista solo aparece aquí**, para catequistas con estado `ACTIVO`.

### E. Inscripción a la Semana del Catequista

- Solo se muestra si `SEMANA_ABIERTA` es TRUE y hay cupo (`SEMANA_CUPO`, donde 0 = sin límite). Muestra la edición, las fechas y la sede desde `Config`.
- Formulario corto: confirmación de los datos de contacto, talla de camiseta y restricciones alimentarias (campos opcionales y configurables), más el pago de `COSTO_SEMANA` por Yappy con comprobante y referencia, con las mismas reglas antifraude del registro.
- Una inscripción por catequista y por edición.
- Al inscribirse: número `SEM26-0001`, comprobante en `04_Comprobantes_Yappy_Semana`, fila en `SemanaCatequista` y `Pagos`, y generación del **QR de acceso**.

### F. QR de acceso y verificación

- El token del QR es un payload compacto (id de inscripción, número de catequista y edición) firmado con HMAC-SHA256 (`QR_SECRET`) y codificado en base64url. El QR apunta a `${URL_SITIO}/verificar/?t=<token>`. No incluye datos personales en claro.
- Genera un PNG del QR y un **pase de acceso en PDF** (nombre, foto, número, edición, fechas, sede y QR), y guárdalos en `07_QR_Semana_Catequista`.
- Página `/verificar/`:
  - sin sesión, solo indica si el pase es **válido, anulado o inexistente**;
  - con sesión de administrador o verificador (Google), muestra la foto, el nombre y la parroquia, y el botón **"Registrar entrada"**, que guarda `checkin_at`/`checkin_por` y avisa si ya había entrado.
- Página `/admin/escanear/`: lector QR con la cámara del celular, para usar en la puerta.

### G. Correos de confirmación (desde mi Gmail, vía Apps Script)

- **Registro:** asunto "Bienvenido(a), catequista CAT-00001". Cuerpo HTML con la identidad del sitio, el número, el enlace al portal y las instrucciones de acceso. Adjunta el PDF de inscripción y el carnet.
- **Semana:** asunto "Inscripción confirmada · Semana del Catequista 2026". Lleva el QR incrustado (`inlineImages`), las fechas, la sede y el pase en PDF adjunto.
- Usa el nombre `REMITENTE_NOMBRE` y la dirección de respuesta `CORREO_RESPUESTA`. Registra cada envío en `Correos`.
- **Cuota de Gmail personal: unos 100 destinatarios al día desde Apps Script.** Si se agota, deja el correo como `PENDIENTE` y que un activador horario lo reintente. En el panel debe verse la cuota restante (`MailApp.getRemainingDailyQuota()`).

### H. Panel de administración `/admin/`

- Inicio de sesión con **Google Identity Services**, reutilizando el `GOOGLE_CLIENT_ID` de Move On Panama, y acceso restringido a `ADMIN_EMAILS` (los verificadores solo pueden escanear). Verifica el ID token en el servidor.
- Funciones:
  - lista y búsqueda de catequistas e inscritos a la Semana;
  - ver la foto, la firma y el comprobante (descargados por la API con la cuenta de servicio, nunca con enlaces públicos);
  - anular con un motivo obligatorio;
  - regenerar documentos y reenviar correos;
  - exportar a CSV con protección contra fórmulas;
  - contadores (registrados, inscritos en la Semana, entradas registradas y monto recaudado).

## 6. Seguridad y privacidad (obligatorio)

- Los secretos viven solo en `.env.local` y en las variables de Vercel. Añade `.env*` a `.gitignore` (excepto `.env.example`, que debes crear).
- Los archivos de Drive **no se comparten con "cualquiera con el enlace"**. Toda descarga pasa por la API y verifica la sesión.
- Escribe en la hoja como `stringValue`/`RAW`, nunca como fórmula. Valida todo con `zod` en el servidor.
- Configura cabeceras de seguridad en `vercel.json`. Mantén `noindex` hasta que yo lo indique. Usa `Permissions-Policy` con la cámara permitida solo en las rutas que la usan.
- Respaldo diario del libro en `99_Respaldos` (función `respaldoDiario` de Move On Panama).

## 7. Variables de entorno (`.env.example`)

```
GOOGLE_SHEET_ID=14CKL3JQ34CDsxN-e-wQoRq2VOkooYUa3byPB1GQhv6c
GOOGLE_SERVICE_ACCOUNT_EMAIL=        # reutilizar de Move On Panama/.env
GOOGLE_PRIVATE_KEY=                  # reutilizar de Move On Panama/.env
GOOGLE_CLIENT_ID=                    # reutilizar de Move On Panama/.env (OAuth web)
APPS_SCRIPT_WRITER_URL=              # URL /exec del nuevo escritor
APPS_SCRIPT_WRITER_SECRET=           # nuevo, >= 32 caracteres
SESSION_SECRET=                      # nuevo, >= 32 caracteres
QR_SECRET=                           # nuevo, >= 32 caracteres, distinto de los anteriores
ADMIN_EMAILS=aovv.26@gmail.com
PUBLIC_SITE_URL=                     # URL de Vercel
```

Genera tú los secretos nuevos con `crypto.randomBytes` y escríbelos solo en `.env.local`.

## 8. Lo que harás tú y lo que debo hacer yo

**Hazlo tú:**

- Todo el código: frontend, `api/`, `apps-script/Code.gs` (escritor + activadores) y las pruebas.
- Si tengo `clasp` disponible (`npx @google/clasp`), crea el proyecto de Apps Script **vinculado a la hoja** anterior, súbelo y despliégalo como aplicación web: ejecutar como *yo*, acceso *cualquier usuario*, con autorización por HMAC. Configura las propiedades del script (`SHEET_ID`, `WRITER_SECRET` y los IDs de las carpetas).
- Lee el `GOOGLE_SERVICE_ACCOUNT_EMAIL` de Move On Panama y **dime ese correo** para que yo comparta los recursos.

**Al terminar, dame una lista de verificación con lo que solo yo puedo hacer**, con enlaces directos:

1. Compartir la hoja y la carpeta raíz con la cuenta de servicio como **Lector**.
2. Autorizar los permisos de Apps Script (Drive, Sheets, Gmail) la primera vez.
3. Añadir el dominio de Vercel a los **orígenes JavaScript autorizados** del ID de cliente OAuth en Google Cloud Console.
4. Cargar las variables de entorno en Vercel.
5. Completar en `Config` los valores **POR DEFINIR** (directorio Yappy, fechas y sede de la Semana, URL del sitio).

## 9. Fases y criterios de aceptación

1. **Plan y andamiaje:** estructura de `api/`, `.env.example`, cliente de Sheets (lectura) y cliente del escritor (HMAC). *Criterio:* `npm test` pasa y una función `/api/salud` lee `Config` real.
2. **Escritor de Apps Script:** acciones `registrarCatequista`, `adjuntarDocumentos`, `inscribirSemana`, `registrarEntrada`, `anular`, `reenviarCorreo` y `recuperarNumero`, más los activadores `procesarPendientes` (cada hora) y `respaldoDiario`. *Criterio:* 20 registros simultáneos de prueba generan 20 consecutivos únicos y sin huecos.
3. **Registro + PDF + carnet + correo.** *Criterio:* desde un celular real (o la emulación móvil de Playwright) se completa el registro con foto, firma y comprobante; llega el correo con los dos PDF; el carnet se ve horizontal y se imprime en tamaño CR80 real.
4. **Portal + Semana + QR.** *Criterio:* solo un catequista `ACTIVO` ve la inscripción; un catequista no puede inscribirse dos veces; el QR se valida; un QR alterado o anulado se rechaza.
5. **Panel admin + escáner.** *Criterio:* el acceso solo funciona con correos de `ADMIN_EMAILS`; la anulación invalida el carnet y el QR; el CSV se descarga correctamente.
6. **Revisión final:** accesibilidad (teclado, contraste y etiquetas), pruebas en un móvil de 360 px, `npm run build`, actualización de `README.md` y `docs/DESPLIEGUE.md` (en español) y resumen de lo pendiente.

Usa Playwright para probar los flujos en una emulación móvil (iPhone y Pixel) y muéstrame capturas del carnet y del PDF. Trabaja contra **una copia de prueba de la hoja** (`npm run sheets:copia-prueba`, que deberás crear) y no contra la hoja real mientras pruebas. Antes de la entrega final, deja la hoja real sin datos de prueba.

## 10. Mejora futura (no implementar ahora)

Deja documentada la opción de sustituir el comprobante manual por el **Botón de Pago Yappy** de Banco General, que requiere una cuenta comercial, para validar los pagos en línea. Diseña la capa de pagos (`api/_lib/pagos.ts`) de modo que ese cambio sea local.
