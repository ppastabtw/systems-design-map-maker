const fallbackRoles = {
  frontend: 'Renders the user interface',
  api: 'Handles HTTP requests',
  worker: 'Runs background jobs',
  database: 'Stores application data',
  cache: 'Keeps frequently used data in memory',
  queue: 'Holds jobs or messages for workers',
  gateway: 'Handles incoming web traffic',
  external: 'Provides an external API',
  cli: 'Runs commands from the terminal',
  library: 'Provides reusable code',
  service: 'Runs an application process'
};

const resourceRoles = {
  postgres: 'Stores relational data',
  mysql: 'Stores relational data',
  mongo: 'Stores application documents',
  sqlite: 'Stores data in a local database file',
  redis: 'Stores data in memory',
  s3: 'Stores files and objects',
  stripe: 'Processes payments',
  openai: 'Runs language model requests',
  supabase: 'Provides hosted app backend services',
  elasticsearch: 'Indexes data for search'
};

const routeLabels = new Map(Object.entries({
  graph: 'graph data', diagrams: 'diagrams', search: 'search results', pipeline: 'pipeline runs',
  schedule: 'schedule data', checkout: 'checkout data', auth: 'sign-in requests',
  vote: 'votes', result: 'results'
}));

export function componentRole(node) {
  if (node.role) return node.role;
  const service = node.id.startsWith('resource:') ? node.id.slice('resource:'.length) : null;
  if (node.id === 'host:backboard.io' || node.id === 'host:openrouter.ai') return 'Routes requests to language models';
  return resourceRoles[service] || fallbackRoles[node.type];
}

export function httpRequests(content) {
  const calls = /\b(?:fetch|axios(?:\.(?:get|post|put|patch|delete))?)\s*\(\s*['"`](?:https?:\/\/([a-z\d.-]+)(?::\d+)?)?(\/(?!\/)[\w./-]+)(?=[?'"`])/gi;
  return [...content.matchAll(calls)].map(([, host = '', path]) => ({ host: host.toLowerCase(), path }));
}

export function routeTopic(paths) {
  const sections = paths.map(path => path.split('/').find(part => part && !/^(?:api|v\d+)$/i.test(part))?.toLowerCase());
  const architecture = sections.some(section => section?.startsWith('architecture'));
  const counts = new Map();
  for (const section of sections) {
    if (!section || !/^[a-z][a-z-]{1,20}$/.test(section) || /^(?:healthz?|status|index|docs|ping|readyz?|metrics|scopes?)$/.test(section)) continue;
    const label = section.startsWith('architecture') || (architecture && section === 'graph') ?
      'architecture maps' : routeLabels.get(section) ?? section.replaceAll('-', ' ');
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function declaredRole(description) {
  if (typeof description !== 'string') return null;
  const phrase = description.replace(/\s+/g, ' ').trim().split(/\.(?:\s|$)/, 1)[0];
  if (phrase.length < 8) return null;
  const brief = phrase.split(/\s+(?:using|with support for)\s+/i, 1)[0];
  return (brief.length >= 20 ? brief : phrase).replace(
    /^(Analyze|Build|Display|Generate|Handle|Manage|Process|Provide|Render|Run|Serve|Store)\b/i, '$1s'
  );
}

export function describeUnit(node, files, manifest) {
  const declared = declaredRole(manifest.description);
  if (declared && (node.type === 'cli' || node.type === 'library')) {
    return { role: declared, evidence: manifest.descriptionPath };
  }
  const source = files.filter(file => file.kind === 'code');
  if (node.type === 'frontend' || node.type === 'api') {
    const handlers = /(?:^\s*@[\w.]+|\b(?:app|router|server|fastify))\.(?:get|post|put|patch|delete|route)\(\s*['"`](\/[\w./-]+)/gim;
    const routes = source.flatMap(file => {
      const paths = node.type === 'api' ? [...file.content.matchAll(handlers)].map(match => match[1]) :
        httpRequests(file.content).map(request => request.path);
      return paths.map(path => ({ path, evidence: file.path }));
    });
    const topic = routeTopic(routes.map(item => item.path));
    if (topic) {
      const hasArchitecture = topic === 'architecture maps';
      const example = routes.find(item => routeTopic([item.path]) === topic ||
        (hasArchitecture && /\/graph(?:\/|$)/.test(item.path)));
      return { role: `${node.type === 'frontend' ? 'Shows' : 'Serves'} ${topic}`, evidence: example?.evidence };
    }
  }
  if (node.type === 'worker' && node.tech === 'BullMQ') {
    for (const file of source) {
      const name = file.content.match(/\bnew Worker\s*\(\s*['"`]([\w-]{1,32})['"`]/)?.[1];
      if (name) return { role: `Runs jobs from the ${name} queue`, evidence: file.path };
    }
  }
  return declared ? { role: declared, evidence: manifest.descriptionPath } : { role: componentRole(node) };
}

export function connectionRole(edge) {
  return edge.flow || ({
    HTTP: 'Calls API', Imports: 'Uses code', 'Depends on': 'Starts after', Consumes: 'Pulls jobs',
    Enqueues: 'Queues jobs', Calls: 'Calls service'
  })[edge.label] || edge.label;
}
