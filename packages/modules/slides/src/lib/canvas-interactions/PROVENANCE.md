# canvas-interactions provenance

Copied source. The module installs no agent-native package; these two files are copied on purpose (owner, 2026-11-07, `czjw.103`).

| Field | Value |
| --- | --- |
| Upstream | https://github.com/BuilderIO/agent-native |
| Revision | `f31225ba3332a3dd4965d1ee5644df4d281bc650` |
| Licence | MIT. The full text is in `LICENSE`. |
| Copied on | 2026-11-09 |

| File | Upstream path | SHA-256 |
| --- | --- | --- |
| `canvas-interactions.ts` | `packages/toolkit/src/canvas-interactions/canvas-interactions.ts` | `17bb5ae80f7a8eee7ca25580598f4952db713adf1c8847299b608ac8aa11c96a` |
| `hotkey-keys.ts` | `packages/toolkit/src/canvas-interactions/hotkey-keys.ts` | `029cc3fc54cd6e1d15170002b224a9088c0a743e6d4b5427dd1f87d934135512` |
| `LICENSE` | `LICENSE` | `dc40b458769a718adbc4456eeb52060385acd5cac3f48a6e98002fafbf84424c` |

## Local modifications

Two, in `canvas-interactions.ts`, so the file passes `exactOptionalPropertyTypes`. Neither changes the behavior. The SHA-256 above is the upstream file before them.

- `createCanvasInteractionCore` `resize` falls back to `DEFAULT_CANVAS_MIN_SIZE` after `config.minSize`. `resizeCanvasRect` already applies that default.
- The resize gesture passes `altKey: Boolean(pointer.altKey)`. The key is read only for its truth value.

The formatter and the linter skip this folder (`packages/config/src/oxfmt/`, `packages/config/src/oxlint/`), so the files stay as copied.

## What the module uses

The gesture controller (`createCanvasGestureController`), the resize math (`resizeCanvasRect`) and the nudge keys (`resolveCanvasNudge`). The module's own adapter, `presentation/canvas-adapter.ts`, turns one gesture into one `change-element` step. The HTML text session of agent-native is not copied.

To update: copy the two files from a new upstream revision, write the new revision and hashes here, and run the module's canvas adapter tests.
