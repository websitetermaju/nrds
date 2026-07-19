const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
const include = [
  'index.html',
  'mulai-dari-sini.html',
  'produk.html',
  'library.html',
  'guides.html',
  'tentang.html',
  'robots.txt',
  'sitemap.xml',
  'vercel.json',
  'assets',
  'pilah'
];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) copy(path.join(src, child), path.join(dest, child));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

rmrf(out);
fs.mkdirSync(out, { recursive: true });
for (const item of include) copy(path.join(root, item), path.join(out, item));
console.log(`Build ready: ${out}`);
