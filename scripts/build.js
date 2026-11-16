import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['web/app.js'], outfile: 'dist/app.js', bundle: true, minify: true,
    format: 'esm', target: ['es2023'], legalComments: 'linked', loader: { '.woff2': 'dataurl', '.txt': 'text' } }),
  ...['style.css', 'mark.svg'].map(file => copyFile('web/' + file, 'dist/' + file)),
  copyFile('assets/Excalifont-OFL.txt', 'dist/Excalifont-OFL.txt')
]);
const [html, bundle, css] = await Promise.all([readFile('web/index.html', 'utf8'), readFile('dist/app.js'), readFile('dist/style.css')]);
const version = content => createHash('sha256').update(content).digest('hex').slice(0, 12);
const packages = ['yaml', 'roughjs', 'hachure-fill', 'path-data-parser', 'points-on-curve', 'points-on-path'];
const notices = await Promise.all(packages.map(async name =>
  `${name}\n\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`));
await Promise.all([
  writeFile('dist/third-party-notices.txt', notices.join('\n\n')),
  writeFile('dist/index.html', html
    .replace('./app.js', `./app.js?v=${version(bundle)}`)
    .replace('./style.css', `./style.css?v=${version(css)}`))
]);
