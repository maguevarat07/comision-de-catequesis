# Contrato de la API · Registro de catequistas

El frontend (`public/`) solo conoce estas rutas. Hoy las implementa la **API simulada** (`scripts/api-simulada.cjs`, en memoria) y en la siguiente fase las implementará la **API real** en `api/` (función única de Vercel + Google Sheets/Drive/Gmail). Ambas deben comportarse igual.

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
| `ANULADO` | 409 | Operación sobre algo anulado |
| `DEMASIADOS_INTENTOS` | 429 | 5 fallos en 15 min por correo o IP |

## Público

| Método y ruta | Cuerpo / parámetros | Respuesta |
|---|---|---|
| `GET /api/salud` | — | `{ ok, modo, configLeida, hora }` |
| `GET /api/config-publica` | — | `{ ok, config: { modo: 'simulado'\|'google', googleClientId, urlSitio, registroAbierto, costoRegistro, costoSemana, moneda, yappy: { directorio, telefono, instrucciones }, semana: { edicion, abierta, fechas, sede, cupo, inscritos, hayCupo, costo, moneda, campos: { talla, restricciones } } } }` |
| `POST /api/registro` **(idem)** | `{ datos: { nombres, apellidos, cedula, fecha_nacimiento, sexo, telefono, correo, direccion, parroquia, vicaria_zona, anios_servicio, nivel_que_imparte[], formacion_cenafca, coordinador_parroquial, yappy_referencia, consentimiento_datos: true, consentimiento_imagen: true }, foto, firma, comprobante, comprobante_sha256 }` | `{ ok, numero, estado, correoEnviado, correo, documentos: { pdf, carnet } }` y abre la sesión `cat_sesion` |
| `POST /api/recuperar` | `{ correo }` | Siempre `{ ok, mensaje }` genérico (no revela si existe) |
| `GET /api/verificar?c=<token>` o `?t=<token>` | — | `{ ok, tipo: 'carnet'\|'pase', estado, staff, publico?, detalle? }`. `estado`: `VALIDO`, `ANULADO`, `INEXISTENTE`, `VENCIDO`, `PENDIENTE`, `OTRA_EDICION`. `detalle` (nombre, foto, parroquia, entrada) solo con sesión de personal |

## Portal del catequista

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/portal/entrar` | `{ correo, numero }` (acepta `CAT-00001`, `cat-1`, `1`) | `{ ok }` + cookie |
| `POST /api/portal/salir` | `{}` | `{ ok }` |
| `GET /api/portal/yo` | — | `{ ok, catequista: { numero, nombres, apellidos, correo, telefono, parroquia, vicaria_zona, estado, fecha_registro, vigencia_hasta, fotoUrl, firmaUrl, verificacionUrl }, documentos: { pdf, carnet }, semana: { …config semana, puedeInscribirse, inscripcion: { numero, estado, fecha, talla, restricciones, verificacionUrl, checkin_at, pase } \| null } }` |
| `GET /api/portal/archivo/(foto\|firma\|pdf\|carnet\|pase)` | — | Binario. PDF con `Content-Disposition: attachment` |
| `POST /api/semana/inscribir` **(idem)** | `{ telefono, talla_camiseta, restricciones_alimentarias, yappy_referencia, comprobante, comprobante_sha256 }` | `{ ok, numero, verificacionUrl, correoEnviado }` |

## Personal (administradores y verificadores)

| Método y ruta | Rol | Notas |
|---|---|---|
| `POST /api/auth/google` | — | `{ credential }` (ID token de Google Identity Services). Se verifica en el servidor contra `GOOGLE_CLIENT_ID`; el correo debe estar en `ADMIN_EMAILS` o `VERIFICADORES_EMAILS` |
| `POST /api/auth/simulado` | — | `{ email }`. **Solo en la API simulada**; la real responde 404 |
| `POST /api/auth/salir` · `GET /api/auth/yo` | — | `yo` → `{ ok, email, rol: 'admin'\|'verificador' }` |
| `POST /api/verificar/entrada` | ambos | `{ t }` → `{ ok, yaHabiaEntrado, checkin_at, checkin_por }` |
| `GET /api/admin/resumen` | admin | Contadores, `recaudado`, `cuotaCorreo` (`MailApp.getRemainingDailyQuota()`), `correosPendientes` |
| `GET /api/admin/catequistas?q=&estado=` | admin | `{ items: [{ id, numero, nombre, cedula, correo, parroquia, vicaria_zona, estado, fecha_registro }] }` |
| `GET /api/admin/catequistas/:id` | admin | `{ item, archivos: { foto, firma, comprobante, pdf, carnet }, pagos, semana, correos, verificacionUrl }`. Nunca expone IDs de Drive |
| `GET /api/admin/semana?q=` · `GET /api/admin/semana/:id` | admin | Equivalentes para `SemanaCatequista` |
| `GET /api/admin/archivo/(catequistas\|semana)/:id/(foto\|firma\|comprobante\|pdf\|carnet\|pase)` | admin (verificador: solo `foto`) | Descarga a través de la API con la cuenta de servicio |
| `POST /api/admin/anular` **(idem)** | admin | `{ tipo: 'catequista'\|'semana', id, motivo ≥ 5 }`. Anular un catequista anula también su inscripción y sus pagos. Queda en `Auditoria` |
| `POST /api/admin/regenerar` **(idem)** | admin | `{ id }` → vuelve a generar PDF y carnet y pasa a `ACTIVO` |
| `POST /api/admin/reenviar` **(idem)** | admin | `{ tipo, id }` → `{ ok, enviado, mensaje }` (si se agota la cuota queda `PENDIENTE`) |
| `GET /api/admin/exportar?tabla=catequistas\|semana\|pagos` | admin | CSV UTF-8 con BOM; celdas que empiezan por `= + - @` se prefijan con `'` |

## Tokens de verificación

`base64url(JSON) + "." + HMAC-SHA256(QR_SECRET)` truncado a 22 caracteres. Carnet: `{ k: 'c', i: <id catequista> }` → `/verificar/?c=`. Pase: `{ k: 't', i: <id inscripción>, n: <CAT-xxxxx>, e: <edición> }` → `/verificar/?t=`. Sin datos personales en claro. Un token de un tipo no sirve como el otro.
