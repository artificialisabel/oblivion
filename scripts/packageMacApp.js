import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const projectPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const appVersion = projectPackage.version;
const releaseDir = path.join(projectRoot, 'release');
const outApp = path.join(releaseDir, 'Oblivion Vault.app');
const zipPath = path.join(releaseDir, `Oblivion-Vault-mac-v${appVersion}.zip`);
const resourcesDir = path.join(outApp, 'Contents/Resources');
const bundledAppDir = path.join(resourcesDir, 'app');
const executableName = 'Oblivion Vault';

if (process.platform !== 'darwin') {
  throw new Error('The current packaging helper only supports macOS.');
}

let electronExecutable;
try {
  // Electron 44+ downloads its checksummed official binary on first require.
  electronExecutable = require('electron');
} catch (error) {
  throw new Error(
    'Could not resolve Electron.app. The official Electron package needs network access or a populated cache on first use; retry npm run package:mac when that is available.',
    { cause: error }
  );
}

const electronApp = path.resolve(path.dirname(electronExecutable), '..', '..');
if (
  path.basename(electronApp) !== 'Electron.app'
  || !fs.existsSync(electronExecutable)
  || !fs.existsSync(path.join(electronApp, 'Contents/Info.plist'))
) {
  throw new Error('The Electron package did not resolve to a valid macOS Electron.app bundle.');
}

if (!fs.existsSync(path.join(projectRoot, 'dist/index.html'))) {
  throw new Error('dist/index.html was not found. Run npm run build first.');
}

fs.rmSync(outApp, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
fs.cpSync(electronApp, outApp, {
  recursive: true,
  verbatimSymlinks: true
});

fs.renameSync(
  path.join(outApp, 'Contents/MacOS/Electron'),
  path.join(outApp, `Contents/MacOS/${executableName}`)
);

fs.rmSync(bundledAppDir, { recursive: true, force: true });
fs.mkdirSync(bundledAppDir, { recursive: true });

for (const entry of ['dist', 'electron', 'scripts']) {
  fs.cpSync(path.join(projectRoot, entry), path.join(bundledAppDir, entry), {
    recursive: true,
    verbatimSymlinks: true
  });
}

fs.writeFileSync(
  path.join(bundledAppDir, 'package.json'),
  `${JSON.stringify({
    name: 'oblivion-vault',
    productName: 'Oblivion Vault',
    version: appVersion,
    type: 'module',
    main: 'electron/main.js'
  }, null, 2)}\n`
);

const plistPath = path.join(outApp, 'Contents/Info.plist');
const plistValues = new Map([
  ['CFBundleDisplayName', executableName],
  ['CFBundleExecutable', executableName],
  ['CFBundleIdentifier', 'com.oblivion.vault'],
  ['CFBundleName', executableName],
  ['CFBundleShortVersionString', appVersion],
  ['CFBundleVersion', appVersion]
]);
for (const [key, value] of plistValues) {
  execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plistPath]);
}

const unusedPlistKeys = [
  'LSApplicationCategoryType',
  'NSAppTransportSecurity',
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription'
];
for (const key of unusedPlistKeys) {
  spawnSync('/usr/bin/plutil', ['-remove', key, plistPath], { stdio: 'ignore' });
}

fs.rmSync(zipPath, { force: true });
execFileSync('xattr', ['-cr', outApp], { stdio: 'inherit' });
execFileSync('codesign', ['--force', '--deep', '--sign', '-', outApp], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', outApp], { stdio: 'inherit' });
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', outApp, zipPath], { stdio: 'inherit' });

console.log(`Packaged ${outApp}`);
console.log(`Created ${zipPath}`);
