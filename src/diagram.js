import rough from 'roughjs';
import { componentSymbol, symbolWidth, symbolHeight } from './component-symbols.js';
import { componentRole, connectionRole } from './roles.js';

export const styles = {
  frontend: { label: 'Frontend', light: '#d0bfff', ink: '#6741d9' },
  api: { label: 'API', light: '#a5d8ff', ink: '#1971c2' },
  worker: { label: 'Worker', light: '#ffec99', ink: '#8d5c13' },
  database: { label: 'Database', light: '#b2f2bb', ink: '#2b8a3e' },
  queue: { label: 'Queue / cache', light: '#ffd8a8', ink: '#a55114' },
  external: { label: 'External service', light: '#fcc2d7', ink: '#a61e4d' },
  cli: { label: 'CLI', light: '#c5f6fa', ink: '#0b7285' },
  library: { label: 'Library', light: '#e5dbff', ink: '#5f3dc4' },
  service: { label: 'Service', light: '#dee2e6', ink: '#495057' },
  cache: { label: 'Cache', light: '#c5f6fa', ink: '#0b7285' },
  gateway: { label: 'Gateway', light: '#a5d8ff', ink: '#1971c2' }
};

const ink = '#1e1e1e';
const pencil = '#495057';
const paper = '#ffffff';
const nodeWidth = 172;
const columnPitch = 242;
const top = 86;
const margin = 30;
const rankOrder = ['frontend', 'cli', 'gateway', 'api', 'service', 'queue', 'worker', 'database', 'cache', 'external', 'library'];

export function layoutDiagram(graph) {
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
  const ordered = [...graph.nodes].sort((a, b) => rankOrder.indexOf(a.type) - rankOrder.indexOf(b.type));
  const seen = new Set();
  const visiting = new Set();
  const forward = new Map(ordered.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    if (nodesById.has(edge.from) && nodesById.has(edge.to)) forward.get(edge.from).push(edge.to);
  }
  const order = [];
  function visit(id) {
    if (seen.has(id) || visiting.has(id)) return;
    visiting.add(id);
    forward.get(id).filter(target => !visiting.has(target)).forEach(visit);
    visiting.delete(id);
    seen.add(id);
    order.unshift(id);
  }
  [...ordered].reverse().forEach(node => visit(node.id));
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  const ranks = new Map(ordered.map(node => [node.id, 0]));
  for (const id of order) {
    for (const target of forward.get(id)) {
      if (orderIndex.get(target) > orderIndex.get(id)) ranks.set(target, Math.max(ranks.get(target), ranks.get(id) + 1));
    }
  }

  const columns = [];
  const connected = new Set(graph.edges.flatMap(edge => [edge.from, edge.to]));
  const disconnected = [];
  const hasConnections = graph.edges.length > 0;
  for (const node of ordered) {
    if (!connected.has(node.id)) {
      disconnected.push(node);
      continue;
    }
    const rank = ranks.get(node.id);
    (columns[rank] ??= []).push(node);
  }
  if (!hasConnections) {
    const size = Math.ceil(Math.sqrt(disconnected.length));
    disconnected.splice(0).forEach((node, index) => (columns[index % size] ??= []).push(node));
  }
  const rows = Math.max(1, ...columns.map(column => column.length));
  const nodeHeight = Math.max(134, ...ordered.map(node => {
    const { role, roleY } = nodeLabels(node);
    return roleY + Math.max(0, role.length - 1) * 17 + 8;
  }));
  const rowPitch = nodeHeight + 27;
  const disconnectedRows = Math.ceil(disconnected.length / Math.max(1, columns.length));
  const width = Math.max(350, (Math.max(1, columns.length) - 1) * columnPitch + nodeWidth + margin * 2);
  const height = (rows + disconnectedRows - 1) * rowPitch + nodeHeight + top + 32;
  const offsetX = (width - ((Math.max(1, columns.length) - 1) * columnPitch + nodeWidth)) / 2;
  const placed = new Map();
  columns.forEach((column, rank) => column.forEach((node, index) => placed.set(node.id, {
    ...node, x: offsetX + rank * columnPitch, y: top + ((rows - column.length) / 2 + index) * rowPitch,
    width: nodeWidth, height: nodeHeight, rank
  })));
  disconnected.forEach((node, index) => placed.set(node.id, {
    ...node, x: offsetX + index % columns.length * columnPitch, y: top + (rows + Math.floor(index / columns.length)) * rowPitch,
    width: nodeWidth, height: nodeHeight
  }));
  const edges = [];
  const endpointCounts = new Map();
  const importPairs = new Map();
  const routed = [];
  for (const edge of graph.edges.filter(item => placed.has(item.from) && placed.has(item.to))) {
    if (edge.label !== 'Imports') {
      routed.push(edge);
      continue;
    }
    const reverse = importPairs.get(JSON.stringify([edge.to, edge.from]));
    if (reverse) {
      reverse.bidirectional = true;
      reverse.flow = 'Shares code';
    } else {
      const connection = { ...edge };
      importPairs.set(JSON.stringify([edge.from, edge.to]), connection);
      routed.push(connection);
    }
  }
  for (const edge of routed) {
    for (const id of [edge.from, edge.to]) endpointCounts.set(id, (endpointCounts.get(id) ?? 0) + 1);
  }
  let crossing = 0;
  const used = new Map();
  for (const edge of routed) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    const rightward = to.x > from.x;
    const adjacent = Math.abs(from.rank - to.rank) === 1;
    function anchor(item, side) {
      const index = (used.get(item.id) ?? 0) + 1;
      used.set(item.id, index);
      const offset = endpointCounts.get(item.id) < 2 ? 0 : (index / (endpointCounts.get(item.id) + 1) - 0.5) * 30;
      const spread = symbolWidth / 2;
      return [item.x + nodeWidth / 2 + (side === 'right' ? spread : -spread), item.y + symbolHeight / 2 + offset];
    }
    const start = anchor(from, rightward ? 'right' : 'left');
    const end = anchor(to, rightward ? 'left' : 'right');
    start[0] += rightward ? 5 : -5;
    end[0] += rightward ? -5 : 5;
    let points;
    let label;
    if (adjacent) {
      const midX = (start[0] + end[0]) / 2;
      const midY = (start[1] + end[1]) / 2;
      const bow = Math.abs(end[1] - start[1]) < 20 ? 9 : 3;
      points = [start, [midX, midY + bow], end];
      label = [midX, midY + bow - 10];
    } else {
      const track = 66 + (crossing++ % 3) * 6;
      const startGap = start[0] + (rightward ? 18 : -18);
      const endGap = end[0] + (rightward ? -18 : 18);
      points = [start, [startGap, start[1]], [startGap, track], [endGap, track], [endGap, end[1]], end];
      label = [(startGap + endGap) / 2, track - 7];
    }
    edges.push({ ...edge, points, labelPosition: label });
  }
  return { nodes: [...placed.values()], edges, width, height };
}

export const xml = value => String(value).replace(/[&<>"']/g, part => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[part]);
const shorten = (value, max) => value.length > max ? value.slice(0, max - 1) + '…' : value;
const sketch = rough.generator();
const seedFor = id => [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, 23);
const handwritten = 'Excalifont, Comic Sans MS, sans-serif';

function wrap(value, limit, maxLines) {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + word.length + 1 > limit) {
      lines.push(current);
      current = '';
    }
    current = current ? current + ' ' + word : word;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) return [...lines.slice(0, maxLines - 1), shorten(lines.slice(maxLines - 1).join(' '), limit)];
  return lines.map(line => shorten(line, limit));
}

function nodeLabels(node) {
  const title = wrap(node.title, 18, 2);
  return { title, role: wrap(componentRole(node), 24, 3), roleY: symbolHeight + 24 + title.length * 18 };
}

function drawingTitle(graph) {
  const name = graph.repository.title ?? graph.repository.name.split('/').at(-1).replaceAll('-', ' ');
  return shorten(name ? name[0].toUpperCase() + name.slice(1) : 'Project', 36) + ' system design';
}

const headingSize = (title, width) => Math.min(32, (width - 36) / (title.length * 0.62));

function sketchPaths(drawing, dashed = false) {
  return sketch.toPaths(drawing).map(({ d, stroke, strokeWidth, fill }) =>
    `<path d="${d}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" ${dashed ? 'stroke-dasharray="7 5"' : ''}/>`).join('');
}

function sketchSymbol(symbol, seed) {
  return symbol.map((part, index) => {
    const options = { seed: (seed + index) >>> 0, stroke: ink, strokeWidth: 1.25, fill: part.fill === 'none' ? undefined : part.fill,
      fillStyle: 'solid', roughness: 0.52, fixedDecimalPlaceDigits: 2, preserveVertices: true };
    return sketchPaths(part.type === 'rectangle' ? sketch.rectangle(part.x, part.y, part.width, part.height, options) :
      part.type === 'ellipse' ? sketch.ellipse(part.x + part.width / 2, part.y + part.height / 2, part.width, part.height, options) :
        part.fill ? sketch.polygon(part.points.slice(0, -1), options) : sketch.linearPath(part.points, options));
  }).join('');
}

function arrowhead(points) {
  const [x, y] = points.at(-1);
  const [previousX, previousY] = points.at(-2);
  const angle = Math.atan2(y - previousY, x - previousX);
  const wing = direction => [x - 11 * Math.cos(direction), y - 11 * Math.sin(direction)];
  return [wing(angle - 0.47), [x, y], wing(angle + 0.47)];
}

export function diagramSvg(graph, { interactive = false, layout = layoutDiagram(graph), fontUrl, fontLicense } = {}) {
  const lines = layout.edges.map(({ points, labelPosition: [labelX, labelY], ...edge }) => {
    const options = { seed: seedFor(edge.from + '/' + edge.to), stroke: pencil, strokeWidth: 1.4,
      roughness: 0.75, fixedDecimalPlaceDigits: 2, preserveVertices: true };
    const body = sketch.linearPath(points, { ...options, disableMultiStroke: edge.inferred });
    const tip = sketch.linearPath(arrowhead(points), options);
    const returnTip = edge.bidirectional ? sketchPaths(sketch.linearPath(arrowhead([...points].reverse()), options)) : '';
    const labels = wrap(connectionRole(edge), 19, 2);
    return `<g class="map-edge" stroke-linejoin="round" stroke-linecap="round">
      ${sketchPaths(body, edge.inferred)}${sketchPaths(tip)}${returnTip}
      <text text-anchor="middle" font-family="${handwritten}" font-size="13" fill="${ink}" stroke="${paper}"
        stroke-width="5" paint-order="stroke" stroke-linejoin="round">${labels.map((label, index) =>
          `<tspan x="${labelX}" y="${labelY - (labels.length - 1 - index) * 14}">${xml(label)}</tspan>`).join('')}</text></g>`;
  }).join('');
  const components = layout.nodes.map(node => {
    const palette = styles[node.type];
    const key = interactive ? `class="map-node" role="button" tabindex="0" data-node="${xml(node.id)}" aria-label="${xml(node.title)}, ${xml(palette.label)}"` : '';
    const { title, role, roleY } = nodeLabels(node);
    const center = node.width / 2;
    const selection = interactive ?
      `<rect width="${node.width}" height="${node.height}" fill="transparent"/>
       <rect class="map-node-selection" x="-4" y="-6" width="${node.width + 8}" height="${node.height + 10}" rx="6" fill="none"/>` : '';
    return `<g ${key} transform="translate(${node.x} ${node.y})">
      ${selection}
      <g transform="translate(${center - symbolWidth / 2} 0)" stroke-linecap="round" stroke-linejoin="round">
        ${sketchSymbol(componentSymbol(node.type), seedFor(node.id))}
      </g>
      <text text-anchor="middle" fill="${ink}" font-size="18" font-weight="750">${title.map((line, index) =>
        `<tspan x="${center}" y="${symbolHeight + 19 + index * 18}">${xml(line)}</tspan>`).join('')}</text>
      <text text-anchor="middle" fill="${pencil}" font-size="15">${role.map((line, index) =>
        `<tspan x="${center}" y="${roleY + index * 17}">${xml(line)}</tspan>`).join('')}</text>
      <title>${xml(node.title)} · ${xml(componentRole(node))}</title>
    </g>`;
  }).join('');
  const font = fontUrl ? `<defs><style>@font-face{font-family:Excalifont;src:url("${xml(fontUrl)}") format("woff2");font-display:swap}</style></defs>` : '';
  const heading = drawingTitle(graph);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" ${interactive ? '' : 'role="img"'}
     aria-label="${xml(graph.repository.name)} system map" font-family="Inter, system-ui, sans-serif">
    <title>${xml(graph.repository.name)} system map</title>
    ${fontLicense ? `<metadata>${xml(fontLicense)}</metadata>` : ''}
    ${font}
    ${interactive ? '' : `<rect width="${layout.width}" height="${layout.height}" fill="${paper}"/>`}
    <text x="${layout.width / 2}" y="39" text-anchor="middle" font-size="${headingSize(heading, layout.width)}" font-weight="800" fill="${ink}">${xml(heading)}</text>
    ${lines}${components}
  </svg>`;
}

function element(id, type, x, y, width, height, options = {}) {
  const seed = seedFor(id);
  return { id, type, x, y, width, height, angle: 0, strokeColor: ink, backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: 1.5, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, roundness: null, seed, version: 1, versionNonce: seed & 0x7fffffff,
    isDeleted: false, boundElements: [], updated: 0, link: null, locked: false, ...options };
}

function textElement(id, lines, x, y, fontSize, color, groupIds = [], fontFamily = 2) {
  const text = lines.join('\n');
  const width = Math.max(...lines.map(line => line.length), 0) * fontSize * 0.53;
  return element(id, 'text', x - width / 2, y, width, lines.length * fontSize * 1.25, {
    text, originalText: text, fontSize, fontFamily, textAlign: 'center', verticalAlign: 'top',
    containerId: null, autoResize: true, lineHeight: 1.25, strokeColor: color, groupIds
  });
}

function linearElement(id, type, points, style) {
  const [x, y] = points[0];
  const dx = points.map(point => point[0] - x);
  const dy = points.map(point => point[1] - y);
  return element(id, type, x, y, Math.max(...dx) - Math.min(...dx), Math.max(...dy) - Math.min(...dy), {
    points: dx.map((point, index) => [point, dy[index]]), lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null, ...style
  });
}

export function excalidrawScene(graph, layout = layoutDiagram(graph)) {
  const arrows = layout.edges.flatMap(({ points, labelPosition, ...edge }, index) => {
    const id = `edge-${index}`;
    const labels = wrap(connectionRole(edge), 19, 2);
    return [
      linearElement(id, 'arrow', points, {
        elbowed: false, startArrowhead: edge.bidirectional ? 'arrow' : null, endArrowhead: 'arrow',
        strokeColor: pencil, strokeStyle: edge.inferred ? 'dashed' : 'solid', roundness: { type: 2 }
      }),
      textElement(id + '-label', labels, labelPosition[0], labelPosition[1] - labels.length * 15, 13, pencil, [], 5)
    ];
  });
  const components = layout.nodes.flatMap((node, index) => {
    const id = `node-${index}`;
    const groupIds = [id + '-group'];
    const originX = node.x + (node.width - symbolWidth) / 2;
    const shapes = componentSymbol(node.type).map((part, partIndex) => {
      const partId = `${id}-shape-${partIndex}`;
      const style = { groupIds, backgroundColor: part.fill && part.fill !== 'none' ? part.fill : 'transparent', roughness: 0.52, strokeWidth: 1.25 };
      return part.type === 'line' ? linearElement(partId, 'line', part.points.map(([x, y]) => [originX + x, node.y + y]), style) :
        element(partId, part.type, originX + part.x, node.y + part.y, part.width, part.height, style);
    });
    const { title, role, roleY } = nodeLabels(node);
    return [
      ...shapes,
      textElement(id + '-title', title, node.x + node.width / 2, node.y + symbolHeight + 1, 18, ink, groupIds),
      textElement(id + '-role', role, node.x + node.width / 2, node.y + roleY - 15, 15, pencil, groupIds)
    ];
  });
  const title = drawingTitle(graph);
  const heading = textElement('heading', [title], layout.width / 2, 10, headingSize(title, layout.width), ink);
  return { type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
    elements: [heading, ...arrows, ...components], appState: { viewBackgroundColor: paper, gridSize: null }, files: {} };
}
