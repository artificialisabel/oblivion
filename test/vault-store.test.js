import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildGraph } from '../scripts/buildGraph.js';
import {
  normalizeTextareaNewlines,
  serializeTextareaContent
} from '../src/noteEditing.js';
import {
  createNoteFile,
  readNoteFile,
  resolveMarkdownPath,
  safeDecodeUrlPath,
  updateNoteFile
} from '../electron/vault-store.js';

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oblivion-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('the renderer graph never contains vault or absolute filesystem paths', (t) => {
  const vault = temporaryDirectory(t);
  fs.writeFileSync(path.join(vault, 'Start.md'), '# Start\n\n[percent](100% ready.md)\n');
  fs.writeFileSync(path.join(vault, '100% ready.md'), '# Ready\n');

  const graph = buildGraph(vault);
  const serialized = JSON.stringify(graph);
  assert.equal(Object.hasOwn(graph, 'vaultRoot'), false);
  assert.equal(graph.nodes.some((node) => Object.hasOwn(node, 'path')), false);
  assert.equal(serialized.includes(vault), false);
  assert.equal(graph.edges.length, 1);
});

test('graph links distinguish literal, encoded-looking, and malformed percent filenames', (t) => {
  const vault = temporaryDirectory(t);
  const targets = ['A B', 'A%20B', 'A%2520B', 'Rate%done', 'Only Space'];
  for (const target of targets) fs.writeFileSync(path.join(vault, `${target}.md`), `# ${target}\n`);
  fs.writeFileSync(path.join(vault, 'Start.md'), [
    '[space](A B.md)',
    '[literal encoded-looking](A%20B.md)',
    '[literal double-encoded-looking](A%2520B.md)',
    '[literal malformed](Rate%done.md)',
    '[encoded fallback](Only%20Space.md)'
  ].join('\n'));

  const graph = buildGraph(vault);
  const neighbors = graph.edges
    .filter((edge) => edge.source === 'Start' || edge.target === 'Start')
    .map((edge) => edge.source === 'Start' ? edge.target : edge.source)
    .sort();

  assert.deepEqual(neighbors, targets.sort());
});

test('note resolution rejects traversal and every symlink component', (t) => {
  const root = temporaryDirectory(t);
  const vault = path.join(root, 'vault');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(vault);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(vault, 'inside.md'), 'inside');
  fs.writeFileSync(path.join(outside, 'outside.md'), 'outside');
  fs.symlinkSync(path.join(outside, 'outside.md'), path.join(vault, 'linked.md'));
  fs.symlinkSync(outside, path.join(vault, 'linked-folder'));

  assert.equal(resolveMarkdownPath(vault, 'inside'), fs.realpathSync(path.join(vault, 'inside.md')));
  assert.equal(resolveMarkdownPath(vault, '../outside/outside'), null);
  assert.equal(resolveMarkdownPath(vault, 'linked'), null);
  assert.equal(resolveMarkdownPath(vault, 'linked-folder/outside'), null);
});

test('literal percent filenames round-trip through graph IDs and note reads', (t) => {
  const vault = temporaryDirectory(t);
  const created = createNoteFile(vault, {
    title: '100% ready',
    content: 'A literal percent filename.',
    links: ''
  });

  assert.equal(created.filename, '100% ready.md');
  const note = readNoteFile(vault, '100% ready');
  assert.equal(note.relativePath, '100% ready.md');
  assert.match(note.content, /literal percent filename/);
  assert.equal(safeDecodeUrlPath('/100%25%20ready.md'), '/100% ready.md');
  assert.equal(safeDecodeUrlPath('/bad%name'), null);
});

test('editing preserves frontmatter, headings, links, and final bytes', (t) => {
  const vault = temporaryDirectory(t);
  const original = [
    '---',
    'aliases:',
    '  - untouched',
    '---',
    '# Existing title',
    '',
    'Text with [[Wiki Link]] and [site](https://example.com).',
    '',
    '## Links',
    '- [[Another Note]]',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(vault, 'Existing.md'), original);

  const result = updateNoteFile(vault, {
    id: 'Existing',
    title: 'Renamed 100%',
    content: original
  });

  assert.equal(result.relativePath, 'Renamed 100%.md');
  assert.equal(fs.existsSync(path.join(vault, 'Existing.md')), false);
  assert.equal(fs.readFileSync(path.join(vault, 'Renamed 100%.md'), 'utf8'), original);
  assert.equal(fs.readdirSync(vault).some((name) => name.endsWith('.tmp')), false);
});

test('an unchanged unusual basename is never sanitized into a rename', (t) => {
  const vault = temporaryDirectory(t);
  const names = ['Why?', 'A< B', 'x'.repeat(130)];

  for (const title of names) {
    const filename = `${title}.md`;
    const content = `# ${title}\n\nUntouched.\n`;
    fs.writeFileSync(path.join(vault, filename), content);
    const result = updateNoteFile(vault, { id: title, title, content });
    assert.equal(result.relativePath, filename);
    assert.equal(fs.readFileSync(path.join(vault, filename), 'utf8'), content);
  }

  assert.deepEqual(fs.readdirSync(vault).sort(), names.map((name) => `${name}.md`).sort());
});

test('uppercase Markdown extensions remain indexed, readable, and unchanged on save', (t) => {
  const vault = temporaryDirectory(t);
  const content = '# Uppercase extension\r\n';
  fs.writeFileSync(path.join(vault, 'NOTE.MD'), content);

  const graph = buildGraph(vault);
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].id, 'NOTE');
  assert.equal(graph.nodes[0].title, 'NOTE');
  assert.equal(readNoteFile(vault, 'NOTE').title, 'NOTE');

  const result = updateNoteFile(vault, { id: 'NOTE', title: 'NOTE', content });
  assert.equal(result.relativePath, 'NOTE.MD');
  assert.equal(fs.readFileSync(path.join(vault, 'NOTE.MD'), 'utf8'), content);
});

test('textarea round-trip preserves untouched CRLF, CR, and mixed newline bytes', (t) => {
  const vault = temporaryDirectory(t);
  const originals = new Map([
    ['CRLF', '---\r\ntitle: CRLF\r\n---\r\nBody\r\n'],
    ['CR', '---\rtitle: CR\r---\rBody\r'],
    ['Mixed', 'first\r\nsecond\rthird\nfourth\r\n']
  ]);

  for (const [title, original] of originals) {
    fs.writeFileSync(path.join(vault, `${title}.md`), original);
    const textareaValue = normalizeTextareaNewlines(original);
    const serialized = serializeTextareaContent(textareaValue, original);
    updateNoteFile(vault, { id: title, title, content: serialized });
    assert.equal(fs.readFileSync(path.join(vault, `${title}.md`), 'utf8'), original);
  }
});

test('edited textarea content retains the existing newline convention', () => {
  const crlfOriginal = 'first\r\nsecond\r\n';
  assert.equal(
    serializeTextareaContent('first\ninserted\nsecond\n', crlfOriginal),
    'first\r\ninserted\r\nsecond\r\n'
  );

  const crOriginal = 'first\rsecond\r';
  assert.equal(
    serializeTextareaContent('first\ninserted\nsecond\n', crOriginal),
    'first\rinserted\rsecond\r'
  );
});
