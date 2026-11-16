import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, join, relative, resolve, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { fileKind, ignoredDirectory, sampleRepository } from './repository.js';

const git = promisify(execFile);

async function gitPaths(folder) {
  try {
    const top = await git('git', ['-C', folder, 'rev-parse', '--show-toplevel'], { windowsHide: true });
    if (await realpath(top.stdout.trim()) !== folder) return null;
    const { stdout } = await git('git', ['-C', folder, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      windowsHide: true, maxBuffer: 16 * 1024 * 1024
    });
    return [...new Set(stdout.split('\0').filter(Boolean))];
  } catch {
    return null;
  }
}

async function walk(folder, relativeRoot = '') {
  const files = [];
  const queued = [relativeRoot];
  while (queued.length) {
    const root = queued.shift();
    const items = await readdir(join(folder, root), { withFileTypes: true });
    for (const item of items) {
      const path = root ? root + '/' + item.name : item.name;
      if (item.isDirectory() && !ignoredDirectory(item.name)) queued.push(path);
      else if (item.isFile() && fileKind(path)) files.push(path);
    }
  }
  return files;
}

export async function readLocalFolder(input) {
  const folder = await realpath(resolve(input));
  if (!(await lstat(folder)).isDirectory()) throw new Error('Choose a project folder.');
  const paths = await gitPaths(folder) ?? await walk(folder);
  const entries = [];
  for (const path of paths.filter(fileKind)) {
    try {
      const filename = await realpath(join(folder, path));
      const within = relative(folder, filename);
      if (within.startsWith('..') || isAbsolute(within) || !(await lstat(join(folder, path))).isFile()) continue;
      const { size } = await lstat(filename);
      entries.push({ path, size, filename });
    } catch {
      // A tracked file can be missing from the working tree.
    }
  }
  return sampleRepository(entries, { name: basename(folder), read: entry => readFile(entry.filename, 'utf8') });
}
