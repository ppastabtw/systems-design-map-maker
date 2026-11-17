import { analyzeRepository } from './analyze.js';
import { routeSegments, scanWorkflowEvidence, usesSymbol } from './workflow-evidence.js';

const featureNames = new Map(Object.entries({
  train: 'Training', training: 'Training', predict: 'Predictions', prediction: 'Predictions', predictions: 'Predictions',
  export: 'Export', exports: 'Export', auth: 'Authentication', login: 'Authentication'
}));
const ignoredRoutes = /^(?:healthz?|liveness|readiness|readyz?|ping|version|docs|openapi|favicon)$/i;
const uiFile = /\.(?:jsx|tsx|svelte|vue)$/i;
const maxViews = 7;
const nodeLimit = 8;
const chart = /<(?:LineChart|AreaChart|BarChart)(?=[\s/>])/;
const hasChart = record => chart.test(record.content) && record.imports.some(link => link.specifier === 'recharts');

function viewId(label) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return id === 'overview' ? 'overview-routes' : id;
}

function titleCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_.]+/g, ' ').trim()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function featureName(path) {
  const segments = routeSegments(path).filter(part => /^[a-z][a-z\d_-]{1,28}$/i.test(part)).map(part => part.toLowerCase());
  const first = segments[0];
  if (!first || ignoredRoutes.test(first)) return null;
  const action = segments.findLast(part => featureNames.has(part));
  return featureNames.get(action) ?? titleCase(first);
}

function moduleName(path) {
  const parts = path.split('/');
  const name = parts.pop().replace(/\.[^.]+$/, '');
  const parent = parts.pop();
  return titleCase(/^(?:main|index|__init__|client|engine|registry|service|processor)$/i.test(name) && parent ?
    `${parent} ${name.replaceAll('_', '')}` : name);
}

function moduleRole(record, feature) {
  const code = record.content;
  if (/\boptimizer\.step\s*\(/.test(code)) return feature === 'Predictions' && /\bno_grad\s*\(/.test(code) ?
    ['Runs inference with trained weights', 'network'] : ['Trains the model and updates weights', 'network'];
  if (hasChart(record)) return ['Plots measurements over time', 'chart'];
  if (/\bnew Blob\s*\(/.test(code) && /\bcreateObjectURL\s*\(/.test(code)) {
    return [/text\/x-python/.test(code) ? 'Generates downloadable Python code' : 'Builds a downloadable file', null];
  }
  if (/\bcreateContext\s*\(/.test(code)) return ['Shares state across the interface', null];
  if (/\bsetInterval\s*\(/.test(code) && /\b(?:get\w*Status|fetch\w*Status)\s*\(/.test(code)) return ['Polls for progress updates', null];
  if (/\b(?:register_dataset|get_dataset)\b/.test(code) && /\bdef\s+get_dataset\b/.test(code)) return ['Resolves datasets by identifier', null];
  if (/\bThreadPoolExecutor\s*\(/.test(code)) return ['Coordinates jobs in a thread pool', null];
  if (/\bclass\s+\w+\(nn\.Module\)/.test(code)) return ['Defines the neural network layers', 'network'];
  if (/\b__tablename__\s*=/.test(code)) return ['Defines records stored in the database', null];
  if (uiFile.test(record.path)) return [`Renders controls for ${feature.toLowerCase()}`, null];
  return [`Provides ${moduleName(record.path).toLowerCase()} logic`, null];
}

function supportingModule(record) {
  return !/(?:^|\/)(?:routes?|schemas?|types?|config|utilities|utils)(?:\/|\.)/.test(record.path) ||
    /\b(?:new Blob|createObjectURL|createContext)\s*\(/.test(record.content);
}

function callers(records, source, symbol) {
  if (!symbol) return [];
  return records.filter(record => record !== source && record.imports.some(link =>
    link.target === source && link.named?.some(binding => binding.original === symbol && usesSymbol(record.content, binding.local))));
}

function matchingRoutes(request, byRoute) {
  const key = routeSegments(request.path).join('/');
  const patterns = [byRoute.get(`${request.method} ${key}`), byRoute.get(`* ${key}`)].flat().filter(Boolean);
  const exact = patterns.filter(route => route.path === request.path);
  const matches = exact.length ? exact : patterns;
  return matches.length === 1 ? matches[0] : undefined;
}

function ownerOf(record, system) {
  return system.nodes.filter(node => node.id.startsWith('unit:')).sort((a, b) => b.id.length - a.id.length)
    .find(node => {
      const root = node.id.slice('unit:'.length);
      return !root || record.path.startsWith(root + '/');
    });
}

function makeWorkflow(system, label, routes, clients, localRoot) {
  const nodes = new Map();
  const edges = new Map();
  function add(record, extra = {}) {
    const id = 'code:' + record.path;
    if (!nodes.has(id) && nodes.size < nodeLimit) {
      const [role, symbol] = moduleRole(record, label);
      const ui = uiFile.test(record.path);
      const owner = ownerOf(record, system);
      nodes.set(id, { id, title: moduleName(record.path), type: ui ? 'frontend' : 'library',
        tech: record.path.endsWith('.py') ? 'Python module' : ui && owner?.type === 'frontend' ? owner.tech : 'Source module',
        role, symbol, evidence: [record.path], ...extra });
    }
    return nodes.has(id) ? id : undefined;
  }
  function connect(from, to, label, evidence, inferred = false) {
    if (!from || !to || from === to) return;
    const key = JSON.stringify([from, to, label]);
    const existing = edges.get(key);
    edges.set(key, { from, to, label, inferred,
      evidence: [...new Set([...(existing?.evidence ?? []), ...evidence])].slice(0, 5) });
  }

  const routerFiles = [...new Set(routes.map(route => route.record))].slice(0, 2);
  const routeBodies = new Map();
  for (const record of routerFiles) {
    const definitions = routes.filter(route => route.record === record);
    routeBodies.set(record, definitions.map(route => route.body).join('\n'));
    const endpoints = [...new Set(definitions.map(route => `${route.method === '*' ? '' : route.method + ' '}${route.path}`))];
    add(record, { title: `${label} API`, type: 'api', tech: ownerOf(record, system)?.tech ?? 'HTTP routes',
      role: `Handles requests for ${label.toLowerCase()}`,
      detail: `Routes found in this module: ${endpoints.slice(0, 5).join(', ')}${endpoints.length > 5 ? ` and ${endpoints.length - 5} more` : ''}.` });
  }
  const origins = new Map();
  for (const { origin, request, route } of clients) {
    if (!routerFiles.includes(route.record)) continue;
    const paths = origins.get(origin) ?? [];
    paths.push({ request, route });
    origins.set(origin, paths);
  }
  for (const [origin, pairs] of [...origins].sort(([a, aPairs], [b, bPairs]) =>
    Number(uiFile.test(b.path)) - Number(uiFile.test(a.path)) || bPairs.length - aPairs.length).slice(0, 2)) {
    const id = add(origin);
    for (const { request, route } of pairs) {
      connect(id, 'code:' + route.record.path, `Calls ${label.toLowerCase()} API`,
        [origin.path, request.record.path, route.record.path], true);
    }
  }

  if (localRoot) {
    const target = add(localRoot.record);
    for (const origin of localRoot.origins.slice(0, 2)) {
      connect(add(origin), target, 'Builds download', [origin.path, localRoot.record.path]);
      origins.set(origin, []);
    }
  }

  for (const record of routerFiles) {
    const bodies = routeBodies.get(record);
    if (!/\b(?:get_db|SessionLocal|db\.(?:add|commit|query|execute))\b/.test(bodies)) continue;
    const owner = ownerOf(record, system);
    const storage = system.edges.find(edge => edge.from === owner?.id &&
      system.nodes.some(node => node.id === edge.to && node.type === 'database'));
    if (storage && nodes.size < nodeLimit) {
      const target = system.nodes.find(node => node.id === storage.to);
      nodes.set(target.id, target);
      connect('code:' + record.path, target.id, 'Uses stored data', [record.path, ...storage.evidence], true);
    }
  }

  function linkModule(record, { target, via }) {
    const to = add(target);
    const body = routeBodies.get(record) ?? '';
    const runsTraining = /\.start_training\s*\(/.test(body) && /\bdef train\s*\(/.test(target.content);
    const predicts = /\.predict\s*\(/.test(body) && /\bdef predict\s*\(/.test(target.content);
    const label = runsTraining ? 'Starts training' : predicts ? 'Runs prediction' :
      hasChart(target) ? 'Uses chart' : /\bcreateContext\s*\(/.test(target.content) ? 'Reads shared state' :
        /\bget_dataset\s*\(/.test(record.content) && /\bdef get_dataset\s*\(/.test(target.content) ? 'Loads dataset' : 'Imports';
    connect('code:' + record.path, to, label, [record.path, via, target.path].filter(Boolean), runsTraining || predicts);
    return to;
  }
  // Give each side of the workflow a chance to contribute before exploring another level.
  for (const origin of origins.keys()) {
    const related = origin.dependencies.filter(({ target }) => hasChart(target) || /\bcreateContext\s*\(/.test(target.content));
    for (const link of related.slice(0, 2)) linkModule(origin, link);
  }
  for (const record of routerFiles) {
    const useful = record.dependencies.filter(item => supportingModule(item.target));
    const body = routeBodies.get(record);
    const relevant = useful.filter(link => link.names.some(name => usesSymbol(body, name)) ||
      (/\.predict\s*\(/.test(body) && /\bdef predict\s*\(/.test(link.target.content)) ||
      (/\.start_training\s*\(/.test(body) && /\bdef train\s*\(/.test(link.target.content)));
    const ordered = (relevant.length ? relevant : useful).sort((a, b) => Number(/(?:optimizer\.step|\bdef get_dataset)\s*\(/.test(b.target.content)) -
      Number(/(?:optimizer\.step|\bdef get_dataset)\s*\(/.test(a.target.content)));
    for (const link of ordered) {
      const alreadyPresent = nodes.has('code:' + link.target.path);
      const to = linkModule(record, link);
      if (to && !alreadyPresent && !/\.predict\s*\(/.test(body)) {
        for (const child of link.target.dependencies.filter(item => supportingModule(item.target)).slice(0, 2)) linkModule(link.target, child);
      }
    }
  }
  const anchor = routerFiles[0] ?? localRoot?.record;
  return { label, routes, anchor, graph: { ...system, title: `${label} workflow`,
    nodes: [...nodes.values()], edges: [...edges.values()],
    notes: ['Follows routes, requests, and imports found in the sampled source.'] } };
}

function moduleView(system, records) {
  const entry = [...records].sort((a, b) => b.dependencies.length - a.dependencies.length)[0];
  if (!entry?.dependencies.length) return undefined;
  const targets = [...new Set(entry.dependencies.map(link => link.target))].slice(0, 5);
  const nodes = [entry, ...targets].map(record => ({
    id: 'code:' + record.path, title: moduleName(record.path), type: 'library', tech: 'Source module',
    role: moduleRole(record, 'this component')[0], evidence: [record.path]
  }));
  return { id: 'modules', label: 'Modules', graph: { ...system, title: 'Source modules', nodes,
    edges: targets.filter(target => target !== entry).map(target => ({
      from: nodes[0].id, to: 'code:' + target.path, label: 'Imports', evidence: [entry.path, target.path]
    })), notes: ['Shows a source module and the local code it calls.'] } };
}

function infrastructureViews(system) {
  return system.nodes.flatMap(node => {
    const edges = system.edges.filter(edge => edge.from === node.id || edge.to === node.id);
    const ids = new Set(edges.flatMap(edge => [edge.from, edge.to]));
    if (ids.size < 3 || ids.size >= system.nodes.length || ids.size > nodeLimit) return [];
    return [{ id: 'component-' + node.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: node.title,
      graph: { ...system, title: `${node.title} connections`, nodes: system.nodes.filter(item => ids.has(item.id)),
        edges, notes: ['Shows the repository evidence for this component’s direct connections.'] } }];
  }).slice(0, 3);
}

function proxyView(repository, system) {
  const apis = system.nodes.filter(node => node.type === 'api');
  const config = repository.files.find(file => file.kind === 'deployment' && /(?:^|\/)nginx\.conf$/i.test(file.path));
  const content = config?.content.replace(/#[^\r\n]*/g, '') ?? '';
  if (apis.length !== 1 || !/\bproxy_pass\s+https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?[;\/]/i.test(content)) return undefined;
  const [api] = apis;
  const gateway = system.nodes.find(node => node.id === 'resource:nginx') ??
    { id: 'proxy:' + config.path, title: 'Nginx', type: 'gateway', tech: 'Nginx', role: 'Forwards web requests', evidence: [config.path] };
  const related = system.edges.filter(edge => edge.from === api.id && system.nodes.some(node => node.id === edge.to && node.type === 'database'));
  const nodes = [gateway, api, ...system.nodes.filter(node => related.some(edge => edge.to === node.id))];
  const edges = [{ from: gateway.id, to: api.id, label: 'Proxies requests', inferred: true, evidence: [config.path, ...api.evidence.slice(0, 1)] }, ...related];
  const frontends = system.nodes.filter(node => node.type === 'frontend');
  if (frontends.length === 1 && /\broot\s+[^;]+\/dist\s*;/.test(content)) {
    const [frontend] = frontends;
    nodes.unshift(frontend);
    edges.unshift({ from: frontend.id, to: gateway.id, label: 'Requests content', inferred: true, evidence: [config.path, ...frontend.evidence.slice(0, 1)] });
  }
  return { id: 'hosting', label: 'Hosting', graph: { ...system, title: 'Hosting and proxy',
    nodes, edges, notes: ['The proxy target is inferred from the loopback configuration and the detected API.'] } };
}

function sourceStructure(system, records) {
  const groups = new Map();
  for (const record of records) {
    const owner = ownerOf(record, system);
    const root = owner?.id.slice('unit:'.length);
    const relative = root ? record.path.slice(root.length + 1) : record.path;
    const parts = relative.split('/').slice(0, -1);
    const boundary = parts.findIndex(part => !/^(?:src|lib|app|internal)$/i.test(part));
    if (boundary < 0) continue;
    const folder = [root, ...parts.slice(0, boundary + 1)].filter(Boolean).join('/');
    const group = groups.get(folder) ?? { owner, files: [] };
    group.files.push(record.path);
    groups.set(folder, group);
  }
  const selected = [...groups].filter(([, group]) => group.files.length > 1).sort((a, b) => b[1].files.length - a[1].files.length).slice(0, 5);
  if (selected.length < 2) return undefined;
  const nodes = new Map();
  const edges = [];
  for (const [folder, { owner, files }] of selected) {
    const id = 'folder:' + folder;
    nodes.set(id, { id, title: titleCase(folder.split('/').at(-1)), type: 'library', tech: 'Source files',
      role: `${files.length} sampled source files`, detail: 'Files grouped by their source directory.', evidence: files.slice(0, 5) });
    if (owner) {
      nodes.set(owner.id, owner);
      edges.push({ from: owner.id, to: id, label: 'Contains', evidence: [files[0]] });
    }
  }
  return { id: 'source-folders', label: 'Source folders', graph: { ...system, title: 'Source folders',
    nodes: [...nodes.values()], edges, notes: ['Groups sampled files by directory.'] } };
}

export function generateRepositoryViews(repository) {
  const system = analyzeRepository(repository);
  const records = scanWorkflowEvidence(repository.files);
  const routes = records.flatMap(record => record.routes);
  const groups = new Map();
  const byRoute = new Map();
  for (const route of routes) {
    const label = featureName(route.path);
    if (!label) continue;
    const group = groups.get(label) ?? { routes: [], clients: [] };
    group.routes.push(route);
    groups.set(label, group);
    const key = `${route.method} ${routeSegments(route.path).join('/')}`;
    byRoute.set(key, [...(byRoute.get(key) ?? []), route]);
  }
  for (const record of records) {
    for (const request of record.requests) {
      const route = matchingRoutes(request, byRoute);
      if (!route) continue;
      const sources = callers(records, record, request.symbol);
      for (const origin of sources.length ? sources : [record]) groups.get(featureName(route.path)).clients.push({ origin, request, route });
    }
  }
  const groupsByEvidence = [...groups].sort(([, a], [, b]) => b.clients.length - a.clients.length || b.routes.length - a.routes.length);
  const candidates = groupsByEvidence.slice(0, maxViews).map(([label, group]) =>
    makeWorkflow(system, label, group.routes, group.clients));
  if (!groups.has('Export')) {
    const fileExport = records.find(record => /\bnew Blob\s*\(/.test(record.content) &&
      /\bcreateObjectURL\s*\(/.test(record.content) && /\.download\s*=/.test(record.content));
    if (fileExport) {
      const origins = records.filter(record => record !== fileExport && record.dependencies.some(link => link.target === fileExport));
      if (origins.length) candidates.push(makeWorkflow(system, 'Export', [], [], { record: fileExport, origins }));
    }
  }
  const useful = candidates.filter(item => item.graph.edges.length || item.routes.length > 1).slice(0, maxViews);
  const detail = useful.map(item => ({
    id: viewId(item.label), label: item.label, graph: item.graph
  }));
  if (!detail.length) {
    const modules = moduleView(system, records);
    if (modules) detail.push(modules);
    else {
      const folders = sourceStructure(system, records);
      if (folders) detail.push(folders);
    }
    detail.push(...infrastructureViews(system));
  }
  const hosting = proxyView(repository, system);
  if (hosting && !detail.some(view => view.id === hosting.id)) detail.push(hosting);

  const overview = { ...system, nodes: [...system.nodes], edges: [...system.edges], notes: [...system.notes] };
  const illustrated = item => item.graph.nodes.filter(node => node.symbol).length;
  const shownForOwner = new Map();
  const featured = [...useful].sort((a, b) => illustrated(b) - illustrated(a));
  for (const item of featured) {
    const owner = ownerOf(item.anchor, system);
    if (!owner || overview.nodes.length >= 10 || (shownForOwner.get(owner.id) ?? 0) >= 2) continue;
    shownForOwner.set(owner.id, (shownForOwner.get(owner.id) ?? 0) + 1);
    const id = 'workflow:' + item.label;
    const role = item.routes.length ? `${item.routes.length} API ${item.routes.length === 1 ? 'route' : 'routes'}` : 'Browser-generated download';
    overview.nodes.push({ id, title: item.label, type: 'library', tech: 'Workflow', role, evidence: [item.anchor.path],
      viewId: viewId(item.label) });
    overview.edges.push({ from: owner.id, to: id, label: 'Contains', evidence: [item.anchor.path] });
  }
  if (!detail.length) overview.notes.push('The sampled source yielded an overview. Workflow views need a traceable route or local module connection.');
  return [{ id: 'overview', label: 'Overview', graph: overview }, ...detail];
}
