import rough from 'roughjs';

export const styles = {
  frontend: { label: 'Frontend', light: '#d0bfff', ink: '#6741d9' },
  api: { label: 'API', light: '#a5d8ff', ink: '#1971c2' },
  worker: { label: 'Worker', light: '#ffec99', ink: '#8d5c13' },
  database: { label: 'Database', light: '#b2f2bb', ink: '#2b8a3e' },
  queue: { label: 'Queue / cache', light: '#ffd8a8', ink: '#a55114' },
  external: { label: 'External service', light: '#fcc2d7', ink: '#a61e4d' },
  cli: { label: 'CLI', light: '#c5f6fa', ink: '#0b7285' },
  library: { label: 'Library', light: '#e5dbff', ink: '#5f3dc4' },
  service: { label: 'Service', light: '#dee2e6', ink: '#495057' }
};

const ink = '#1e1e1e';
const pencil = '#495057';
const paper = '#ffffff';
const nodeWidth = 192;
const nodeHeight = 82;
const columnPitch = 316;
const rowPitch = 132;
const rankOrder = ['frontend', 'cli', 'api', 'service', 'queue', 'worker', 'database', 'external', 'library'];

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
  const disconnectedRows = Math.ceil(disconnected.length / Math.max(1, columns.length));
  const width = Math.max(1, columns.length) * columnPitch - columnPitch + nodeWidth + 112;
  const height = (rows + disconnectedRows - 1) * rowPitch + nodeHeight + 150;
  const placed = new Map();
  columns.forEach((column, rank) => column.forEach((node, index) => placed.set(node.id, {
    ...node, x: 56 + rank * columnPitch, y: 72 + ((rows - column.length) / 2 + index) * rowPitch,
    width: nodeWidth, height: nodeHeight, rank
  })));
  disconnected.forEach((node, index) => placed.set(node.id, {
    ...node, x: 56 + index % columns.length * columnPitch, y: 72 + (rows + Math.floor(index / columns.length)) * rowPitch,
    width: nodeWidth, height: nodeHeight
  }));
  const edges = [];
  const endpointCounts = new Map();
  const routed = graph.edges.filter(edge => placed.has(edge.from) && placed.has(edge.to));
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
      const offset = endpointCounts.get(item.id) < 2 ? 0 : (index / (endpointCounts.get(item.id) + 1) - 0.5) * 42;
      return [item.x + (side === 'right' ? nodeWidth : 0), item.y + nodeHeight / 2 + offset];
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
      const track = 25 + (crossing++ % 4) * 10;
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
const caption = node => shorten(node.tech === node.title ? styles[node.type].label : node.tech, 25);

function sketchPaths(drawing, dashed = false) {
  return sketch.toPaths(drawing).map(({ d, stroke, strokeWidth, fill }) =>
    `<path d="${d}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" ${dashed ? 'stroke-dasharray="7 5"' : ''}/>`).join('');
}

function roundedBox(width, height) {
  const radius = 13;
  return `M${radius},0 H${width - radius} Q${width},0 ${width},${radius}
    V${height - radius} Q${width},${height} ${width - radius},${height}
    H${radius} Q0,${height} 0,${height - radius} V${radius} Q0,0 ${radius},0 Z`;
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
    return `<g class="map-edge" stroke-linejoin="round" stroke-linecap="round">
      ${sketchPaths(body, edge.inferred)}${sketchPaths(tip)}
      <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="13" fill="${pencil}" stroke="${paper}"
        stroke-width="6" paint-order="stroke" stroke-linejoin="round">${xml(edge.label)}</text></g>`;
  }).join('');
  const cards = layout.nodes.map(node => {
    const palette = styles[node.type];
    const key = interactive ? `class="map-node" role="button" tabindex="0" data-node="${xml(node.id)}" aria-label="${xml(node.title)}, ${xml(palette.label)}"` : '';
    const shape = roundedBox(node.width, node.height);
    const drawing = sketch.path(shape, { seed: seedFor(node.id), stroke: palette.ink, strokeWidth: 1.7,
      fill: palette.light, fillStyle: 'hachure', hachureGap: 6, fillWeight: 1, roughness: 1, fixedDecimalPlaceDigits: 2 });
    const selection = interactive ?
      `<rect class="map-node-selection" x="-6" y="-6" width="${node.width + 12}" height="${node.height + 12}" rx="4" fill="none"/>` : '';
    return `<g ${key} transform="translate(${node.x} ${node.y})">
      ${selection}
      <path d="${shape}" fill="${paper}"/>
      ${sketchPaths(drawing)}
      <text x="${node.width / 2}" y="36" text-anchor="middle" fill="${ink}" font-size="19">${xml(shorten(node.title, 20))}</text>
      <text x="${node.width / 2}" y="59" text-anchor="middle" fill="${pencil}" font-size="14">${xml(caption(node))}</text>
      <title>${xml(node.title)} · ${xml(node.tech)}</title>
    </g>`;
  }).join('');
  const font = fontUrl ? `<defs><style>@font-face{font-family:Excalifont;src:url("${xml(fontUrl)}") format("woff2");font-display:swap}</style></defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" ${interactive ? '' : 'role="img"'}
     aria-label="${xml(graph.repository.name)} system map" font-family="Excalifont, Comic Sans MS, sans-serif">
    <title>${xml(graph.repository.name)} system map</title>
    ${fontLicense ? `<metadata>${xml(fontLicense)}</metadata>` : ''}
    ${font}
    ${interactive ? '' : `<rect width="${layout.width}" height="${layout.height}" fill="${paper}"/>`}
    ${lines}${cards}
  </svg>`;
}

function element(id, type, x, y, width, height, options = {}) {
  const seed = seedFor(id);
  return { id, type, x, y, width, height, angle: 0, strokeColor: ink, backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: 1.5, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, roundness: null, seed, version: 1, versionNonce: seed & 0x7fffffff,
    isDeleted: false, boundElements: [], updated: 0, link: null, locked: false, ...options };
}

function textElement(id, text, x, y, fontSize, color, groupIds = []) {
  const width = text.length * fontSize * 0.53;
  return element(id, 'text', x - width / 2, y, width, fontSize * 1.25, {
    text, originalText: text, fontSize, fontFamily: 5, textAlign: 'center', verticalAlign: 'top',
    containerId: null, autoResize: true, lineHeight: 1.25, strokeColor: color, groupIds
  });
}

export function excalidrawScene(graph, layout = layoutDiagram(graph)) {
  const arrows = layout.edges.map(({ points, labelPosition, ...edge }, index) => {
    const [x, y] = points[0];
    const dx = points.map(point => point[0] - x);
    const dy = points.map(point => point[1] - y);
    const id = `edge-${index}`;
    return [
      element(id, 'arrow', x, y, Math.max(...dx) - Math.min(...dx), Math.max(...dy) - Math.min(...dy), {
        points: points.map(point => [point[0] - x, point[1] - y]), lastCommittedPoint: null, elbowed: false,
        startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: 'arrow',
        strokeColor: pencil, strokeStyle: edge.inferred ? 'dashed' : 'solid', roundness: { type: 2 }
      }),
      textElement(id + '-label', edge.label, labelPosition[0], labelPosition[1] - 14, 13, pencil)
    ];
  }).flat();
  const boxes = layout.nodes.flatMap((node, index) => {
    const id = `node-${index}`;
    const groupIds = [id + '-group'];
    const style = styles[node.type];
    return [
      element(id, 'rectangle', node.x, node.y, node.width, node.height, {
        backgroundColor: style.light, strokeColor: style.ink, fillStyle: 'hachure', roundness: { type: 3 }, groupIds
      }),
      textElement(id + '-title', shorten(node.title, 20), node.x + node.width / 2, node.y + 17, 19, ink, groupIds),
      textElement(id + '-caption', caption(node), node.x + node.width / 2, node.y + 45, 14, pencil, groupIds)
    ];
  });
  return { type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
    elements: [...arrows, ...boxes], appState: { viewBackgroundColor: paper, gridSize: null }, files: {} };
}
