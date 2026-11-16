#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeRepository } from '../src/analyze.js';
import { diagramSvg, excalidrawScene, layoutDiagram } from '../src/diagram.js';
import { readLocalFolder } from '../src/local-repository.js';
import { readGitHub } from '../src/repository.js';

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string', short: 'o', default: 'output' }, help: { type: 'boolean', short: 'h' } }
  });
  if (values.help) {
    console.log('Usage: system-map <project-folder | GitHub URL> [--out <directory>]\nWrites system-map.svg, system-map.excalidraw, and system-map.json.');
    return;
  }
  if (positionals.length !== 1) throw new Error('Supply exactly one project folder or GitHub URL. Run with --help for usage.');
  const [source] = positionals;
  const local = await stat(source).catch(error => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EINVAL') return null;
    throw error;
  });
  const repo = local ? await readLocalFolder(source) : await readGitHub(source);
  const graph = analyzeRepository(repo);
  const layout = layoutDiagram(graph);
  const output = resolve(values.out);
  const json = value => JSON.stringify(value, null, 2) + '\n';
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(join(output, 'system-map.svg'), diagramSvg(graph, { layout })),
    writeFile(join(output, 'system-map.excalidraw'), json(excalidrawScene(graph, layout))),
    writeFile(join(output, 'system-map.json'), json(graph))
  ]);
  console.log(`${repo.name}: ${graph.nodes.length} components, ${graph.edges.length} connections, ${graph.filesScanned} files read.\nSaved to ${output}`);
  graph.notes.forEach(note => console.log(note));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
