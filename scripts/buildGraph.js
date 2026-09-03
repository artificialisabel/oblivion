import fs from 'node:fs';
import path from 'node:path';

const wikiLinkPattern = /(!?)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
const mdLinkPattern = /\[[^\]]+\]\((?!https?:|mailto:|obsidian:)([^)#]+?)(?:#[^)]+)?\)/g;
const tagPattern = /(?:^|\s)#([a-zA-Z0-9/_-]+)/g;

function walkMarkdownFiles(root) {
  const files = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(full);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function cleanTarget(raw) {
  return String(raw ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.md$/i, '')
    .trim();
}

function targetForms(raw) {
  const literal = String(raw ?? '');
  try {
    const decoded = decodeURIComponent(literal);
    return decoded === literal ? [literal] : [literal, decoded];
  } catch {
    return [literal];
  }
}

function normalizeKey(value) {
  return cleanTarget(value).toLowerCase();
}

function normalizeLooseKey(value) {
  return normalizeKey(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveMarkdownTarget(raw, sourceRel) {
  const sourceDir = path.posix.dirname(sourceRel.replace(/\\/g, '/'));
  const candidates = [];
  for (const form of targetForms(raw)) {
    const target = cleanTarget(form);
    const withSource = path.posix.normalize(path.posix.join(sourceDir, target));
    candidates.push(
      normalizeKey(target),
      normalizeKey(withSource),
      normalizeKey(path.posix.basename(target))
    );
  }
  return [...new Set(candidates)];
}

function hasMarkdownExtension(raw) {
  return targetForms(raw).some((form) => /\.md$/i.test(form.trim()));
}

export function buildGraph(vaultRoot) {
  if (!vaultRoot) throw new Error('No vault path was provided to buildGraph().');

  const files = walkMarkdownFiles(vaultRoot);
  const nodes = files.map((file, index) => {
    const rel = path.relative(vaultRoot, file).replace(/\\/g, '/');
    const title = path.basename(file).replace(/\.md$/i, '');
    return {
      id: rel.replace(/\.md$/i, ''),
      title,
      relativePath: rel,
      tags: [],
      index,
      degree: 0
    };
  });

  const byId = new Map();
  const byBasename = new Map();
  const byLoose = new Map();

  for (const node of nodes) {
    byId.set(normalizeKey(node.id), node);
    byId.set(normalizeKey(node.relativePath), node);
    const base = normalizeKey(node.title);
    if (!byBasename.has(base)) byBasename.set(base, []);
    byBasename.get(base).push(node);
    const loose = normalizeLooseKey(node.title);
    if (!byLoose.has(loose)) byLoose.set(loose, []);
    byLoose.get(loose).push(node);
  }

  const edges = [];
  const edgeKeys = new Set();

  function findNode(candidates) {
    for (const key of candidates) {
      if (byId.has(key)) return byId.get(key);
    }
    const last = path.posix.basename(candidates[0] ?? '');
    const basenameMatches = byBasename.get(last);
    if (basenameMatches?.length === 1) return basenameMatches[0];
    const looseMatches = byLoose.get(normalizeLooseKey(last));
    return looseMatches?.length === 1 ? looseMatches[0] : null;
  }

  function addEdge(source, target) {
    if (!target || source.id === target.id) return;
    const a = source.id;
    const b = target.id;
    const key = a < b ? `${a}--${b}` : `${b}--${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source: a, target: b });
    source.degree += 1;
    target.degree += 1;
  }

  for (const node of nodes) {
    const text = fs.readFileSync(files[node.index], 'utf8');
    const tags = new Set();

    for (const match of text.matchAll(tagPattern)) tags.add(match[1]);
    node.tags = [...tags].sort();

    for (const match of text.matchAll(wikiLinkPattern)) {
      if (match[1] === '!') continue;
      const target = findNode([normalizeKey(match[2]), normalizeKey(path.posix.basename(match[2]))]);
      addEdge(node, target);
    }

    for (const match of text.matchAll(mdLinkPattern)) {
      if (!hasMarkdownExtension(match[1])) continue;
      const target = findNode(resolveMarkdownTarget(match[1], node.relativePath));
      addEdge(node, target);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges
  };
}
