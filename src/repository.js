const MAX_FILE_BYTES = 90_000;
const MAX_FILES = 120;
const entrypoint = /(?:^|\/)(?:main|server|app|index|worker|routes?|settings|config|database|db|manage|asgi|wsgi|program|client|urls|\+page)(?:\.|\/)/i;

const ignoredDirectories = /^(?:\..+|node_modules|vendor|dist|build|coverage|target|__pycache__|third.party|generated|fixtures?|tests?|__tests__|benchmarks?|examples?|samples?)$/i;
const manifest = /^(?:package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|Gemfile|pom\.xml|build\.gradle(?:\.kts)?|composer\.json|mix\.exs|.*\.(?:csproj|fsproj)|pubspec\.yaml)$/i;
const deployment = /^(?:Dockerfile[.\w-]*|(?:docker-)?compose(?:[.-][\w-]+)?\.ya?ml|nginx\.conf|Procfile|vercel\.json|fly\.toml|serverless\.ya?ml|wrangler\.(?:toml|jsonc?))$/i;
const code = /\.(?:[cm]?[jt]sx?|py|go|rs|rb|php|java|kts?|cs|fs|swift|exs?|dart|vue|svelte|proto|cpp|cc|c|h|zig|lua|r|jl|scala|clj|kt|sh|sql|tf)$/i;

export function ignoredDirectory(name) {
  return ignoredDirectories.test(name);
}

export function fileKind(path) {
  const parts = path.split('/');
  const name = parts.pop();
  if (parts.some(ignoredDirectory) || /^\.|(?:^|[._-])(?:test|spec|secret|credentials?)(?:[._-]|$)|\.min\./i.test(name)) return null;
  if (manifest.test(name)) return 'manifest';
  if (deployment.test(name) || /(?:^|\/)(?:k8s|kubernetes)\/.*\.ya?ml$/i.test(path)) return 'deployment';
  if (/^(?:readme(?:\..*)?|architecture(?:\..*)?)$/i.test(name)) return 'documentation';
  return code.test(name) ? 'code' : null;
}

function priority(file) {
  const depth = file.path.split('/').length;
  return (file.kind === 'manifest' ? 130 : file.kind === 'deployment' ? 125 :
    file.kind === 'documentation' ? 100 : 0) + (depth < 3 ? 20 : 0) +
    (entrypoint.test(file.path) ? 45 : 0) - depth;
}

export async function sampleRepository(entries, { name, url, revision, notes = [], read, signal }) {
  const candidates = entries.map(entry => ({ ...entry, kind: fileKind(entry.path) }))
    .filter(entry => entry.kind && entry.size <= (entrypoint.test(entry.path) ? MAX_FILE_BYTES * 5 : MAX_FILE_BYTES))
    .sort((a, b) => priority(b) - priority(a) || a.path.localeCompare(b.path));
  const important = candidates.filter(entry => entry.kind !== 'code').slice(0, 46);
  const groups = new Map();
  for (const entry of candidates.filter(file => file.kind === 'code')) {
    const parts = entry.path.split('/');
    const key = /^(?:apps|packages|services|src|cmd|crates)$/.test(parts[0]) ? parts.slice(0, 2).join('/') : parts[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const selected = [...important];
  const queues = [...groups.values()];
  for (let index = 0; selected.length < MAX_FILES; index++) {
    const next = queues.flatMap(queue => queue[index] ? [queue[index]] : []);
    if (!next.length) break;
    selected.push(...next.slice(0, MAX_FILES - selected.length));
  }
  if (candidates.length > selected.length) notes.push(`Sampled ${selected.length} of ${candidates.length} eligible files.`);

  const files = [];
  let unavailable = 0;
  let partial = 0;
  for (let offset = 0; offset < selected.length; offset += 8) {
    signal?.throwIfAborted();
    await Promise.all(selected.slice(offset, offset + 8).map(async entry => {
      try {
        const content = await read(entry);
        if (content && !content.includes('\0')) {
          if (content.length > MAX_FILE_BYTES) partial++;
          files.push({ path: entry.path, kind: entry.kind, content: content.slice(0, MAX_FILE_BYTES) });
        }
      } catch {
        signal?.throwIfAborted();
        unavailable++;
      }
    }));
  }
  if (unavailable) notes.push(`${unavailable} selected files could not be read.`);
  if (partial) notes.push(`Read the beginning of ${partial} large source ${partial === 1 ? 'file' : 'files'}.`);
  if (!files.length) throw new Error('No supported source, manifests, or deployment files could be read.');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name, url, revision, files, paths: entries.map(entry => entry.path), notes };
}

export function parseGitHub(input) {
  const value = input.trim();
  const match = /^(?:https?:\/\/github\.com\/)?([\w-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(value);
  if (!match || /^\.+$/.test(match[2])) throw new Error('Enter a GitHub repository URL such as https://github.com/owner/repo.');
  const [, owner, repo] = match;
  return { owner, repo, name: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}` };
}

export async function readGitHub(input, { signal, fetcher = fetch } = {}) {
  const repo = parseGitHub(input);
  const base = `https://api.github.com/repos/${repo.name}`;
  const requestSignal = AbortSignal.any([AbortSignal.timeout(45_000), ...(signal ? [signal] : [])]);
  async function json(path) {
    const response = await fetcher(base + path, { signal: requestSignal });
    if (response.status === 404) throw new Error('GitHub repository or default branch is unavailable. For a private repo, choose a local checkout.');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub’s unauthenticated request limit was reached. Try a local folder or retry later.');
    if (response.status === 409) throw new Error('This GitHub repository is empty.');
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    return response.json();
  }
  const commit = await json('/commits/HEAD');
  const tree = await json(`/git/trees/${commit.commit.tree.sha}?recursive=1`);
  return sampleRepository(tree.tree.filter(entry => entry.type === 'blob' && entry.mode !== '120000'), {
    ...repo,
    revision: commit.sha,
    signal: requestSignal,
    notes: tree.truncated ? ['GitHub returned a partial file tree. A local checkout may give a more complete map.'] : [],
    async read({ path }) {
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const response = await fetcher(`https://raw.githubusercontent.com/${repo.name}/${commit.sha}/${encoded}`, { signal: requestSignal });
      if (!response.ok) throw new Error('Source file is unavailable.');
      return response.text();
    }
  });
}

export function readBrowserFolder(list) {
  const files = Array.from(list);
  const name = files[0]?.webkitRelativePath.split('/')[0];
  if (!name) throw new Error('Choose a project folder.');
  const entries = files.map(file => ({ path: file.webkitRelativePath.slice(name.length + 1), size: file.size, file }));
  return sampleRepository(entries, { name, read: entry => entry.file.text() });
}
