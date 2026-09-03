import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { buildGraph } from '../scripts/buildGraph.js';
import {
  atomicWriteFile,
  canonicalizeVaultRoot,
  createNoteFile,
  ensureStubNote,
  isPathWithin,
  parseNoteLinks,
  parseWikiLinks,
  readNoteFile,
  safeDecodeUrlPath,
  updateNoteFile
} from './vault-store.js';
import {
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  withSecurityHeaders
} from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const SAFE_OPERATION_ERRORS = new Set([
  'Add a title first.',
  'Could not find that note in the vault.',
  'Symbolic links cannot be edited from Oblivion.',
  'That note is larger than the 5 MB editor limit.',
  'The note folder is outside the vault.'
]);

let mainWindow = null;
let server = null;
let watcher = null;
let reloadTimer = null;
let appOrigin = null;

const state = {
  vaultRoot: null,
  avatarPath: null,
  vaultRevision: 0,
  graph: createEmptyGraph(),
  error: null,
  generatedAt: null
};

app.setName('Oblivion Vault');

function createEmptyGraph() {
  return { generatedAt: null, nodes: [], edges: [] };
}

function getAppIconPath() {
  return [
    path.join(distRoot, 'oblivion-icon.png'),
    path.join(projectRoot, 'public/oblivion-icon.png')
  ].find((candidate) => fs.existsSync(candidate));
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function safeOperationError(error, fallback) {
  return error instanceof Error && SAFE_OPERATION_ERRORS.has(error.message)
    ? error.message
    : fallback;
}

function validateNotePayload(note, { update = false } = {}) {
  if (!note || typeof note !== 'object' || Array.isArray(note)) return false;
  if (typeof note.title !== 'string' || note.title.length > 1000) return false;
  if (typeof note.content !== 'string') return false;
  if (note.links !== undefined && (typeof note.links !== 'string' || note.links.length > 65_536)) return false;
  if (update && (typeof note.id !== 'string' || note.id.length > 4096)) return false;
  return true;
}

function canonicalizeAvatarPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null;
  try {
    const canonicalPath = fs.realpathSync.native?.(value) ?? fs.realpathSync(value);
    return fs.statSync(canonicalPath).isFile() && path.extname(canonicalPath).toLowerCase() === '.glb'
      ? canonicalPath
      : null;
  } catch {
    return null;
  }
}

function loadSettings() {
  state.vaultRoot = null;
  state.avatarPath = null;
  state.vaultRevision = 0;
  try {
    const settings = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
    try {
      state.vaultRoot = canonicalizeVaultRoot(settings.vaultRoot);
      state.vaultRevision = 1;
    } catch {
      state.vaultRoot = null;
    }
    state.avatarPath = canonicalizeAvatarPath(settings.avatarPath);
  } catch {
    // First launch, malformed settings, and removed paths all fall back safely.
  }
}

function saveSettings() {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
  atomicWriteFile(
    settingsPath,
    `${JSON.stringify({ vaultRoot: state.vaultRoot, avatarPath: state.avatarPath }, null, 2)}\n`,
    { overwrite: fs.existsSync(settingsPath), mode: 0o600 }
  );
}

function refreshGraph() {
  if (!state.vaultRoot) {
    state.graph = createEmptyGraph();
    state.error = null;
    state.generatedAt = null;
    return;
  }

  try {
    state.graph = buildGraph(state.vaultRoot);
    state.error = null;
    state.generatedAt = state.graph.generatedAt;
  } catch (error) {
    console.error('Could not refresh the selected vault:', error);
    state.graph = createEmptyGraph();
    state.error = 'Could not read one or more Markdown files in this vault.';
    state.generatedAt = new Date().toISOString();
  }
}

function getVaultStatus() {
  return {
    connected: Boolean(state.vaultRoot),
    vaultName: state.vaultRoot ? path.basename(state.vaultRoot) : null,
    vaultRevision: state.vaultRevision,
    nodeCount: state.graph.nodes.length,
    edgeCount: state.graph.edges.length,
    generatedAt: state.generatedAt,
    avatarSelected: Boolean(state.avatarPath),
    avatarName: state.avatarPath ? path.basename(state.avatarPath) : null,
    error: state.error
  };
}

function emitVaultChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vault:changed', getVaultStatus());
  }
}

function createNote(note) {
  if (!state.vaultRoot) return { ok: false, error: 'Choose a vault before creating notes.' };
  if (!validateNotePayload(note)) return { ok: false, error: 'The note data is invalid.' };

  try {
    const created = createNoteFile(state.vaultRoot, note);
    const links = [...new Set([
      ...parseNoteLinks(note?.links),
      ...parseWikiLinks(note?.content)
    ])];
    for (const link of links) {
      if (link.toLocaleLowerCase() !== created.title.toLocaleLowerCase()) {
        ensureStubNote(state.vaultRoot, link, created.title);
      }
    }

    refreshGraph();
    emitVaultChanged();
    return {
      ok: true,
      id: created.filename.replace(/\.md$/i, ''),
      relativePath: created.filename,
      status: getVaultStatus()
    };
  } catch (error) {
    console.error('Could not create a note:', error);
    return { ok: false, error: safeOperationError(error, 'Could not create that note.') };
  }
}

function updateNote(note) {
  if (!state.vaultRoot) return { ok: false, error: 'Choose a vault before editing notes.' };
  if (!validateNotePayload(note, { update: true })) return { ok: false, error: 'The note data is invalid.' };

  try {
    const updated = updateNoteFile(state.vaultRoot, note);
    for (const link of new Set(parseWikiLinks(updated.content))) {
      if (link.toLocaleLowerCase() !== updated.title.toLocaleLowerCase()) {
        ensureStubNote(state.vaultRoot, link, updated.title);
      }
    }

    refreshGraph();
    emitVaultChanged();
    return {
      ok: true,
      id: updated.id,
      relativePath: updated.relativePath,
      status: getVaultStatus()
    };
  } catch (error) {
    console.error('Could not update a note:', error);
    return { ok: false, error: safeOperationError(error, 'Could not update that note.') };
  }
}

function readNote(id) {
  if (!state.vaultRoot) return null;
  try {
    return readNoteFile(state.vaultRoot, id);
  } catch {
    return null;
  }
}

function closeWatcher() {
  clearTimeout(reloadTimer);
  reloadTimer = null;
  watcher?.close();
  watcher = null;
}

function watchVault() {
  closeWatcher();
  if (!state.vaultRoot) return;

  try {
    watcher = fs.watch(state.vaultRoot, { recursive: true }, (_event, filename) => {
      if (typeof filename === 'string' && !filename.toLowerCase().endsWith('.md')) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        refreshGraph();
        emitVaultChanged();
      }, 220);
    });
    watcher.on('error', (error) => {
      console.error('Vault watcher failed:', error);
      state.error = 'The vault watcher stopped. Choose the vault again to retry.';
      closeWatcher();
      emitVaultChanged();
    });
  } catch (error) {
    console.error('Could not watch the selected vault:', error);
    state.error = 'Could not watch this vault for changes.';
  }
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.woff2': 'font/woff2'
  }[extension] ?? 'application/octet-stream';
}

function send(response, status, headers, body, headOnly = false) {
  response.writeHead(status, withSecurityHeaders(headers));
  response.end(headOnly ? undefined : body);
}

function sendJson(response, status, value, headOnly = false) {
  send(response, status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }, `${JSON.stringify(value)}\n`, headOnly);
}

function sendError(response, status, message, headOnly = false) {
  send(response, status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store'
  }, message, headOnly);
}

function serveFile(requestPath, response, headOnly) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const lexicalPath = path.resolve(distRoot, relativePath);
  if (!isPathWithin(distRoot, lexicalPath)) {
    sendError(response, 404, 'Not found', headOnly);
    return;
  }

  fs.realpath(lexicalPath, (realpathError, canonicalPath) => {
    if (realpathError || !isPathWithin(distRoot, canonicalPath)) {
      sendError(response, 404, 'Not found', headOnly);
      return;
    }

    fs.readFile(canonicalPath, (readError, data) => {
      if (readError) {
        sendError(response, 404, 'Not found', headOnly);
        return;
      }
      send(response, 200, {
        'content-type': getMimeType(canonicalPath),
        'cache-control': canonicalPath.endsWith('.html') ? 'no-store' : 'public, max-age=3600'
      }, data, headOnly);
    });
  });
}

function startServer() {
  if (server?.listening && appOrigin) return Promise.resolve(Number(new URL(appOrigin).port));

  return new Promise((resolve, reject) => {
    const nextServer = http.createServer((request, response) => {
      const headOnly = request.method === 'HEAD';
      if (request.method !== 'GET' && !headOnly) {
        sendError(response, 405, 'Method not allowed', headOnly);
        return;
      }
      if (!request.url || request.url.length > 8192) {
        sendError(response, 414, 'Request target is too long', headOnly);
        return;
      }

      const port = nextServer.address()?.port;
      const expectedHost = port ? `127.0.0.1:${port}` : null;
      if (!expectedHost || request.headers.host !== expectedHost) {
        sendError(response, 421, 'Misdirected request', headOnly);
        return;
      }

      let url;
      try {
        url = new URL(request.url, `http://${expectedHost}`);
      } catch {
        sendError(response, 400, 'Bad request', headOnly);
        return;
      }
      if (url.origin !== `http://${expectedHost}`) {
        sendError(response, 400, 'Bad request', headOnly);
        return;
      }
      if (request.headers.origin && request.headers.origin !== appOrigin) {
        sendError(response, 403, 'Forbidden', headOnly);
        return;
      }

      if (url.pathname === '/graph.json') {
        sendJson(response, 200, state.graph, headOnly);
        return;
      }

      if (url.pathname === '/api/vault') {
        sendJson(response, 200, getVaultStatus(), headOnly);
        return;
      }

      if (url.pathname === '/api/note') {
        const id = url.searchParams.get('id');
        const note = id ? readNote(id) : null;
        if (!note) {
          sendJson(response, 404, { error: 'Note not found.' }, headOnly);
          return;
        }
        sendJson(response, 200, note, headOnly);
        return;
      }

      if (url.pathname === '/api/avatar.glb') {
        const avatarPath = canonicalizeAvatarPath(state.avatarPath);
        if (!avatarPath) {
          sendError(response, 404, 'Not found', headOnly);
          return;
        }
        fs.readFile(avatarPath, (error, data) => {
          if (error) {
            sendError(response, 404, 'Not found', headOnly);
            return;
          }
          send(response, 200, {
            'content-type': 'model/gltf-binary',
            'cache-control': 'no-store'
          }, data, headOnly);
        });
        return;
      }

      const decodedPath = safeDecodeUrlPath(url.pathname);
      if (decodedPath === null) {
        sendError(response, 400, 'Bad request', headOnly);
        return;
      }
      serveFile(decodedPath, response, headOnly);
    });

    nextServer.once('error', reject);
    nextServer.listen(0, '127.0.0.1', () => {
      nextServer.off('error', reject);
      server = nextServer;
      const port = nextServer.address().port;
      appOrigin = `http://127.0.0.1:${port}`;
      resolve(port);
    });
  });
}

function stopServices() {
  closeWatcher();
  if (server) {
    server.close();
    server.closeAllConnections?.();
    server = null;
  }
  appOrigin = null;
}

async function chooseVault() {
  const options = { title: 'Choose your Markdown vault', properties: ['openDirectory'] };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return getVaultStatus();

  const previousRoot = state.vaultRoot;
  const previousRevision = state.vaultRevision;
  try {
    state.vaultRoot = canonicalizeVaultRoot(result.filePaths[0]);
    state.vaultRevision += 1;
    saveSettings();
    refreshGraph();
    watchVault();
    emitVaultChanged();
  } catch (error) {
    console.error('Could not select that vault:', error);
    state.vaultRoot = previousRoot;
    state.vaultRevision = previousRevision;
    refreshGraph();
    watchVault();
    state.error = 'Could not open that vault.';
  }
  return getVaultStatus();
}

async function chooseAvatar() {
  const options = {
    title: 'Choose a GLB avatar',
    properties: ['openFile'],
    filters: [{ name: 'GLB models', extensions: ['glb'] }]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return getVaultStatus();

  const avatarPath = canonicalizeAvatarPath(result.filePaths[0]);
  if (!avatarPath) return { ...getVaultStatus(), error: 'Choose a readable GLB file.' };
  const previousAvatarPath = state.avatarPath;
  try {
    state.avatarPath = avatarPath;
    saveSettings();
    emitVaultChanged();
    return getVaultStatus();
  } catch (error) {
    console.error('Could not save the avatar selection:', error);
    state.avatarPath = previousAvatarPath;
    return { ...getVaultStatus(), error: 'Could not save that avatar selection.' };
  }
}

function createMenu() {
  const viewItems = [
    { role: 'reload' },
    { role: 'togglefullscreen' }
  ];
  if (!app.isPackaged) viewItems.push({ role: 'toggleDevTools' });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Oblivion',
      submenu: [
        { label: 'Choose Vault...', accelerator: 'CommandOrControl+O', click: chooseVault },
        { label: 'Choose Avatar...', click: chooseAvatar },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: 'View', submenu: viewItems }
  ]));
}

function isTrustedIpcEvent(event) {
  return Boolean(
    appOrigin
    && mainWindow
    && !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents
    && isTrustedRendererUrl(event.senderFrame?.url, appOrigin)
  );
}

function registerIpcHandler(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcEvent(event)) throw new Error('Blocked an untrusted renderer request.');
    return handler(...args);
  });
}

function registerIpcHandlers() {
  registerIpcHandler('vault:choose', chooseVault);
  registerIpcHandler('vault:get', () => getVaultStatus());
  registerIpcHandler('avatar:choose', chooseAvatar);
  registerIpcHandler('note:create', createNote);
  registerIpcHandler('note:update', updateNote);
}

async function createWindow(port) {
  const expectedOrigin = `http://127.0.0.1:${port}`;
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    title: 'Oblivion Vault',
    icon: getAppIconPath(),
    backgroundColor: '#41354b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    }
  });

  mainWindow = window;
  const { webContents } = window;
  webContents.session.setPermissionCheckHandler(() => false);
  webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  webContents.on('will-attach-webview', (event) => event.preventDefault());
  const preventUntrustedNavigation = (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl, expectedOrigin)) event.preventDefault();
  };
  webContents.on('will-navigate', preventUntrustedNavigation);
  webContents.on('will-redirect', preventUntrustedNavigation);
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  await window.loadURL(`${expectedOrigin}/`);
}

app.whenReady().then(async () => {
  loadSettings();
  refreshGraph();
  watchVault();
  createMenu();
  const port = await startServer();
  registerIpcHandlers();
  await createWindow(port);
}).catch((error) => {
  console.error('Oblivion could not start:', error);
  stopServices();
  app.quit();
});

app.on('before-quit', stopServices);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length > 0) return;
  try {
    const port = await startServer();
    await createWindow(port);
  } catch (error) {
    console.error('Could not reopen Oblivion:', error);
  }
});
