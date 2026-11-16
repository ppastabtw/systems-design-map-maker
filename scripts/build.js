import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['web/app.js'], outfile: 'dist/app.js', bundle: true, minify: true,
    format: 'esm', target: ['es2023'], legalComments: 'linked' }),
  ...['style.css', 'mark.svg'].map(file => copyFile('web/' + file, 'dist/' + file))
]);
const [html, bundle] = await Promise.all([readFile('web/index.html', 'utf8'), readFile('dist/app.js')]);
const revision = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
await writeFile('dist/index.html', html.replace('./app.js', `./app.js?v=${revision}`));
