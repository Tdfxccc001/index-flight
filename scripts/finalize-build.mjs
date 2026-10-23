import fs from 'node:fs';
import crypto from 'node:crypto';
const assets = [
  './',
  './data/sse_composite_daily.json',
  './icon.svg',
  './fonts/RobotoMono.ttf',
  './fonts/Manrope.ttf',
  ...fs
    .readdirSync('dist/assets')
    .sort()
    .map((name) => './assets/' + name),
];
const hash = crypto.createHash('sha256');
for (const url of assets)
  hash.update(fs.readFileSync(url === './' ? 'dist/index.html' : 'dist/' + url.slice(2)));
const id = hash.digest('hex').slice(0, 16);
const sw = fs
  .readFileSync('public/sw.js', 'utf8')
  .replace('__BUILD__', id)
  .replace("/*__PRECACHE__*/ ['./','./data/sse_composite_daily.json']", JSON.stringify(assets));
fs.writeFileSync('dist/sw.js', sw);
fs.writeFileSync(
  'dist/build-info.json',
  JSON.stringify(
    {
      version: JSON.parse(fs.readFileSync('package.json', 'utf8').replace(/^\uFEFF/, '')).version,
      build: id,
      assets,
    },
    null,
    2,
  ),
);
console.log(`Offline precache: ${assets.length} files, build ${id}`);
