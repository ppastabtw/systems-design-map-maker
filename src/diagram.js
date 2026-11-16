export const styles = {
  frontend: { label: 'Frontend', light: '#f0eaff', ink: '#6544b6', border: '#c6b4f2' },
  api: { label: 'API', light: '#e9edff', ink: '#3c55ad', border: '#b6c3ed' },
  worker: { label: 'Worker', light: '#fff2dd', ink: '#8b591a', border: '#e6c483' },
  database: { label: 'Database', light: '#e5f3eb', ink: '#286748', border: '#a7ccb8' },
  queue: { label: 'Queue / cache', light: '#fff1dc', ink: '#8b591a', border: '#e6c483' },
  external: { label: 'External service', light: '#f9e9f0', ink: '#9a4569', border: '#e5afc8' },
  cli: { label: 'CLI', light: '#ebedf8', ink: '#464f82', border: '#b6bdd9' },
  library: { label: 'Library', light: '#f0edf8', ink: '#5a4c77', border: '#c5bdd8' },
  service: { label: 'Service', light: '#edf0f4', ink: '#4c5e78', border: '#bdc8d5' }
};

const nodeWidth = 184;
const nodeHeight = 76;
const columnPitch = 284;
const rowPitch = 126;
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
    let points;
    let label;
    if (adjacent) {
      const midX = (start[0] + end[0]) / 2;
      points = [start, [midX, start[1]], [midX, end[1]], end];
      label = [midX, (start[1] + end[1]) / 2 - 8];
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

const icons = {
  frontend: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  api: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-2-14-4 20"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  worker: '<path d="m13 2-9 12h7l-1 8 10-12h-8z"/>',
  queue: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  external: '<path d="M13 4h7v7m0-7-9 9m7 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  cli: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  library: '<path d="M3 5h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6v14h-6a3 3 0 0 0-3 2 3 3 0 0 0-3-2H3zM12 8v13"/>',
  service: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5m-9 5v8"/>'
};

export const xml = value => String(value).replace(/[&<>"']/g, part => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[part]);
const shorten = (value, max) => value.length > max ? value.slice(0, max - 1) + '…' : value;

export function diagramSvg(graph, { interactive = false, layout = layoutDiagram(graph) } = {}) {
  const lines = layout.edges.map(({ points, labelPosition: [labelX, labelY], ...edge }) => {
    const text = xml(edge.label);
    return `<g class="map-edge"><polyline points="${points.map(point => point.join(',')).join(' ')}"
      stroke="#807994" stroke-width="1.55" stroke-linejoin="round" fill="none" marker-end="url(#map-arrow)" ${edge.inferred ? 'stroke-dasharray="5 4"' : ''}/>
      <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10" font-weight="550" fill="#676173" stroke="#fbfaf7" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${text}</text></g>`;
  }).join('');
  const cards = layout.nodes.map(node => {
    const palette = styles[node.type];
    const key = interactive ? `class="map-node" role="button" tabindex="0" data-node="${xml(node.id)}" aria-label="${xml(node.title)}, ${xml(palette.label)}"` : '';
    return `<g ${key} transform="translate(${node.x} ${node.y})">
      <rect x="2" y="4" width="${node.width}" height="${node.height}" rx="13" fill="#e6e0ed" opacity=".46"/>
      <rect class="map-node-border" width="${node.width}" height="${node.height}" rx="13" fill="${palette.light}" stroke="${palette.border}" stroke-width="1.35"/>
      <rect x="13" y="22" width="32" height="32" rx="9" fill="#ffffff" opacity=".70"/>
      <g transform="translate(20 29) scale(.75)" fill="none" stroke="${palette.ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[node.type]}</g>
      <text x="54" y="33" fill="#26223a" font-size="13" font-weight="700">${xml(shorten(node.title, 18))}</text>
      <text x="54" y="51" fill="${palette.ink}" font-size="10.5" font-weight="550">${xml(shorten(node.tech, 20))}</text>
      <title>${xml(node.title)} · ${xml(node.tech)}</title>
    </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" ${interactive ? '' : 'role="img"'}
     aria-label="${xml(graph.repository.name)} system map" font-family="Inter, Arial, sans-serif">
    <title>${xml(graph.repository.name)} system map</title>
    <defs><marker id="map-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M1 1l6 3.5L1 8" fill="none" stroke="#807994" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
    ${interactive ? '' : `<rect width="${layout.width}" height="${layout.height}" rx="16" fill="#fbfaf7"/>`}
    ${lines}${cards}
  </svg>`;
}

function element(id, type, x, y, width, height, options = {}) {
  const seed = [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, 23);
  return { id, type, x, y, width, height, angle: 0, strokeColor: '#302844', backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: 1.5, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, roundness: null, seed, version: 1, versionNonce: seed & 0x7fffffff,
    isDeleted: false, boundElements: [], updated: 0, link: null, locked: false, ...options };
}

function textElement(id, text, x, y, fontSize, color, groupIds = []) {
  return element(id, 'text', x, y, text.length * fontSize * 0.57, fontSize * 1.25, {
    text, originalText: text, fontSize, fontFamily: 1, textAlign: 'left', verticalAlign: 'top',
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
        strokeColor: '#807994', strokeStyle: edge.inferred ? 'dashed' : 'solid'
      }),
      textElement(id + '-label', edge.label, labelPosition[0] - edge.label.length * 3.1, labelPosition[1] - 12, 11, '#676173')
    ];
  }).flat();
  const boxes = layout.nodes.flatMap((node, index) => {
    const id = `node-${index}`;
    const groupIds = [id + '-group'];
    const style = styles[node.type];
    return [
      element(id, 'rectangle', node.x, node.y, node.width, node.height, {
        backgroundColor: style.light, strokeColor: style.ink, roundness: { type: 3 }, groupIds
      }),
      textElement(id + '-title', shorten(node.title, 21), node.x + 14, node.y + 16, 16, '#26223a', groupIds),
      textElement(id + '-caption', shorten(node.tech, 24), node.x + 14, node.y + 43, 12, style.ink, groupIds)
    ];
  });
  return { type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
    elements: [...arrows, ...boxes], appState: { viewBackgroundColor: '#fbfaf7', gridSize: null }, files: {} };
}
