import { parseAllDocuments } from 'yaml';
import { componentRole, describeUnit, httpRequests, routeTopic } from './roles.js';

const importPattern = /(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]|^\s*(?:from\s+([.\w]+)\s+import\b|(?:import|using|use)\s+([\w.]+))/gm;
const sourceImports = content => [...content.matchAll(importPattern)].map(match => match[1] ?? match[2] ?? match[3]);

const runtimeSignals = [
  ['frontend', 'Next.js', /(?:["']next(?:\/[^"']*)?["']|next\/server)/i],
  ['frontend', 'Nuxt', /["'](?:nuxt|#app)["']/i],
  ['frontend', 'SvelteKit', /@sveltejs\/kit|\$app\/navigation/i],
  ['frontend', 'Angular', /@angular\/core/i],
  ['frontend', 'Vue', /["']vue["']/i],
  ['frontend', 'React', /["'](?:react|react-dom)(?:\/[^"']*)?["']/i],
  ['frontend', 'Flutter', /package:flutter|^\s+sdk:\s*flutter/m],
  ['worker', 'Celery', /(?:^|[\s'"])celery(?:[.\s<=>~'"]|$)/mi, /\bCelery\(/],
  ['worker', 'BullMQ', /["']bullmq["']/],
  ['api', 'FastAPI', /(?:^|[\s'"])fastapi(?:[.\s<=>~'"]|$)/mi, /\bFastAPI\(/],
  ['api', 'Django', /(?:^|[\s'"])django(?:[.\s<=>~'"]|$)/mi, /['"]DJANGO_SETTINGS_MODULE['"]/],
  ['api', 'Flask', /(?:^|[\s'"])flask(?:[.\s<=>~'"]|$)/mi, /\bFlask\(/],
  ['api', 'Express', /["']express["']/, /\bexpress\(\)/],
  ['api', 'Fastify', /["']fastify["']/i, /\bfastify\(/i],
  ['api', 'Hono', /["']hono["']/, /\bnew Hono\(/],
  ['api', 'NestJS', /@nestjs\/core/, /\bNestFactory\.create\(/],
  ['api', 'ASP.NET', /Microsoft\.NET\.Sdk\.Web/, /\bWebApplication\.CreateBuilder\(/],
  ['api', 'Spring Boot', /spring-boot-starter-web/, /^\s*@SpringBootApplication\b/m],
  ['api', 'Rails', /gem\s+['"]rails['"]/, /\bRails\.application\.routes\b/],
  ['api', 'Laravel', /laravel\/framework/, /\bIlluminate\\Routing\\/],
  ['api', 'Go HTTP', /github\.com\/(?:gin-gonic\/gin|labstack\/echo|gofiber\/fiber)/, /\b(?:http\.ListenAndServe|gin\.Default|echo\.New|fiber\.New)\(/],
  ['api', 'Axum', /^\s*axum\s*=/m, /\baxum::(?:Router|routing|serve)/],
  ['api', 'HTTP server', null, /\b(?:createServer|HttpServer::new)\(|^\s*@RestController\b/m]
];

const resourceSignals = [
  ['postgres', 'PostgreSQL', 'database', /\bpostgres(?:ql)?(?:\b|:\/\/)|\bpsycopg\d?\b|\basyncpg\b|['"]pg['"]|\borg\.postgresql\b|\blib\/pq\b|\bpgx\/v\d/i],
  ['mysql', 'MySQL', 'database', /\bmysql\d?\b|\bpymysql\b|\bmariadb\b/i],
  ['mongo', 'MongoDB', 'database', /\bmongodb\b|\bmongoose\b|\bpymongo\b/i],
  ['sqlite', 'SQLite', 'database', /\bsqlite3?\b|better-sqlite3/i],
  ['redis', 'Redis', 'queue', /\b(?:redis|ioredis|rediss|valkey)\b/i],
  ['rabbitmq', 'RabbitMQ', 'queue', /\b(?:rabbitmq|amqplib|amqp091-go|pika)\b/i],
  ['kafka', 'Kafka', 'queue', /\b(?:kafka|kafkajs|confluent_kafka|sarama)\b/i],
  ['s3', 'Amazon S3', 'external', /\bS3Client\b|@aws-sdk\/client-s3|\bservice\/s3\b|\.client\(\s*['"]s3['"]/i],
  ['stripe', 'Stripe', 'external', /\b(?:import stripe|from stripe|new Stripe)\b|(?:['"]stripe['"]|stripe\/stripe-php)/i],
  ['openai', 'OpenAI API', 'external', /\b(?:import openai|from openai|new OpenAI)\b|(?:['"]openai['"]|api\.openai\.com)/i],
  ['supabase', 'Supabase', 'external', /@supabase\/supabase-js|\bfrom supabase\b|\.supabase\.co\b/i],
  ['elasticsearch', 'Elasticsearch', 'database', /@elastic\/elasticsearch|\b(?:from|import) elasticsearch\b|\belasticsearch:/i],
  ['memcached', 'Memcached', 'cache', /\bmemcached\b/i],
  ['nginx', 'NGINX', 'gateway', /^nginx$/i],
  ['traefik', 'Traefik', 'gateway', /^traefik$/i],
  ['haproxy', 'HAProxy', 'gateway', /^haproxy$/i],
  ['caddy', 'Caddy', 'gateway', /^caddy$/i]
];

const typeLabels = {
  frontend: 'Frontend', api: 'API', worker: 'Worker', database: 'Database',
  queue: 'Queue / cache', cache: 'Cache', gateway: 'Gateway', external: 'External service',
  cli: 'CLI', library: 'Library', service: 'Service'
};

const resourceConfiguration = {
  postgres: /\bpostgres(?:ql)?:\/\/|\b(?:POSTGRES_(?:HOST|DB|URL)|PGHOST)\b/i,
  mysql: /\b(?:mysql|mariadb):\/\/|\bMYSQL_(?:HOST|DATABASE|URL)\b/i,
  mongo: /\bmongodb(?:\+srv)?:\/\/|\bMONGO(?:DB)?_(?:URI|URL)\b/i,
  sqlite: /\bsqlite(?:3)?:\/\//i,
  redis: /\brediss?:\/\/|\bREDIS_(?:HOST|URL)\b/i,
  rabbitmq: /\bamqps?:\/\/|\bRABBITMQ_(?:HOST|URL)\b/i,
  kafka: /\bKAFKA_(?:BROKERS|BOOTSTRAP_SERVERS)\b/,
  s3: /\bnew S3Client\(|\.client\(\s*['"]s3['"]/,
  stripe: /\bnew Stripe\(|\bapi\.stripe\.com\b/,
  openai: /\bnew (?:Async)?OpenAI\(|\bapi\.openai\.com\b/,
  supabase: /\bSUPABASE_URL\b|\.supabase\.co\b/,
  elasticsearch: /\bELASTICSEARCH_(?:HOST|URL)\b/
};

function asTitle(value) {
  const words = value.replace(/^@[^/]+\//, '').split(/[-_.\s]+/).filter(Boolean);
  const acronyms = new Set(['api', 'web', 'db', 'cli', 'ui', 'sdk']);
  return words.map(word => acronyms.has(word.toLowerCase()) && word.toLowerCase() !== 'web' ?
    word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(' ').slice(0, 48);
}

function packageInfo(file) {
  if (file.path.endsWith('package.json')) {
    try {
      const info = JSON.parse(file.content);
      const dependencies = Object.keys(info.dependencies || {}).map(name => JSON.stringify(name)).join(' ');
      return { name: typeof info.name === 'string' ? info.name : null, description: info.description, dependencies,
        runnable: Boolean(info.scripts?.start || info.scripts?.dev || info.bin),
        cli: Boolean(info.bin), workspace: Boolean(info.workspaces), library: Boolean(info.exports || info.main) };
    } catch { return {}; }
  }
  if (/(?:^|\/)(?:Cargo\.toml|pyproject\.toml)$/.test(file.path)) {
    const { content } = file;
    const section = content.split(/^\[(?:project|package|tool\.poetry)\][ \t]*\r?$/m)[1]?.split(/^\[/m)[0];
    return { name: section?.match(/^name\s*=\s*["']([^"']+)/m)?.[1],
      description: section?.match(/^description\s*=\s*(["'])(.+?)\1[ \t]*\r?$/m)?.[2],
      cli: /^(?:\[\[bin\]\]|\[project\.scripts\]|\[tool\.poetry\.scripts\])/m.test(content),
      workspace: /^\[workspace\]/m.test(content) && !section, dependencies: content };
  }
  return { dependencies: file.content };
}

function directory(path) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function joinPath(root, value) {
  const result = [];
  for (const part of [root, value].join('/').replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') result.pop();
    else result.push(part);
  }
  return result.join('/');
}

function runtimeFor(root, files, info) {
  const structural = root.match(/(?:^|\/)(?:[^/]+[-_])?(web|frontend|client|dashboard|api|backend|server|worker|workers|jobs|cli|cmd)(?:[-_][^/]+)?$/i)?.[1]?.toLowerCase();
  const kind = /^(?:web|frontend|client|dashboard)$/.test(structural) ? 'frontend' :
    /^(?:api|backend|server)$/.test(structural) ? 'api' :
    /^(?:worker|workers|jobs)$/.test(structural) ? 'worker' : structural ? 'cli' : null;
  const signatures = files.map(file => ({ ...file, dependencies: file.kind === 'manifest' ?
    packageInfo(file).dependencies ?? '' : sourceImports(file.content).map(name => JSON.stringify(name)).join(' ') }));
  const match = runtimeSignals.map(([type, tech, dependency, entry]) => {
    const evidence = signatures.find(file => dependency?.test(file.dependencies) || (file.kind === 'code' && entry?.test(file.content)));
    return evidence ? { type, tech, evidence: evidence.path } : null;
  }).filter(Boolean);
  if (kind === 'worker') return match.find(signal => signal.type === kind) ?? { type: kind };
  if (info.cli) return { type: 'cli' };
  const executable = files.find(file => file.kind === 'code' &&
    /\b(?:func\s+main\s*\(|fn\s+main\s*\(|static\s+void\s+main\s*\(|if\s+__name__\s*==\s*['"]__main__['"])/.test(file.content));
  return (kind && match.find(signal => signal.type === kind)) ?? match[0] ?? {
    type: kind || (info.runnable ? 'service' : executable ? 'cli' : 'library'), evidence: executable?.path
  };
}

function deploymentDocuments(files, notes) {
  const deployments = [];
  for (const file of files.filter(file => file.kind === 'deployment' && /\.ya?ml$/i.test(file.path))) {
    try {
      for (const document of parseAllDocuments(file.content, { uniqueKeys: true, merge: true })) {
        if (document.errors.length) throw new Error('Invalid YAML');
        const data = document.toJS({ maxAliasCount: 30 });
        if (data && typeof data === 'object') deployments.push({ path: file.path, data });
      }
    } catch { notes.push(`Could not parse ${file.path}.`); }
  }
  return deployments;
}

function resolveImport(path, specifier) {
  if (/^\.+[a-z_]\w*(?:\.\w+)*$/i.test(specifier) && path.endsWith('.py')) {
    const relative = specifier.match(/^\.+/)[0].length;
    return joinPath(directory(path), '../'.repeat(relative - 1) + specifier.slice(relative).replaceAll('.', '/'));
  }
  return specifier.startsWith('.') ? joinPath(directory(path), specifier) : null;
}

export function analyzeRepository(repository) {
  const { files, paths = files.map(file => file.path) } = repository;
  const notes = [...repository.notes ?? []];
  const packages = new Map();
  const units = new Map();
  const nodes = new Map();
  const edges = new Map();
  const serviceNames = new Map();

  function node(id, title, type, tech, evidence) {
    if (!nodes.has(id)) nodes.set(id, { id, title, type, tech: tech || typeLabels[type], evidence: [] });
    const result = nodes.get(id);
    if (evidence && !result.evidence.includes(evidence) && result.evidence.length < 5) result.evidence.push(evidence);
    return result;
  }

  function edge(from, to, label, evidence, inferred = false, flow) {
    if (from === to) return;
    const key = JSON.stringify([from, to]);
    const existing = edges.get(key);
    if (!existing || (existing.inferred && !inferred) ||
      (existing.inferred === inferred && existing.label === 'Depends on' && label !== 'Depends on')) {
      edges.set(key, { from, to, label, inferred, flow, evidence: [...new Set([evidence, ...existing?.evidence ?? []])].slice(0, 4) });
    } else {
      if (existing.label === label && !existing.flow && flow) existing.flow = flow;
      if (!existing.evidence.includes(evidence) && existing.evidence.length < 4) existing.evidence.push(evidence);
    }
  }

  for (const file of files.filter(file => file.kind === 'manifest')) {
    const root = directory(file.path);
    const pkg = packages.get(root) ?? { evidence: file.path, dependencies: '' };
    const info = packageInfo(file);
    packages.set(root, { ...pkg, ...info, name: info.name || pkg.name, description: info.description ?? pkg.description,
      descriptionPath: info.description ? file.path : pkg.descriptionPath,
      dependencies: `${pkg.dependencies}\n${info.dependencies ?? ''}` });
  }
  for (const file of files.filter(file => file.kind === 'code')) {
    const root = file.path.match(/^(?:apps|services|packages|crates|cmd)\/[^/]+(?=\/)/)?.[0] ??
      file.path.match(/^(?:frontend|backend|web|api|client|server|worker|workers|jobs)(?=\/)/i)?.[0];
    if (root) units.set(root, file.path);
  }
  for (const [root, info] of packages) {
    const nested = [...packages.keys(), ...units.keys()].some(other => other && other !== root && (!root || other.startsWith(root + '/')));
    if (!info.workspace && (root || info.runnable || info.cli || !nested)) units.set(root, info.evidence);
  }
  const firstSource = files.find(file => file.kind === 'code');
  if (!units.size && firstSource) units.set('', firstSource.path);

  const cliRoots = [...packages].filter(([, info]) => info.cli).map(([root]) => root);
  for (const file of files.filter(file => file.kind === 'code')) {
    const root = directory(file.path);
    const candidate = file.path.match(/(?:^|\/)(?:server|asgi|wsgi|routes|app|main)\.[\w]+$/i);
    const api = runtimeSignals.some(([type, , , entry]) => type === 'api' && entry?.test(file.content));
    if (root && candidate && api && cliRoots.some(parent => root !== parent && (!parent || root.startsWith(parent + '/'))) &&
      ![...units.keys()].some(other => other && (root === other || root.startsWith(other + '/')))) {
      units.set(root, file.path);
    }
  }

  const unitEntries = [...units].sort(([a], [b]) => b.length - a.length);
  const unitFor = path => unitEntries.find(([root]) => !root || path === root || path.startsWith(root + '/'))?.[0];
  const knownPaths = new Set(paths);
  const scopedFiles = new Map(unitEntries.map(([root]) => [root, []]));
  for (const file of files) scopedFiles.get(unitFor(file.path))?.push(file);

  for (const [root, evidence] of unitEntries) {
    const scoped = scopedFiles.get(root);
    const info = packages.get(root) ?? {};
    const profile = runtimeFor(root, scoped.filter(file => file.kind === 'manifest' || file.kind === 'code'), info);
    const basename = repository.name.split('/').at(-1);
    const display = info.name ?? (root ? root.split('/').at(-1) : basename);
    const title = profile.type === 'api' && /^(?:web|server|app)$/i.test(display) ? `${asTitle(display)} API` : asTitle(display);
    const result = node(`unit:${root}`, title || 'Project', profile.type, profile.tech, evidence);
    if (profile.evidence) node(result.id, null, null, null, profile.evidence);
    const description = describeUnit(result, scoped, info);
    result.role = description.role;
    result.roleEvidence = description.evidence;
  }

  const primaryCompose = path => /(?:^|\/)(?:docker-)?compose\.ya?ml$/i.test(path);
  const manifests = deploymentDocuments(files, notes)
    .sort((a, b) => Number(primaryCompose(b.path)) - Number(primaryCompose(a.path)));
  const composeIds = new Map();
  for (const { path, data } of manifests) {
    if (!data.services || typeof data.services !== 'object') continue;
    const localServices = new Map();
    for (const [name, service] of Object.entries(data.services)) {
      if (!service || typeof service !== 'object') continue;
      if (service.profiles?.length && /^(?:seed(?:-data)?|migrate|setup|init)$/i.test(name)) continue;
      const image = String(service.image ?? '');
      const imageName = image.split('/').at(-1).split(':')[0];
      const resource = resourceSignals.find(([, , , pattern]) => pattern.test(imageName));
      const build = typeof service.build === 'string' ? service.build : service.build?.context;
      const context = typeof build === 'string' ? joinPath(directory(path), build) : null;
      const unit = context !== null && nodes.get(`unit:${context}`);
      const serviceKey = `${directory(path)}:${name}`;
      const id = composeIds.get(serviceKey) ?? (resource ? `resource:${resource[0]}` :
        unit && ![...localServices.values()].includes(unit.id) ? unit.id : `deploy:${serviceKey}`);
      const type = resource?.[2] ?? unit?.type ?? (/worker|jobs/i.test(name) ? 'worker' : service.ports ? 'api' : 'service');
      const title = resource?.[1] ?? asTitle(name);
      const tech = resource?.[1] ?? (unit?.tech || imageName || typeLabels[type]);
      node(id, title, type, tech, path);
      composeIds.set(serviceKey, id);
      localServices.set(name, id);
      if (!serviceNames.has(name)) serviceNames.set(name, id);
    }
    for (const [name, service] of Object.entries(data.services)) {
      const depends = service?.depends_on ?? [];
      const names = Array.isArray(depends) ? depends : typeof depends === 'object' ? Object.keys(depends) : [];
      for (const target of names) {
        if (localServices.has(name) && localServices.has(target)) edge(localServices.get(name), localServices.get(target), 'Depends on', path);
      }
    }
  }

  for (const { path, data } of manifests) {
    if (!/^(?:Deployment|StatefulSet|DaemonSet|CronJob)$/.test(data.kind) || !data.metadata?.name) continue;
    const containers = (data.spec?.template ?? data.spec?.jobTemplate?.spec?.template)?.spec?.containers;
    if (!Array.isArray(containers)) continue;
    const name = String(data.metadata.name);
    const image = String(containers[0]?.image ?? '').split('/').at(-1).split(':')[0];
    const resource = resourceSignals.find(([, , , pattern]) => pattern.test(image));
    if (resource) node(`resource:${resource[0]}`, resource[1], resource[2], resource[1], path);
    else {
      const unit = [...nodes.values()].find(item => item.id.startsWith('unit:') && item.title.toLowerCase() === asTitle(name).toLowerCase());
      node(unit?.id ?? `k8s:${data.metadata.namespace ?? ''}:${name}`, asTitle(name),
        data.kind === 'CronJob' ? 'worker' : 'service', image, path);
    }
  }

  function existingPath(target) {
    return knownPaths.has(target) || ['.js', '.ts', '.tsx', '.jsx', '.py', '.rs', '.vue', '/index.js', '/index.ts', '/__init__.py']
      .some(extension => knownPaths.has(target + extension)) || knownPaths.has(target.replace(/\.js$/, '.ts'));
  }
  for (const file of files) {
    if (file.kind !== 'code' && file.kind !== 'manifest') continue;
    const root = unitFor(file.path);
    if (root === undefined) continue;
    const from = `unit:${root}`;
    const content = file.kind === 'manifest' ? packageInfo(file).dependencies ?? '' : file.content;
    const specifiers = file.kind === 'code' ? sourceImports(content) : [];
    const configValues = [...content.matchAll(/(?:\b(?:process\.env|os\.environ)\.([A-Z][A-Z_]+)|['"]([A-Z][A-Z_]+)['"]|['"]((?:[a-z]+(?:\+[a-z]+)?):\/\/[^'"\s]+)['"])/g)]
      .map(match => match[1] ?? match[2] ?? match[3]).join(' ');
    for (const [id, title, type, pattern] of resourceSignals) {
      if (type === 'gateway') continue;
      const detected = file.kind === 'manifest' ? pattern.test(content) :
        specifiers.some(value => pattern.test(JSON.stringify(value))) || resourceConfiguration[id]?.test(configValues);
      if (!detected) continue;
      const result = node(`resource:${id}`, title, type, title, file.path);
      const action = type === 'database' ? 'Reads / writes' : type === 'queue' && nodes.get(from)?.type === 'worker' ? 'Consumes' :
        type === 'queue' ? 'Uses' : 'Calls';
      const flow = ({ stripe: 'Requests payments', openai: 'Calls model API', s3: 'Uses object storage' })[id];
      edge(from, result.id, action, file.path, true, flow);
    }
    if (file.kind !== 'code') continue;
    for (const specifier of specifiers) {
      const relative = resolveImport(file.path, specifier);
      const named = [...packages.entries()].find(([, info]) => info.name && (specifier === info.name ||
        specifier.startsWith(info.name + '/') || (file.path.endsWith('.py') && specifier.startsWith(info.name + '.'))));
      const python = file.path.endsWith('.py') ? specifier.replaceAll('.', '/') : null;
      const target = (relative && existingPath(relative) ? unitFor(relative) : null) ??
        named?.[0] ?? (python && existingPath(python) ? unitFor(python) : null);
      if (target !== null && target !== undefined && nodes.has(`unit:${target}`)) edge(from, `unit:${target}`, 'Imports', file.path);
    }
    for (const match of content.matchAll(/https?:\/\/([\w.-]+)(?::\d+)?(?:[/'"`\s]|$)/g)) {
      const target = serviceNames.get(match[1]);
      if (target) edge(from, target, 'HTTP', file.path);
    }
    const requestPaths = new Map();
    for (const request of httpRequests(content)) {
      const target = serviceNames.get(request.host);
      if (!target) continue;
      if (!requestPaths.has(target)) requestPaths.set(target, []);
      requestPaths.get(target).push(request.path);
    }
    for (const [target, paths] of requestPaths) {
      const topic = routeTopic(paths);
      edge(from, target, 'HTTP', file.path, false, topic ? `Requests ${topic}` : undefined);
    }
    const endpoints = /^\s*(?:(?:export\s+)?(?:const|let)\s+)?[\w]*(?:API_URL|BASE_URL|API_ENDPOINT)\s*(?::\s*\w+)?\s*=\s*['"`]https:\/\/([a-z\d.-]+)(?=[:/'"`])/gmi;
    for (const [, hostname] of content.matchAll(endpoints)) {
      const domain = hostname.toLowerCase().replace(/^(?:api|app|www)\./, '');
      if (!domain.includes('.') || /(?:^|\.)(?:example\.(?:com|org|net)|localhost|test|invalid|local)$/.test(domain) ||
        /^[\d.]+$/.test(domain) || [...nodes.values()].some(item => item.type === 'external' && domain.startsWith(item.id.slice('resource:'.length) + '.'))) continue;
      const result = node(`host:${domain}`, domain, 'external', 'HTTP endpoint', file.path);
      const flow = /^(?:backboard\.io|openrouter\.ai)$/.test(domain) ? 'Calls model API' : 'Calls external API';
      edge(from, result.id, 'HTTP', file.path, true, flow);
    }
  }

  const fronts = [...nodes.values()].filter(item => item.type === 'frontend');
  const apis = [...nodes.values()].filter(item => item.type === 'api');
  if (fronts.length === 1 && apis.length === 1) {
    const frontend = fronts[0];
    const root = frontend.id.slice('unit:'.length);
    const requests = scopedFiles.get(root)?.filter(file => file.kind === 'code').flatMap(file =>
      httpRequests(file.content).filter(request => request.host === '' ? request.path.startsWith('/api/') :
        /^(?:localhost|127\.0\.0\.1)$/.test(request.host)).map(request => ({ ...request, evidence: file.path }))) ?? [];
    if (requests.length) {
      const topic = routeTopic(requests.map(request => request.path));
      const source = requests.find(request => routeTopic([request.path]) === topic) ?? requests[0];
      edge(frontend.id, apis[0].id, 'HTTP', source.evidence, true, topic ? `Requests ${topic}` : undefined);
    }
  }

  if (!nodes.size) {
    const title = asTitle(repository.name.split('/').at(-1)) || 'Project';
    node('unit:', title, 'service', 'Project', files[0]?.path).role = 'Role unclear from sampled files';
  }
  const allNodes = [...nodes.values()];
  const weight = id => [...edges.values()].filter(pair => pair.from === id || pair.to === id).length;
  const selected = allNodes.length > 12 ? allNodes
    .sort((a, b) => weight(b.id) - weight(a.id) || Number(a.type === 'library') - Number(b.type === 'library')).slice(0, 12) : allNodes;
  if (selected.length < allNodes.length) notes.push(`Showing 12 of ${allNodes.length} detected components to keep the map readable.`);
  const ids = new Set(selected.map(item => item.id));
  return { version: 1, repository: { name: repository.name, url: repository.url, revision: repository.revision },
    nodes: selected.map(item => ({ ...item, role: componentRole(item) })),
    edges: [...edges.values()].filter(pair => ids.has(pair.from) && ids.has(pair.to)),
    filesScanned: files.length, notes };
}
