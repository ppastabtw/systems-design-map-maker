const extensions = /\.(?:[cm]?[jt]sx?|py|go|rs|rb|php|java|kt|cs|vue|svelte|swift)$/i;
const script = /\.[cm]?[jt]sx?$/i;
const symbols = /(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^\n]*?\)|\w+)\s*=>)/g;

function withoutComments(file) {
  if (file.path.endsWith('.py')) {
    return file.content.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|("(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')|#[^\r\n]*/g,
      (token, string) => string ?? token.replace(/[^\r\n]/g, ' '));
  }
  if (!script.test(file.path)) return file.content;
  return file.content.replace(/("(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (token, string) => string ?? token.replace(/[^\r\n]/g, ' '));
}

function joinPath(base, relative) {
  const result = [];
  for (const part of (base + '/' + relative).split('/')) {
    if (part === '..') result.pop();
    else if (part && part !== '.') result.push(part);
  }
  return result.join('/');
}

function writtenImports(file) {
  if (file.path.endsWith('.py')) {
    return [...file.content.matchAll(/^\s*(?:from\s+([.\w]+)\s+import\s*\(?\s*([\w, ]+)|import\s+([\w.]+))/gm)]
      .map(([, module, names, plain]) => ({
        specifier: module ?? plain,
        names: names?.split(',').map(name => name.trim().split(/\s+as\s+/).at(-1)).filter(Boolean) ?? []
      }));
  }
  if (!script.test(file.path)) return [];
  const imports = [...file.content.matchAll(/\bimport\s+(?!type\b)([\w$*,{}\s]+?)\s+from\s*['"]([^'"]+)['"]/g)]
    .map(([, binding, specifier]) => {
      const named = binding.match(/\{([^}]+)\}/)?.[1].split(',').map(name => {
        const [original, alias] = name.trim().split(/\s+as\s+/);
        return { original, local: alias ?? original };
      }).filter(item => item.local) ?? [];
      const defaultName = binding.match(/^\s*([\w$]+)(?:\s*,|\s*$)/)?.[1];
      const namespace = binding.match(/^\s*\*\s+as\s+([\w$]+)/)?.[1];
      return { specifier, named, defaultName, names: [...named.map(item => item.local), defaultName, namespace].filter(Boolean) };
    });
  const common = [...file.content.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map(([, specifier]) => ({ specifier, names: [], explicit: true }));
  return [...imports, ...common];
}

export function usesSymbol(content, name) {
  if (!/^[\w$]+$/.test(name)) return false;
  const identifier = name.replaceAll('$', '\\$');
  return new RegExp(`(?:\\b${identifier}(?:\\s*\\.[\\w$]+)?\\s*\\(|<${identifier}(?=[\\s/>]))`).test(content);
}

function pathForRoute(path) {
  return path.split(/[?#]/, 1)[0].replace(/\$\{[^}]*\}|\{[^}]*\}|:[\w-]+|\[[^\]]+\]/g, ':id')
    .replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

export function routeSegments(path) {
  return pathForRoute(path).split('/').filter(part => part && !/^(?:api|v\d+)$/i.test(part));
}

function endpoints(record) {
  const handlers = /(?:^[ \t]*@([\w.]+)|\b(app|router|server|fastify))\.(get|post|put|patch|delete|route)\(\s*['"`]([^'"`\r\n]{0,160})['"`]/gim;
  const matches = [...record.content.matchAll(handlers)];
  const prefix = record.content.match(/\bAPIRouter\(\s*prefix\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? '';
  if (/\.[jt]sx?$/i.test(record.path) && !matches.length) {
    const appRoute = record.path.match(/(?:^|\/)app\/(.+)\/route\.[jt]s$/)?.[1];
    const pageRoute = record.path.match(/(?:^|\/)pages\/(api\/.+)\.[jt]sx?$/)?.[1];
    if (appRoute || pageRoute) {
      const path = pathForRoute('/' + (appRoute ?? pageRoute).replace(/\/index$/, ''));
      const methods = pageRoute ? ['*'] : [...record.content.matchAll(/\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(match => match[1]);
      return methods.map(method => ({ method, path, body: record.content, record }));
    }
  }
  return matches.filter(match => match[4] === '' || match[4].startsWith('/')).map(match => {
    const index = matches.indexOf(match);
    return { method: match[3].toLowerCase() === 'route' ? '*' : match[3].toUpperCase(), path: pathForRoute((match[1] ? prefix : '') + match[4]),
      body: record.content.slice(match.index, matches[index + 1]?.index), record };
  });
}

function requests(record) {
  if (!script.test(record.path)) return [];
  const functions = [...record.content.matchAll(symbols)];
  const configured = new Set(['axios']);
  for (const binding of record.imports) {
    if (binding.defaultName && (binding.specifier === 'axios' || /\baxios\.create\s*\(/.test(binding.target?.content ?? ''))) {
      configured.add(binding.defaultName);
    }
  }
  for (const [, name] of record.content.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*axios\.create\(/g)) configured.add(name);
  const calls = /\b(?:(fetch)\s*\(|([\w$]+)\.(get|post|put|patch|delete)\s*\()\s*['"`]([^'"`\r\n]{1,160})['"`]/gi;
  return [...record.content.matchAll(calls)].flatMap(match => {
    if (!match[1] && !configured.has(match[2])) return [];
    const address = match[4].replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/)/i, '');
    if (!/^\/(?!\/)/.test(address)) return [];
    const owner = functions.findLast(item => item.index < match.index);
    const method = match[3]?.toUpperCase() ??
      record.content.slice(match.index + match[0].length, match.index + match[0].length + 100).match(/^\s*,\s*\{\s*method\s*:\s*['"](POST|PATCH|PUT|DELETE|GET)['"]/i)?.[1].toUpperCase() ?? 'GET';
    return [{ method, path: pathForRoute(address), symbol: owner?.[1] ?? owner?.[2], record }];
  });
}

export function scanWorkflowEvidence(files) {
  const records = files.filter(file => file.kind === 'code' && extensions.test(file.path))
    .map(file => ({ ...file, content: withoutComments(file) }));
  const byPath = new Map(records.map(record => [record.path, record]));
  const byModule = new Map();
  for (const record of records) {
    const key = record.path.replace(extensions, '').replace(/\/(?:index|__init__)$/, '');
    const entries = byModule.get(key) ?? [];
    entries.push(record);
    byModule.set(key, entries);
  }
  function resolve(record, specifier) {
    const base = record.path.split('/').slice(0, -1).join('/');
    if (record.path.endsWith('.py')) {
      const dots = specifier.match(/^\.+/)?.[0].length ?? 0;
      const module = specifier.slice(dots).replaceAll('.', '/');
      if (dots) return byModule.get(joinPath(base, '../'.repeat(dots - 1) + module))?.find(file => file.path.endsWith('.py'));
      const matches = [...byModule].filter(([key]) => key === module || key.endsWith('/' + module))
        .flatMap(([, matches]) => matches).filter(file => file.path.endsWith('.py'));
      return matches.length === 1 ? matches[0] : undefined;
    }
    if (!specifier.startsWith('.')) return undefined;
    const path = joinPath(base, specifier);
    const candidates = byModule.get(path.replace(extensions, '')) ?? [];
    return byPath.get(path) ?? (candidates.length === 1 ? candidates[0] : undefined);
  }
  for (const record of records) record.imports = writtenImports(record).map(link => ({ ...link, target: resolve(record, link.specifier) }));
  for (const record of records) {
    record.routes = endpoints(record);
    record.requests = requests(record);
    record.dependencies = record.imports.filter(link => link.target && link.target !== record &&
      (link.explicit || link.names.some(name => usesSymbol(record.content, name)))).map(link => {
      if (!link.target.path.endsWith('/__init__.py')) return link;
      const calls = link.names.filter(name => usesSymbol(record.content, name));
      const reexports = link.target.imports.filter(binding => binding.target && calls.every(name => binding.names.includes(name)));
      return reexports.length === 1 && reexports[0].target !== record ?
        { ...link, via: link.target.path, target: reexports[0].target } : link;
    });
  }
  return records;
}
