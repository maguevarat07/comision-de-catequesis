# Comisión de Catequesis

Prototipo de presentación de la Comisión de Catequesis de la Arquidiócesis de Panamá. Conserva el diseño y los recursos del HTML facilitado. Su finalidad actual es revisar el aspecto visual y las interacciones antes de desarrollar el sitio definitivo.

## Desarrollo local

Con Node.js 20 o superior:

```sh
npm run dev
```

Abrir http://127.0.0.1:4173. No necesita instalar dependencias.

```sh
npm run build
```

Genera `dist/`, la carpeta pública para Vercel.

## Estructura

- `public/index.html`: contenido y plantilla del componente.
- `public/css/styles.css`: tipografías, diseño y animaciones.
- `public/js/app.js`: estado e interacciones de la muestra.
- `public/assets/`: imágenes, fuentes y motor incluido en el archivo original.
- `scripts/`: servidor local y preparación para publicación.
- `vercel.json`: configuración de publicación.

El motor original utiliza React 18.3.1 y una plantilla declarativa. La pequeña clase dentro del HTML conecta la plantilla con `app.js`. Se conservó esta estructura para mantener fielmente el prototipo.

## Alcance de la muestra

El formulario **no envía ni guarda datos**. La agenda presenta actividades habituales, sin anunciar fechas ni sedes concretas. El mapa de zonas es referencial. La directiva `noindex` evita solicitar la indexación de esta etapa; no restringe el acceso a quien tenga el enlace. El código puede estar en un repositorio privado mientras el sitio de presentación es público.

## Fuentes del contenido

La misión, visión, funciones y actividades proceden de `QUIÉNES SOMOS.docx`; la información del equipo procede de `Reseña del Equipo de la Comisión Arquidiocesana de Catequesis.docx`; y la formación de CENAFCA procede de `CENTRO ARQUIDIOCESANO PARA LA FORMACIÓN DE CATEQUISTAS.docx`, facilitados por la Comisión. Los logos de la Sección, CENAFCA y «Catequistas con un solo corazón» se prepararon a partir de la carpeta `LOGOS CATEQUESIS` facilitada. El teléfono, la dirección y el enlace de Facebook se tomaron de la página anterior `https://www.labdev.space/cacp/`; el correo figura también en el documento de CENAFCA. Conviene confirmar que esos canales siguen vigentes antes del lanzamiento definitivo.

## Ampliación posterior

Ver `docs/PROXIMOS-PASOS.md`. Esta base admite contenido nuevo, formularios reales, servicios y API sin reemplazar el diseño. No se ha añadido un servidor innecesario para esta presentación.

## Recursos

Las demás imágenes y el motor proceden del archivo HTML original. Las licencias de fuentes se conservan en `public/assets/FONT-LICENSES.txt`; los archivos de React mantienen sus avisos originales.
