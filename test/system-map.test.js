import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRepository } from '../src/analyze.js';
import { diagramSvg, excalidrawScene, layoutDiagram } from '../src/diagram.js';
import { fileKind, parseGitHub, readBrowserFolder, readGitHub } from '../src/repository.js';

const scan = (entries, name = 'project') => analyzeRepository({
  name, files: Object.entries(entries).map(([path, content]) => ({ path, content, kind: fileKind(path) }))
});

test('recognizes a Compose monorepo and preserves explicit links and their source evidence', () => {
  const graph = scan({
    'package.json': '{"name":"store","workspaces":["apps/*"]}',
    'apps/web/package.json': '{"name":"store-web","dependencies":{"next":"1"}}',
    'apps/web/main.js': "fetch('http://orders-api:8080/api/orders')",
    'apps/api/package.json': '{"name":"orders-api","dependencies":{"express":"1","pg":"1","stripe":"1"}}',
    'apps/api/server.js': "import express from 'express'; import pg from 'pg';",
    'apps/worker/package.json': '{"name":"order-worker","dependencies":{"bullmq":"1","redis":"1"}}',
    'apps/worker/main.js': "import { Worker } from 'bullmq'; new Worker('orders', processOrder);",
    'compose.yaml': 'services:\n  web:\n    build: ./apps/web\n  orders-api:\n    build: ./apps/api\n    depends_on: [db]\n  db:\n    image: postgres:16\n  jobs:\n    build: ./apps/worker\n    depends_on: [cache]\n  cache:\n    image: redis:7',
    'compose.images.yaml': 'services:\n  orders-api:\n    image: custom/orders-api\n  cache:\n    image: redis:7'
  });
  assert.deepEqual(graph.nodes.map(node => node.type).sort(), ['api', 'database', 'external', 'frontend', 'queue', 'worker']);
  const edge = (from, to) => graph.edges.find(item => item.from === from && item.to === to);
  assert.equal(edge('unit:apps/web', 'unit:apps/api').label, 'HTTP');
  assert.equal(edge('unit:apps/api', 'resource:postgres').inferred, false);
  assert.ok(edge('unit:apps/api', 'resource:postgres').evidence.includes('compose.yaml'));
  assert.equal(edge('unit:apps/api', 'resource:stripe').inferred, true);
  assert.ok(graph.nodes.find(item => item.id === 'unit:apps/api').evidence.includes('compose.images.yaml'));
});

test('finds a Python CLI, its bundled API, and a separate web app', () => {
  const graph = scan({
    'pyproject.toml': '[project]\nname = "planner"\n[project.scripts]\nplanner = "planner.cli:app"',
    'src/planner/cli.py': 'from .web.server import app',
    'src/planner/web/server.py': 'from fastapi import FastAPI\napp = FastAPI()',
    'src/planner/llm.py': 'PARTNER_BASE_URL = "https://api.partner.dev/v1"',
    'webapp/package.json': '{"name":"planner-web","dependencies":{"react":"1"}}',
    'webapp/src/App.jsx': 'fetch("/api/schedule")'
  });
  assert.deepEqual(graph.nodes.map(node => [node.type, node.tech]),
    [['api', 'FastAPI'], ['frontend', 'React'], ['cli', 'CLI'], ['external', 'HTTP endpoint']]);
  assert.equal(graph.edges.find(item => item.from === 'unit:webapp').label, 'HTTP');
  assert.equal(graph.edges.find(item => item.to === 'host:partner.dev').inferred, true);
});

test('a library does not get services merely mentioned in its docs or source strings', () => {
  const graph = scan({
    'package.json': '{"name":"tiny","exports":"./index.js","devDependencies":{"pg":"1"}}',
    'README.md': 'Could work with PostgreSQL, Redis, or Stripe',
    'index.js': 'export const frameworks = ["Nuxt", "React", "Express"]; export const database = "Redis and PostgreSQL example";'
  });
  assert.deepEqual(graph.nodes.map(node => node.type), ['library']);
  assert.deepEqual(graph.edges, []);
});

test('exports labels, escaped XML, and editable Excalidraw elements for a cyclic graph', () => {
  const graph = {
    repository: { name: '<example>' },
    nodes: [{ id: 'a', title: 'A & B', type: 'api', tech: 'API' }, { id: 'b', title: 'Store', type: 'database', tech: 'SQL' }],
    edges: [{ from: 'a', to: 'b', label: 'Reads / writes', inferred: true }, { from: 'b', to: 'a', label: 'Updates' }]
  };
  const layout = layoutDiagram(graph);
  assert.equal(layout.nodes.length, 2);
  assert.equal(layout.edges.length, 2);
  const svg = diagramSvg(graph, { layout });
  assert.match(svg, /A &amp; B/);
  assert.match(svg, /Reads \/ writes/);
  assert.match(svg, /stroke-dasharray/);
  const scene = excalidrawScene(graph, layout);
  assert.equal(scene.type, 'excalidraw');
  assert.equal(scene.elements.filter(item => item.type === 'rectangle').length, 2);
  assert.equal(scene.elements.filter(item => item.type === 'arrow').length, 2);
  assert.ok(scene.elements.filter(item => item.type === 'rectangle').every(item => item.fillStyle === 'hachure'));
  assert.ok(scene.elements.filter(item => item.type === 'text').every(item => item.fontFamily === 5));
  assert.ok(scene.elements.some(item => item.text === 'Reads / writes'));
});

test('reads a selected local folder without opening its ignored files', async () => {
  const repo = await readBrowserFolder([
    { webkitRelativePath: 'local/package.json', size: 18, text: async () => '{"name":"local"}' },
    { webkitRelativePath: 'local/.env', size: 20, text: async () => assert.fail('Secret file read') },
    { webkitRelativePath: 'local/examples/server.js', size: 100, text: async () => assert.fail('Example file read') },
    { webkitRelativePath: 'local/node_modules/p/index.js', size: 100, text: async () => assert.fail('Vendor file read') }
  ]);
  assert.equal(repo.name, 'local');
  assert.deepEqual(repo.files.map(file => file.path), ['package.json']);
});

test('uses commit-pinned GitHub sources and skips symlinks', async () => {
  const requests = [];
  const repo = await readGitHub('https://github.com/sample/project.git', { async fetcher(url) {
    requests.push(url);
    if (url.endsWith('/commits/HEAD')) return Response.json({ sha: 'commit', commit: { tree: { sha: 'tree' } } });
    if (url.endsWith('/git/trees/tree?recursive=1')) return Response.json({ tree: [
      { path: 'main.go', type: 'blob', mode: '100644', size: 40 },
      { path: 'linked.go', type: 'blob', mode: '120000', size: 20 }
    ] });
    return new Response('package main\nfunc main() {}');
  } });
  assert.equal(repo.revision, 'commit');
  assert.deepEqual(requests, [
    'https://api.github.com/repos/sample/project/commits/HEAD',
    'https://api.github.com/repos/sample/project/git/trees/tree?recursive=1',
    'https://raw.githubusercontent.com/sample/project/commit/main.go'
  ]);
  assert.throws(() => parseGitHub('https://github.com.example.net/sample/project'), /GitHub repository URL/);
});
