import { analyzeRepository } from '../src/analyze.js';
import { diagramSvg, excalidrawScene, layoutDiagram, styles, xml } from '../src/diagram.js';
import { readBrowserFolder, readGitHub } from '../src/repository.js';
import { demoGraph } from '../src/demo.js';
import { componentRole, connectionRole } from '../src/roles.js';
import fontUrl from '../assets/Excalifont.woff2';
import fontLicense from '../assets/Excalifont-OFL.txt';

const icons = {
  github: '<path d="M9 19c-4.3 1.4-4.3-2.4-6-2.9m12 5v-3.4a3 3 0 0 0-.8-2.2c2.7-.3 5.6-1.3 5.6-6A4.7 4.7 0 0 0 18.5 6a4.4 4.4 0 0 0-.1-3.4s-1-.3-3.5 1.3a13.4 13.4 0 0 0-6.3 0C6.2 2.3 5.1 2.6 5.1 2.6A4.4 4.4 0 0 0 5 6a4.7 4.7 0 0 0-1.3 3.4c0 4.7 2.9 5.7 5.6 6a3 3 0 0 0-.8 2.2V21"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9H3z"/>',
  map: '<rect x="3" y="8" width="6" height="8" rx="1.5"/><rect x="15" y="3" width="6" height="7" rx="1.5"/><rect x="15" y="14" width="6" height="7" rx="1.5"/><path d="M9 12h3v-5h3m-3 5v5h3"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>'
};
document.querySelectorAll('[data-icon]').forEach(element => {
  element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[element.dataset.icon]}</svg>`;
});

const get = id => document.getElementById(id);
const canvas = get('canvas');
const drawing = get('drawing');
const inspector = get('inspector');
const folderInput = get('folder-input');
let graph;
let layout;
let drag;
let sequence = 0;
let request;
let view;

function moveView() {
  drawing.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  get('zoom-level').value = `${Math.round(view.scale * 100)}%`;
}

function fit() {
  if (!layout) return;
  const scale = Math.min(1.15, canvas.clientWidth / layout.width, (canvas.clientHeight - 35) / layout.height);
  view = { x: (canvas.clientWidth - layout.width * scale) / 2,
    y: (canvas.clientHeight - 35 - layout.height * scale) / 2, scale };
  moveView();
}

function zoom(multiplier) {
  const scale = Math.max(0.1, Math.min(3, view.scale * multiplier));
  const centerX = canvas.clientWidth / 2;
  const centerY = canvas.clientHeight / 2;
  view = { x: centerX - (centerX - view.x) * scale / view.scale,
    y: centerY - (centerY - view.y) * scale / view.scale, scale };
  moveView();
}

function evidence(path) {
  if (!graph.repository.url || !graph.repository.revision) return xml(path);
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `<a href="${xml(graph.repository.url)}/blob/${xml(graph.repository.revision)}/${xml(encoded)}" target="_blank" rel="noopener">${xml(path)}</a>`;
}

function selectNode(id) {
  const node = graph.nodes.find(item => item.id === id);
  drawing.querySelectorAll('[data-node]').forEach(item => {
    item.classList.toggle('active', item.dataset.node === id);
    item.setAttribute('aria-pressed', String(item.dataset.node === id));
  });
  inspector.hidden = !node;
  if (!node) return;
  const style = styles[node.type];
  const related = graph.edges.filter(edge => edge.from === id || edge.to === id);
  const files = [...new Set([node.roleEvidence, ...node.evidence].filter(Boolean))]
    .map(path => `<li class="evidence">${evidence(path)}</li>`).join('');
  const connections = related.map(edge => {
    const outgoing = edge.from === id;
    const other = graph.nodes.find(item => item.id === (outgoing ? edge.to : edge.from));
    return `<li><button class="connection" data-target="${xml(other.id)}">
      <strong>${outgoing ? '→' : '←'} ${xml(other.title)}</strong>
      <span>${xml(connectionRole(edge))}${edge.inferred ? ' · Inferred' : ''}</span></button>
      <div class="connection-files">${edge.evidence.map(evidence).join('<br>')}</div></li>`;
  }).join('');
  inspector.innerHTML = `<button class="dismiss" type="button" aria-label="Close component details" data-dismiss>×</button>
    <span class="type" style="background:${style.light};color:${style.ink}">${style.label}</span>
    <h3>${xml(node.title)}</h3><p class="tech">${xml(node.tech)}</p>
    <p class="role">${xml(componentRole(node))}</p>
    <section><h4>Source evidence</h4>${files ? `<ul>${files}</ul>` : '<p class="empty">No source references.</p>'}</section>
    <section><h4>Connections</h4>${connections ? `<ul>${connections}</ul>` : '<p class="empty">No connections detected.</p>'}</section>`;
  inspector.scrollTop = 0;
}

function show(next, isExample = false) {
  graph = next;
  layout = layoutDiagram(graph);
  get('map-title').textContent = graph.repository.title ?? graph.repository.name;
  const components = `${graph.nodes.length} component${graph.nodes.length === 1 ? '' : 's'}`;
  get('map-meta').textContent = isExample ? `Example map · ${components}` : `${components} · ${graph.filesScanned} files read`;
  get('scan-notes').textContent = graph.notes.join(' ');
  get('inferred-key').hidden = !graph.edges.some(edge => edge.inferred);
  drawing.style.width = `${layout.width}px`;
  drawing.innerHTML = diagramSvg(graph, { interactive: true, layout, fontUrl });
  selectNode();
  fit();
}

function status(message, error = false) {
  const element = get('status');
  element.hidden = !message;
  element.textContent = message;
  element.classList.toggle('error', error);
}

function busy(value) {
  get('generate').disabled = value;
  get('generate-text').textContent = value ? 'Reading repo…' : 'Generate map';
}

async function generate(read) {
  request?.abort();
  request = new AbortController();
  const current = ++sequence;
  busy(true);
  status('Reading source files…');
  try {
    const repository = await read(request.signal);
    if (current !== sequence) return;
    show(analyzeRepository(repository));
    status('');
  } catch (error) {
    if (current === sequence) status(error.name === 'TimeoutError' ? 'GitHub took too long to respond. Try again or open a local folder.' : error.message, true);
  } finally {
    if (current === sequence) busy(false);
  }
}

get('github-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = get('repo-url').value;
  generate(signal => readGitHub(input, { signal }));
});
get('open-folder').addEventListener('click', () => folderInput.click());
folderInput.addEventListener('change', async () => {
  if (!folderInput.files.length) return;
  const files = Array.from(folderInput.files);
  folderInput.value = '';
  await generate(() => readBrowserFolder(files));
});
get('sample').addEventListener('click', () => {
  request?.abort();
  sequence++;
  busy(false);
  status('');
  get('repo-url').value = '';
  show(demoGraph, true);
});
get('zoom-in').addEventListener('click', () => zoom(1.18));
get('zoom-out').addEventListener('click', () => zoom(1 / 1.18));
get('fit').addEventListener('click', fit);
new ResizeObserver(fit).observe(canvas);

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('[data-node]')) return;
  selectNode();
  drag = { id: event.pointerId, x: event.clientX - view.x, y: event.clientY - view.y };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return;
  view.x = event.clientX - drag.x;
  view.y = event.clientY - drag.y;
  moveView();
});
canvas.addEventListener('lostpointercapture', () => {
  drag = null;
  canvas.classList.remove('dragging');
});
drawing.addEventListener('click', event => selectNode(event.target.closest('[data-node]')?.dataset.node));
drawing.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  selectNode(event.target.closest('[data-node]')?.dataset.node);
});
inspector.addEventListener('click', event => {
  if (event.target.closest('[data-dismiss]')) {
    const selected = drawing.querySelector('[data-node].active');
    selectNode();
    selected?.focus();
    return;
  }
  const id = event.target.closest('[data-target]')?.dataset.target;
  if (id) {
    selectNode(id);
    [...drawing.querySelectorAll('[data-node]')].find(item => item.dataset.node === id)?.focus();
  }
});

function download(content, extension, type) {
  const name = graph.repository.name.split('/').at(-1).replace(/[^\w.-]/g, '-');
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.download = `${name || 'system-map'}.${extension}`;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
get('export-svg').addEventListener('click', () => download(diagramSvg(graph, { layout, fontUrl, fontLicense }), 'svg', 'image/svg+xml'));
get('export-excalidraw').addEventListener('click', () => download(JSON.stringify(excalidrawScene(graph, layout), null, 2), 'excalidraw', 'application/json'));
show(demoGraph, true);

const linkedRepository = new URLSearchParams(location.hash.slice(1)).get('repository');
if (linkedRepository?.trim()) {
  get('repo-url').value = linkedRepository;
  get('github-form').requestSubmit();
}
