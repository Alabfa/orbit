'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name));
const write = (name, text) => fs.writeFileSync(path.join(root, name), text);
const context = vm.createContext({});
vm.runInContext(read('texts.js').toString() + '\nthis.copyData = COPY;', context);
const text = context.copyData;

// Platform metadata is generated from the same copy file as the visible UI.
write('manifest.webmanifest', JSON.stringify({
  id: './', name: text.meta.brand, short_name: text.meta.brand,
  description: text.install.description, lang: 'ar', dir: 'rtl',
  start_url: './', scope: './', display: 'standalone',
  background_color: '#e3eaee', theme_color: '#e3eaee',
  categories: ['games'], prefer_related_applications: false,
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2) + '\n');
const escapedBrand = text.meta.brand.replace(/[&"<>]/g, char => ({'&':'&amp;', '"':'&quot;', '<':'&lt;', '>':'&gt;'}[char]));
write('index.html', read('index.html').toString().replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(">)/, (_, before, after) => before + escapedBrand + after));

const assets = [
  'index.html', 'styles.css', 'texts.js', 'settings.js', 'pwa.js', 'app.js',
  'favicon.svg', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  ...fs.readdirSync(path.join(root, 'fonts')).filter(name => name.endsWith('.woff2')).sort().map(name => 'fonts/' + name)
];
const template = read('scripts/service-worker.template.js').toString();
const hash = crypto.createHash('sha256').update(template);
for (const name of assets) hash.update(name).update(read(name));
const version = hash.digest('hex').slice(0, 16);
write('sw.js', template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(assets, null, 2)));
console.log(`Built offline shell ${version} (${assets.length} files).`);
