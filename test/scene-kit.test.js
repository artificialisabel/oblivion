import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as sceneKit from '../packages/oblivion-scene-kit/src/index.js';

test('the scene kit is self-contained and exposes its documented helpers', () => {
  const nebulaSource = fs.readFileSync(
    new URL('../packages/oblivion-scene-kit/src/nebulaSystem.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(nebulaSource, /\.\.\/\.\.\/\.\.\/src\//);
  assert.equal(typeof sceneKit.createNebulaSystem, 'function');
  assert.equal(typeof sceneKit.formatNotePreview, 'function');
  assert.equal(typeof sceneKit.renderReaderTextElement, 'function');
});
