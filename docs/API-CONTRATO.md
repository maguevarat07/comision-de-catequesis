# Contrato de la API · Registro de catequistas

El frontend (`public/`) solo conoce estas rutas. Las implementan la **API simulada** (`scripts/api-simulada.cjs`, en memoria) y la **API real** (`api/`, función única de Vercel + Google Sheets/Drive/Gmail vía el escritor de Apps Script). Ambas se comportan igual; `npm test` lo comprueba sobre la real.

## Reglas comunes

- Todas las respuestas son JSON con `ok: true|false`, salvo las descargas de archivos y el CSV.
- Error: `{ ok: false, codigo, mensaje, campos? }`. `mensaje` se muestra tal cual a la persona; `campos` asocia nombres de campo con su error.
- Peticiones distintas de `GET`: cabecera `x-cat-csrf: 1` obligatoria y `Origin` igual al host (anti-CSRF). Sin ella → `403 PROHIBIDO`.
- Rutas marcadas con **(idem)**: cabecera `Idempotency-Key` obligatoria. La misma clave devuelve la misma respuesta (y las mismas cookies) sin repetir la operación. El frontend genera una clave por envío y la renueva solo si cambia el comprobante.
- Límite de cuerpo: 4,5 MB → `413 DEMASIADO_GRANDE`.
- Imágenes en data URL base64. Se validan tipo, tamaño y firma mágica (JPEG `FFD8`, PNG `8950`, WEBP `RIFF…WEBP`). Foto: JPEG ≤ 700 KB (600×600). Firma: PNG ≤ 700 KB. Comprobante: JPEG/PNG/WEBP ≤ 2,5 MB.
- Sesiones: cookies `HttpOnly; SameSite=Lax; Secure` en producción. `cat_sesion` (catequista, 2 h) y `cat_staff` (personal, 8 h). Los roles se releen de `Config` en cada petición.

## Códigos de error

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDACION` | 400 | Datos inválidos (incluye `campos`) |
| `IDEMPOTENCIA` | 400 | Falta `Idempotency-Key` |
| `NO_AUTENTICADO` | 401 | Sin sesión o sesión caducada |
| `CREDENCIALES` | 401 | Correo + número no coinciden (mensaje genérico, espera fija) |
| `PROHIBIDO` | 403 | CSRF, origen o rol insuficiente |
| `NO_ACTIVO` | 403/409 | Catequista no `ACTIVO` |
| `INEXISTENTE` | 404 | Registro o archivo no encontrado |
| `DUPLICADO` | 409 | Correo o cédula ya registrados (no dice cuál) |
| `COMPROBANTE_REPETIDO` | 409 | SHA-256 del comprobante ya existe en `Pagos` |
| `REFERENCIA_REPETIDA` | 409 | `yappy_referencia` ya existe en `Pagos` |
| `YA_INSCRITO` | 409 | Ya inscrito en la edición vigente |
| `CERRADO` / `SIN_CUPO` | 409 | `REGISTRO_ABIERTO`/`SEMANA_ABIERTA` en FALSE o cupo agotado |
| `ANULADO` / `RECHAZADO` | 409 | Operación sobre algo anulado o rechazado |
| `NO_PENDIENTE` | 409 | Aprobar o rechazar un registro que no está pendiente de aprobación |
| `SIN_DOCUMENTOS` | 409 | Aprobar un registro `PENDIENTE_DOCUMENTOS` (hay que regenerar antes) |
| `DEMASIADOS_INTENTOS` | 429 | 5 fallos en 15 min por correo o IP |

## Estados del catequista

| Estado | Significado |
|---|---|
| `PENDIENTE_DOCUMENTOS` | Guardado, pero falló la generación de la ficha o el carnet. Se regenera desde el panel |
| `PENDIENTE_APROBACION` | Con documentos; espera la revisión de un administrador. Correo de «recibido» con la ficha. Sin carnet ni Semana |
| `ACTIVO` | Aprobado. Correo con ficha y carnet; puede inscribirse a la Semana |
| `RECHAZADO` | Rechazado con motivo (correo al catequista). Su pago queda `RECHAZADO`; el correo, la cédula, el comprobante y la referencia quedan libres para un registro nuevo |
| `ANULADO` | Retirado después de aprobado |

Si `REQUIERE_APROBACION` está en FALSE en `Config`, el registro pasa directamente a `ACTIVO` (comportamiento anterior). Si falta, vale TRUE.

## Público

| Método y ruta | Cuerpo / parámetros | Respuesta |
|---|---|---|
| `GET /api/salud` | — | `{ ok, modo, configLeida, escritor, hora }` |
| `GET /api/territorio` | — | `{ ok, zonas: [{ id, nombre, area, etiqueta, vicarias: [{ id, nombre, etiqueta, parroquias: [{ id, nombre, coordinador, propuesta }] }] }] }`. Catálogo vigente: pestañas `Vicarias`/`Parroquias` del libro o, mientras estén vacías, el inicial de `api/_lib/territorio.js`. Solo activas |
| `GET /api/config-publica` | — | `{ ok, config: { modo: 'simulado'\|'google', googleClientId, urlSitio, registroAbierto, costoRegistro, costoSemana, moneda, yappy: { directorio, telefono, instrucciones }, semana: { edicion, abierta, fechas, sede, cupo, inscritos, hayCupo, costo, moneda, campos: { talla, restricciones } } } }` |
| `POST /api/registro` **(idem)** | `{ datos: { nombres, apellidos, cedula, fecha_nacimiento, sexo, telefono, correo, direccion, parroquia_id, parroquia?, vicaria_id?, anios_servicio, nivel_que_imparte[], formacion_cenafca, coordinador_parroquial, yappy_referencia, consentimiento_datos: true, consentimiento_imagen: true }, foto, firma, comprobante, comprobante_sha256 }` | `{ ok, numero, estado, correoEnviado, correo, parroquia, vicaria_zona, zona_pastoral, documentos: { pdf, carnet } }` y abre la sesión `cat_sesion`. `parroquia_id` es un id del catálogo (la vicaría y la zona se toman del catálogo, no del cliente) u `otra` con `parroquia` (texto) y `vicaria_id`. Si `coordinador_parroquial` llega vacío se usa el del catálogo. `telefono`: celular de 8 dígitos que empieza por 6 (también en `/api/semana/inscribir`). `carnet` solo si `estado` es `ACTIVO` |
| `POST /api/recuperar` | `{ correo }` | Siempre `{ ok, mensaje }` genérico (no revela si existe) |
| `GET /api/verificar?c=<token>` o `?t=<token>` | — | `{ ok, tipo: 'carnet'\|'pase', estado, staff, publico?, detalle? }`. `estado`: `VALIDO`, `ANULADO`, `INEXISTENTE`, `VENCIDO`, `PENDIENTE`, `OTRA_EDICION`. `detalle` (nombre, foto, parroquia, entrada) solo con sesión de personal |

## Portal del catequista

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/portal/entrar` | `{ correo, numero }` (acepta `CAT-00001`, `cat-1`, `1`) | `{ ok }` + cookie |
| `POST /api/portal/salir` | `{}` | `{ ok }` |
| `GET /api/portal/yo` | — | `{ ok, catequista: { numero, nombres, apellidos, correo, telefono, parroquia, vicaria_zona, zona_pastoral, cumpleanosHoy, estado, fecha_registro, vigencia_hasta, fotoUrl, firmaUrl, verificacionUrl }, documentos: { pdf, carnet }, semana: { …config semana, puedeInscribirse, inscripcion: { numero, estado, fecha, talla, restricciones, verificacionUrl, checkin_at, pase } \| null } }` |
| `GET /api/portal/archivo/(foto\|firma\|pdf\|carnet\|pase)` | — | Binario. PDF con `Content-Disposition: attachment`. `carnet` → 404 hasta que el registro esté `ACTIVO` |
| `POST /api/semana/inscribir` **(idem)** | `{ telefono, talla_camiseta, restricciones_alimentarias, yappy_referencia, comprobante, comprobante_sha256 }` | `{ ok, numero, verificacionUrl, correoEnviado }` |

## Personal (administradores y verificadores)

| Método y ruta | Rol | Notas |
|---|---|---|
| `POST /api/auth/google` | — | `{ credential }` (ID token de Google Identity Services). Se verifica en el servidor contra `GOOGLE_CLIENT_ID`; el correo debe estar en `ADMIN_EMAILS` o `VERIFICADORES_EMAILS` |
| `POST /api/auth/simulado` | — | `{ email }`. **Solo sin Google real** (API simulada o modo emulado); en producción responde 404 |
| `POST /api/auth/salir` · `GET /api/auth/yo` | — | `yo` → `{ ok, email, rol: 'admin'\|'verificador' }` |
| `POST /api/verificar/entrada` | ambos | `{ t }` → `{ ok, yaHabiaEntrado, checkin_at, checkin_por }` |
| `GET /api/admin/resumen` | admin | Contadores (incluye `porAprobar` y `rechazados`), `recaudado`, `cuotaCorreo` (`MailApp.getRemainingDailyQuota()`), `correosPendientes` |
| `GET /api/admin/catequistas?q=&estado=&zona=&vicaria=&parroquia=` | admin | `{ items: [{ id, numero, nombre, cedula, correo, parroquia, vicaria_zona, zona_pastoral, estado, fecha_registro }] }`. Con `estado=PENDIENTE_APROBACION` (cola) va del más antiguo al más reciente; si no, al revés. `zona`/`vicaria`/`parroquia` filtran por las etiquetas que devuelve `estadisticas` |
| `GET /api/admin/estadisticas` | admin | `{ estados, total: {ESTADO: n}, zonas: [{ id, nombre, corto, area, conteo, vicarias: [{ id, nombre, corto, conteo, parroquias: [{ id, nombre, coordinador, propuesta, catalogo, conteo }] }] }] }`. Todo el catálogo (también en cero), las parroquias escritas a mano y una zona «Sin clasificar» para registros que no se pueden ubicar |
| `GET /api/admin/territorio` | admin | `{ origen: 'base'\|'hoja', zonas: [{ id, nombre, area, vicarias: [{ id, nombre, etiqueta, activa, parroquias: [{ id, nombre, coordinador, propuesta, activa, catequistas }] }] }], fuera: [{ nombre, vicaria, vicaria_id, zona, catequistas }] }`. Incluye inactivas; `catequistas` = vigentes; `fuera` = parroquias escritas a mano |
| `POST /api/admin/territorio/parroquia` **(idem)** | admin | `{ id?, nombre, vicaria_id, coordinador, propuesta, activa, simular? }`. Sin `id` = alta. Con `simular: true` → `{ afectados }` sin guardar. Si no → `{ id, actualizados }`: guarda la fila y actualiza `parroquia`, `vicaria_zona`, `zona_pastoral` y `coordinador_parroquial` de los catequistas afectados (el coordinador solo donde tenían el anterior o ninguno). La primera edición siembra las pestañas con el catálogo inicial |
| `POST /api/admin/territorio/vicaria` **(idem)** | admin | `{ id?, nombre, zona_id, activa, simular? }`. Renombrar actualiza `vicaria_zona`; cambiar de zona actualiza `zona_pastoral`. No se desactiva con parroquias activas |
| `GET /api/admin/cumpleanos?dias=30` | admin | `{ hoy, activo, dias, items: [{ id, numero, nombre, parroquia, correo, fecha, dias, edad, saludo: { estado, fecha } \| null }] }`. Solo `ACTIVO` y no excluidos |
| `POST /api/admin/cumpleanos/saludar` **(idem)** | admin | `{ id }` → `{ enviado, mensaje }`. Saludo manual |
| `POST /api/admin/aprobar` **(idem)** | admin | `{ id }` → `{ ok, estado: 'ACTIVO', yaRevisado, correoEnviado, mensaje }`. Solo desde `PENDIENTE_APROBACION`; envía el carnet. Queda en `Auditoria` (`APROBAR`) y en `revisado_at`/`revisado_por` |
| `POST /api/admin/rechazar` **(idem)** | admin | `{ id, motivo ≥ 5 }` → `{ ok, estado: 'RECHAZADO', yaRevisado, correoEnviado, mensaje }`. Desde `PENDIENTE_APROBACION` o `PENDIENTE_DOCUMENTOS`; envía el motivo. Queda en `Auditoria` (`RECHAZAR`) y en `motivo_rechazo` |
| `GET /api/admin/catequistas/:id` | admin | `{ item, archivos: { foto, firma, comprobante, pdf, carnet }, pagos, semana, correos, verificacionUrl }`. Nunca expone IDs de Drive |
| `GET /api/admin/semana?q=` · `GET /api/admin/semana/:id` | admin | Equivalentes para `SemanaCatequista` |
| `GET /api/admin/archivo/(catequistas\|semana)/:id/(foto\|firma\|comprobante\|pdf\|carnet\|pase)` | admin (verificador: solo `foto`) | Descarga a través de la API con la cuenta de servicio |
| `POST /api/admin/anular` **(idem)** | admin | `{ tipo: 'catequista'\|'semana', id, motivo ≥ 5 }`. Anular un catequista anula también su inscripción y sus pagos. Queda en `Auditoria` |
| `POST /api/admin/regenerar` **(idem)** | admin | `{ id }` → vuelve a generar PDF y carnet y pasa a `ACTIVO` |
| `POST /api/admin/reenviar` **(idem)** | admin | `{ tipo, id }` → `{ ok, enviado, mensaje }` (si se agota la cuota queda `PENDIENTE`) |
| `GET /api/admin/exportar?tabla=catequistas\|semana\|pagos` | admin | CSV UTF-8 con BOM; celdas que empiezan por `= + - @` se prefijan con `'` |

## Tokens de verificación

`base64url(JSON) + "." + HMAC-SHA256(QR_SECRET)` truncado a 22 caracteres. Carnet: `{ k: 'c', i: <id catequista> }` → `/verificar/?c=`. Pase: `{ k: 't', i: <id inscripción>, n: <CAT-xxxxx>, e: <edición> }` → `/verificar/?t=`. Sin datos personales en claro. Un token de un tipo no sirve como el otro.
