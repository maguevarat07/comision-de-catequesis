# Despliegue del registro de catequistas

Cómo poner en línea el módulo de registro con Google real. Sitio de producción: **https://comision-de-catequesis.vercel.app**.

## Cómo funciona

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| Sitio (`public/`) | Vercel, estático | Formularios, portal, panel y escáner |
| API (`api/index.js`) | Vercel, una sola función | Valida, genera PDF y QR, lee la hoja con la cuenta de servicio |
| Escritor (`apps-script/Code.gs`) | Apps Script, como aplicación web | Única vía de escritura: hoja, Drive y correos (Gmail) |
| Hoja «Catequesis · Base de Registro» | Google Sheets | Base de datos |
| Carpetas `01_Fotos` … `99_Respaldos` | Google Drive | Fotos, firmas, comprobantes, PDF, QR y respaldos |

La cuenta de servicio `lector-inscripciones@catequesispanama.iam.gserviceaccount.com` solo **lee**. Las cuentas de servicio no tienen espacio propio en Drive, así que todo lo que se guarda lo crea el escritor de Apps Script con tu cuenta. La API firma cada solicitud al escritor con HMAC (`APPS_SCRIPT_WRITER_SECRET`), con marca de tiempo y un nonce de un solo uso.

## 1. Google Drive: compartir la carpeta raíz

Comparte la carpeta raíz del módulo (`DRIVE_RAIZ` en `Config`) con la cuenta de servicio como **Lector**:
https://drive.google.com/drive/folders/16rN1mUHJ79gLQasHiaTY5-QeEslZPCvz

Sin esto, el portal y el panel no pueden mostrar fotos ni PDF. Comprobación: `npm run google:verificar`.

## 2. Escritor de Apps Script

### Opción A: con clasp (recomendada)

1. Activa la API de Apps Script en https://script.google.com/home/usersettings.
2. Inicia sesión: `npx @google/clasp@3.4.1 login`.
3. Crea el proyecto vinculado a la hoja y súbelo:
   ```sh
   cd apps-script
   npx @google/clasp@3.4.1 create --type sheets --title "Escritor · Registro de catequistas" --parentId 14CKL3JQ34CDsxN-e-wQoRq2VOkooYUa3byPB1GQhv6c
   npx @google/clasp@3.4.1 push --force
   ```

Proyecto actual: https://script.google.com/d/171BRor3yHd152NCdhaPYcZEj5TYerXnNhoWARCxQEUONllJgM4McZlVX/edit (`apps-script/.clasp.json`). clasp 3.4.1 ignora `--parentId`: el script quedó vinculado a una hoja propia llamada «Escritor · Registro de catequistas». **No borres esa hoja**: el escritor se borraría con ella. Escribe en la hoja de registro gracias a la propiedad `SHEET_ID`. Para subir cambios: `npx @google/clasp@3.4.1 push --force` y luego `npx @google/clasp@3.4.1 update-deployment AKfycbxlimTxX9M-dSJgWQRqZ99DDha06eFkOCxt-uUOz6gnkhOv1U8KeAb9tPdDVt4z6BU5`.

### Opción B: a mano

1. Abre la hoja → **Extensiones → Apps Script**.
2. Pega el contenido de `apps-script/Code.gs` en `Código.gs`.
3. En **Configuración del proyecto**, marca «Mostrar el archivo de manifiesto appsscript.json» y pega `apps-script/appsscript.json`.

### En ambos casos

1. **Configuración del proyecto → Propiedades del script**:
   - `SHEET_ID` = `14CKL3JQ34CDsxN-e-wQoRq2VOkooYUa3byPB1GQhv6c`
   - `WRITER_SECRET` = el valor de `APPS_SCRIPT_WRITER_SECRET` de `.env.local` (cópialo del archivo; no lo compartas)
2. En el editor, ejecuta la función `autorizar` y acepta los permisos (Hojas, Drive y Gmail).
3. Ejecuta `instalarActivadores` una vez: crea `procesarPendientes` (cada hora) y `respaldoDiario` (2:00 a. m.).
4. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. La firma HMAC es la que autoriza cada solicitud.
5. Copia la URL que termina en `/exec` en `APPS_SCRIPT_WRITER_URL` de `.env.local`.

Cada cambio posterior en `Code.gs` necesita **Implementar → Gestionar implementaciones → Editar → Nueva versión**. Así la URL `/exec` se mantiene.

## 3. Inicio de sesión del panel (Google Identity Services)

En https://console.cloud.google.com/apis/credentials?project=catequesispanama crea un **ID de cliente OAuth** de tipo **Aplicación web**:

- Orígenes autorizados de JavaScript:
  - `https://comision-de-catequesis.vercel.app`
  - `http://localhost`
  - `http://localhost:4173`
- URI de redireccionamiento autorizados: ninguno (el panel usa la ventana emergente de Google y valida el ID token en el servidor).

Pon el ID de cliente en `GOOGLE_CLIENT_ID` de `.env.local`. No es secreto.

## 4. Hoja `Config`

Completa los valores **POR DEFINIR**: `YAPPY_DIRECTORIO`, `YAPPY_TELEFONO`, `SEMANA_FECHAS`, `SEMANA_SEDE` y `URL_SITIO` (`https://comision-de-catequesis.vercel.app`). Opcionales: `SEMANA_PEDIR_TALLA` y `SEMANA_PEDIR_RESTRICCIONES`. Si faltan, valen TRUE.

`ADMIN_EMAILS` y `VERIFICADORES_EMAILS` de `Config` mandan sobre las variables de entorno y se releen en cada petición. Para quitar el acceso a alguien, basta con borrarlo de la hoja.

### Aprobación de registros y estructura territorial

- `REQUIERE_APROBACION` (opcional, TRUE si falta): con TRUE cada registro queda **Por aprobar** hasta que un administrador lo apruebe en el panel; solo entonces se envía el carnet. Con FALSE se vuelve al comportamiento anterior (activo al registrarse).
- La pestaña `Catequistas` necesita cuatro columnas nuevas: `zona_pastoral`, `revisado_at`, `revisado_por` y `motivo_rechazo`. **No hay que crearlas a mano**: el escritor las agrega al final de la fila de encabezados en su primera solicitud después de actualizarse (o ejecuta `migrarEsquema()` desde el editor de Apps Script). Las lecturas usan el nombre de la columna, así que el orden no importa.
- Al publicar esta versión hay que **volver a desplegar el escritor** (`apps-script/Code.gs`): Implementar → Gestionar implementaciones → editar la existente → Nueva versión, para conservar la misma URL `/exec`.
- El catálogo de zonas, vicarías, parroquias y coordinadores está en `api/_lib/territorio.js`. Los coordinadores salen de la sección «Equipo» de la portada: si cambian, actualiza los dos sitios.

## 5. Probar en local contra Google real

```sh
npm run google:verificar   # la cuenta de servicio lee la hoja
npm run dev:real           # http://localhost:4173 con la hoja, Drive y escritor reales
```

`dev:real` **escribe en la hoja real**. Haz pruebas con datos marcados como prueba y anúlalos o bórralos después; deja la hoja sin datos de prueba antes de abrir el registro.

## 6. Vercel

1. Genera el archivo de variables **fuera del repositorio**:
   ```sh
   npm run vercel:env -- "C:\Users\ahc_0\OneDrive\Documentos\.config\catequesispanama\vercel-produccion.env"
   ```
   El script solo muestra los nombres de las variables, nunca sus valores. Incluye la clave privada leída del JSON.
2. En Vercel → proyecto → **Settings → Environment Variables**, abre el archivo, copia todo su contenido y pégalo en el campo *Key*: Vercel separa las variables. Márcalas para **Production** (y **Preview** si quieres probar ramas).
3. Publica: fusiona la rama en `main` (o vuelve a desplegar desde el panel de Vercel si solo cambiaron las variables).
4. Comprueba https://comision-de-catequesis.vercel.app/api/salud: debe responder `"modo":"google","configLeida":true,"escritor":true`.

`QR_SECRET` no debe cambiar nunca después de imprimir carnets: invalidaría todos los QR. `SESSION_SECRET` sí puede rotarse (cierra todas las sesiones).

## Para quien administra Vercel

Estado al 12 de noviembre de 2026: la hoja, Drive, el escritor de Apps Script y el ID de cliente OAuth ya están configurados y probados. Solo falta Vercel:

1. Recibir por un canal privado el archivo `vercel-produccion.env`. **Nunca debe subirse a GitHub ni pegarse en chats públicos.**
2. Vercel → proyecto **comision-de-catequesis** → **Settings → Environment Variables**: pegar el contenido completo del archivo en el primer campo *Key* (Vercel separa las 10 variables). Marcar **Production** (y **Preview** si se quieren probar ramas). Guardar.
3. Fusionar la rama `feature/registro-catequistas` en `main`. Vercel despliega la producción.
4. Comprobar https://comision-de-catequesis.vercel.app/api/salud. Debe responder `"modo":"google","configLeida":true,"escritor":true`.
5. Comprobar que https://comision-de-catequesis.vercel.app/admin/ muestra el botón «Iniciar sesión con Google» y que entra con una cuenta de `ADMIN_EMAILS`.

Las variables deben estar cargadas **antes** de fusionar. Si no, las páginas del registro cargan pero la API responde «El servicio está en configuración». El resto del sitio no se ve afectado.

## Pruebas

```sh
npm test            # API real + escritor Code.gs sobre Google emulado (sin red ni credenciales)
npm run dev:emulado # sitio completo con Google emulado y dos catequistas de ejemplo
```

## Límites conocidos

- **Gmail personal: unos 100 correos al día** desde Apps Script. Si se agota la cuota, el correo queda `PENDIENTE` y `procesarPendientes` lo reintenta cada hora. El panel muestra la cuota restante.
- **Apps Script admite unas 30 ejecuciones simultáneas.** El escritor serializa las escrituras con `LockService` (espera hasta 30 s). Con picos muy altos, alguna solicitud puede recibir «El sistema está ocupado»; el formulario conserva los datos y se puede reenviar con la misma clave sin duplicar.
- El límite de 5 intentos de acceso cada 15 minutos se lleva en la memoria de cada instancia de Vercel. La espera fija en cada intento limita igualmente la fuerza bruta.
