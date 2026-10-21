# Validate cache inputs and ignore files

Status: delivered on branch `fix/0d2-ignore-cache-inputs` from `develop` `9f67536`, 2026-09-21. Bead `genie-ops-center-v2-0d2` (`s0-01-followup`).

## What was wrong

`nx.json`'s `validate` target declared the workspace manifests, configs and READMEs it reads, but not `.gitignore` or `.nxignore`. Those files decide which directories Nx treats as projects, so a change to one can change the validate result while no declared input changes and Nx replays a cached pass.

Measured with the Nx daemon off for determinism (`NX_DAEMON=false`), cold cache then warm hit, on the unfixed inputs:

| Change | Result |
| --- | --- |
| none (warm) | `Cache: 1/1 hit (100%)` |
| root `.gitignore` appended | `Cache: 0/1 hit (0%)` |
| nested `.beads/.gitignore` appended | `Cache: 1/1 hit (100%)` — replayed |

The root ignore file is folded into Nx's project-graph hash even without a declared input, so it invalidated by accident. A nested ignore file did not, and that is the real gap: Nx resolves ignore files as a cascade — its `createIgnoreChainResolver` reads a directory's own `.gitignore`/`.nxignore` and every one above it — so a nested file changes the same project set. The same replay was also observed with the daemon on.

## The fix

Two inputs appended to the validate target, changing nothing already declared:

```json
"{workspaceRoot}/**/.gitignore",
"{workspaceRoot}/**/.nxignore"
```

`**/` matches the workspace root too, so these cover the root files and every nested one, which is what the cascade needs. `{workspaceRoot}/**/package.json` in the same list already relies on that zero-directory match.

Measured with the fix, same procedure:

| Change | Result |
| --- | --- |
| none (warm) | `Cache: 1/1 hit (100%)` |
| root `.gitignore` appended | `Cache: 0/1 hit (0%)`; restored → `1/1 hit (100%)` |
| nested `.beads/.gitignore` appended | `Cache: 0/1 hit (0%)`; restored → `1/1 hit (100%)` |

## Mutation evidence

Removing the two inputs restores the replay: with the mutation applied, a warm cache plus a nested `.beads/.gitignore` append returned `Cache: 1/1 hit (100%)`. `nx.json` was restored byte-identical (`sha256 af401e9b6076048bc8835a46174de888cb8da1fd29df2465ccc16b1899aa43f5`) and the fixed behaviour re-measured.

A focused check lives in `tools/generators/src/workspace/validate/validate-inputs.test.ts`: it reads `nx.json` and requires the exact whole-workspace globs `{workspaceRoot}/**/.gitignore` and `{workspaceRoot}/**/.nxignore`. A looser shape check is not enough — a subtree-only spelling such as `{workspaceRoot}/.beads/**/.gitignore` also starts at the root, contains `**` and ends in the filename, yet omits the root file and every nested ignore file outside `.beads`; the exact assertion fails that replacement.

## Scope

Only the validate target's inputs changed; every existing input, pin and selection entry is unchanged. The daemon was disabled for the table above so the result does not depend on watcher timing.
