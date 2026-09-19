# S0-01 workspace and data-only build inputs implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the pnpm and Nx workspace, the shared presets, the enforced import boundaries, and the data-only module selection resolver that later Spec 0 tickets build on.

**Architecture:** One pnpm workspace. Nx infers every task from each package's `package.json` scripts, so each package stays a plain pnpm package. `packages/config` owns every shared preset and the vendored lint rules. `tools/generators` owns the module selection resolver, which reads data only and never evaluates a module. Import direction is enforced by glob-keyed `no-restricted-imports` entries in one shared Oxlint configuration.

**Tech Stack:** Node 26.9.0, pnpm 12.4.2, Nx 23.2.1, TypeScript 7.0.2, Oxlint 1.83.0 with `@oxlint/plugins` 1.83.0, oxfmt 0.68.0, lefthook 2.1.14, Vitest 5.0.1, Tailwind CSS 4.3.3.

**Spec:** [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [ticket](index.md).

**Bead:** `genie-ops-center-v2-1rd.1`. Branch `feature/s0-01-workspace-and-build-inputs`. Base `develop` at `7d68e91`.

## Global Constraints

Every task inherits the constraints below. Copy the exact values.

- A test-first step must be able to fail. Two traps in this repository make a red step report success: `pnpm --filter <pkg>` exits 0 when it matches no package, and a test that builds its cases from the Nx project graph generates no case for a package that does not exist yet. Before recording a red result, confirm the output names the assertion that failed. A passing run, a no-op run, and a run that collected nothing are all different from a red step, and none of them proves a test works.

- Node major 26. The root `engines.node` field and the future Dockerfile base image must name the same major (R-6).
- Exact pins, no range prefix, for `oxlint`, `@oxlint/plugins`, `oxfmt`, `lefthook`, `typescript`, `vitest`, `tailwindcss`, `nx`.
- `oxlint` and `@oxlint/plugins` must hold the identical exact version (R-5a).
- TypeScript runs in strict mode (R-6).
- Nx local caching is on. Remote caching is off. No cache provider, account, or token (R-3).
- Every project carries exactly one architectural classification tag from `app`, `core`, `ui`, `module`, `config`, `tooling` (R-4).
- Every folder named in [the repository layout](../../../architecture/repository-layout.md) holds a `README.md` that says what the folder is for, what belongs in it, and what must not go in it. A package `README.md` also names what it imports. The file never lists the folder's files (R-9).
- Do not add a dependency that [the tech stack](../../../core/tech-stack.md) does not name. A new dependency needs a one-line reason in that document in the same change.
- Formatting is oxfmt, configured by the option names in [its configuration reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html). Never set an option to its documented default. Never add Prettier, Biome, or a formatting lint rule beside it.
- Every pnpm setting lives in `pnpm-workspace.yaml`, in camel case. pnpm 12 reads only authorization and registry settings from `.npmrc`, so a setting written there is silently ignored ([pnpm settings](https://pnpm.io/settings)). Never relax `strictPeerDependencies`, `minimumReleaseAge`, or `minimumReleaseAgeStrict` to make an install pass. Add a named exception instead, and never use `dangerouslyAllowAllBuilds`.
- Do not create `apps/storybook`, any Storybook pin, preset body, or Storybook Nx target. S0-02 owns those. This ticket reserves the configuration extension point only.
- Do not create `packages/modules/placeholder`. S0-04 owns it. Import fixtures use throwaway fixture files.
- Do not commit, merge, push, or run a Dolt remote sync. The repository policy requires separate authority.
- Write every document in the style of the repository: short sentences, active voice, no contractions, no semicolons.

## Deviations recorded before work starts

1. **Plan location.** The Superpowers default is `docs/superpowers/plans/`. This plan lives beside its ticket because [the ticket execution contract](../README.md) says ticket-local execution plans belong with the ticket.
2. **Node 26 is not yet a long-term support release.** Version 26.9.0 shipped on 2026-09-16 and long-term support starts in October 2026. [The tech stack](../../../core/tech-stack.md) already states this and pins 26 on purpose. This plan follows it.
3. **Oxlint pin.** The vendored anti-slop revision was tested against Oxlint 1.78.0. The current release is 1.83.0. Task 6 tries 1.83.0 first and proves the plugin loads. If it fails, Task 6 falls back to 1.78.0 and records the exact failure. Neither choice is silent.
4. **Branch naming and toolchain policy are already recorded, outside this branch.** The user's global `~/.gitignore` ignores `CLAUDE.md` (line 12) and `AGENTS.md` (line 15), so both files exist only in the main checkout at `/home/kenan/work/genie-ops-center-v2/`. They never appear in a worktree and never enter a commit. The new branch prefixes (`feature/`, `bugfix/`, `chore/`) and the settled toolchain (oxfmt not Prettier, oxlint not ESLint, `tsc --noEmit` kept) were written there on 2026-09-19. This plan therefore has nine tasks and touches neither file.

## File structure

| Path | Responsibility |
| --- | --- |
| `package.json` | Root manifest. Node engine, package manager pin, Nx-backed scripts, shared development dependencies. |
| `pnpm-workspace.yaml` | Workspace package globs. |
| `nx.json` | Task graph, named inputs, target defaults, local cache on, remote cache off. |
| `.gitignore` | Ignores `node_modules`, Nx cache, and `apps/genie/src/modules.ts`. |
| `.npmrc` | pnpm strictness settings. |
| `lefthook.yml` | Staged-file format and lint hook. |
| `oxlint.config.ts` | Root Oxlint entry. Re-exports the shared configuration from `packages/config`. |
| `oxfmt.config.ts` | Root oxfmt entry. Re-exports the shared configuration from `packages/config`. |
| `packages/config/src/typescript/base.json` | Shared strict `tsconfig`. |
| `packages/config/src/oxlint/boundaries.ts` | The glob-keyed import-direction overrides. |
| `packages/config/src/oxlint/index.ts` | The composed shared Oxlint configuration. |
| `packages/config/src/oxfmt/index.ts` | Shared formatter settings. |
| `packages/config/src/vitest/unit.ts` | Shared unit-test preset. |
| `packages/config/src/tailwind/preset.ts` | Shared Tailwind preset. |
| `packages/config/src/storybook/index.ts` | Reserved extension point. Exports the shared shape only. |
| `packages/config/oxlint/anti-slop/` | Vendored anti-slop source, its licence, and its provenance record. |
| `tools/generators/src/selection/inventory.ts` | Reads the data-only module inventory from package metadata. |
| `tools/generators/src/selection/resolve.ts` | Resolves an ordered selection from `MODULE_INCLUDE`. |
| `tools/generators/src/selection/fingerprint.ts` | Canonical serialization and fingerprint. |
| `tools/generators/src/selection/modules-file.ts` | Reads a customer `modules.txt` into a `MODULE_INCLUDE` value. |
| `tools/generators/src/workspace/classify-project.ts` | Maps a project root to its one architectural classification. |
| `tools/generators/src/workspace/hygiene.test.ts` | Proves every project carries the right tag and holds a `README.md`. |

---

### Task 1: Workspace root, Nx, and a running unit-test harness

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `nx.json`, `.gitignore`
- Create: `packages/config/package.json`, `packages/config/README.md`, `packages/config/src/vitest/unit.ts`, `packages/config/vitest.config.ts`
- Test: `packages/config/src/vitest/unit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `unitTestPreset` from `@genie/config/vitest/unit`, a `UserConfig` object that every package's `vitest.config.ts` merges. Root scripts `build`, `test`, `lint`, `typecheck`, each delegating to Nx.

- [ ] **Step 1: Write the failing test**

Create `packages/config/src/vitest/unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { unitTestPreset } from "./unit.ts";

describe("unitTestPreset", () => {
  it("restores mocks between tests so one test cannot leak into the next", () => {
    expect(unitTestPreset.test?.restoreMocks).toBe(true);
  });

  it("collects only unit test files and leaves browser and end-to-end files alone", () => {
    expect(unitTestPreset.test?.include).toEqual(["src/**/*.test.ts", "src/**/*.test.tsx"]);
    expect(unitTestPreset.test?.exclude).toContain("**/*.stories.*");
    expect(unitTestPreset.test?.exclude).toContain("e2e/**");
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `pnpm --filter @genie/config exec vitest run`
Expected: the run fails because `./unit.ts` does not exist.

- [ ] **Step 3: Write the root workspace files**

Create `pnpm-workspace.yaml`. Do not create a `.npmrc`. pnpm 12 reads only authorization and registry settings from `.npmrc`, so a pinning or peer setting written there is silently ignored ([pnpm settings](https://pnpm.io/settings)). Every setting below uses the camel-case name pnpm 12 expects.

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/modules/*"
  - "tools/*"
  - "customers/*/app"

# pnpm 12 reads only auth and registry settings from .npmrc. Everything else
# lives here: https://pnpm.io/settings
saveExact: true
strictPeerDependencies: true
autoInstallPeers: false

# Supply-chain guard. Refuse any version published less than one day ago,
# because a malicious release is usually pulled from the registry within the
# hour. The 1440 default is non-strict, so a too-fresh pin would silently fall
# back to an older version. Setting the value explicitly turns strict mode on,
# and the install fails instead. Every exception is one auditable line below.
minimumReleaseAge: 1440
minimumReleaseAgeStrict: true
minimumReleaseAgeExclude:
  - "@types/node@26.6.2"

# An install script runs arbitrary code at install time. Name each package that
# needs one. Never use dangerouslyAllowAllBuilds.
allowBuilds:
  nx: true
```

Expect `minimumReleaseAgeStrict: true` to reject other pins in this plan that were published in the last day. That is the guard working. Add the exact `name@version` to `minimumReleaseAgeExclude`, one line each. Never lower `minimumReleaseAge`, never set `minimumReleaseAgeStrict: false`, and never downgrade a pin to slip under the window.

Create `.gitignore`:

```gitignore
node_modules/
.nx/
dist/
coverage/
*.tsbuildinfo

# Agent scratch space. Holds the execution ledger and review packages, never source.
.superpowers/

# Generated at build time from MODULE_INCLUDE. Never commit it (ADR 0008).
apps/genie/src/modules.ts

.env
.env.*
!.env.example
```

Create `package.json`:

```json
{
  "name": "genie-ops-center",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.4.2",
  "engines": {
    "node": "^26.0.0"
  },
  "scripts": {
    "build": "nx run-many -t build",
    "test": "nx run-many -t test",
    "lint": "nx run-many -t lint",
    "typecheck": "nx run-many -t typecheck",
    "format": "oxfmt --disable-nested-config",
    "format:check": "oxfmt --check --disable-nested-config",
    "affected": "nx affected -t build test lint typecheck"
  },
  "devDependencies": {
    "@types/node": "26.6.2",
    "nx": "23.2.1",
    "oxfmt": "0.68.0",
    "oxlint": "1.83.0",
    "typescript": "7.0.2",
    "vitest": "5.0.1"
  }
}
```

Create `nx.json`:

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "neverConnectToCloud": true,
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/*.test.ts",
      "!{projectRoot}/**/*.test.tsx",
      "!{projectRoot}/**/*.stories.*",
      "!{projectRoot}/vitest.config.ts",
      "!{projectRoot}/e2e/**"
    ],
    "sharedGlobals": [
      "{workspaceRoot}/nx.json",
      "{workspaceRoot}/oxlint.config.ts",
      "{workspaceRoot}/oxfmt.config.ts",
      "{workspaceRoot}/pnpm-lock.yaml",
      "{workspaceRoot}/tsconfig.base.json"
    ]
  },
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production"]
    },
    "lint": {
      "cache": true,
      "inputs": ["default", "{workspaceRoot}/oxlint.config.ts"]
    },
    "typecheck": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["default", "^production"]
    }
  }
}
```

- [ ] **Step 4: Write the config package and the preset**

Create `packages/config/package.json`:

```json
{
  "name": "@genie/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./vitest/unit": "./src/vitest/unit.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "nx": {
    "tags": ["config"]
  },
  "devDependencies": {
    "vitest": "5.0.1"
  }
}
```

Create `packages/config/src/vitest/unit.ts`:

```ts
import type { UserConfig } from "vitest/config";

/** The shared unit-test preset. Every package merges it in its own vitest.config.ts. */
export const unitTestPreset: UserConfig = {
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.stories.*", "e2e/**"],
    restoreMocks: true,
    passWithNoTests: false,
  },
};
```

Create `packages/config/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

import { unitTestPreset } from "./src/vitest/unit.ts";

export default defineConfig(unitTestPreset);
```

Create `packages/config/README.md`:

```markdown
# packages/config

The shared development configuration for every package in this repository.

## What belongs here

The shared TypeScript settings, the Oxlint configuration and its vendored rules, the oxfmt settings, the Tailwind preset, the unit-test preset, and the reserved Storybook configuration extension point. Each preset exists once. Another package extends a preset and never restates a rule.

## What must not go here

Product code, business logic, React components, design tokens, and database access. Design tokens belong to `packages/ui`.

## What it imports

No internal project. This package imports its tool packages only. A package configuration file consumes these presets. Product runtime source must not import this package.
```

- [ ] **Step 5: Install and run the test to confirm that it passes**

Run: `pnpm install`
Run: `pnpm --filter @genie/config exec vitest run`
Expected: two tests pass. The collection is not empty.

- [ ] **Step 6: Confirm that Nx sees the project and caches its test target**

Run: `pnpm exec nx show projects`
Expected: the output names `@genie/config`.
Run: `pnpm test`
Run: `pnpm test`
Expected: the second run reports the result read from the cache.

- [ ] **Step 7: Confirm that no remote cache is configured**

Run: `pnpm exec nx show projects --json`
Expected: the command completes without asking to connect to a cache provider. Confirm that no `nxCloudAccessToken` and no `nxCloudId` key exists in `nx.json`. If `neverConnectToCloud` is rejected by this Nx version, remove the key, record the exact error in the bead, and rely on the absent token instead.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json .gitignore packages/config
git commit -m "build: add pnpm and nx workspace with a shared unit-test preset"
```

---

### Task 2: Shared TypeScript preset and the typecheck target

**Files:**
- Create: `tsconfig.base.json`, `packages/config/src/typescript/base.json`, `packages/config/tsconfig.json`
- Modify: `packages/config/package.json`
- Test: `packages/config/src/typescript/base.test.ts`

**Interfaces:**
- Consumes: the `@genie/config` package from Task 1.
- Produces: `@genie/config/typescript/base` as an extendable `tsconfig`. Every package gains a `typecheck` script that runs `tsc --noEmit`.

- [ ] **Step 1: Write the failing test**

Create `packages/config/src/typescript/base.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = JSON.parse(readFileSync(new URL("./base.json", import.meta.url), "utf8")) as {
  compilerOptions: Record<string, unknown>;
};

describe("the shared TypeScript preset", () => {
  it("turns strict mode on", () => {
    expect(base.compilerOptions.strict).toBe(true);
  });

  it("rejects unchecked index access, which hides an undefined value behind a typed read", () => {
    expect(base.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it("emits nothing, because every package typechecks and does not build through tsc", () => {
    expect(base.compilerOptions.noEmit).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `pnpm --filter @genie/config exec vitest run src/typescript`
Expected: the run fails because `base.json` does not exist.

- [ ] **Step 3: Write the preset**

Create `packages/config/src/typescript/base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

Create `tsconfig.base.json` at the repository root so that every package extends one stable path:

```json
{
  "extends": "./packages/config/src/typescript/base.json"
}
```

Create `packages/config/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Add the typecheck script and the export**

In `packages/config/package.json`, add `"./typescript/base": "./src/typescript/base.json"` to `exports` and `"typecheck": "tsc --noEmit"` to `scripts`.

- [ ] **Step 5: Run the test and the typecheck to confirm that both pass**

Run: `pnpm --filter @genie/config exec vitest run src/typescript`
Expected: three tests pass.
Run: `pnpm typecheck`
Expected: the run passes with no error.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json packages/config
git commit -m "build(config): add the shared strict typescript preset"
```

---

### Task 3: Project skeletons, classification tags, and the folder hygiene check

**Files:**
- Create: `apps/genie/package.json`, `apps/genie/README.md`, `apps/genie/tsconfig.json`
- Create: `packages/core/package.json`, `packages/core/README.md`, `packages/core/tsconfig.json`
- Create: `packages/core/src/lib/tenant-config/index.ts`, `packages/core/src/lib/tenant-config/README.md`
- Create: `packages/ui/package.json`, `packages/ui/README.md`, `packages/ui/tsconfig.json`
- Create: `packages/modules/README.md`
- Create: `tools/generators/package.json`, `tools/generators/README.md`, `tools/generators/tsconfig.json`, `tools/generators/vitest.config.ts`
- Create: `tools/generators/src/workspace/classify-project.ts`
- Test: `tools/generators/src/workspace/classify-project.test.ts`, `tools/generators/src/workspace/hygiene.test.ts`

**Interfaces:**
- Consumes: `@genie/config/typescript/base` and `@genie/config/vitest/unit`.
- Produces: `classifyProject(projectRoot: string): ArchitecturalTag` where `ArchitecturalTag` is the union `"app" | "core" | "ui" | "module" | "config" | "tooling"`. Task 9 reuses it.

- [ ] **Step 1: Write the failing classification test**

Create `tools/generators/src/workspace/classify-project.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyProject } from "./classify-project.ts";

describe("classifyProject", () => {
  it.each([
    ["apps/genie", "app"],
    ["apps/storybook", "app"],
    ["customers/acme/app", "app"],
    ["packages/core", "core"],
    ["packages/ui", "ui"],
    ["packages/modules/placeholder", "module"],
    ["packages/config", "config"],
    ["tools/generators", "tooling"],
  ])("classifies %s as %s", (root, expected) => {
    expect(classifyProject(root)).toBe(expected);
  });

  it("refuses a root it does not recognise, so a new folder cannot enter the graph untagged", () => {
    expect(() => classifyProject("packages/mystery")).toThrow(/no architectural classification/i);
  });

  it("treats packages/modules itself as unclassified, because it holds no code", () => {
    expect(() => classifyProject("packages/modules")).toThrow(/no architectural classification/i);
  });
});
```

- [ ] **Step 2: Create the package first, then run the test and confirm that it fails**

Do Step 3 before this step. `pnpm --filter` exits 0 when it matches no package, so running the test while `@genie/generators` does not exist reports success and proves nothing. Create the package, run `pnpm install`, then come back here.

Run: `pnpm --filter @genie/generators exec vitest run src/workspace/classify-project.test.ts`
Expected: the run fails with `Cannot find module './classify-project.ts'`. Confirm that the output names the failing test file. A run that reports no test files is a different failure and does not count.

- [ ] **Step 3: Create the tooling package**

Create `tools/generators/package.json`:

```json
{
  "name": "@genie/generators",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "nx": {
    "tags": ["tooling"]
  },
  "devDependencies": {
    "@genie/config": "workspace:*",
    "vitest": "5.0.1"
  }
}
```

Create `tools/generators/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

import { unitTestPreset } from "@genie/config/vitest/unit";

export default defineConfig(unitTestPreset);
```

Create `tools/generators/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write the classifier**

Create `tools/generators/src/workspace/classify-project.ts`:

```ts
/** The one architectural classification every project carries (Spec 0 R-4). */
export type ArchitecturalTag = "app" | "core" | "ui" | "module" | "config" | "tooling";

const EXACT_ROOTS = new Map<string, ArchitecturalTag>([
  ["packages/core", "core"],
  ["packages/ui", "ui"],
  ["packages/config", "config"],
  ["tools/generators", "tooling"],
]);

const PATTERNS: readonly (readonly [RegExp, ArchitecturalTag])[] = [
  [/^apps\/[^/]+$/, "app"],
  [/^customers\/[^/]+\/app$/, "app"],
  [/^packages\/modules\/[^/]+$/, "module"],
];

/**
 * Maps a repository-relative project root to its one architectural classification.
 * Throws when the root matches no rule, so an untagged folder cannot enter the graph.
 */
export function classifyProject(projectRoot: string): ArchitecturalTag {
  const root = projectRoot.replace(/\/+$/, "");

  const exact = EXACT_ROOTS.get(root);
  if (exact !== undefined) {
    return exact;
  }

  for (const [pattern, tag] of PATTERNS) {
    if (pattern.test(root)) {
      return tag;
    }
  }

  throw new Error(`"${root}" has no architectural classification. Add one rule in classify-project.ts.`);
}
```

- [ ] **Step 5: Run the classification test and confirm that it passes**

Run: `pnpm --filter @genie/generators exec vitest run src/workspace/classify-project.test.ts`
Expected: ten assertions pass.

- [ ] **Step 6: Write the failing hygiene test**

Create `tools/generators/src/workspace/hygiene.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyProject } from "./classify-project.ts";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../..");

type NxProject = { readonly root: string; readonly tags?: readonly string[] };

function readProjectGraph(): Record<string, NxProject> {
  const raw = execFileSync("pnpm", ["exec", "nx", "show", "projects", "--json", "--verbose"], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
  });
  const names = JSON.parse(raw) as readonly string[];

  const projects: Record<string, NxProject> = {};
  for (const name of names) {
    const detail = execFileSync("pnpm", ["exec", "nx", "show", "project", name, "--json"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });
    projects[name] = JSON.parse(detail) as NxProject;
  }
  return projects;
}

const projects = readProjectGraph();

describe("repository hygiene", () => {
  it("finds every workspace project", () => {
    expect(Object.keys(projects).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(projects))("%s carries exactly its derived classification tag", (_name, project) => {
    const expected = classifyProject(project.root);
    const classifications = (project.tags ?? []).filter((tag) =>
      ["app", "core", "ui", "module", "config", "tooling"].includes(tag),
    );
    expect(classifications).toEqual([expected]);
  });

  it.each(Object.entries(projects))("%s holds a README.md that says what it imports", (_name, project) => {
    const readme = join(WORKSPACE_ROOT, project.root, "README.md");
    expect(existsSync(readme)).toBe(true);
    expect(readFileSync(readme, "utf8")).toMatch(/what it imports/i);
  });
});
```

- [ ] **Step 7: Create the manifests first, then run the hygiene test and confirm that it fails**

Do the `package.json` part of Step 8 before this step. The hygiene test builds its cases from the live Nx project graph, so a package that does not exist yet is simply absent from the graph and generates no case to fail. Running the test now would pass while asserting nothing about the missing packages.

Create the three package manifests, run `pnpm install`, then come back here and run the test before writing the three `README.md` files.

Run: `pnpm --filter @genie/generators exec vitest run src/workspace/hygiene.test.ts`
Expected: the three README cases fail because the files do not exist yet, and the tag cases pass. Record the exact counts. Then write the READMEs in Step 8 and watch the same three cases turn green.

- [ ] **Step 8: Create the three remaining skeletons**

Create `packages/ui/package.json`:

```json
{
  "name": "@genie/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "nx": { "tags": ["ui"] },
  "devDependencies": { "@genie/config": "workspace:*", "vitest": "5.0.1" }
}
```

Create `packages/core/package.json`:

```json
{
  "name": "@genie/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tenant-config": "./src/lib/tenant-config/index.ts"
  },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "nx": { "tags": ["core"] },
  "dependencies": { "@genie/ui": "workspace:*" },
  "devDependencies": { "@genie/config": "workspace:*", "vitest": "5.0.1" }
}
```

Create `apps/genie/package.json`:

```json
{
  "name": "@genie/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "nx": { "tags": ["app"] },
  "dependencies": { "@genie/core": "workspace:*", "@genie/ui": "workspace:*" },
  "devDependencies": { "@genie/config": "workspace:*", "vitest": "5.0.1" }
}
```

Give `packages/core`, `packages/ui`, and `apps/genie` each a `tsconfig.json` and a `vitest.config.ts`. All three sit two folders deep, so each file is byte-identical to the `tools/generators` pair written in Step 3:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "vitest.config.ts"]
}
```

```ts
import { defineConfig } from "vitest/config";

import { unitTestPreset } from "@genie/config/vitest/unit";

export default defineConfig(unitTestPreset);
```

Each package needs one source file so that the typecheck target has something to read. Create `packages/ui/src/index.ts`, `packages/core/src/index.ts`, and `apps/genie/src/index.ts`, each holding:

```ts
export {};
```

The shared unit preset sets `passWithNoTests: false`, so a package with no test file fails its `test` target. Give each of the three packages one real test that proves its own entrypoint loads. Create `packages/ui/src/index.test.ts`, `packages/core/src/index.test.ts`, and `apps/genie/src/index.test.ts`, each holding:

```ts
import { describe, expect, it } from "vitest";

describe("the package entrypoint", () => {
  it("loads without a side effect", async () => {
    await expect(import("./index.ts")).resolves.toBeDefined();
  });
});
```

Create `packages/modules/README.md`:

```markdown
# packages/modules

One folder per capability module.

## What belongs here

A capability module, named by what it does and never by the customer who asked for it. Generate a module with `nx g @genie/module:new <capability>`.

## What must not go here

A customer folder, a deployment configuration file, core code, or shared user-interface primitives. A module never imports another module.

## What it imports

Nothing. This folder holds no code of its own.
```

Write the three package `README.md` files. Each says what the folder is for, what belongs in it, what must not go in it, and what it imports. Copy the import direction from [the repository layout](../../../architecture/repository-layout.md): `packages/ui` imports no internal project, `packages/core` imports `packages/ui`, `apps/genie` imports every layer.

- [ ] **Step 8a: Reserve the build-safe tenant-configuration entrypoint for S0-03**

R-31 and R-7a require one build-safe location that `tools/generators` may import for the `tenant.yaml` and `branding.seed.json` schemas. S0-01 provides the location and its export path only. S0-03 writes the schemas. Never copy a schema into tooling.

Create `packages/core/src/lib/tenant-config/index.ts`:

```ts
/**
 * The build-safe tenant-configuration schema entrypoint.
 *
 * S0-01 reserves this location and its package export path `@genie/core/tenant-config`.
 * S0-03 adds the strict zod schemas for tenant.yaml and branding.seed.json here.
 *
 * Importing this file must stay safe at build time. It must never read a deployment
 * environment value, open a connection, or start a service (R-19a). It is the one
 * place tooling may import from core (R-7a), so nothing else belongs in it.
 */
export {};
```

Create `packages/core/src/lib/tenant-config/README.md`:

```markdown
# packages/core/src/lib/tenant-config

The strict schemas for a customer's `tenant.yaml` and `branding.seed.json`.

## What belongs here

The zod schemas, their inferred types, and the JSON Schema emission that `deploy/schemas/` is built from. A schema rejects an unknown key, so a value written in the wrong file fails the generator.

## What must not go here

A deployment environment read, a database connection, a service, a secret, and a hosting mode. Importing this folder must stay safe during a build.

## What it imports

`zod` only. This is the one core folder that `tools/generators` may import, so it must never pull in the core runtime.
```

Add `"zod": "4.x"` only when S0-03 needs it. S0-01 adds no dependency here.

- [ ] **Step 9: Run the full test suite and confirm that it passes**

Run: `pnpm install`
Run: `pnpm test`
Expected: every project's tests pass. The hygiene test reports one case per project and none is skipped.

- [ ] **Step 10: Commit**

```bash
git add apps packages tools pnpm-lock.yaml
git commit -m "build: add project skeletons with architectural tags and a hygiene check"
```

---

### Task 4: Oxlint base configuration, oxfmt, and the staged-file hook

**Files:**
- Create: `oxlint.config.ts`, `oxfmt.config.ts`, `packages/config/src/oxlint/index.ts`, `packages/config/src/oxfmt/index.ts`, `lefthook.yml`
- Modify: `packages/config/package.json`, every package `package.json` to add a `lint` script
- Test: `packages/config/src/oxlint/index.test.ts`

**Interfaces:**
- Consumes: the config package from Task 1.
- Produces: `sharedOxlintConfig` in `packages/config/src/oxlint/index.ts` and `sharedOxfmtConfig` in `packages/config/src/oxfmt/index.ts`. The two root entry files import them by relative path, and tasks 5 and 6 edit them in place, so neither needs a package export entry. Task 5 extends `sharedOxlintConfig.overrides`. Task 6 extends its `jsPlugins` and `rules`.

- [ ] **Step 1: Write the failing test**

Create `packages/config/src/oxlint/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sharedOxlintConfig } from "./index.ts";

describe("the shared Oxlint configuration", () => {
  it("ignores build output and the vendored plugin, which is not ours to lint", () => {
    expect(sharedOxlintConfig.ignorePatterns).toContain("**/dist/**");
    expect(sharedOxlintConfig.ignorePatterns).toContain("packages/config/oxlint/anti-slop/**");
  });

  it("treats a correctness problem as an error rather than a warning", () => {
    expect(sharedOxlintConfig.categories?.correctness).toBe("error");
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `pnpm --filter @genie/config exec vitest run src/oxlint`
Expected: the run fails because `./index.ts` does not exist.

- [ ] **Step 3: Write the shared configuration**

Create `packages/config/src/oxlint/index.ts`:

```ts
import type { Oxlintrc } from "oxlint";

/**
 * The one Oxlint configuration for this repository.
 * Task 5 adds the import-direction overrides. Task 6 adds the vendored rules.
 */
export const sharedOxlintConfig: Oxlintrc = {
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.nx/**",
    "**/coverage/**",
    "apps/genie/src/modules.ts",
    "packages/config/oxlint/anti-slop/**",
  ],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
  },
  rules: {
    "oxc/no-accumulating-spread": "error",
  },
};
```

If the `Oxlintrc` type is not exported by `oxlint` 1.83.0, import `defineConfig` from `oxlint` instead and drop the type annotation. Record which form the installed version supports.

Create `oxlint.config.ts` at the repository root:

```ts
import { defineConfig } from "oxlint";

import { sharedOxlintConfig } from "./packages/config/src/oxlint/index.ts";

export default defineConfig(sharedOxlintConfig);
```

- [ ] **Step 4: Write the formatter settings**

The option names below come from the [oxfmt configuration reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html). They are Prettier's names, not invented ones.

Every style rule this repository states is already an oxfmt default, so the configuration sets none of them. Confirm each default rather than restating it: `tabWidth` is 2, `semi` is true, `singleQuote` is false, which means double quotes, `trailingComma` is `"all"`, `printWidth` is 100, `endOfLine` is `"lf"`, and `insertFinalNewline` is true. Writing a default back into the file adds a line that can drift from the tool without changing behavior.

R-5 puts the formatter configuration in `packages/config`, so the root file is a thin entry that re-exports it, exactly as `oxlint.config.ts` does.

Create `packages/config/src/oxfmt/index.ts`:

```ts
import type { Config } from "oxfmt";

/**
 * The one formatter configuration for this repository.
 *
 * It sets no style option. Every rule this repository states is already an oxfmt
 * default: 2 spaces, semicolons, double quotes, trailing commas, print width 100.
 * See https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html
 */
export const sharedOxfmtConfig: Config = {
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.nx/**",
    "**/coverage/**",
    "pnpm-lock.yaml",
    // Generated from MODULE_INCLUDE. The generator owns its shape (ADR 0008).
    "apps/genie/src/modules.ts",
    // Vendored upstream source. Reformatting it would corrupt the three-way merge
    // that an anti-slop update depends on (R-5a).
    "packages/config/oxlint/anti-slop/**",
    // Approved planning documents. Reformatting every table in docs/ would bury this
    // ticket's real diff. Reopen by deleting this line once the code tree is stable.
    "docs/**",
  ],
  // Built in, so it replaces an import-sorting lint plugin at no cost.
  sortImports: true,
};
```

If `oxfmt` 0.68.0 exports no `Config` type, drop the annotation and use `defineConfig` at the root only. Record which form the installed version supports.

Create `oxfmt.config.ts` at the repository root:

```ts
import { defineConfig } from "oxfmt";

import { sharedOxfmtConfig } from "./packages/config/src/oxfmt/index.ts";

export default defineConfig(sharedOxfmtConfig);
```

Do not create a `.oxfmtrc.json`. oxfmt allows one configuration file per directory, and a JSON file cannot sit beside `oxfmt.config.ts`.

Two settings stay off on purpose. `sortTailwindcss` waits until a component with classes exists, which is S0-02 and later. `jsdoc` reformatting is not adopted, because it rewrites comment text and nothing asks for that.

- [ ] **Step 5: Add the lint script to every package**

Add `"lint": "oxlint --config ../../oxlint.config.ts src"` to each package `package.json`, correcting the relative depth per package. Add `oxlint` at `1.83.0` to each package's `devDependencies`.

- [ ] **Step 6: Write the staged-file hook**

Create `lefthook.yml`:

```yaml
pre-commit:
  parallel: false
  jobs:
    - name: format
      glob: "*.{ts,tsx,js,jsx,mjs,cjs,json}"
      run: pnpm exec oxfmt {staged_files}
      stage_fixed: true
    - name: lint
      glob: "*.{ts,tsx,js,jsx,mjs,cjs}"
      run: pnpm exec oxlint --config oxlint.config.ts {staged_files}
```

Add `"lefthook": "2.1.14"` to the root `devDependencies` and `"prepare": "lefthook install"` to the root `scripts`. Run `pnpm exec lefthook validate` and correct the file if lefthook 2 rejects the `jobs` key. Record the correction.

- [ ] **Step 7: Prove the formatter converges**

Run: `pnpm exec oxfmt --help`
Expected: the flag list confirms `--check` and `--disable-nested-config`. Correct the scripts if a flag name differs, and record the correction.

Run: `pnpm format`
Run: `git diff --stat`
Expected: the diff touches code files only. No file under `docs/` changed.
Run: `pnpm format:check`
Expected: the check passes and reports no file to change.
Run: `pnpm format`
Run: `git diff --stat`
Expected: the diff is unchanged from the first run. A second format run changes nothing.

Note that `sortPackageJson` is on by default, so the first run reorders keys in every `package.json`. That is expected. Confirm that no script, dependency, or version value changed, only key order.

- [ ] **Step 8: Prove the hook runs on a staged file**

Create a scratch file `packages/config/src/scratch-hook-check.ts` holding badly spaced code such as `export const a   =    1`. Stage it and commit.

Run: `git add packages/config/src/scratch-hook-check.ts`
Run: `git commit -m "test: prove the staged-file hook runs"`
Expected: lefthook runs the format job, rewrites the file, and stages the fix.
Run: `git show --stat HEAD`
Expected: the committed file is formatted.
Then remove the scratch file and amend the commit away with `git reset --hard HEAD~1`.

- [ ] **Step 9: Run the full gate and commit**

Run: `pnpm lint`
Run: `pnpm test`
Expected: both pass.

```bash
git add oxlint.config.ts oxfmt.config.ts lefthook.yml package.json packages apps tools pnpm-lock.yaml
git commit -m "build: add the shared oxlint and oxfmt configuration with staged hooks"
```

---

### Task 5: Import-boundary enforcement with positive and negative fixtures

**Files:**
- Create: `packages/config/src/oxlint/boundaries.ts`
- Create: `packages/config/src/oxlint/__testing__/lint-at.ts`
- Modify: `packages/config/src/oxlint/index.ts`
- Test: `packages/config/src/oxlint/boundaries.test.ts`

**Interfaces:**
- Consumes: `sharedOxlintConfig` from Task 4.
- Produces: `importBoundaryOverrides`, an array of Oxlint `overrides` entries, merged into `sharedOxlintConfig.overrides`.

- [ ] **Step 1: Write the failing test**

The test writes a temporary file at a path that matches a layer glob, runs the real `oxlint` binary over it, and asserts the outcome. This proves the rules through the shipped tool rather than through a copy of its logic. Task 6 reuses the same helper, so it lives in its own file from the start.

Create `packages/config/src/oxlint/__testing__/lint-at.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

export type LintOutcome = { readonly failed: boolean; readonly output: string };

/**
 * Lints one source string at a chosen repository-relative path, then removes the file
 * and any directory it had to create. The path decides which layer override applies,
 * so a caller picks the path on purpose.
 */
export function lintAt(relativePath: string, source: string): LintOutcome {
  const absolute = join(WORKSPACE_ROOT, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, source, "utf8");
  try {
    const output = execFileSync(
      "pnpm",
      ["exec", "oxlint", "--config", "oxlint.config.ts", relativePath],
      { cwd: WORKSPACE_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { failed: false, output };
  } catch (error) {
    const shaped = error as { stdout?: string; stderr?: string };
    return { failed: true, output: `${shaped.stdout ?? ""}${shaped.stderr ?? ""}` };
  } finally {
    rmSync(absolute, { force: true });
  }
}
```

Confirm that `WORKSPACE_ROOT` resolves to the repository root. The file sits five folders deep at `packages/config/src/oxlint/__testing__/`, so the relative walk is `../../../../..`. Add one assertion in the test that `existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))` is true, and correct the depth if it is not.

Create `packages/config/src/oxlint/boundaries.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, lintAt } from "./__testing__/lint-at.ts";

describe("the import direction, proved through the oxlint binary", () => {
  it("runs against the real repository root", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("stops packages/ui from importing core", () => {
    const result = lintAt("packages/ui/src/__boundary__.ts", `import "@genie/core";\n`);
    expect(result.failed).toBe(true);
    expect(result.output).toMatch(/no-restricted-imports/);
  });

  it("stops packages/ui from reaching core through a package subpath", () => {
    const result = lintAt("packages/ui/src/__boundary__.ts", `import "@genie/core/services/mailer";\n`);
    expect(result.failed).toBe(true);
  });

  it("stops packages/ui from reaching core through a relative spelling", () => {
    const result = lintAt("packages/ui/src/__boundary__.ts", `import "../../core/src/index.ts";\n`);
    expect(result.failed).toBe(true);
  });

  it("allows packages/core to import ui, which is the declared direction", () => {
    const result = lintAt("packages/core/src/__boundary__.ts", `import "@genie/ui";\n`);
    expect(result.failed).toBe(false);
  });

  it("stops one module from importing another module", () => {
    const result = lintAt(
      "packages/modules/alpha/src/__boundary__.ts",
      `import "@genie/modules/beta";\n`,
    );
    expect(result.failed).toBe(true);
  });

  it("stops a module from importing the application", () => {
    const result = lintAt("packages/modules/alpha/src/__boundary__.ts", `import "apps/genie/src/context.ts";\n`);
    expect(result.failed).toBe(true);
  });

  it("stops the database driver outside core", () => {
    const result = lintAt("packages/modules/alpha/src/__boundary__.ts", `import "pg";\n`);
    expect(result.failed).toBe(true);
  });

  it("stops the drizzle node-postgres binding outside core", () => {
    const result = lintAt("packages/ui/src/__boundary__.ts", `import "drizzle-orm/node-postgres";\n`);
    expect(result.failed).toBe(true);
  });

  it("allows core to import the database driver, because core owns the pool", () => {
    const result = lintAt("packages/core/src/__boundary__.ts", `import "pg";\n`);
    expect(result.failed).toBe(false);
  });

  it("stops packages/config from importing any internal project", () => {
    const result = lintAt("packages/config/src/__boundary__.ts", `import "@genie/ui";\n`);
    expect(result.failed).toBe(true);
  });

  it("stops tools/generators from importing a module implementation", () => {
    const result = lintAt("tools/generators/src/__boundary__.ts", `import "@genie/modules/alpha";\n`);
    expect(result.failed).toBe(true);
  });

  it("stops tools/generators from importing the core runtime entrypoint", () => {
    const result = lintAt("tools/generators/src/__boundary__.ts", `import "@genie/core";\n`);
    expect(result.failed).toBe(true);
  });

  it("allows tools/generators to import the build-safe core tenant-config schemas", () => {
    const result = lintAt("tools/generators/src/__boundary__.ts", `import "@genie/core/tenant-config";\n`);
    expect(result.failed).toBe(false);
  });

  it("stops tools/generators from importing a database driver", () => {
    const result = lintAt("tools/generators/src/__boundary__.ts", `import "pg";\n`);
    expect(result.failed).toBe(true);
  });

  it("applies the rules to a test file as well as to source", () => {
    const result = lintAt("packages/ui/src/__boundary__.test.ts", `import "@genie/core";\n`);
    expect(result.failed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails**

Run: `pnpm --filter @genie/config exec vitest run src/oxlint/boundaries.test.ts`
Expected: the banned cases pass lint today, so those assertions fail.

- [ ] **Step 3: Write the boundary overrides**

Create `packages/config/src/oxlint/boundaries.ts`:

```ts
type RestrictedGroup = { readonly group: readonly string[]; readonly message: string };

function restrict(files: readonly string[], patterns: readonly RestrictedGroup[]) {
  return {
    files: [...files],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...patterns] }],
    },
  };
}

const CORE = ["@genie/core", "@genie/core/**", "**/packages/core/**"];
const MODULES = ["@genie/modules/*", "@genie/modules/**", "**/packages/modules/**"];
const APPS = ["apps/*", "apps/**", "**/apps/genie/**", "**/apps/storybook/**"];
const CUSTOMERS = ["customers/*", "customers/**", "**/customers/**"];
const DRIVERS = ["pg", "pg/**", "drizzle-orm/node-postgres", "**/packages/core/src/services/database/**"];
const INTERNAL = [...CORE, ...MODULES, ...APPS, ...CUSTOMERS, "@genie/ui", "@genie/ui/**", "**/packages/ui/**"];

/**
 * The import direction (Spec 0 R-7 and R-7a), one entry per layer, keyed by file glob.
 * Each group lists the package spelling, its subpaths, and the relative spelling that
 * reaches the same folder, so a deep relative path cannot walk around the rule.
 */
export const importBoundaryOverrides = [
  restrict(
    ["packages/ui/**"],
    [
      { group: CORE, message: "ui imports nothing internal. Move the shared piece into ui." },
      { group: MODULES, message: "ui imports nothing internal." },
      { group: APPS, message: "ui imports nothing internal." },
    ],
  ),
  restrict(
    ["packages/core/**"],
    [
      { group: MODULES, message: "core never imports a module. Extend the module contract instead." },
      { group: APPS, message: "core never imports an app. A capability that needs one is a defect in core." },
      { group: CUSTOMERS, message: "core never imports a customer folder." },
    ],
  ),
  restrict(
    ["packages/core/contracts/**"],
    [{ group: ["*", "!zod", "!zod/**"], message: "contracts import only zod and types (DEC-42)." }],
  ),
  restrict(
    ["packages/modules/*/**"],
    [
      { group: MODULES, message: "a module never imports another module." },
      { group: APPS, message: "a module never imports an app." },
      { group: CUSTOMERS, message: "a module never imports a customer folder." },
      { group: DRIVERS, message: "read the database through ctx.tenant.db (DEC-34)." },
    ],
  ),
  restrict(
    ["packages/ui/**", "packages/modules/**", "apps/**", "customers/**", "tools/**", "packages/config/**"],
    [{ group: DRIVERS, message: "only core opens a connection (DEC-34)." }],
  ),
  restrict(
    ["packages/config/**"],
    [{ group: INTERNAL, message: "config imports no internal project (R-7a)." }],
  ),
  restrict(
    ["tools/**"],
    [
      { group: MODULES, message: "tooling reads module metadata as data. It never imports a module." },
      { group: APPS, message: "tooling never imports an app." },
      {
        group: ["@genie/core", "@genie/core/index", "**/packages/core/src/index.ts"],
        message: "tooling uses the build-safe core schema entrypoints only, never the runtime entrypoint (R-7a).",
      },
    ],
  ),
];
```

The `packages/core/contracts/**` entry uses a deny-all group with negations. Confirm that Oxlint 1.83.0 supports the `!` negation form in a `no-restricted-imports` group. If it does not, replace that entry with an explicit list of the banned scopes and record the substitution with the exact error.

- [ ] **Step 4: Merge the overrides into the shared configuration**

`sharedOxlintConfig` already carries an `overrides` array. Task 4 put one entry in it, which switches off the empty-module rule for the four reserved package entrypoints. Assigning `overrides: importBoundaryOverrides` would delete that entry and break the lint.

In `packages/config/src/oxlint/index.ts`, import `importBoundaryOverrides` and spread both arrays, keeping the existing entry first:

```ts
overrides: [...reservedEntrypointOverrides, ...importBoundaryOverrides],
```

If Task 4 wrote its entry inline rather than as a named constant, lift it to a named constant in the same file first, keeping its comment, then spread. Confirm after the change that the four reserved entrypoints still lint clean.

- [ ] **Step 5: Run the test and confirm that it passes**

Run: `pnpm --filter @genie/config exec vitest run src/oxlint/boundaries.test.ts`
Expected: all fifteen cases pass. Every banned case fails lint. Every allowed case passes lint.

- [ ] **Step 6: Confirm the real tree still lints clean**

Run: `pnpm lint`
Expected: the run passes. No real file breaks a boundary.

- [ ] **Step 7: Commit**

```bash
git add packages/config/src/oxlint
git commit -m "build(config): enforce the import direction with tested oxlint boundaries"
```

---

### Task 6: Vendor anti-slop with provenance and prove the rules run

**Files:**
- Create: `packages/config/oxlint/anti-slop/` (copied source), `packages/config/oxlint/anti-slop/LICENSE`, `packages/config/oxlint/anti-slop/PROVENANCE.md`
- Modify: `packages/config/src/oxlint/index.ts`, root `package.json`
- Test: `packages/config/src/oxlint/anti-slop.test.ts`

**Interfaces:**
- Consumes: `sharedOxlintConfig` from Task 4 and the `lintAt` helper shape from Task 5.
- Produces: the `anti-slop/*` rule namespace inside the shared configuration.

- [ ] **Step 1: Copy the upstream source at a fixed revision**

Upstream revision `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`, dated 2026-09-10, licence MIT.

```bash
mkdir -p packages/config/oxlint
curl -sL https://codeload.github.com/dmmulroy/anti-slop/tar.gz/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b -o /tmp/anti-slop.tar.gz
mkdir -p /tmp/anti-slop && tar -xzf /tmp/anti-slop.tar.gz -C /tmp/anti-slop --strip-components=1
cp -rf /tmp/anti-slop/src packages/config/oxlint/anti-slop
cp -f /tmp/anti-slop/LICENSE packages/config/oxlint/anti-slop/LICENSE
rm -rf /tmp/anti-slop /tmp/anti-slop.tar.gz
```

Delete every `*.test.ts` file under `packages/config/oxlint/anti-slop/`. The upstream tests run under `tsx`, which this repository does not carry, and the vendored rules are proved by the fixtures in Step 5 instead.

- [ ] **Step 2: Write the provenance record**

Create `packages/config/oxlint/anti-slop/PROVENANCE.md`:

```markdown
# anti-slop provenance

Vendored source. Upstream distributes no npm package, so the rules are copied here on purpose.

| Field | Value |
| --- | --- |
| Upstream | https://github.com/dmmulroy/anti-slop |
| Revision | `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` |
| Revision date | 2026-09-10 |
| Licence | MIT. The full text is in `LICENSE`. |
| Copied on | <fill in the date of the copy> |
| Copied paths | `src/` from the upstream root, minus every `*.test.ts` file |

## Local modifications

- Removed every `*.test.ts` file. The upstream tests need `tsx`, which this repository does not carry. The rules are proved by the fixtures in `packages/config/src/oxlint/anti-slop.test.ts`.
- <record any further change here, one line each, with the reason>

## Enabled rules

Every generic rule is on at `error`. The list is in `packages/config/src/oxlint/index.ts`.

## Rules that stay off

The five Effect rules stay off. This repository does not adopt Effect, and adoption needs separate approval (Spec 0 R-5a). The Effect entry point is not registered.

## Documented exceptions

| Rule | Path or case | Reason |
| --- | --- | --- |
| <fill in only when a real exception is needed> | | |

An exception must narrow to a legitimate boundary validation, a framework contract, or a test fixture. Never weaken a type or change behavior to satisfy a rule.

## Updating

An upstream update must keep the reviewed local policy. Stage incoming source separately and merge. Never replace this folder in one step.
```

- [ ] **Step 3: Pin the toolchain and register the plugin**

Add `"@oxlint/plugins": "1.83.0"` to the root `devDependencies`, beside the existing `"oxlint": "1.83.0"`. Both must hold the identical exact version.

In `packages/config/src/oxlint/index.ts`, add:

```ts
jsPlugins: [
  { name: "anti-slop", specifier: "./packages/config/oxlint/anti-slop/index.ts" },
],
```

and add every generic rule at `"error"`:

```ts
"anti-slop/no-array-filter-map": "error",
"anti-slop/no-reduce-accumulator-copy": "error",
"anti-slop/no-chained-type-assertions": "error",
"anti-slop/no-conditional-empty-object-spread": "error",
"anti-slop/no-known-value-widening": "error",
"anti-slop/no-module-mocking": "error",
"anti-slop/no-object-parameters": "error",
"anti-slop/no-reflect-apply": "error",
"anti-slop/no-reflect-get": "error",
"anti-slop/no-runtime-typeof": "error",
"anti-slop/no-shape-in-symbol-names": "error",
"anti-slop/no-unknown-parameters": "error",
"anti-slop/no-unknown-returns": "error",
"anti-slop/no-unknown-type-aliases": "error",
"anti-slop/no-unsafe-dictionary-type": "error",
"anti-slop/no-widen-then-assert": "error",
"anti-slop/require-readable-spacing": "error",
"anti-slop/require-safety-comment-for-type-assertion": "error",
```

Do not register the Effect entry point and do not enable any `anti-slop-effect/*` rule.

- [ ] **Step 4: Prove the plugin loads at the chosen pin**

Run: `pnpm install`
Run: `pnpm exec oxlint --config oxlint.config.ts packages/config/src`
Expected: the run completes and reports no unknown plugin and no unknown rule.

If Oxlint 1.83.0 refuses to load the plugin, set both `oxlint` and `@oxlint/plugins` to `1.78.0`, the pair the vendored revision was tested against, and repeat. Record the exact failing command, the exact error, and the chosen pair in `PROVENANCE.md` and on the bead. Do not mix the two versions.

- [ ] **Step 5: Write the failing rule test**

Create `packages/config/src/oxlint/anti-slop.test.ts`. It reuses the `lintAt` helper written in Task 5.

```ts
import { describe, expect, it } from "vitest";

import { sharedOxlintConfig } from "./index.ts";
import { lintAt } from "./__testing__/lint-at.ts";

describe("the vendored anti-slop rules run through the shared lint target", () => {
  it("rejects an adjacent filter and map pair", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.ts",
      `export const a = [1, 2].filter((n) => n > 1).map((n) => n + 1);\n`,
    );
    expect(result.failed).toBe(true);
    expect(result.output).toMatch(/no-array-filter-map/);
  });

  it("rejects a chained type assertion that fabricates evidence", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.ts",
      `export const a = ({} as unknown) as { id: string };\n`,
    );
    expect(result.failed).toBe(true);
    expect(result.output).toMatch(/no-chained-type-assertions/);
  });

  it("rejects module mocking, because this repository uses real seams", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.test.ts",
      `import { vi } from "vitest";\nvi.mock("node:fs");\n`,
    );
    expect(result.failed).toBe(true);
    expect(result.output).toMatch(/no-module-mocking/);
  });

  it("leaves ordinary code alone", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.ts",
      `export function add(left: number, right: number): number {\n  return left + right;\n}\n`,
    );
    expect(result.failed).toBe(false);
  });

  it("does not enable any Effect rule, because this repository has not adopted Effect", () => {
    const ruleNames = Object.keys(sharedOxlintConfig.rules ?? {});
    expect(ruleNames.filter((name) => name.startsWith("anti-slop-effect/"))).toEqual([]);
  });

  it("does not register the Effect plugin entry point", () => {
    const specifiers = (sharedOxlintConfig.jsPlugins ?? []).map((plugin) => plugin.specifier);
    expect(specifiers.some((specifier) => specifier.includes("effect"))).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test and confirm that it passes**

Run: `pnpm --filter @genie/config exec vitest run src/oxlint/anti-slop.test.ts`
Expected: five cases pass.

- [ ] **Step 7: Fix or justify every new failure in the real tree**

Run: `pnpm lint`
Expected: the run passes. If a rule flags real code, change the code. Add an exception only when the case is a legitimate boundary validation, a framework contract, or a test fixture, and record it in the `PROVENANCE.md` exception table with its reason.

- [ ] **Step 8: Confirm the formatter and the linter still converge**

Run: `pnpm format`
Run: `pnpm lint`
Run: `pnpm format:check`
Expected: all three pass and the working tree is unchanged after the last one.

- [ ] **Step 9: Commit**

```bash
git add packages/config package.json pnpm-lock.yaml
git commit -m "build(config): vendor the reviewed anti-slop rules with provenance"
```

---

### Task 7: The data-only module selection resolver

**Files:**
- Create: `tools/generators/src/selection/inventory.ts`, `resolve.ts`, `fingerprint.ts`, `modules-file.ts`, `index.ts`
- Create: `tools/generators/src/selection/__fixtures__/throwing-module/package.json`, `.../src/index.ts`
- Create: `tools/generators/src/selection/README.md`
- Test: `tools/generators/src/selection/resolve.test.ts`, `fingerprint.test.ts`, `inventory.test.ts`, `modules-file.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except the test preset and the boundary rules.
- Produces:
  - `type ModuleInventoryEntry = { readonly id: string; readonly packageName: string; readonly packageRoot: string; readonly entrypoint: string }`
  - `type SelectionSource = "unset" | "explicit"`
  - `type ModuleSelection = { readonly source: SelectionSource; readonly ids: readonly string[]; readonly entries: readonly ModuleInventoryEntry[] }`
  - `readModuleInventory(workspaceRoot: string): readonly ModuleInventoryEntry[]`
  - `resolveModuleSelection(input: { readonly moduleInclude: string | undefined; readonly inventory: readonly ModuleInventoryEntry[]; readonly workspaceRoot: string }): ModuleSelection`
  - `serializeSelection(selection: ModuleSelection): string`
  - `fingerprintSelection(selection: ModuleSelection): string`
  - `readModulesFile(path: string): string`

  S0-05 generates the registry from these. S0-02 and S0-10 use the same resolver for Storybook discovery.

- [ ] **Step 1: Write the failing resolver test**

Create `tools/generators/src/selection/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolveModuleSelection } from "./resolve.ts";
import type { ModuleInventoryEntry } from "./inventory.ts";

const WORKSPACE_ROOT = new URL("./__fixtures__/", import.meta.url).pathname;

const alpha: ModuleInventoryEntry = {
  id: "alpha",
  packageName: "@genie/modules-alpha",
  packageRoot: "throwing-module",
  entrypoint: "throwing-module/src/index.ts",
};
const beta: ModuleInventoryEntry = { ...alpha, id: "beta" };
const inventory = [alpha, beta] as const;

function resolve(moduleInclude: string | undefined) {
  return resolveModuleSelection({ moduleInclude, inventory, workspaceRoot: WORKSPACE_ROOT });
}

describe("resolveModuleSelection", () => {
  it("treats an unset value as every module, which is the development and CI default", () => {
    const selection = resolve(undefined);
    expect(selection.source).toBe("unset");
    expect(selection.ids).toEqual(["alpha", "beta"]);
  });

  it("treats an empty string as an explicit choice of no module", () => {
    const selection = resolve("");
    expect(selection.source).toBe("explicit");
    expect(selection.ids).toEqual([]);
  });

  it("keeps the supplied order, because that order also decides the registry order", () => {
    expect(resolve("beta,alpha").ids).toEqual(["beta", "alpha"]);
  });

  it("accepts spacing around an id", () => {
    expect(resolve(" beta , alpha ").ids).toEqual(["beta", "alpha"]);
  });

  it("rejects an unknown id rather than skipping it", () => {
    expect(() => resolve("alpha,gamma")).toThrow(/unknown module id: gamma/i);
  });

  it("rejects a duplicate id", () => {
    expect(() => resolve("alpha,alpha")).toThrow(/duplicate module id: alpha/i);
  });

  it("rejects an empty segment, which is a malformed list rather than an empty selection", () => {
    expect(() => resolve("alpha,,beta")).toThrow(/empty module id/i);
  });

  it("rejects a missing entrypoint file", () => {
    const broken = [{ ...alpha, entrypoint: "throwing-module/src/absent.ts" }] as const;
    expect(() =>
      resolveModuleSelection({ moduleInclude: "alpha", inventory: broken, workspaceRoot: WORKSPACE_ROOT }),
    ).toThrow(/entrypoint .* does not exist/i);
  });

  it("never evaluates a module, so a module that throws on import still resolves", () => {
    expect(() => resolve("alpha")).not.toThrow();
    expect(resolve("alpha").entries[0]?.entrypoint).toBe("throwing-module/src/index.ts");
  });
});
```

- [ ] **Step 2: Create the fixture that throws when it is evaluated**

Create `tools/generators/src/selection/__fixtures__/throwing-module/package.json`:

```json
{
  "name": "@genie/modules-alpha",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "genie": { "module": { "id": "alpha", "entrypoint": "src/index.ts" } }
}
```

Create `tools/generators/src/selection/__fixtures__/throwing-module/src/index.ts`:

```ts
throw new Error("This fixture must never be evaluated. The resolver reads data only.");
```

Add `tools/generators/src/selection/__fixtures__/**` to `ignorePatterns` in the shared Oxlint configuration and to `exclude` in `tools/generators/tsconfig.json`, so the fixture never breaks lint or typecheck.

- [ ] **Step 3: Run the test and confirm that it fails**

Run: `pnpm --filter @genie/generators exec vitest run src/selection/resolve.test.ts`
Expected: the run fails because `./resolve.ts` does not exist.

- [ ] **Step 4: Write the inventory reader**

Create `tools/generators/src/selection/inventory.ts`:

```ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** One module, described by data only. No declaration is ever imported. */
export type ModuleInventoryEntry = {
  readonly id: string;
  readonly packageName: string;
  /** Repository-relative folder of the module package. */
  readonly packageRoot: string;
  /** Repository-relative path to the module declaration file. A string, never an import. */
  readonly entrypoint: string;
};

type ModulePackageManifest = {
  readonly name?: string;
  readonly genie?: { readonly module?: { readonly id?: string; readonly entrypoint?: string } };
};

const MODULES_DIR = "packages/modules";

/**
 * Reads the data-only module inventory from package metadata under packages/modules.
 * Reads bytes and parses JSON. It never imports, evaluates, or resolves a module.
 */
export function readModuleInventory(workspaceRoot: string): readonly ModuleInventoryEntry[] {
  const modulesRoot = join(workspaceRoot, MODULES_DIR);
  if (!existsSync(modulesRoot)) {
    return [];
  }

  const entries: ModuleInventoryEntry[] = [];
  const folders = readdirSync(modulesRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();

  for (const folder of folders) {
    const manifestPath = join(modulesRoot, folder, "package.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ModulePackageManifest;
    const declared = manifest.genie?.module;
    if (declared?.id === undefined || declared.entrypoint === undefined) {
      throw new Error(`${MODULES_DIR}/${folder}/package.json has no genie.module id and entrypoint.`);
    }
    if (manifest.name === undefined) {
      throw new Error(`${MODULES_DIR}/${folder}/package.json has no name.`);
    }
    entries.push({
      id: declared.id,
      packageName: manifest.name,
      packageRoot: `${MODULES_DIR}/${folder}`,
      entrypoint: `${MODULES_DIR}/${folder}/${declared.entrypoint}`,
    });
  }

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate module id in the inventory: ${entry.id}`);
    }
    seen.add(entry.id);
  }

  return entries;
}
```

- [ ] **Step 5: Write the resolver**

Create `tools/generators/src/selection/resolve.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ModuleInventoryEntry } from "./inventory.ts";

/** Whether the caller supplied a selection at all. Unset and explicitly empty differ. */
export type SelectionSource = "unset" | "explicit";

export type ModuleSelection = {
  readonly source: SelectionSource;
  readonly ids: readonly string[];
  readonly entries: readonly ModuleInventoryEntry[];
};

export type ResolveInput = {
  /** The raw MODULE_INCLUDE value. undefined means unset. "" means explicitly empty. */
  readonly moduleInclude: string | undefined;
  readonly inventory: readonly ModuleInventoryEntry[];
  readonly workspaceRoot: string;
};

function parseIds(raw: string): readonly string[] {
  if (raw.trim() === "") {
    return [];
  }
  return raw.split(",").map((segment, index) => {
    const id = segment.trim();
    if (id === "") {
      throw new Error(`Empty module id at position ${index} in MODULE_INCLUDE: "${raw}"`);
    }
    return id;
  });
}

/**
 * Resolves an ordered module selection from a raw MODULE_INCLUDE value.
 * Reads the inventory as data. It never imports or evaluates a module entrypoint.
 */
export function resolveModuleSelection(input: ResolveInput): ModuleSelection {
  const byId = new Map(input.inventory.map((entry) => [entry.id, entry]));

  const source: SelectionSource = input.moduleInclude === undefined ? "unset" : "explicit";
  const ids = input.moduleInclude === undefined
    ? input.inventory.map((entry) => entry.id)
    : parseIds(input.moduleInclude);

  const seen = new Set<string>();
  const entries: ModuleInventoryEntry[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate module id: ${id}`);
    }
    seen.add(id);

    const entry = byId.get(id);
    if (entry === undefined) {
      throw new Error(
        `Unknown module id: ${id}. The inventory holds: ${[...byId.keys()].join(", ") || "nothing"}.`,
      );
    }

    const absolute = join(input.workspaceRoot, entry.entrypoint);
    if (!existsSync(absolute)) {
      throw new Error(`Module "${id}" entrypoint ${entry.entrypoint} does not exist.`);
    }

    entries.push(entry);
  }

  return { source, ids, entries };
}
```

The fixture test passes `packageRoot: "throwing-module"` and `entrypoint: "throwing-module/src/index.ts"` with `workspaceRoot` set to the fixtures folder, so `existsSync` finds the file without `readModuleInventory` being involved.

- [ ] **Step 6: Run the resolver test and confirm that it passes**

Run: `pnpm --filter @genie/generators exec vitest run src/selection/resolve.test.ts`
Expected: nine cases pass. No fixture throws.

- [ ] **Step 7: Write the failing fingerprint test**

Create `tools/generators/src/selection/fingerprint.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { fingerprintSelection, serializeSelection } from "./fingerprint.ts";
import type { ModuleSelection } from "./resolve.ts";

function selection(source: ModuleSelection["source"], ids: readonly string[]): ModuleSelection {
  return { source, ids, entries: [] };
}

describe("selection serialization and fingerprint", () => {
  it("produces the same value for the same input", () => {
    const a = serializeSelection(selection("explicit", ["alpha", "beta"]));
    const b = serializeSelection(selection("explicit", ["alpha", "beta"]));
    expect(a).toBe(b);
    expect(fingerprintSelection(selection("explicit", ["alpha", "beta"]))).toBe(
      fingerprintSelection(selection("explicit", ["alpha", "beta"])),
    );
  });

  it("keeps unset and explicit apart even when the effective list matches", () => {
    const unset = selection("unset", ["alpha", "beta"]);
    const explicit = selection("explicit", ["alpha", "beta"]);
    expect(serializeSelection(unset)).not.toBe(serializeSelection(explicit));
    expect(fingerprintSelection(unset)).not.toBe(fingerprintSelection(explicit));
  });

  it("changes when the order changes, because order decides the registry order", () => {
    expect(fingerprintSelection(selection("explicit", ["alpha", "beta"]))).not.toBe(
      fingerprintSelection(selection("explicit", ["beta", "alpha"])),
    );
  });

  it("changes between explicitly empty and one module", () => {
    expect(fingerprintSelection(selection("explicit", []))).not.toBe(
      fingerprintSelection(selection("explicit", ["alpha"])),
    );
  });

  it("produces a hexadecimal digest of a fixed length", () => {
    expect(fingerprintSelection(selection("explicit", ["alpha"]))).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 8: Run it, confirm that it fails, then write the fingerprint module**

Run: `pnpm --filter @genie/generators exec vitest run src/selection/fingerprint.test.ts`
Expected: the run fails because `./fingerprint.ts` does not exist.

Create `tools/generators/src/selection/fingerprint.ts`:

```ts
import { createHash } from "node:crypto";

import type { ModuleSelection } from "./resolve.ts";

/**
 * The canonical serialized selection. This value, not the digest, is the source of
 * selection truth, so an unset selection and an explicit one never collapse together.
 */
export function serializeSelection(selection: ModuleSelection): string {
  return JSON.stringify({ source: selection.source, ids: selection.ids });
}

/** A stable digest of the canonical value, for use as a declared cache input. */
export function fingerprintSelection(selection: ModuleSelection): string {
  return createHash("sha256").update(serializeSelection(selection), "utf8").digest("hex");
}
```

Run the test again. Expected: five cases pass.

- [ ] **Step 9: Write the modules.txt reader with its test**

Create `tools/generators/src/selection/modules-file.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readModulesFile } from "./modules-file.ts";

function fileHolding(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "genie-modules-")), "modules.txt");
  writeFileSync(path, contents, "utf8");
  return path;
}

describe("readModulesFile", () => {
  it("reads one id per line and keeps the file order", () => {
    expect(readModulesFile(fileHolding("beta\nalpha\n"))).toBe("beta,alpha");
  });

  it("ignores a blank line and trailing spacing", () => {
    expect(readModulesFile(fileHolding("  beta  \n\n alpha\n\n"))).toBe("beta,alpha");
  });

  it("returns an explicitly empty value for a file that lists no module", () => {
    expect(readModulesFile(fileHolding("\n  \n"))).toBe("");
  });

  it("fails on a missing file rather than falling back to every module", () => {
    expect(() => readModulesFile("/tmp/genie-absent/modules.txt")).toThrow(/does not exist/i);
  });
});
```

Create `tools/generators/src/selection/modules-file.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";

/**
 * Reads a customer modules.txt into a MODULE_INCLUDE value.
 * An existing file that lists no module returns "", which is an explicitly empty selection.
 * A missing file throws, so a typo can never widen the selection to every module.
 */
export function readModulesFile(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`The module include file ${path} does not exist.`);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(",");
}
```

Run: `pnpm --filter @genie/generators exec vitest run src/selection/modules-file.test.ts`
Expected: four cases pass.

- [ ] **Step 10: Write the inventory test and the barrel**

Create `tools/generators/src/selection/inventory.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readModuleInventory } from "./inventory.ts";

/** Builds a throwaway workspace holding one package.json per named module folder. */
function workspaceHolding(manifests: Readonly<Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), "genie-inventory-"));
  for (const [folder, manifest] of Object.entries(manifests)) {
    const dir = join(root, "packages/modules", folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest), "utf8");
  }
  return root;
}

function moduleManifest(id: string) {
  return {
    name: `@genie/modules-${id}`,
    genie: { module: { id, entrypoint: "src/index.ts" } },
  };
}

describe("readModuleInventory", () => {
  it("reads every module in sorted folder order, so the default list is stable", () => {
    const root = workspaceHolding({ beta: moduleManifest("beta"), alpha: moduleManifest("alpha") });
    const inventory = readModuleInventory(root);
    expect(inventory.map((entry) => entry.id)).toEqual(["alpha", "beta"]);
  });

  it("records the repository-relative entrypoint as a string and never loads it", () => {
    const root = workspaceHolding({ alpha: moduleManifest("alpha") });
    expect(readModuleInventory(root)[0]).toEqual({
      id: "alpha",
      packageName: "@genie/modules-alpha",
      packageRoot: "packages/modules/alpha",
      entrypoint: "packages/modules/alpha/src/index.ts",
    });
  });

  it("rejects a module package that declares no genie.module block", () => {
    const root = workspaceHolding({ alpha: { name: "@genie/modules-alpha" } });
    expect(() => readModuleInventory(root)).toThrow(/no genie.module id and entrypoint/i);
  });

  it("rejects a module package that declares no name", () => {
    const root = workspaceHolding({ alpha: { genie: { module: { id: "alpha", entrypoint: "src/index.ts" } } } });
    expect(() => readModuleInventory(root)).toThrow(/has no name/i);
  });

  it("rejects two folders that claim the same module id", () => {
    const root = workspaceHolding({ one: moduleManifest("alpha"), two: moduleManifest("alpha") });
    expect(() => readModuleInventory(root)).toThrow(/duplicate module id in the inventory: alpha/i);
  });

  it("returns an empty inventory when no module folder exists yet", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-inventory-empty-"));
    expect(readModuleInventory(root)).toEqual([]);
  });
});
```

Run: `pnpm --filter @genie/generators exec vitest run src/selection/inventory.test.ts`
Expected: six cases pass.

Create `tools/generators/src/selection/index.ts` re-exporting every public name listed in the Interfaces block above.

Create `tools/generators/src/selection/README.md`:

```markdown
# tools/generators/src/selection

The one build-time module selection resolver. The application registry generation and the Storybook host both read it.

## What belongs here

Reading the data-only module inventory, resolving an ordered selection from `MODULE_INCLUDE` or a customer `modules.txt`, and producing the canonical serialized selection and its fingerprint.

## What must not go here

Any import of a module declaration, the application runtime, a database driver, or executable configuration. An entrypoint path is validated data used to emit import text. It is never a path this code loads. Registry generation itself belongs to the application and arrives in S0-05.

## What it imports

The Node standard library only.
```

- [ ] **Step 11: Prove the whole package passes every gate**

Run: `pnpm --filter @genie/generators exec vitest run`
Run: `pnpm lint`
Run: `pnpm typecheck`
Expected: all three pass.

- [ ] **Step 12: Commit**

```bash
git add tools/generators packages/config/src/oxlint
git commit -m "feat(generators): add the data-only module selection resolver"
```

---

### Task 8: Tailwind preset and the reserved Storybook extension point

**Files:**
- Create: `packages/config/src/tailwind/preset.ts`, `packages/config/src/storybook/index.ts`, `packages/config/src/storybook/README.md`
- Modify: `packages/config/package.json`, `packages/ui/package.json`
- Test: `packages/config/src/tailwind/preset.test.ts`, `packages/config/src/storybook/index.test.ts`

**Interfaces:**
- Consumes: the config package.
- Produces: `tailwindPreset` from `@genie/config/tailwind` and `sharedStorybookConfig` from `@genie/config/storybook`. S0-02 fills the Storybook body and owns every Storybook pin.

- [ ] **Step 1: Write the failing Tailwind test**

Create `packages/config/src/tailwind/preset.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { tailwindPreset } from "./preset.ts";

describe("the shared Tailwind preset", () => {
  it("defines no colour, because packages/ui owns the design tokens", () => {
    expect(tailwindPreset.theme?.extend?.colors).toBeUndefined();
  });

  it("names the content globs every package shares", () => {
    expect(tailwindPreset.content).toContain("./src/**/*.{ts,tsx}");
  });
});
```

- [ ] **Step 2: Run it, confirm that it fails, then write the preset**

Run: `pnpm --filter @genie/config exec vitest run src/tailwind`
Expected: the run fails because `./preset.ts` does not exist.

Create `packages/config/src/tailwind/preset.ts`:

```ts
import type { Config } from "tailwindcss";

/**
 * The shared Tailwind preset. It carries structure only.
 * packages/ui owns every design token, so this file defines no colour, font, or spacing scale.
 * Defining one here would create a second token source and a config-to-ui dependency (R-7a).
 */
export const tailwindPreset: Omit<Config, "content"> & { content: readonly string[] } = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

Add `"tailwindcss": "4.3.3"` to the root `devDependencies` and `"./tailwind": "./src/tailwind/preset.ts"` to the `@genie/config` exports. Add `"tailwindcss": "4.3.3"` to `packages/ui` dependencies so that the token owner consumes the preset.

Run the test again. Expected: two cases pass.

- [ ] **Step 3: Write the failing Storybook extension-point test**

Create `packages/config/src/storybook/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sharedStorybookConfig } from "./index.ts";

describe("the reserved Storybook configuration extension point", () => {
  it("stays build-safe, so importing it starts no service and reads no environment value", () => {
    expect(sharedStorybookConfig.stories).toEqual([]);
    expect(sharedStorybookConfig.addons).toEqual([]);
  });

  it("names S0-02 as its owner, so nobody fills it in here by accident", () => {
    expect(sharedStorybookConfig.owner).toBe("S0-02");
  });
});
```

- [ ] **Step 4: Run it, confirm that it fails, then write the extension point**

Create `packages/config/src/storybook/index.ts`:

```ts
/**
 * The reserved shape of the shared Storybook configuration.
 *
 * S0-01 reserves this extension point and nothing else. S0-02 owns every Storybook
 * pin, the framework choice, the addon list, the preset body, and the Nx targets.
 * Keep this file free of a dependency on any Storybook package, so the workspace
 * builds before S0-02 lands.
 */
export type SharedStorybookConfig = {
  /** Story globs. S0-02 fills this from the module selection resolver. */
  readonly stories: readonly string[];
  /** Addon specifiers. S0-02 fills this. */
  readonly addons: readonly string[];
  /** The ticket that owns the body of this configuration. */
  readonly owner: "S0-02";
};

export const sharedStorybookConfig: SharedStorybookConfig = {
  stories: [],
  addons: [],
  owner: "S0-02",
};
```

Create `packages/config/src/storybook/README.md` saying that this folder holds the reserved extension point, that S0-02 owns its content, and that no Storybook dependency belongs here until S0-02.

Add `"./storybook": "./src/storybook/index.ts"` to the `@genie/config` exports.

Run: `pnpm --filter @genie/config exec vitest run src/storybook src/tailwind`
Expected: four cases pass.

- [ ] **Step 5: Record the two new dependencies**

Add one line each for `tailwindcss` in [the tech stack](../../../core/tech-stack.md) only if it is absent. It is already listed at 4.x, so confirm rather than duplicate. Add no Storybook dependency.

- [ ] **Step 6: Run the full gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add packages/config packages/ui package.json pnpm-lock.yaml
git commit -m "build(config): add the tailwind preset and reserve the storybook extension point"
```

---

### Task 9: Affected graph, tag correctness, and local cache proof

**Files:**
- Create: `docs/tickets/spec-0/01-workspace-and-build-inputs/evidence.md`
- Test: `tools/generators/src/workspace/affected.test.ts`

**Interfaces:**
- Consumes: `classifyProject` from Task 3 and the Nx graph from Task 1.
- Produces: the recorded gate evidence the bead links to.

- [ ] **Step 1: Write the failing affected test**

Create `tools/generators/src/workspace/affected.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../..");
const CONFIG_PRESET = join(WORKSPACE_ROOT, "packages/config/src/vitest/unit.ts");

function affectedProjects(): readonly string[] {
  const raw = execFileSync("pnpm", ["exec", "nx", "show", "projects", "--affected", "--json"], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
  });
  return JSON.parse(raw) as readonly string[];
}

let original: string | undefined;

afterEach(() => {
  if (original !== undefined) {
    writeFileSync(CONFIG_PRESET, original, "utf8");
    original = undefined;
  }
});

describe("the affected graph", () => {
  it("marks every consumer affected when the shared config preset changes", () => {
    original = readFileSync(CONFIG_PRESET, "utf8");
    appendFileSync(CONFIG_PRESET, "\n// affected-graph probe\n", "utf8");

    const affected = affectedProjects();
    expect(affected).toContain("@genie/config");
    expect(affected).toContain("@genie/generators");
  });
});
```

- [ ] **Step 2: Run the test and confirm that it fails or passes for the right reason**

Run: `pnpm --filter @genie/generators exec vitest run src/workspace/affected.test.ts`
If the test fails because `@genie/generators` is not listed, the dependency edge on `@genie/config` is missing. Add `@genie/config` to its `devDependencies` as `workspace:*` and re-run. Do not add a manual `implicitDependencies` entry. The edge must come from the real dependency.

- [ ] **Step 3: Prove the local cache reuses identical pure work**

Run: `pnpm exec nx reset`
Run: `pnpm exec nx run-many -t test --skip-nx-cache`
Record the wall time and confirm that every task ran.
Run: `pnpm exec nx run-many -t test`
Expected: every task reports that it read the result from the cache. Nothing re-ran.

- [ ] **Step 4: Prove a changed input busts the cache**

Append a comment to `packages/config/src/vitest/unit.ts`.
Run: `pnpm exec nx run-many -t test`
Expected: `@genie/config` and `@genie/generators` re-run. Remove the comment afterwards.

- [ ] **Step 5: Prove no remote cache is in use**

Run: `pnpm exec nx run-many -t test --verbose`
Expected: the output names no remote cache and no cache provider. Confirm again that `nx.json` holds no `nxCloudAccessToken` and no `nxCloudId`.

- [ ] **Step 6: Write the evidence record**

Create `docs/tickets/spec-0/01-workspace-and-build-inputs/evidence.md` recording, for this ticket only: the integrated base revision, the exact installed version of every pinned tool taken from `pnpm list`, every command run in Tasks 1 to 9, its exit outcome, the negative cases that failed as intended, the chosen Oxlint pin and why, any documented anti-slop exception, the changed paths, and every check that was not run. Do not record a planned success.

State plainly in that file that Storybook, the module registry runtime, the tenant context, the migrator, the image, and the end-to-end layer are not proved by this ticket. They belong to S0-02 and later.

- [ ] **Step 7: Commit**

```bash
git add tools/generators docs/tickets/spec-0/01-workspace-and-build-inputs/evidence.md
git commit -m "test: prove the affected graph, project tags and local cache reuse"
```

---

### Task 10: Apply the owner's formatter preferences

The owner supplied `/home/kenan/Desktop/oxfmt.json` on 2026-09-19. Most of it cannot be used as written. Checked against `node_modules/oxfmt/configuration_schema.json`, the installed schema for oxfmt 0.68.0:

- Four keys do not exist: `experimentalTernaries`, `experimentalSortImports`, `experimentalSortPackageJson`, and `experimentalTailwindcss`. The three sorting options lost their `experimental` prefix in a later release, and `experimentalTernaries` is a Prettier option with no oxfmt equivalent. Writing `experimentalSortImports` would turn import sorting off, because the real key `sortImports` would then be unset and it defaults to disabled.
- `"ignorePatterns": "[]"` is a string. The schema requires an array of strings. Taking it literally would erase the ignore list that keeps the formatter away from `.beads/`, `.claude/`, `docs/`, and the vendored anti-slop source.
- Fourteen keys restate the oxfmt default, so they add lines that can drift from the tool without changing behavior.

Three entries are genuine preferences that differ from the defaults, and those are the whole of this change: `printWidth` 80 rather than 100, `trailingComma` `"es5"` rather than `"all"`, and `quoteProps` `"consistent"` rather than `"as-needed"`.

**Files:**
- Modify: `packages/config/src/oxfmt/index.ts`
- Modify: every file the reformat touches

- [ ] **Step 1: Add the three preferences**

In `packages/config/src/oxfmt/index.ts`, add the block below above `ignorePatterns`. Change nothing else. Keep `ignorePatterns` and `sortImports` exactly as they are.

```ts
  // Owner's choices, 2026-09-19. Everything not listed keeps the oxfmt default.
  // Narrower than the oxfmt default of 100, which the tool recommends for
  // TypeScript. The owner prefers 80.
  printWidth: 80,
  // Trailing commas in arrays and objects, but not in function parameter lists.
  trailingComma: "es5",
  // Quote every property in an object once any one of them needs quoting.
  quoteProps: "consistent",
```

- [ ] **Step 1a: Ignore markdown, and keep the ignore list in one place**

The owner asked for an ignore file for markdown and similar files. oxfmt has no `.oxfmtignore`. Its only separate ignore file is `.prettierignore`, kept for Prettier compatibility, and [its documentation](https://oxc.rs/docs/guide/usage/formatter/ignore-files.html) says to prefer `ignorePatterns` for a new project. Three reasons decide it here:

1. This repository has no Prettier and rejects it by policy, so a file named after Prettier would be confusing.
2. R-5 puts the formatter configuration in `packages/config`. A root ignore file would split one decision across two places.
3. `ignorePatterns` is the stronger guard. A file that only `.gitignore` covers can still be formatted when a caller names it directly, and the lefthook pre-commit hook does exactly that: it passes explicit staged paths. A file listed in `ignorePatterns` cannot be formatted even when named directly.

Replace the `ignorePatterns` array in `packages/config/src/oxfmt/index.ts` with the list below. It adds markdown, and drops entries that are now redundant: `README.md`, `DESIGN.md`, and `PRODUCT.md` are covered by the markdown pattern, `plans/**` holds only markdown, and oxfmt always ignores lock files.

```ts
  // oxfmt recommends ignorePatterns over a separate ignore file for a new
  // project, and it is the stronger guard: a path listed here cannot be
  // formatted even when a caller names it directly, which is how the
  // pre-commit hook invokes the formatter.
  // https://oxc.rs/docs/guide/usage/formatter/ignore-files.html
  ignorePatterns: [
    // Prose. Markdown is written by hand, and reflowing it churns documents
    // without improving them.
    "**/*.md",
    "**/*.mdx",

    // State owned by other tools.
    ".beads/**",
    ".claude/**",
    ".agents/**",
    ".impeccable/**",
    "graft/**",

    // Diagram sources and generated HTML live here beside the prose.
    "docs/**",

    // Vendored upstream source. Reformatting it would break the three-way
    // merge that an anti-slop update depends on (R-5a).
    "packages/config/oxlint/anti-slop/**",

    // Generated at build time from MODULE_INCLUDE (ADR 0008).
    "apps/genie/src/modules.ts",

    // Build output. Also gitignored, but repeated here so a direct
    // invocation cannot reach it.
    "**/dist/**",
    "**/coverage/**",
    "**/.nx/**",
  ],
```

Do not add `node_modules` or a lock file. oxfmt ignores `.git`, `.svn`, `.jj`, `node_modules`, and every lock file by default.

- [ ] **Step 2: Confirm the tool accepts all three**

Run: `pnpm exec oxfmt --check --disable-nested-config`
Expected: the command runs and reports files to change. It must not report an unknown or invalid option. An unknown key is the failure mode this task exists to avoid, so read the output rather than only the exit code.

- [ ] **Step 3: Reformat, and confirm the scope**

Run: `pnpm format`
Run: `git status --short`
Expected: many files change, because the print width moved. Confirm that nothing under `docs/`, `.beads/`, `.claude/`, `.agents/`, `.impeccable/`, `graft/`, `plans/`, or `packages/config/oxlint/anti-slop/` changed, and that `README.md`, `DESIGN.md`, and `PRODUCT.md` are untouched. If any of those moved, the ignore list was damaged. Stop and report.

- [ ] **Step 4: Confirm convergence and the gates**

Run: `pnpm format`
Run: `git diff --stat`
Expected: unchanged from Step 3. A second pass changes nothing.
Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: all pass. The narrower print width rewraps code that the linter also reads, so this proves the formatter and the linter still agree.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: apply the owner's formatter preferences"
```

---

## Completion handoff

After Task 9, do not close the bead and do not push. Record on `genie-ops-center-v2-1rd.1`: the changed paths, every command and its real outcome, the red and green evidence, the checks that were not run, the base revision, and the proposed integration action. The integration owner closes the bead after integrated proof.

Stop and report, rather than deciding alone, if any of these happen:

- Oxlint 1.83.0 and the vendored plugin do not work together at either pin.
- A pinned major named in [the tech stack](../../../core/tech-stack.md) is unavailable or incompatible.
- An import boundary cannot be expressed in `no-restricted-imports` and would need a different mechanism.
- The resolver cannot distinguish unset from explicitly empty through the whole chain.
- A gate needs a new service, an extra pool, a cross-module import, or weaker authorization.
