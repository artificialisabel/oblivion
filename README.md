# Oblivion

A walkable, local-first knowledge galaxy for a Markdown vault. Every note becomes a
star, every `[[wiki link]]` becomes a thread, and the selected folder stays on the
computer running the app.

**Live online edition:** [oblivion.artificialisabel.com](https://oblivion.artificialisabel.com)

The hosted edition is a separate online product, not a browser build of this
local-first source snapshot.

Built with [Vite](https://vite.dev), [three.js](https://threejs.org), and
[Electron](https://www.electronjs.org).

## Requirements

- Node.js 22.12 or newer
- macOS 13 or newer for artifacts produced by the current Electron version
- a folder of Markdown notes (an Obsidian vault works as-is)

Install the locked dependencies:

```sh
npm ci
```

Electron's npm package installs its JavaScript wrapper first and resolves the official,
checksummed Electron binary on the first `npm run desktop` or `npm run package:mac`.
That first invocation needs network access or an already populated Electron cache.

## Run the local vault app

```sh
npm run desktop
```

The command builds the renderer, starts an HTTP service bound to a random port on
`127.0.0.1`, and opens the Electron window. Choose a vault inside the app or with
**Oblivion → Choose Vault…**. The chosen path is stored in Electron's local app
settings so it can be restored on the next launch.

Controls:

- `V` or **POV** toggles first-person and third-person view.
- **Avatar** imports a local `.glb` avatar and remembers that choice locally.
- **New Note** creates a Markdown file in the vault. Wiki links written in the body,
  or added with the create-only Links helper, can create missing stub notes.
- `E` opens the nearby note in the editor. During edits, the textarea contains the
  complete Markdown file rather than parsed fields, so frontmatter, headings, and link
  sections are not reconstructed. An unchanged textarea writes the original bytes,
  including CRLF, CR, or mixed newlines. After a text edit, Oblivion retains the
  file's predominant newline convention. Leaving the title unchanged preserves the
  existing basename exactly; changing it explicitly renames the file using a portable,
  sanitized title of at most 120 characters.
- `O` previews or opens the nearby note. HTTP(S) links in the full reader open in the
  system browser.

Note and stub writes use a same-directory temporary file plus an atomic filesystem
operation. Oblivion refuses path traversal and does not follow symlinks while indexing
or editing a vault.

## Privacy and security boundary

- The production renderer is always built with the empty `public/graph.json`
  placeholder. Environment variables cannot bake a local vault into a browser build.
- The in-memory graph contains note IDs, relative paths, tags, and links, but never an
  absolute vault path. Renderer status includes only the selected folder's basename.
- Notes and imported avatars are served only by the loopback desktop service. Private
  responses disable caching, requests must use the exact `127.0.0.1` host and port,
  and Electron navigation, permissions, IPC senders, and new windows are restricted.
- The selected absolute paths remain in Electron's local settings because the main
  process needs them to reopen local files. They are not returned to the renderer.

The threat boundary is the local operating-system account. A process already running
as the same user can generally read that user's files directly; Oblivion is not a
sandbox for mutually untrusted local processes.

## Browser preview

```sh
npm run dev
```

The browser preview intentionally opens an empty, read-only galaxy. It never accepts a
vault path and has no note API. Use the Electron command above to explore real notes.

## Verify changes

```sh
npm run check
npm audit
```

`npm run check` runs the path/privacy/round-trip regression tests and creates a
production renderer build.

## Local macOS packaging helper

```sh
npm run package:mac
```

This creates a local developer artifact in `release/` from Electron's official binary.
It targets the architecture selected by Electron for the Mac running the helper; it is
not a universal binary. The helper applies only an ad-hoc signature. It does **not**
apply a Developer ID signature or notarize the app, and its output should not be
presented as a trusted public macOS release.

The helper currently retains Electron's default application icon. The bundled PNG art
is not mislabeled or silently converted to ICNS; a custom macOS icon remains blocked on
confirmed asset provenance and a reproducible ICNS source. A public release also needs
an owned signing identity, notarization, update strategy, and release CI.

## Interface and reusable kit

Panels, chips, fields, and the hint strip come from the vendored `glass-chrome` UI in
`src/glass-chrome/`. Oblivion uses its greyscale `void` theme while the galaxy retains
its colour.

Reusable scene pieces live in `packages/oblivion-scene-kit/`:

- the procedural painterly nebula system
- note preview text helpers
- reader text/link rendering helpers

See [packages/oblivion-scene-kit/README.md](packages/oblivion-scene-kit/README.md).

## Redistribution status

This source snapshot intentionally does not invent a software license or asset grant.
There is no repository-level license file. Confirm ownership and redistribution rights
for the bundled GLB, icons, cover art, and other visual assets, then add the intended
license notices before publishing binaries or describing the project as open source.
