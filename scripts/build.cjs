const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.cpSync(path.join(root, 'public'), path.join(root, 'dist'), {recursive:true});
console.log('Prototipo preparado en dist/');
