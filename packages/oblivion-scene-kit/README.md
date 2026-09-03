# Oblivion Scene Kit

Small reusable pieces extracted from the Oblivion vault galaxy so we can reuse the look and behavior without re-discovering the logic from scratch.

## Included

- `nebulaSystem`
  Procedural painterly nebula volume built from layered shader-driven planes in `three.js`.
- `previewText`
  Helpers for turning markdown into short in-scene previews.
- `readerText`
  Helpers for rendering note text with clickable links in DOM overlays.

## Install Into Another Project

For now this is a local workspace package, meant to be copied or linked from this repository.

```js
import { createNebulaSystem, formatNotePreview, wrapPreviewText } from './packages/oblivion-scene-kit/src/index.js';
```

## Nebula Usage

```js
import * as THREE from 'three';
import { createNebulaSystem } from './packages/oblivion-scene-kit/src/index.js';

const settings = {
  backgroundColor: '#41354b',
  nebulaColorA: '#5f38da',
  nebulaColorB: '#ad5cff',
  nebulaColorC: '#27baa3',
  nebulaIntensity: 1.31,
  nebulaMotion: 0.9,
  brushScale: 2.42
};

const seeded = (index, salt) => {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

const nebula = createNebulaSystem({ scene, settings, seeded });

function tick(elapsed, dt) {
  nebula.update(elapsed, dt);
}
```

## Notes

- The nebula effect is custom GLSL in `three.js`, not a third-party effect library.
- It depends on additive blending, large warped planes, and layered noise/fbm.
- For the same painterly feel, keep the post-processing pass that adds grain, vignette, and subtle color distortion.
