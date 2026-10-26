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

El formulario **no envía ni guarda datos**. La agenda y los datos de contacto están pendientes de confirmación. La directiva `noindex` evita solicitar la indexación de esta etapa; no restringe el acceso a quien tenga el enlace. El código puede estar en un repositorio privado mientras el sitio de presentación es público.

## Ampliación posterior

Ver `docs/PROXIMOS-PASOS.md`. Esta base admite contenido nuevo, formularios reales, servicios y API sin reemplazar el diseño. No se ha añadido un servidor innecesario para esta presentación.

## Recursos

Las imágenes y el motor proceden del archivo suministrado. Las licencias de fuentes se conservan en `public/assets/FONT-LICENSES.txt`; los archivos de React mantienen sus avisos originales.
