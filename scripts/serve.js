import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const types = {
  'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8',
  'style.css': 'text/css; charset=utf-8', 'mark.svg': 'image/svg+xml'
};
const port = Number(process.env.PORT ?? 4173);
createServer(async (request, response) => {
  const requested = request.url.split('?')[0].slice(1) || 'index.html';
  if (!Object.hasOwn(types, requested)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(new URL('../dist/' + requested, import.meta.url));
    response.writeHead(200, { 'Content-Type': types[requested] }).end(data);
  } catch {
    response.writeHead(500).end('Run npm run build first.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local preview at http://127.0.0.1:${port}/`));
