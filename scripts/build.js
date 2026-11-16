import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['web/app.js'], outfile: 'dist/app.js', bundle: true, minify: true,
    format: 'esm', target: ['es2023'], legalComments: 'linked' }),
  ...['index.html', 'style.css', 'mark.svg'].map(file => copyFile('web/' + file, 'dist/' + file))
]);
