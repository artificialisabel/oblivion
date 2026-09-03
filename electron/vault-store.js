import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_NOTE_ID_LENGTH = 4096;
export const MAX_NOTE_CONTENT_BYTES = 5 * 1024 * 1024;
export const MAX_NOTE_TITLE_LENGTH = 120;

function realpath(value) {
  return fs.realpathSync.native?.(value) ?? fs.realpathSync(value);
}

export function isPathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function canonicalizeVaultRoot(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) {
    throw new Error('The vault path is invalid.');
  }

  const root = realpath(value);
  if (!fs.statSync(root).isDirectory()) throw new Error('The selected vault is not a folder.');
  return root;
}

export function sanitizeNoteTitle(value) {
  return String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTE_TITLE_LENGTH);
}

export function validateNoteContent(value) {
  const content = String(value ?? '');
  if (Buffer.byteLength(content, 'utf8') > MAX_NOTE_CONTENT_BYTES) {
    throw new Error('That note is larger than the 5 MB editor limit.');
  }
  return content;
}

export function parseWikiLinks(value) {
  const links = [];
  const pattern = /(!?)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of String(value ?? '').matchAll(pattern)) {
    if (match[1] === '!') continue;
    const title = sanitizeNoteTitle(match[2]);
    if (title) links.push(title);
  }
  return links;
}

export function parseNoteLinks(value) {
  return String(value ?? '')
    .split(/[,\n]+/)
    .map((link) => link.replace(/^\[\[/, '').replace(/\]\]$/, '').trim())
    .map(sanitizeNoteTitle)
    .filter(Boolean);
}

function assertNoSymlinkComponents(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!isPathWithin(root, candidate)) throw new Error('Note path is outside the vault.');

  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Symbolic links cannot be edited from Oblivion.');
    }
  }
}

export function resolveMarkdownPath(vaultRoot, id) {
  const root = canonicalizeVaultRoot(vaultRoot);
  if (typeof id !== 'string' || !id || id.length > MAX_NOTE_ID_LENGTH || id.includes('\0')) {
    return null;
  }

  const relative = id.toLowerCase().endsWith('.md') ? id : `${id}.md`;
  if (path.isAbsolute(relative)) return null;

  const lexicalPath = path.resolve(root, relative);
  if (!isPathWithin(root, lexicalPath)) return null;

  try {
    assertNoSymlinkComponents(root, lexicalPath);
    const canonicalPath = realpath(lexicalPath);
    if (!isPathWithin(root, canonicalPath)) return null;
    if (!fs.statSync(canonicalPath).isFile() || path.extname(canonicalPath).toLowerCase() !== '.md') return null;
    return canonicalPath;
  } catch {
    return null;
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch {
    // Some filesystems do not support syncing directory descriptors.
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function atomicWriteFile(filePath, content, { overwrite = false, mode = 0o600 } = {}) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  let descriptor;

  try {
    descriptor = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;

    if (overwrite) {
      fs.renameSync(temporaryPath, filePath);
    } else {
      fs.linkSync(temporaryPath, filePath);
      fs.unlinkSync(temporaryPath);
    }
    fsyncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temp file may already have been renamed or removed.
    }
    throw error;
  }
}

function sameExistingFile(a, b) {
  try {
    const left = fs.statSync(a);
    const right = fs.statSync(b);
    return left.dev === right.dev && left.ino === right.ino;
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

export function buildNoteFilename(vaultRoot, title, { excludePath = null, directory = vaultRoot } = {}) {
  const root = canonicalizeVaultRoot(vaultRoot);
  const canonicalDirectory = realpath(directory);
  if (!fs.statSync(canonicalDirectory).isDirectory() || !isPathWithin(root, canonicalDirectory)) {
    throw new Error('The note folder is outside the vault.');
  }

  const safeTitle = sanitizeNoteTitle(title) || 'Untitled note';
  let filename = `${safeTitle}.md`;
  let filePath = path.join(canonicalDirectory, filename);
  let index = 2;

  while (fs.existsSync(filePath) && (!excludePath || !sameExistingFile(filePath, excludePath))) {
    filename = `${safeTitle} ${index}.md`;
    filePath = path.join(canonicalDirectory, filename);
    index += 1;
  }

  assertNoSymlinkComponents(root, filePath);
  return { filePath, filename };
}

export function findMarkdownByTitle(vaultRoot, title) {
  const root = canonicalizeVaultRoot(vaultRoot);
  const target = sanitizeNoteTitle(title).toLocaleLowerCase();
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      if (
        entry.isFile()
        && entry.name.toLowerCase().endsWith('.md')
        && entry.name.replace(/\.md$/i, '').toLocaleLowerCase() === target
      ) {
        return fullPath;
      }
    }
  }

  return null;
}

export function ensureStubNote(vaultRoot, title, sourceTitle) {
  const existing = findMarkdownByTitle(vaultRoot, title);
  if (existing) return existing;

  const { filePath } = buildNoteFilename(vaultRoot, title);
  atomicWriteFile(filePath, `# ${title}\n\nLinked from [[${sourceTitle}]].\n`);
  return filePath;
}

export function formatNewNote({ title, content, links }) {
  const body = validateNoteContent(content).trim();
  const noteLinks = [...new Set(parseNoteLinks(links))];
  const linkSection = noteLinks.length
    ? `${body ? '\n\n' : ''}## Links\n${noteLinks.map((link) => `- [[${link}]]`).join('\n')}`
    : '';
  return `# ${title}\n\n${body}${linkSection}\n`;
}

export function readNoteFile(vaultRoot, id) {
  const filePath = resolveMarkdownPath(vaultRoot, id);
  if (!filePath) return null;

  const root = canonicalizeVaultRoot(vaultRoot);
  const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    id: relativePath.replace(/\.md$/i, ''),
    title: path.basename(filePath).replace(/\.md$/i, ''),
    relativePath,
    content,
    body: content
  };
}

export function createNoteFile(vaultRoot, note) {
  const root = canonicalizeVaultRoot(vaultRoot);
  const title = sanitizeNoteTitle(note?.title);
  if (!title) throw new Error('Add a title first.');

  const content = formatNewNote({ ...note, title });
  const { filePath, filename } = buildNoteFilename(root, title);
  atomicWriteFile(filePath, content);
  return { filePath, filename, title, content };
}

export function updateNoteFile(vaultRoot, note) {
  const root = canonicalizeVaultRoot(vaultRoot);
  const currentPath = resolveMarkdownPath(root, note?.id);
  if (!currentPath) throw new Error('Could not find that note in the vault.');

  const fallbackTitle = path.basename(currentPath).replace(/\.md$/i, '');
  const requestedTitle = typeof note?.title === 'string' ? note.title : fallbackTitle;
  const renameRequested = requestedTitle !== fallbackTitle;
  const title = renameRequested ? sanitizeNoteTitle(requestedTitle) : fallbackTitle;
  if (!title) throw new Error('Add a title first.');
  const content = validateNoteContent(note?.content);
  const mode = fs.statSync(currentPath).mode & 0o777;
  const { filePath } = renameRequested
    ? buildNoteFilename(root, title, {
      excludePath: currentPath,
      directory: path.dirname(currentPath)
    })
    : { filePath: currentPath };
  const sameFile = fs.existsSync(filePath) && sameExistingFile(filePath, currentPath);

  if (sameFile) {
    atomicWriteFile(currentPath, content, { overwrite: true, mode });
  } else {
    atomicWriteFile(filePath, content, { mode });
    fs.unlinkSync(currentPath);
    fsyncDirectory(path.dirname(currentPath));
  }

  const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
  return { filePath, relativePath, id: relativePath.replace(/\.md$/i, ''), title, content };
}

export function safeDecodeUrlPath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
