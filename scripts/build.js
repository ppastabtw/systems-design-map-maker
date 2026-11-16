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
await writeFile('dist/index.html', html
  .replace('./app.js', `./app.js?v=${version(bundle)}`)
  .replace('./style.css', `./style.css?v=${version(css)}`));
