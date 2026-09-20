# S0-03 Module Contracts and Build-Safe Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give core the final public type surface for every module contract point, the strict tenant-configuration schemas, the request-owned authorization stub and the pure content security policy functions, with no runtime service behind any of them.

**Architecture:** Everything lands in `packages/core` as declaration types, pure functions and zod schemas. A module declares against these types. Nothing here opens a connection, reads a deployment value at import time or emits a response header. Later tickets supply the services: S0-04 the tenant-context factory and the placeholder, S0-05 the header emission, S0-08 the generators.

**Tech Stack:** TypeScript 7.0.2 strict, zod 4.6.5, `@trpc/server` 11.19.0 types, `drizzle-orm` 0.45.2 types, `pg` 8.23.0 with `@types/pg` 8.23.1, `@types/react` 19.3.0, Vitest 5.0.1, oxlint 1.83.0, oxfmt 0.68.0, Nx 23.2.1, Node 26.

**Spec:** [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ticket](index.md) including "Accepted planning decisions — 2026-09-20", [module contract](../../../architecture/module-contract.md), [environment contract](../../../architecture/environment-contract.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md).

Plan location note: the Superpowers default is `docs/superpowers/plans/`. This repository keeps ticket-local plans beside the ticket, so the plan lives here. Repository instructions override the skill default.

## Status, 2026-09-20

This plan stays active. Phase A is complete. Phase B is not started, so the
plan remains the working instruction set for Tasks 6 to 11.

### Completed: Phase A

| Task | Result | Commits |
| --- | --- | --- |
| 1 | Target coverage for a top-level `contracts/` folder | `1879df5`, repaired by `b3b476f` |
| 2 | Permission key and scope primitives | `bc7c3b9`, extended by `71674a8` |
| 3 | Request-owned authorization seam | `03fb70f`, extended by `b6303e3` |
| 4 | Pure content security policy validation and serialization | `c6adcc4`, with `2f742c8`, `82895a2`, `933174d` |
| 5 | Contract dependency pins, prepared and awaiting integration | `66b1c3d` |

Each task passed a review with two verdicts, for specification compliance and
for code quality. Every finding is fixed or filed in Beads.

### Pending: Phase B

Tasks 6 to 11 are not started. They create `packages/core/contracts/`, the
TenantContext types, the tenant configuration schemas, the Module type and its
fixture, the validator and the build-safety proof.

### Revisions

- `66b1c3d` is the original dependency-handoff revision. The integration owner
  receives this revision for the Task 5 change.
- `cde5ee5` is the current merged head. It merges develop `53b49f4` into the
  feature branch.
- The Global Constraints baseline of `7fe04be` records the original branch cut.
  That value is history and not the current head.

### Verification

Historical evidence belongs to the revision that produced it. Each task review
proves its own commit range only. Post-merge verification is separate. At
`cde5ee5` the merged tree passed `nx affected` 15 of 15 tasks with the cache
skipped, core tests at 5 files and 48 tests, and zero leaked probe fixtures.
That run proves the merged tree. It does not re-prove the earlier ranges.

### Authoritative sources

If an instruction in this plan conflicts with a source below, follow the source:

- The ticket [index.md](index.md), sections "Accepted planning decisions — 2026-09-20" and "Naming revision, 2026-09-20".
- [The module naming revision](../../../tech-plans/module-naming-revision.md).
- [Module package naming](../../../architecture/repository-layout.md#module-package-naming).
- [Tenant module visibility](../../../flows/tenant-module-visibility.md).

The naming contract keeps the folder `packages/modules/<capability>/` and the
module IDs unchanged. The package name becomes `@genie/module-<capability>`.
One fixture in Task 6 needs this correction. The boundary test named "stops core
testing helpers importing a module" writes the forbidden import as
`@genie/modules-placeholder`. Use `@genie/module-placeholder` when Task 6 runs.
A scoped search found no other naming change for this plan and no naming change
in committed Phase A source.

### Blocker

Do not resume Phase B before both conditions below hold:

1. S0-01 delivers its naming rework, and the integration owner accepts that
   baseline. At `cde5ee5` the rework is absent.
   `tools/generators/src/selection/inventory.ts` accepts a manifest name without
   the folder, name and ID invariant.
   `packages/config/src/oxlint/boundaries.ts` carries no singular
   `@genie/module-*` restriction. Bead `genie-ops-center-v2-1rd.1` stays in
   progress.
2. The required ownership handoff completes, including separate integration
   approval for the Task 5 dependency change.

## Global Constraints

- Baseline revision is `7fe04be`. Worktree is `~/work/genie-ops-center-v2.feature-s0-03-module-contracts` on branch `feature/s0-03-module-contracts`.
- Bead `genie-ops-center-v2-1rd.3` is claimed by actor `claude-s0-03-2026-09-20`. Beads is the only task tracker. Refresh the lease, which expires after five minutes.
- No commit, merge, push, publication, Dolt remote sync or worktree deletion without separate approval. Every task's commit step is written as a proposal, not an authorization.
- Prefix shell commands with `rtk`.
- Format with oxfmt. Lint with oxlint. Typecheck with `tsc --noEmit`. Run all three through Nx.
- Import direction: `ui` imports nothing internal, `core` imports `ui`, a module imports `core` and `ui`, an app imports everything. `packages/core/contracts` imports zod and types only.
- No `any`. No cast to silence a lint rule. No global rule disable. R-5a permits a narrow documented exception for boundary validation, framework contracts and test fixtures. Name the rule and the reason in the comment.
- Nothing in this ticket reads a deployment environment value at import time, opens a connection or starts a service (R-19a).
- Do not create `packages/core/testing/`. R-39 reserves it for core-table factories and generic database, migration and tenant-context helpers, which S0-04 and S0-07 own.
- Contract fixtures live beside the test that uses them, never in a public export.
- Five shared surfaces need the coordination handoff before integration: `pnpm-lock.yaml`, `packages/core/package.json` exports, `packages/config/src/vitest/unit.ts`, `packages/config/src/vitest/unit.test.ts`, `packages/config/src/oxlint/boundaries.ts`.
- Every new folder gets a `README.md` saying what belongs there and what must not. It never lists files (R-9).
- Stop conditions: a declaration that needs later business behavior, a forbidden import, a new service or pool, a dependency major change, or any weakening of authorization. Report the failed command, the versions, the observed evidence and the smallest alternative. Keep the bead open.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/config/src/vitest/unit.ts` | Unit discovery: `src` and `contracts` in, `testing` out |
| `packages/core/src/__testing__/target-probe.ts` | Runs a real tool binary against an isolated fixture |
| `packages/core/src/package-targets.test.ts` | Proves lint, typecheck and unit collection reach `contracts/` and skip `testing/` |
| `packages/core/src/lib/module-contract/keys.ts` | Permission key, resource reference, scope set. No library dependency |
| `packages/core/src/services/authorization/principal.ts` | The server-only request principal and its lazy grant read |
| `packages/core/src/services/authorization/stub.ts` | The Section 0 grant reader: one key, `placeholder:read` |
| `packages/core/src/services/authorization/index.ts` | `can()` and `scopesFor()` with their final signatures |
| `packages/core/src/lib/content-security-policy/index.ts` | Baseline, origin validator, serializer, provider collector |
| `packages/core/contracts/index.ts` | Capability interfaces and cross-module event schemas |
| `packages/core/src/lib/tenant-context/index.ts` | The `TenantContext` type and the deployment environment type |
| `packages/core/src/lib/tenant-config/tenant-yaml.ts` | The strict `tenant.yaml` schema |
| `packages/core/src/lib/tenant-config/branding-seed.ts` | The strict `branding.seed.json` schema |
| `packages/core/src/lib/module-contract/module.ts` | The seventeen point types and the `Module` type |
| `packages/core/src/lib/module-contract/validate.ts` | The runtime contract validator |
| `packages/core/src/lib/build-safety/probe-entry.ts` | The child-process entry that detects forbidden initialization |

---

## Phase A — no new dependency

### Task 1: Unit discovery reaches `contracts/` and skips `testing/`

**Files:**
- Modify: `packages/config/src/vitest/unit.ts`
- Modify: `packages/config/src/vitest/unit.test.ts`
- Modify: `packages/core/package.json` (the `lint` script)
- Modify: `packages/core/tsconfig.json` (the `include` array)
- Create: `packages/core/src/__testing__/target-probe.ts`
- Create: `packages/core/src/__testing__/README.md`
- Test: `packages/core/src/package-targets.test.ts`

**Interfaces:**
- Produces: `UNIT_TEST_INCLUDE`, `UNIT_TEST_EXCLUDE` and `unitTestPreset` from `@genie/config/vitest/unit`. `probe(files, command, args)` returning `{ failed, output }` from `./__testing__/target-probe.ts`.
- Consumes: nothing.

The probe builds its fixture in the operating system temporary directory and symlinks the workspace `node_modules` into it. Module resolution and binaries work, the repository tree stays clean, and a concurrent test can never discover a planted failure.

- [ ] **Step 1: Write the failing discovery test**

Create `packages/core/src/package-targets.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UNIT_TEST_EXCLUDE, UNIT_TEST_INCLUDE } from "@genie/config/vitest/unit";
import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, probe } from "./__testing__/target-probe.ts";

const VITEST = join(WORKSPACE_ROOT, "node_modules/.bin/vitest");

const PASSING = `import { expect, it } from "vitest";\nit("passes", () => { expect(1).toBe(1); });\n`;
const FAILING = `import { expect, it } from "vitest";\nit("fails", () => { expect(1).toBe(2); });\n`;

function vitestConfig(): string {
  return [
    `import { defineConfig } from "vitest/config";`,
    `export default defineConfig({ test: {`,
    `  environment: "node",`,
    `  include: ${JSON.stringify([...UNIT_TEST_INCLUDE])},`,
    `  exclude: ${JSON.stringify([...UNIT_TEST_EXCLUDE])},`,
    `  passWithNoTests: false,`,
    `} });`,
  ].join("\n");
}

describe("unit collection, run through the real vitest binary", () => {
  it("collects src and contracts and leaves testing alone", () => {
    const result = probe(
      [
        { path: "vitest.config.ts", source: vitestConfig() },
        { path: "src/in-src.test.ts", source: PASSING },
        { path: "contracts/in-contracts.test.ts", source: PASSING },
        { path: "testing/in-testing.test.ts", source: FAILING },
      ],
      VITEST,
      ["run", "--reporter=json", "--outputFile=report.json"]
    );

    expect(result.failed).toBe(false);

    const report: { testResults: readonly { name: string }[] } = JSON.parse(
      readFileSync(join(result.root, "report.json"), "utf8")
    );
    const collected = report.testResults.map((entry) => entry.name);

    expect(collected).toHaveLength(2);
    expect(collected.some((name) => name.includes("in-src"))).toBe(true);
    expect(collected.some((name) => name.includes("in-contracts"))).toBe(true);
    expect(collected.some((name) => name.includes("in-testing"))).toBe(false);
  });
});
```

The planted `testing/` file fails on purpose. A passing run with exactly two collected files proves inclusion of `src` and `contracts` and exclusion of `testing` in one execution.

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL. `@genie/config/vitest/unit` exports no `UNIT_TEST_INCLUDE`, and `./__testing__/target-probe.ts` does not exist.

- [ ] **Step 3: Write the probe helper**

Create `packages/core/src/__testing__/target-probe.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const WORKSPACE_ROOT = join(import.meta.dirname, "../../../..");

export type ProbeFile = { readonly path: string; readonly source: string };
export type ProbeResult = {
  readonly failed: boolean;
  readonly output: string;
  readonly root: string;
};

const roots: string[] = [];

/**
 * Writes files into a private fixture outside the repository, then runs one command there.
 * The fixture borrows the workspace node_modules through a symlink, so binaries and package
 * specifiers resolve. Nothing is planted inside a real package, so a concurrent target never
 * discovers a deliberate failure.
 */
export function probe(
  files: readonly ProbeFile[],
  command: string,
  args: readonly string[]
): ProbeResult {
  const root = mkdtempSync(join(tmpdir(), "genie-target-probe-"));

  roots.push(root);

  symlinkSync(join(WORKSPACE_ROOT, "node_modules"), join(root, "node_modules"), "dir");

  for (const file of files) {
    const absolute = join(root, file.path);

    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.source, "utf8");
  }

  try {
    const output = execFileSync(command, [...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return { failed: false, output, root };
  } catch (error) {
    // SAFETY: execFileSync throws an Error that also carries stdout and stderr. Only those
    // two fields are read, so this narrow shape holds for every failure this call raises.
    const failure = error as { stdout?: string; stderr?: string };

    return {
      failed: true,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      root,
    };
  }
}

/** Removes every fixture this module created. Call it from a global teardown. */
export function cleanUpProbeRoots(): void {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}
```

Add `import { rmSync } from "node:fs";` to the import list. The fixture survives the command so the test can read a report file, and teardown removes it.

Create `packages/core/src/__testing__/README.md`:

```markdown
# packages/core/src/__testing__

Helpers that core's own tests use.

## What belongs here

A helper that runs a real tool binary against an isolated fixture, so a test can prove what a
build target covers.

## What must not go here

A factory for a core table, a database helper, a migration helper, and a tenant-context helper.
Those belong in `packages/core/testing/`, which R-39 governs and a later ticket creates. Nothing
here is part of the package's public surface.

## What it imports

The Node standard library only.
```

- [ ] **Step 4: Give the shared preset explicit discovery**

Replace `packages/config/src/vitest/unit.ts`:

```ts
import type { ViteUserConfig } from "vitest/config";

/**
 * Where a unit test lives. `contracts/` is a top-level source folder beside `src/`, so it needs
 * its own entry. `testing/` is absent on purpose: it holds real-database integration tests that
 * need a disposable Postgres, and those run under their own preset.
 */
export const UNIT_TEST_INCLUDE: readonly string[] = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "contracts/**/*.test.ts",
  "contracts/**/*.test.tsx",
];

export const UNIT_TEST_EXCLUDE: readonly string[] = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.stories.*",
  "testing/**",
  "e2e/**",
];

/** The shared unit-test preset. Every package merges it in its own vitest.config.ts. */
export const unitTestPreset: ViteUserConfig = {
  test: {
    environment: "node",
    include: [...UNIT_TEST_INCLUDE],
    exclude: [...UNIT_TEST_EXCLUDE],
    restoreMocks: true,
    passWithNoTests: false,
  },
};
```

- [ ] **Step 5: Follow the change in the preset's own test**

In `packages/config/src/vitest/unit.test.ts`, replace the include assertion:

```ts
  it("collects unit tests from src and from the top-level contracts folder", () => {
    expect(unitTestPreset.test?.include).toEqual([...UNIT_TEST_INCLUDE]);
    expect(UNIT_TEST_INCLUDE).toContain("src/**/*.test.ts");
    expect(UNIT_TEST_INCLUDE).toContain("contracts/**/*.test.ts");
  });

  it("keeps integration tests under testing out of the unit collection", () => {
    expect(UNIT_TEST_INCLUDE.some((pattern) => pattern.startsWith("testing/"))).toBe(false);
    expect(unitTestPreset.test?.exclude).toContain("testing/**");
  });
```

Add `UNIT_TEST_INCLUDE` to the import from `./unit.ts`. These assertions state the intent. The executable proof is the collection run in Task 1's first test.

- [ ] **Step 6: Widen the core lint and typecheck scope**

In `packages/core/package.json`, change the `lint` script to:

```json
"lint": "oxlint --config ../../oxlint.config.ts src contracts testing"
```

In `packages/core/tsconfig.json`, change `include` to:

```json
"include": ["src/**/*.ts", "contracts/**/*.ts", "testing/**/*.ts", "vitest.config.ts"]
```

Both tools tolerate a path that does not exist yet, so `testing/` can be named before S0-04 creates it. Confirm that in Step 8 rather than assuming it.

- [ ] **Step 7: Prove lint and typecheck reach both folders**

Append to `packages/core/src/package-targets.test.ts`:

```ts
const OXLINT = join(WORKSPACE_ROOT, "node_modules/.bin/oxlint");
const TSC = join(WORKSPACE_ROOT, "node_modules/.bin/tsc");

function coreLintPaths(): readonly string[] {
  const manifest: { scripts: { lint: string } } = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/package.json"), "utf8")
  );

  return manifest.scripts.lint.split(" ").slice(3);
}

function coreTsconfigInclude(): readonly string[] {
  const config: { include: readonly string[] } = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/tsconfig.json"), "utf8")
  );

  return config.include;
}

// One `let` per statement is the rule the formatter applies, so the violation is stable.
const LINT_VIOLATION = `export const value: string = "x" as string as string;\n`;
const TYPE_ERROR = `export const value: number = "not a number";\n`;

describe("the core lint scope", () => {
  it.each(["contracts", "testing"])("reaches %s", (folder) => {
    const result = probe(
      [{ path: `${folder}/offender.ts`, source: LINT_VIOLATION }],
      OXLINT,
      ["--config", join(WORKSPACE_ROOT, "oxlint.config.ts"), ...coreLintPaths()]
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("offender.ts");
  });
});

describe("the core typecheck scope", () => {
  it.each(["contracts", "testing"])("reaches %s", (folder) => {
    const tsconfig = JSON.stringify({
      extends: join(WORKSPACE_ROOT, "tsconfig.base.json"),
      include: coreTsconfigInclude().filter((pattern) => pattern !== "vitest.config.ts"),
    });

    const result = probe(
      [
        { path: "tsconfig.json", source: tsconfig },
        { path: `${folder}/offender.ts`, source: TYPE_ERROR },
      ],
      TSC,
      ["--noEmit", "-p", "tsconfig.json"]
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("offender.ts");
  });
});
```

Each probe reads the real value out of the real manifest, so the proof is bound to core's actual configuration and not to a copy that can drift.

- [ ] **Step 8: Run the whole task green**

```bash
rtk npx nx run-many -t test lint typecheck --skip-nx-cache
```

Expected: PASS for all projects. If oxlint or tsc rejects the not-yet-existing `testing` path, remove that path from the scope, keep `contracts`, and record the limitation in the bead. Do not create `packages/core/testing/` to work around it.

- [ ] **Step 9: Format, then propose the commit**

```bash
rtk pnpm format
```

Proposed commit, to run only after the owner approves:

```bash
git add packages/config/src/vitest packages/core/package.json packages/core/tsconfig.json packages/core/src
git commit -m "test(core): cover the top-level contracts folder in every target"
```

---

### Task 2: Permission key primitives

**Files:**
- Create: `packages/core/src/lib/module-contract/keys.ts`
- Create: `packages/core/src/lib/module-contract/README.md`
- Test: `packages/core/src/lib/module-contract/keys.test.ts`

**Interfaces:**
- Produces: `PermissionKey`, `ResourceRef`, `Scope`, `ScopeSet`, `isPermissionKey(value)`, `permissionKeyFor(moduleId, action)`.
- Consumes: nothing. This file carries no library dependency on purpose, so Tasks 3 and 4 can run before the dependency change lands.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { isPermissionKey, permissionKeyFor } from "./keys.ts";

describe("isPermissionKey", () => {
  it("accepts the <id>:<action> form", () => {
    expect(isPermissionKey("placeholder:read")).toBe(true);
  });

  it("refuses a key without an action", () => {
    expect(isPermissionKey("placeholder")).toBe(false);
  });

  it("refuses a key with two separators", () => {
    expect(isPermissionKey("core:settings:manage")).toBe(false);
  });

  it("refuses a module part that is not kebab-case", () => {
    expect(isPermissionKey("Placeholder:read")).toBe(false);
  });
});

describe("permissionKeyFor", () => {
  it("joins the module id and the action", () => {
    expect(permissionKeyFor("placeholder", "read")).toBe("placeholder:read");
  });

  it("refuses an identifier that is not kebab-case", () => {
    expect(() => permissionKeyFor("Placeholder", "read")).toThrow("kebab-case");
  });
});
```

Note the third case. `core:settings:manage` is a core key, not a module key. The module key form is exactly two parts. Record that in the file comment so a later reader does not widen the check.

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, `./keys.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
/** A module permission key, always `<module-id>:<action>` (module contract, Permission keys). */
export type PermissionKey = `${string}:${string}`;

/** One record a permission can be checked against. */
export type ResourceRef = { readonly type: string; readonly id: string };

/** One scope a role assignment can point at. */
export type Scope = { readonly type: string; readonly id: string };

/** What `scopesFor()` answers: everything, nothing, or a named list (DEC-39). */
export type ScopeSet =
  | { readonly kind: "all" }
  | { readonly kind: "none" }
  | { readonly kind: "some"; readonly scopes: readonly Scope[] };

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * A module key has exactly two kebab-case parts. Core's own keys, such as
 * `core:settings:manage`, are not module keys and do not pass this check.
 */
export function isPermissionKey(value: string): value is PermissionKey {
  const parts = value.split(":");

  if (parts.length !== 2) return false;

  return parts.every((part) => KEBAB_CASE.test(part));
}

export function permissionKeyFor(moduleId: string, action: string): PermissionKey {
  if (!KEBAB_CASE.test(moduleId)) {
    throw new Error(`Module id "${moduleId}" is not kebab-case.`);
  }

  if (!KEBAB_CASE.test(action)) {
    throw new Error(`Action "${action}" is not kebab-case.`);
  }

  return `${moduleId}:${action}`;
}
```

Create `packages/core/src/lib/module-contract/README.md` describing the folder: the module contract types, the key primitives and the validator belong here; a service, a database read and a module import do not; it imports zod and type-only library declarations.

- [ ] **Step 4: Run the tests green**

```bash
rtk npx nx run @genie/core:test @genie/core:lint @genie/core:typecheck --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Propose the commit**

```bash
git add packages/core/src/lib/module-contract
git commit -m "feat(core): add the permission key primitives"
```

---

### Task 3: The request-owned authorization seam

**Files:**
- Create: `packages/core/src/services/authorization/principal.ts`
- Create: `packages/core/src/services/authorization/stub.ts`
- Create: `packages/core/src/services/authorization/index.ts`
- Create: `packages/core/src/services/authorization/README.md`
- Test: `packages/core/src/services/authorization/index.test.ts`

**Interfaces:**
- Consumes: `PermissionKey`, `ResourceRef`, `ScopeSet` from `../../lib/module-contract/keys.ts`.
- Produces: `RequestPrincipal`, `PermissionGrants`, `GrantReader`, `createRequestPrincipal(identity, read)`, `can(user, permission, resource?)`, `scopesFor(user, permission)`, `createStubGrantReader()`, `STUB_GRANTED_KEY`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { can, scopesFor } from "./index.ts";
import { createRequestPrincipal } from "./principal.ts";
import { STUB_GRANTED_KEY, createStubGrantReader } from "./stub.ts";

function countingReader() {
  const reader = createStubGrantReader();
  let reads = 0;

  return {
    reads: () => reads,
    read: async () => {
      reads += 1;

      return reader();
    },
  };
}

function principalWith(read: () => Promise<Awaited<ReturnType<ReturnType<typeof createStubGrantReader>>>>) {
  return createRequestPrincipal({ userId: "u1", groups: [] }, read);
}

describe("the Section 0 authorization stub", () => {
  it("grants placeholder:read", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(can(user, STUB_GRANTED_KEY)).resolves.toBe(true);
  });

  it("refuses every other key", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(can(user, "placeholder:admin")).resolves.toBe(false);
    await expect(can(user, "placeholder:use")).resolves.toBe(false);
    await expect(can(user, "invoices:approve")).resolves.toBe(false);
  });

  it("refuses a resource check for a key it does not grant", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(
      can(user, "placeholder:admin", { type: "placeholder-record", id: "r1" })
    ).resolves.toBe(false);
  });

  it("answers scopesFor with none for a refused key", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(scopesFor(user, "invoices:approve")).resolves.toEqual({ kind: "none" });
  });

  it("answers scopesFor with all for the granted key", async () => {
    const user = principalWith(createStubGrantReader());

    await expect(scopesFor(user, STUB_GRANTED_KEY)).resolves.toEqual({ kind: "all" });
  });
});

describe("the lazy loader", () => {
  it("reads once however many calls one execution makes", async () => {
    const counting = countingReader();
    const user = principalWith(counting.read);

    expect(counting.reads()).toBe(0);

    await can(user, STUB_GRANTED_KEY);
    await can(user, "placeholder:admin");
    await scopesFor(user, STUB_GRANTED_KEY);
    await can(user, STUB_GRANTED_KEY);

    expect(counting.reads()).toBe(1);
  });

  it("reads once even when calls start before the first read settles", async () => {
    const counting = countingReader();
    const user = principalWith(counting.read);

    await Promise.all([
      can(user, STUB_GRANTED_KEY),
      can(user, STUB_GRANTED_KEY),
      scopesFor(user, STUB_GRANTED_KEY),
    ]);

    expect(counting.reads()).toBe(1);
  });

  it("keeps two executions apart", async () => {
    const first = countingReader();
    const second = countingReader();

    await can(principalWith(first.read), STUB_GRANTED_KEY);
    await can(principalWith(second.read), STUB_GRANTED_KEY);

    expect(first.reads()).toBe(1);
    expect(second.reads()).toBe(1);
  });

  it("does not read until a permission is asked for", () => {
    const counting = countingReader();

    principalWith(counting.read);

    expect(counting.reads()).toBe(0);
  });
});
```

The second case matters. Memoising the resolved value alone lets two concurrent calls both start a read. Memoise the promise.

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, the three files do not exist.

- [ ] **Step 3: Write the principal**

`principal.ts`:

```ts
import type { PermissionKey, ScopeSet } from "../../lib/module-contract/keys.ts";

/** What one read of a person's assignments answers. */
export type PermissionGrants = {
  readonly keys: ReadonlySet<PermissionKey>;
  readonly scopes: ReadonlyMap<PermissionKey, ScopeSet>;
};

/** Reads the current person's assignments. Section 2 replaces the stub behind this type. */
export type GrantReader = () => Promise<PermissionGrants>;

export type PrincipalIdentity = {
  readonly userId: string;
  readonly groups: readonly string[];
};

/**
 * The server-only wrapper `can()` and `scopesFor()` take. It is not the persisted user row, not a
 * value sent to a browser, and not the shared session. One is created per request and per job run,
 * and its lazy read is shared inside that one execution only (DEC-48, R-14).
 */
export type RequestPrincipal = PrincipalIdentity & {
  readonly grants: () => Promise<PermissionGrants>;
};

export function createRequestPrincipal(
  identity: PrincipalIdentity,
  read: GrantReader
): RequestPrincipal {
  // The promise is memoised, not the resolved value, so two concurrent calls share one read.
  let pending: Promise<PermissionGrants> | undefined;

  return {
    userId: identity.userId,
    groups: identity.groups,
    grants: () => {
      pending ??= read();

      return pending;
    },
  };
}
```

- [ ] **Step 4: Write the stub reader**

`stub.ts`:

```ts
import type { PermissionKey } from "../../lib/module-contract/keys.ts";
import type { GrantReader, PermissionGrants } from "./principal.ts";

/**
 * The one key Section 0 grants (R-13). Section 2 item 6 replaces this reader with the real
 * evaluator. There is no test principal and no read without a permission (DEC-34).
 */
export const STUB_GRANTED_KEY: PermissionKey = "placeholder:read";

export function createStubGrantReader(): GrantReader {
  const grants: PermissionGrants = {
    keys: new Set<PermissionKey>([STUB_GRANTED_KEY]),
    scopes: new Map([[STUB_GRANTED_KEY, { kind: "all" } as const]]),
  };

  return () => Promise.resolve(grants);
}
```

- [ ] **Step 5: Write the two final signatures**

`index.ts`:

```ts
import type { PermissionKey, ResourceRef, ScopeSet } from "../../lib/module-contract/keys.ts";
import type { RequestPrincipal } from "./principal.ts";

export type { GrantReader, PermissionGrants, PrincipalIdentity, RequestPrincipal } from "./principal.ts";
export { createRequestPrincipal } from "./principal.ts";
export { STUB_GRANTED_KEY, createStubGrantReader } from "./stub.ts";

/**
 * The one permission check in the platform (DEC-39). `resource` narrows the check to one record.
 * The Section 0 stub has no record-scoped grant, so a held key answers true for any resource.
 */
export async function can(
  user: RequestPrincipal,
  permission: PermissionKey,
  resource?: ResourceRef
): Promise<boolean> {
  const grants = await user.grants();

  if (!grants.keys.has(permission)) return false;

  if (resource === undefined) return true;

  const scopes = grants.scopes.get(permission) ?? { kind: "none" };

  if (scopes.kind === "all") return true;

  if (scopes.kind === "none") return false;

  return scopes.scopes.some(
    (scope) => scope.type === resource.type && scope.id === resource.id
  );
}

/** The one scope filter for a list query (DEC-39). */
export async function scopesFor(
  user: RequestPrincipal,
  permission: PermissionKey
): Promise<ScopeSet> {
  const grants = await user.grants();

  if (!grants.keys.has(permission)) return { kind: "none" };

  return grants.scopes.get(permission) ?? { kind: "none" };
}
```

Write `README.md` for the folder: the authorization seam and its Section 0 stub belong here; a real evaluator, a role table read and a bypass do not; it imports the key primitives only.

- [ ] **Step 6: Run the tests green**

```bash
rtk npx nx run @genie/core:test @genie/core:lint @genie/core:typecheck --skip-nx-cache
```

Expected: PASS, including the four loader cases.

- [ ] **Step 7: Propose the commit**

```bash
git add packages/core/src/services/authorization
git commit -m "feat(core): add the request-owned authorization seam"
```

---

### Task 4: Pure content security policy functions

**Files:**
- Create: `packages/core/src/lib/content-security-policy/index.ts`
- Create: `packages/core/src/lib/content-security-policy/README.md`
- Test: `packages/core/src/lib/content-security-policy/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BASELINE_POLICY`, `isFrameOrigin(value)`, `normalizeFrameOrigins(values)`, `serializeContentSecurityPolicy(frameOrigins)`, `FrameOriginProvider<Ctx>`, `collectFrameOrigins(provider, ctx)`.

The collector is generic over its context so this file needs no `TenantContext` import and can land before the dependency change. Task 9 pins the concrete `{ tenant: TenantContext }` context in the Module type, so the public contract signature is still final.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  BASELINE_POLICY,
  collectFrameOrigins,
  isFrameOrigin,
  normalizeFrameOrigins,
  serializeContentSecurityPolicy,
} from "./index.ts";

describe("the baseline policy", () => {
  it("is the exact string R-47 fixes", () => {
    expect(BASELINE_POLICY).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'"
    );
  });
});

describe("isFrameOrigin", () => {
  it("accepts an HTTPS origin", () => {
    expect(isFrameOrigin("https://viewer.example.com")).toBe(true);
  });

  it("accepts an HTTPS origin with a port", () => {
    expect(isFrameOrigin("https://viewer.example.com:8443")).toBe(true);
  });

  it.each([
    ["a path", "https://viewer.example.com/embed"],
    ["plain HTTP", "http://viewer.example.com"],
    ["a wildcard host", "https://*.example.com"],
    ["the broad scheme source", "https:"],
    ["a wildcard", "*"],
    ["a policy keyword", "'self'"],
    ["a header fragment", "frame-src https://viewer.example.com"],
    ["a directive separator", "https://a.example.com; script-src *"],
    ["a trailing slash", "https://viewer.example.com/"],
    ["an empty string", ""],
  ])("refuses %s", (_label, value) => {
    expect(isFrameOrigin(value)).toBe(false);
  });
});

describe("normalizeFrameOrigins", () => {
  it("drops an invalid origin instead of failing the whole list", () => {
    expect(normalizeFrameOrigins(["https://a.example.com", "*"])).toEqual([
      "https://a.example.com",
    ]);
  });

  it("removes a duplicate and keeps the supplied order", () => {
    expect(
      normalizeFrameOrigins(["https://b.example.com", "https://a.example.com", "https://b.example.com"])
    ).toEqual(["https://b.example.com", "https://a.example.com"]);
  });
});

describe("serializeContentSecurityPolicy", () => {
  it("returns the baseline when no origin survives", () => {
    expect(serializeContentSecurityPolicy([])).toBe(BASELINE_POLICY);
  });

  it("replaces frame-src and leaves the other three directives alone", () => {
    const policy = serializeContentSecurityPolicy(["https://viewer.example.com"]);

    expect(policy).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://viewer.example.com"
    );
  });

  it("never emits a second policy or an extra directive", () => {
    const policy = serializeContentSecurityPolicy(["https://viewer.example.com"]);

    expect(policy.split(";")).toHaveLength(4);
    expect(policy).not.toContain("default-src");
    expect(policy).not.toContain("script-src");
    expect(policy).not.toContain("style-src");
    expect(policy).not.toContain("nonce");
  });
});

describe("collectFrameOrigins", () => {
  const ctx = { tenant: { id: "one" } };

  it("contributes nothing when the provider is omitted", async () => {
    await expect(collectFrameOrigins(undefined, ctx)).resolves.toEqual([]);
  });

  it("contributes nothing when the provider returns an empty list", async () => {
    await expect(
      collectFrameOrigins({ frameOrigins: () => Promise.resolve([]) }, ctx)
    ).resolves.toEqual([]);
  });

  it("contributes nothing when the provider throws", async () => {
    await expect(
      collectFrameOrigins(
        {
          frameOrigins: () => {
            throw new Error("backing record read failed");
          },
        },
        ctx
      )
    ).resolves.toEqual([]);
  });

  it("contributes nothing when the provider rejects", async () => {
    await expect(
      collectFrameOrigins({ frameOrigins: () => Promise.reject(new Error("down")) }, ctx)
    ).resolves.toEqual([]);
  });

  it("drops an invalid contribution rather than widening the policy", async () => {
    const origins = await collectFrameOrigins(
      { frameOrigins: () => Promise.resolve(["https:", "*", "https://ok.example.com"]) },
      ctx
    );

    expect(serializeContentSecurityPolicy(origins)).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://ok.example.com"
    );
  });

  it("gives each context only its own origins", async () => {
    const provider = {
      frameOrigins: (given: { tenant: { id: string } }) =>
        Promise.resolve([`https://${given.tenant.id}.example.com`]),
    };

    await expect(collectFrameOrigins(provider, { tenant: { id: "one" } })).resolves.toEqual([
      "https://one.example.com",
    ]);
    await expect(collectFrameOrigins(provider, { tenant: { id: "two" } })).resolves.toEqual([
      "https://two.example.com",
    ]);
  });

  it("leaves frames denied when every contribution is invalid", async () => {
    const origins = await collectFrameOrigins(
      { frameOrigins: () => Promise.resolve(["*", "https:"]) },
      ctx
    );

    expect(serializeContentSecurityPolicy(origins)).toBe(BASELINE_POLICY);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, `./index.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The enforced baseline of DEC-31 as amended on 2026-09-19 (R-47, R-48). There is no
 * `default-src`, `script-src` or `style-src`, and no nonce. Strict script and style policy and
 * report-only evaluation are deferred, not Section 0 work.
 */
export const BASELINE_POLICY =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

const FRAME_ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

/**
 * A module contributes an origin, never a URL, a wildcard, a policy keyword or a header
 * fragment. Anything else is dropped, because a wildcard fallback would widen the policy.
 */
export function isFrameOrigin(value: string): boolean {
  return FRAME_ORIGIN.test(value);
}

/** Drops every invalid origin and every repeat, keeping the order the module supplied. */
export function normalizeFrameOrigins(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(isFrameOrigin))];
}

/**
 * Core owns serialization, so a module cannot replace another directive (R-48). An empty list
 * leaves frames denied.
 */
export function serializeContentSecurityPolicy(
  frameOrigins: readonly string[]
): string {
  const allowed = normalizeFrameOrigins(frameOrigins);
  const frameSrc = allowed.length === 0 ? "'none'" : allowed.join(" ");

  return `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src ${frameSrc}`;
}

/**
 * The optional module point. The Module type pins the context to `{ tenant: TenantContext }`;
 * the parameter stays generic here so this file needs no runtime import.
 */
export type FrameOriginProvider<Ctx> = {
  frameOrigins(ctx: Ctx): Promise<readonly string[]>;
};

/**
 * An omitted provider, an empty result and a provider failure all contribute nothing. A failure
 * never falls back to a wildcard or to the broad `https:` source (module contract, Content
 * security policy provider).
 */
export async function collectFrameOrigins<Ctx>(
  provider: FrameOriginProvider<Ctx> | undefined,
  ctx: Ctx
): Promise<readonly string[]> {
  if (provider === undefined) return [];

  try {
    return normalizeFrameOrigins(await provider.frameOrigins(ctx));
  } catch {
    // A failed contribution must deny frames, so the error is swallowed here on purpose. S0-05
    // owns the log line when it emits the header.
    return [];
  }
}
```

Write `README.md` for the folder: the baseline, the origin validator, the serializer and the provider collector belong here; header emission, a request read and a database call do not; it imports nothing.

- [ ] **Step 4: Run the tests green**

```bash
rtk npx nx run @genie/core:test @genie/core:lint @genie/core:typecheck --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Close phase A**

```bash
rtk pnpm format
rtk npx nx affected -t build test lint typecheck
```

Record the result on the bead. Propose the commit:

```bash
git add packages/core/src/lib/content-security-policy
git commit -m "feat(core): add the pure content security policy functions"
```

---

## Phase H — the dependency handoff

### Task 5: Prepare and hand off the contract dependency change

**Files:**
- Modify: `packages/core/package.json` (dependencies and exports)
- Modify: `pnpm-lock.yaml`
- Modify: `docs/core/tech-stack.md` (only for a dependency the document does not already name)

**Interfaces:**
- Produces: the installed types every phase B task imports.
- Consumes: the pins S0-02 agrees.

This task needs separate approval before the change is integrated. Decision 4 fixes the order: S0-03 prepares, the integration owner approves and integrates, then S0-02 rebases and takes over the Storybook dependency and configuration edits.

- [ ] **Step 1: Verify the peer and release-age facts**

```bash
npm view drizzle-orm@0.45.2 peerDependenciesMeta --json
npm view react@19.3.0 time --json
npm view @types/react@19.3.0 time --json
```

`strictPeerDependencies` is true and `autoInstallPeers` is false, so an unmet non-optional peer fails the install. Drizzle declares many peers. Confirm every one this repository does not install is marked optional. `minimumReleaseAge` is 1440 minutes and strict, so check each chosen version's own publish time, not the package's last-modified time.

If a pin fails either check, report the exact failure and the nearest acceptable version. Do not add a `minimumReleaseAgeExclude` line without approval.

- [ ] **Step 2: Agree the overlapping pins with S0-02**

Post on bead `genie-ops-center-v2-1rd.2` and `genie-ops-center-v2-1rd.3`: proposed React 19.3.0, React DOM 19.3.0, `@types/react` 19.3.0, `@types/react-dom` at the matching 19.x. Core needs the types only. The React and React DOM runtime belong to `packages/ui` and Storybook, which S0-02 owns. Wait for agreement before Step 3.

- [ ] **Step 3: Write the manifest change**

In `packages/core/package.json`, add to `dependencies`:

```json
"drizzle-orm": "0.45.2",
"pg": "8.23.0",
"zod": "4.6.5"
```

Add to `devDependencies`:

```json
"@trpc/server": "11.19.0",
"@types/pg": "8.23.1",
"@types/react": "19.3.0"
```

Placement follows the public consumer. `zod`, `drizzle-orm` and `pg` appear in values core ships and in types a module resolves at build time, so they are real dependencies. The three type packages carry no runtime code.

Add to `exports`:

```json
"./contracts": "./contracts/index.ts"
```

- [ ] **Step 4: Install and verify**

```bash
rtk pnpm install
rtk npx nx affected -t build test lint typecheck
```

Expected: the install succeeds and every target stays green.

- [ ] **Step 5: Hand off**

Record on bead `1rd.3`: the changed paths, the resolved versions, the peer and release-age evidence, and the revision. Request approval and integration. Do not continue to phase B until the change is integrated. Phase A work can continue in the meantime.

---

## Phase B — after the dependency change is integrated

### Task 6: The contracts directory

**Files:**
- Create: `packages/core/contracts/index.ts`
- Create: `packages/core/contracts/README.md`
- Test: `packages/core/contracts/index.test.ts`
- Modify: `packages/config/src/oxlint/boundaries.test.ts`

**Interfaces:**
- Produces: `CapabilityInterfaces`, `CapabilityName`, `EventContract<TName, TPayload>`, `defineEventContract(name, version, payload)`.
- Consumes: zod.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineEventContract } from "./index.ts";

describe("defineEventContract", () => {
  it("keeps the name, the version and the payload schema together", () => {
    const contract = defineEventContract(
      "placeholder.record-created",
      1,
      z.object({ recordId: z.string() })
    );

    expect(contract.name).toBe("placeholder.record-created");
    expect(contract.version).toBe(1);
    expect(contract.payload.parse({ recordId: "r1" })).toEqual({ recordId: "r1" });
  });

  it("refuses a version below one, so a payload change cannot reuse a version", () => {
    expect(() =>
      defineEventContract("placeholder.record-created", 0, z.object({}))
    ).toThrow("version");
  });
});
```

- [ ] **Step 2: Write the failing boundary fixtures**

Append to `packages/config/src/oxlint/boundaries.test.ts`:

```ts
describe("the contracts and schema subpaths", () => {
  it("lets tooling import the build-safe tenant schemas", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/core/tenant-config";\n`
    );

    expect(result.failed).toBe(false);
  });

  it("lets a module import the contracts surface", () => {
    const result = lintAt(
      "packages/modules/example/__boundary__/__boundary__.ts",
      `import "@genie/core/contracts";\n`
    );

    expect(result.failed).toBe(false);
  });

  it("lets the contracts surface import zod", () => {
    const result = lintAt(
      "packages/core/contracts/__boundary__/__boundary__.ts",
      `import "zod";\n`
    );

    expect(result.failed).toBe(false);
  });

  it("stops the contracts surface importing anything else", () => {
    const result = lintAt(
      "packages/core/contracts/__boundary__/__boundary__.ts",
      `import "node:fs";\n`
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("contracts import only zod and types (DEC-42).");
  });

  it("stops the tenant schemas importing a database driver", () => {
    const result = lintAt(
      "packages/core/src/lib/tenant-config/__boundary__/__boundary__.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);
  });

  it("stops core testing helpers importing a module", () => {
    const result = lintAt(
      "packages/core/testing/__boundary__/__boundary__.ts",
      `import "@genie/modules-placeholder";\n`
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("core never imports a module");
  });
});
```

The last two are expected to fail at first. The baseline has no rule that stops `packages/core/src/lib/tenant-config` importing `pg`, because the driver ban applies to `ui`, modules, apps, config and tooling, not to core.

- [ ] **Step 3: Run both and watch them fail**

```bash
rtk npx nx run @genie/core:test @genie/config:test --skip-nx-cache
```

Expected: FAIL. Record which of the six boundary cases already pass; a passing case is evidence, not a reason to delete the test.

- [ ] **Step 4: Add the missing boundary rule**

In `packages/config/src/oxlint/boundaries.ts`, add an entry after the core entry:

```ts
  restrict(
    ["packages/core/src/lib/tenant-config/**"],
    [
      {
        group: DRIVERS,
        message:
          "the tenant schemas stay build-safe: no driver, no connection (R-19a, R-7a).",
      },
    ]
  ),
```

Place it after the `packages/core/**` entry so the later entry wins for this folder.

- [ ] **Step 5: Write the contracts surface**

`packages/core/contracts/index.ts`:

```ts
import type { ZodType } from "zod";

/**
 * One cross-module event. Both the emitting module and every subscriber import the same contract
 * from here, so neither imports the other (DEC-42). A payload change takes a new version; a
 * version is never reshaped in place.
 */
export type EventContract<TName extends string, TPayload> = {
  readonly name: TName;
  readonly version: number;
  readonly payload: ZodType<TPayload>;
};

export function defineEventContract<TName extends string, TPayload>(
  name: TName,
  version: number,
  payload: ZodType<TPayload>
): EventContract<TName, TPayload> {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Event "${name}" has version ${version}. A version is an integer above zero.`);
  }

  return { name, version, payload };
}

/**
 * The named synchronous interfaces a module can provide and another can ask for. Section 0
 * declares the registry and adds no real capability; a capability is added here when a real
 * module needs one, in the same change that documents it in the module contract.
 */
export type CapabilityInterfaces = Record<never, never>;

export type CapabilityName = keyof CapabilityInterfaces & string;
```

`CapabilityInterfaces` is deliberately empty. Section 0 introduces no capability service, and an empty registry keeps `capability(name)` typed without inventing an interface no module asked for.

Write `README.md`: capability interfaces and cross-module event schemas belong here; a core type, a service, a module import and anything but zod do not; it imports zod and TypeScript types only.

- [ ] **Step 6: Run both green**

```bash
rtk npx nx run @genie/core:test @genie/core:lint @genie/core:typecheck @genie/config:test --skip-nx-cache
```

Expected: PASS, all six boundary cases included.

- [ ] **Step 7: Propose the commit**

```bash
git add packages/core/contracts packages/config/src/oxlint
git commit -m "feat(core): add the cross-module contracts surface"
```

---

### Task 7: The TenantContext type

**Files:**
- Create: `packages/core/src/lib/tenant-context/index.ts`
- Create: `packages/core/src/lib/tenant-context/README.md`
- Test: `packages/core/src/lib/tenant-context/index.test.ts`

**Interfaces:**
- Produces: `TenantContext`, `DeploymentEnvironment`, `FileStorageAdapter`.
- Consumes: `NodePgDatabase` from `drizzle-orm/node-postgres`.

S0-03 owns the type. S0-04 adds `createTenantContext()` in this same folder. Core exports no `db`, `settings`, `branding` or `storage` singleton (R-17).

- [ ] **Step 1: Write the failing type test**

```ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { describe, expectTypeOf, it } from "vitest";

import type { DeploymentEnvironment, TenantContext } from "./index.ts";

describe("TenantContext", () => {
  it("carries the Drizzle database over pg", () => {
    expectTypeOf<TenantContext["db"]>().toExtend<NodePgDatabase>();
  });

  it("carries the validated environment the image reads", () => {
    expectTypeOf<TenantContext["env"]>().toEqualTypeOf<DeploymentEnvironment>();
  });

  it("holds no changing reader in Section 0", () => {
    expectTypeOf<keyof TenantContext>().toEqualTypeOf<"db" | "env">();
  });
});
```

The third case is the guard for R-18. Section 1 adds `settings`, `branding` and `entitlements` as readers with a ten second expiry, and that change updates this assertion on purpose.

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, `./index.ts` does not exist.

- [ ] **Step 3: Write the type**

```ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type FileStorageAdapter = "postgres" | "s3" | "gcs" | "azure";

/**
 * The environment values the image reads, after validation (environment contract, Required).
 * Values a tenant administrator owns live in the database, never here.
 */
export type DeploymentEnvironment = {
  readonly databaseUrl: string;
  readonly publicUrl: string;
  readonly fileStorageAdapter: FileStorageAdapter;
  readonly fileMaxBytes: number;
  readonly chatAllowedOrigins: readonly string[];
  readonly authTrustedProxies: readonly string[];
  readonly lockTimeoutMs: number;
  readonly logLevel: string;
  readonly port: number;
};

/**
 * The one object every procedure, job and page reads through (DEC-34). In Section 0 it holds
 * fixed members only. Section 1 adds settings, branding and entitlements as readers that expire
 * after ten seconds (DEC-46, R-18); adding a member here is how that arrives.
 */
export type TenantContext = {
  readonly db: NodePgDatabase;
  readonly env: DeploymentEnvironment;
};
```

Write `README.md`: the tenant context type and, from S0-04, its factory belong here; a connection singleton, a settings read and a branding read do not; it imports the Drizzle node-postgres types.

- [ ] **Step 4: Run the tests green**

```bash
rtk npx nx run @genie/core:test @genie/core:lint @genie/core:typecheck --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Propose the commit**

```bash
git add packages/core/src/lib/tenant-context
git commit -m "feat(core): add the tenant context type"
```

---

### Task 8: The strict tenant-configuration schemas

**Files:**
- Create: `packages/core/src/lib/tenant-config/tenant-yaml.ts`
- Create: `packages/core/src/lib/tenant-config/branding-seed.ts`
- Modify: `packages/core/src/lib/tenant-config/index.ts`
- Test: `packages/core/src/lib/tenant-config/tenant-yaml.test.ts`
- Test: `packages/core/src/lib/tenant-config/branding-seed.test.ts`

**Interfaces:**
- Produces: `tenantYamlSchema`, `TenantYaml`, `brandingSeedSchema`, `BrandingSeed`.
- Consumes: zod.

The field lists come from DEC-35 as amended on 2026-09-17. `tenant.yaml` holds the module list, the onboarding mode, `local_accounts`, the first administrators and the break-glass email. `branding.seed.json` holds exactly the `tenant_branding` columns plus `$schema`. No value appears in both files.

- [ ] **Step 1: Write the failing tenant.yaml test**

```ts
import { describe, expect, it } from "vitest";

import { tenantYamlSchema } from "./tenant-yaml.ts";

const VALID = {
  modules: ["placeholder"],
  onboarding_mode: "invite",
  local_accounts: false,
  first_administrators: ["admin@example.com"],
  break_glass_email: "break-glass@example.com",
};

describe("tenantYamlSchema", () => {
  it("accepts a complete file", () => {
    expect(tenantYamlSchema.parse(VALID)).toEqual(VALID);
  });

  it("rejects an unknown key, so a value in the wrong file fails the generator", () => {
    const result = tenantYamlSchema.safeParse({ ...VALID, hosting_mode: "genie-hosted" });

    expect(result.success).toBe(false);
  });

  it("rejects a branding value, because branding.seed.json owns it (DEC-35)", () => {
    const result = tenantYamlSchema.safeParse({ ...VALID, company_name: "Example" });

    expect(result.success).toBe(false);
  });

  it("rejects an address that is not an email", () => {
    const result = tenantYamlSchema.safeParse({ ...VALID, break_glass_email: "not-an-email" });

    expect(result.success).toBe(false);
  });

  it("rejects an empty first administrator list", () => {
    const result = tenantYamlSchema.safeParse({ ...VALID, first_administrators: [] });

    expect(result.success).toBe(false);
  });

  it("accepts an empty module list, because a customer can select none", () => {
    expect(tenantYamlSchema.parse({ ...VALID, modules: [] }).modules).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing branding test**

```ts
import { describe, expect, it } from "vitest";

import { brandingSeedSchema } from "./branding-seed.ts";

const VALID = {
  $schema: "../../../deploy/schemas/branding.seed.schema.json",
  company_name: "Example Group",
  product_display_name: "Example Ops",
  primary_color: "#1d4ed8",
  email_sender_name: "Example Ops",
};

CORRECTION, 2026-09-21: the two blocks above and below are stale. `tenant_branding`
has no `product_display_name` column; the column is `product_name`. The seed file
also carries every `tenant_branding` column, not the five shown here. Use the
implemented schema and the field table at `.superpowers/sdd/plan/branding-field-table.md`
as the source. The block is kept so the historical evidence stays readable.

describe("brandingSeedSchema", () => {
  it("accepts a complete file with its schema key", () => {
    expect(brandingSeedSchema.parse(VALID)).toEqual(VALID);
  });

  it("rejects an unknown key", () => {
    const result = brandingSeedSchema.safeParse({ ...VALID, modules: ["placeholder"] });

    expect(result.success).toBe(false);
  });

  it("rejects a colour that is not a hex value", () => {
    const result = brandingSeedSchema.safeParse({ ...VALID, primary_color: "blue" });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, neither file exists.

- [ ] **Step 4: Write the two schemas**

`tenant-yaml.ts`:

```ts
import { z } from "zod";

const MODULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Every field here is read by the generator or by `genie-ops setup`. A value nothing reads is not
 * configuration and is not written here (DEC-35). Branding lives in branding.seed.json, the
 * hosting mode lives in the customer runbook, and the slug is the folder name.
 */
export const tenantYamlSchema = z.strictObject({
  modules: z.array(z.string().regex(MODULE_ID, "a module id is kebab-case")),
  onboarding_mode: z.enum(["invite", "jit"]),
  local_accounts: z.boolean(),
  first_administrators: z.array(z.email()).min(1),
  break_glass_email: z.email(),
});

export type TenantYaml = z.infer<typeof tenantYamlSchema>;
```

`branding-seed.ts`:

```ts
import { z } from "zod";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Exactly the tenant_branding columns, plus the `$schema` key an editor reads. The loader strips
 * `$schema` before it writes the row (DEC-35). The admin portal replaces these values after
 * go-live, so this file seeds and never governs.
 */
export const brandingSeedSchema = z.strictObject({
  $schema: z.string(),
  company_name: z.string().min(1),
  product_name: z.string().min(1),
  primary_color: z.string().regex(HEX_COLOR, "a colour is a six digit hex value"),
  email_sender_name: z.string().min(1),
  // ... and every other tenant_branding column. See the correction below.
});

export type BrandingSeed = z.infer<typeof brandingSeedSchema>;
```

CORRECTION, 2026-09-21, applied. The block above is an excerpt, not the schema.
It named `product_display_name`, but the column is `product_name`. It also
listed five fields, while DEC-35 and `docs/architecture/repository-layout.md`
line 82 require exactly the `tenant_branding` columns. The implemented schema
carries all 26 non-bookkeeping columns plus `$schema`, and rejects the two
bookkeeping columns the database owns. The field table at
`.superpowers/sdd/plan/branding-field-table.md` gives every column with its
source, its required or optional state and its supplier. One column,
`primary_foreground`, is an open question recorded in that table.

Before writing these, read `docs/architecture/data-shape.md` for the exact `tenant_branding` columns and match them. If a column is missing from the list above, add it and record the correction in the bead.

Replace the body of `index.ts` with the two re-exports, keeping the existing file comment about build safety.

- [ ] **Step 5: Run the tests green**

```bash
rtk npx nx run @genie/core:test @genie/core:lint @genie/core:typecheck --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 6: Propose the commit**

```bash
git add packages/core/src/lib/tenant-config
git commit -m "feat(core): add the strict tenant configuration schemas"
```

---

### Task 9: The seventeen point types and the Module type

**Files:**
- Create: `packages/core/src/lib/module-contract/module.ts`
- Test: `packages/core/src/lib/module-contract/module.test-d.ts`
- Test: `packages/core/src/lib/module-contract/module.test.ts`
- Create: `packages/core/src/lib/module-contract/__fixtures__/valid-module.ts`

**Interfaces:**
- Consumes: `PermissionKey`, `Scope` from `./keys.ts`; `TenantContext` from `../tenant-context/index.ts`; `FrameOriginProvider` from `../content-security-policy/index.ts`; `RequestPrincipal` from `../../services/authorization/index.ts`; `AnyTRPCRouter` from `@trpc/server`; `PgTable` from `drizzle-orm/pg-core`; `ComponentType` from `react`; `ZodObject`, `ZodType` from `zod`.
- Produces: `Module` and every point type named below.

The seventeen points and their Section 0 status come from the R-12 table. Write them in that order so a reader can check the table against the file.

- [ ] **Step 1: Write the failing type fixture**

Create `__fixtures__/valid-module.ts`, a module declaration that uses every point, typed `satisfies Module`. It declares id `fixture`, keys `fixture:read`, `fixture:use` and `fixture:admin`, one workspace entry requiring `fixture:use`, one admin entry requiring `fixture:admin`, a pinned list of three, a configuration schema with one field of each of the five kinds, and a frame-origins provider returning one HTTPS origin.

Create `module.test-d.ts` asserting the fixture assigns to `Module`, and asserting with `@ts-expect-error` that a declaration missing `identity`, and one whose `id` is not a string, both fail.

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:typecheck --skip-nx-cache
```

Expected: FAIL, `./module.ts` does not exist.

- [ ] **Step 3: Write the point types**

```ts
import type { AnyTRPCRouter } from "@trpc/server";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ComponentType } from "react";
import type { ZodObject, ZodType } from "zod";

import type { RequestPrincipal } from "../../services/authorization/index.ts";
import type { FrameOriginProvider } from "../content-security-policy/index.ts";
import type { TenantContext } from "../tenant-context/index.ts";
import type { PermissionKey, Scope } from "./keys.ts";

/** 1. Identity. */
export type ModuleIdentity = {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
};

/** 2. Schema: one Drizzle schema and its own migration history. */
export type ModuleSchema = {
  readonly tables: Readonly<Record<string, PgTable>>;
  readonly migrationsFolder: string;
  readonly migrationsTable: string;
};

/** 4. Permission keys. */
export type PermissionDeclaration = {
  readonly key: PermissionKey;
  readonly label: string;
};

/** 5. Record types. `path` is optional; core renders a link only when it is present. */
export type RecordDescriptor = {
  readonly label: string;
  readonly path?: string;
  readonly parents?: readonly Scope[];
};

export type RecordTypeDeclaration = {
  readonly type: string;
  readonly parentTypes?: readonly string[];
  resolve(id: string): Promise<RecordDescriptor | undefined>;
};

/** 6. Default roles. Declared in Section 0, seeded in Section 2. */
export type DefaultRole = {
  readonly name: string;
  readonly permissions: readonly PermissionKey[];
};

/** 7. Navigation. At most one workspace entry carries the landing flag (DEC-49). */
export type NavigationEntry = {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly surface: "workspace" | "admin";
  readonly requiredPermission: PermissionKey;
  readonly categoryId?: string;
  readonly landing?: boolean;
};

export type ModuleNavigation = {
  /** Ordered, at most six entries (module contract, Navigation row). */
  readonly pinned: readonly NavigationEntry[];
  readonly entries: readonly NavigationEntry[];
};

/** 8. Pages. */
export type ModulePages = {
  readonly workspace: Readonly<Record<string, ComponentType>>;
  readonly admin: Readonly<Record<string, ComponentType>>;
};

/** 9. Category assignment, optional. Runtime arrives in Section 3. */
export type CategoryContext = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
};

export type AssignableRecord = {
  readonly id: string;
  readonly label: string;
  readonly categoryId?: string;
};

export type CategoryAssignment = {
  listAssignable(ctx: CategoryContext): Promise<readonly AssignableRecord[]>;
  assign(ctx: CategoryContext, recordId: string, categoryId: string): Promise<void>;
  clear(ctx: CategoryContext, recordId: string): Promise<void>;
};

/** 10. Configuration schema, optional. Five field kinds only (DEC-28). */
export type ConfigFieldKind = "string" | "number" | "boolean" | "enum" | "stringList";

export type ConfigFieldMetadata = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
};

export type ConfigSectionMetadata = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  /**
   * An AND restriction on top of `core:settings:manage`, never a substitute (module contract,
   * Settings discovery and authorization).
   */
  readonly additionalPermission?: PermissionKey;
};

export type ModuleConfiguration = {
  readonly schema: ZodObject;
  readonly section: ConfigSectionMetadata;
  readonly fields: Readonly<Record<string, ConfigFieldMetadata>>;
};

/** The core permission every central Settings read and write requires. */
export const SETTINGS_BASE_PERMISSION = "core:settings:manage";

/** 11. Events, declaration-site only in Section 0. */
export type EventDeclaration = {
  readonly name: string;
  readonly version: number;
  readonly payload: ZodType;
};

/** 12. Capabilities, declaration-site only. Named against packages/core/contracts. */
export type CapabilityProvision = { readonly name: string };

/** 13. Jobs, declaration-site only. Every handler receives the tenant context (DEC-34). */
export type JobContext = { readonly tenant: TenantContext };

export type JobDeclaration<TData = never> = {
  readonly name: string;
  readonly schedule?: string;
  handler(ctx: JobContext, data: TData): Promise<void>;
};

/** 14. Inbound endpoints under /api/m/<id>/..., declaration-site only. */
export type InboundEndpoint = {
  readonly path: string;
  handle(request: Request): Promise<Response>;
};

/** 16. Content security policy, optional. Server-only, origins only. */
export type ModuleFrameOriginProvider = FrameOriginProvider<{ readonly tenant: TenantContext }>;

/** 17. Tests: the shared presets a module must use. */
export type ModuleTests = { readonly presets: readonly string[] };

/** Every point of the module contract. A module uses these and nothing else. */
export type Module = {
  readonly identity: ModuleIdentity;
  readonly schema: ModuleSchema;
  readonly router: AnyTRPCRouter;
  readonly permissions: readonly PermissionDeclaration[];
  readonly recordTypes: readonly RecordTypeDeclaration[];
  readonly defaultRoles: readonly DefaultRole[];
  readonly navigation: ModuleNavigation;
  readonly pages: ModulePages;
  readonly categoryAssignment?: CategoryAssignment;
  readonly configuration?: ModuleConfiguration;
  readonly events: readonly EventDeclaration[];
  readonly capabilities: readonly CapabilityProvision[];
  readonly jobs: readonly JobDeclaration[];
  readonly inboundEndpoints: readonly InboundEndpoint[];
  readonly integrationKinds: readonly string[];
  readonly contentSecurityPolicy?: ModuleFrameOriginProvider;
  readonly tests: ModuleTests;
};
```

If an anti-slop rule rejects one of these shapes, reproduce the failure, add the narrowest documented exception under R-5a naming the rule and the reason, and verify through lint that the exception is needed.

- [ ] **Step 4: Run typecheck and lint green**

```bash
rtk npx nx run @genie/core:typecheck @genie/core:lint @genie/core:test --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Propose the commit**

```bash
git add packages/core/src/lib/module-contract
git commit -m "feat(core): add the module contract point types"
```

---

### Task 10: The runtime contract validator

**Files:**
- Create: `packages/core/src/lib/module-contract/validate.ts`
- Modify: `packages/core/src/lib/module-contract/index.ts`
- Test: `packages/core/src/lib/module-contract/validate.test.ts`
- Create: `packages/core/src/lib/module-contract/__fixtures__/invalid-modules.ts`

**Interfaces:**
- Consumes: `Module` and its point types from `./module.ts`, `isPermissionKey` from `./keys.ts`.
- Produces: `validateModule(module)` returning `readonly string[]` of problems, and `validateRegistry(modules)` for the checks that span modules.

A validator that returns problems rather than throwing lets one test list every failure a fixture has.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { validModule } from "./__fixtures__/valid-module.ts";
import { validateModule, validateRegistry } from "./validate.ts";

describe("validateModule", () => {
  it("accepts the valid fixture", () => {
    expect(validateModule(validModule)).toEqual([]);
  });

  it("rejects an identifier that is not kebab-case", () => {
    const broken = { ...validModule, identity: { ...validModule.identity, id: "Fixture" } };

    expect(validateModule(broken).join(" ")).toContain("kebab-case");
  });

  it("rejects a key that does not start with the module id", () => {
    const broken = {
      ...validModule,
      permissions: [...validModule.permissions, { key: "other:read" as const, label: "Other" }],
    };

    expect(validateModule(broken).join(" ")).toContain("other:read");
  });

  it("rejects a workspace entry without the use key", () => {
    const broken = {
      ...validModule,
      permissions: validModule.permissions.filter((p) => p.key !== "fixture:use"),
    };

    expect(validateModule(broken).join(" ")).toContain("fixture:use");
  });

  it("rejects an admin page without the admin key", () => {
    const broken = {
      ...validModule,
      permissions: validModule.permissions.filter((p) => p.key !== "fixture:admin"),
    };

    expect(validateModule(broken).join(" ")).toContain("fixture:admin");
  });

  it("rejects a pinned list of seven", () => {
    const entry = validModule.navigation.entries[0];
    const broken = {
      ...validModule,
      navigation: { ...validModule.navigation, pinned: Array.from({ length: 7 }, () => entry) },
    };

    expect(validateModule(broken).join(" ")).toContain("six");
  });

  it("accepts a pinned list of six", () => {
    const entry = validModule.navigation.entries[0];
    const ok = {
      ...validModule,
      navigation: { ...validModule.navigation, pinned: Array.from({ length: 6 }, () => entry) },
    };

    expect(validateModule(ok)).toEqual([]);
  });

  it("rejects a sixth configuration field kind", () => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        schema: z.object({ when: z.date() }),
      },
    };

    expect(validateModule(broken).join(" ")).toContain("field kind");
  });

  it("accepts all five configuration field kinds", () => {
    expect(validateModule(validModule)).toEqual([]);
  });

  it("accepts a record resolver that returns no path", () => {
    const ok = {
      ...validModule,
      recordTypes: [
        {
          type: "fixture-record",
          resolve: () => Promise.resolve({ label: "One" }),
        },
      ],
    };

    expect(validateModule(ok)).toEqual([]);
  });

  it("accepts an omitted category provider and an omitted configuration", () => {
    const ok = { ...validModule, categoryAssignment: undefined, configuration: undefined };

    expect(validateModule(ok)).toEqual([]);
  });

  it("rejects a settings section whose additional permission is not a module key", () => {
    const broken = {
      ...validModule,
      configuration: {
        ...validModule.configuration,
        section: { ...validModule.configuration.section, additionalPermission: "nope" as never },
      },
    };

    expect(validateModule(broken).join(" ")).toContain("additional permission");
  });
});

describe("validateRegistry", () => {
  it("accepts one landing flag across two modules", () => {
    const landing = withLanding(validModule, "fixture");
    const plain = rename(validModule, "second");

    expect(validateRegistry([landing, plain])).toEqual([]);
  });

  it("accepts zero landing flags", () => {
    expect(validateRegistry([validModule, rename(validModule, "second")])).toEqual([]);
  });

  it("rejects two landing flags across two modules", () => {
    const first = withLanding(validModule, "fixture");
    const second = withLanding(rename(validModule, "second"), "second");

    expect(validateRegistry([first, second]).join(" ")).toContain("landing");
  });

  it("rejects two modules with the same id", () => {
    expect(validateRegistry([validModule, validModule]).join(" ")).toContain("fixture");
  });
});
```

Write `rename(module, id)` and `withLanding(module, id)` in `__fixtures__/invalid-modules.ts`. `rename` rewrites the identity and every permission key prefix. `withLanding` sets `landing: true` on the first workspace entry.

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, `./validate.ts` does not exist.

- [ ] **Step 3: Write the validator**

The field-kind check walks the configuration schema with zod 4 introspection. `schema._zod.def.type` names the kind, and an array is a string list only when its element type is `string`.

```ts
import type { $ZodTypes } from "zod/v4/core";
import type { ZodType } from "zod";

import type { Module } from "./module.ts";
import { isPermissionKey } from "./keys.ts";

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const MAX_PINNED = 6;

function fieldKind(schema: ZodType): string | undefined {
  // SAFETY: zod exposes the discriminant on _zod.def.type for every schema class. R-5a permits
  // this narrow framework-contract exception; the alternative is a type assertion per branch.
  const def = (schema as unknown as $ZodTypes)._zod.def;

  if (def.type === "string") return "string";

  if (def.type === "number") return "number";

  if (def.type === "boolean") return "boolean";

  if (def.type === "enum") return "enum";

  if (def.type === "array") {
    const element = (def.element as unknown as $ZodTypes)._zod.def;

    return element.type === "string" ? "stringList" : undefined;
  }

  return undefined;
}

export function validateModule(module: Module): readonly string[] {
  const problems: string[] = [];
  const id = module.identity.id;

  if (!KEBAB_CASE.test(id)) {
    problems.push(`Module id "${id}" is not kebab-case.`);
  }

  const declared = new Set(module.permissions.map((entry) => entry.key));

  for (const entry of module.permissions) {
    if (!isPermissionKey(entry.key) || !entry.key.startsWith(`${id}:`)) {
      problems.push(`Permission key "${entry.key}" is not "${id}:<action>".`);
    }
  }

  const workspace = module.navigation.entries.filter((e) => e.surface === "workspace");
  const admin = module.navigation.entries.filter((e) => e.surface === "admin");

  if (workspace.length > 0 && !declared.has(`${id}:use`)) {
    problems.push(`A module with a workspace entry declares "${id}:use" (DEC-50).`);
  }

  for (const entry of workspace) {
    if (entry.requiredPermission !== `${id}:use`) {
      problems.push(`Workspace entry "${entry.id}" must require "${id}:use" (DEC-50).`);
    }
  }

  if (admin.length > 0 && !declared.has(`${id}:admin`)) {
    problems.push(`A module with an admin page declares "${id}:admin" (DEC-23).`);
  }

  if (module.navigation.pinned.length > MAX_PINNED) {
    problems.push(
      `The pinned list holds ${module.navigation.pinned.length} entries. The maximum is six.`
    );
  }

  if (module.navigation.entries.filter((e) => e.landing === true).length > 1) {
    problems.push(`Module "${id}" flags more than one landing route (DEC-49).`);
  }

  const configuration = module.configuration;

  if (configuration !== undefined) {
    const additional = configuration.section.additionalPermission;

    if (additional !== undefined && !isPermissionKey(additional)) {
      problems.push(`The additional permission "${additional}" is not a module key.`);
    }

    // SAFETY: the same narrow framework-contract exception as fieldKind above.
    const shape = (configuration.schema as unknown as $ZodTypes)._zod.def.shape;

    for (const [name, field] of Object.entries(shape)) {
      if (fieldKind(field as ZodType) === undefined) {
        problems.push(
          `Field "${name}" uses a field kind ConfigForm does not render. The five kinds are string, number, boolean, enum and string list (DEC-28).`
        );
      }
    }
  }

  return problems;
}

/** The checks that span a whole selected registry. */
export function validateRegistry(modules: readonly Module[]): readonly string[] {
  const problems = modules.flatMap((module) => validateModule(module));
  const seen = new Set<string>();

  for (const module of modules) {
    if (seen.has(module.identity.id)) {
      problems.push(`Module id "${module.identity.id}" appears twice in the registry.`);
    }

    seen.add(module.identity.id);
  }

  const landing = modules.flatMap((module) =>
    module.navigation.entries.filter((entry) => entry.landing === true)
  );

  if (landing.length > 1) {
    problems.push(`${landing.length} modules flag a landing route. At most one does (DEC-49).`);
  }

  return problems;
}
```

Confirm the `zod/v4/core` import path against the installed package before relying on it. If the published subpath differs, use whatever `@zod/core` type entry the installed version exposes and record the correction.

- [ ] **Step 4: Run the tests green**

```bash
rtk npx nx run @genie/core:test @genie/core:lint @genie/core:typecheck --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Propose the commit**

```bash
git add packages/core/src/lib/module-contract
git commit -m "feat(core): add the module contract validator"
```

---

### Task 11: The build-safety proof

**Files:**
- Create: `packages/core/src/lib/build-safety/detect-initialization.ts`
- Create: `packages/core/src/lib/build-safety/README.md`
- Test: `packages/core/src/lib/build-safety/index.test.ts`
- Create: `packages/core/src/lib/build-safety/__fixtures__/imports-driver.ts`
- Create: `packages/core/src/lib/build-safety/__fixtures__/opens-connection.ts`

**Interfaces:**
- Consumes: `node:module`, `node:net`, `node:dns`.
- Produces: the preload entry a probe process registers, and its report file.

Two detectors run together. Each has its own negative control, because a driver import opens no socket and a lazy pool construction opens none either.

| Detector | Watches | Control that must trip it |
| --- | --- | --- |
| Module graph | a forbidden specifier resolving during the import | `imports-driver.ts`, which imports `pg` and does nothing else |
| Connection activity | a socket connect or a DNS lookup | `opens-connection.ts`, which constructs a pool and issues a query |

- [ ] **Step 1: Write the preload entry**

`detect-initialization.ts` registers synchronous hooks and patches the two call sites, then writes a report at exit. Node 26 uses `module.registerHooks()`; `module.register()` is runtime-deprecated from Node 25.9.0 and must not be used.

```ts
import { lookup } from "node:dns";
import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { Socket } from "node:net";

const FORBIDDEN = ["pg", "drizzle-orm/node-postgres", "pg-pool"];

const resolved: string[] = [];
const connections: string[] = [];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (FORBIDDEN.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
      resolved.push(specifier);
    }

    return nextResolve(specifier, context);
  },
});

const connect = Socket.prototype.connect;

Socket.prototype.connect = function patched(...args: Parameters<typeof connect>) {
  connections.push("socket");

  return connect.apply(this, args);
};

process.on("exit", () => {
  writeFileSync(
    process.env.GENIE_PROBE_REPORT ?? "probe-report.json",
    JSON.stringify({ resolved, connections }),
    "utf8"
  );
});

export { lookup };
```

Patch `dns.lookup` the same way and record into `connections`. Keep the export so the module is not tree-shaken.

- [ ] **Step 2: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, probe } from "../../__testing__/target-probe.ts";

const NODE = process.execPath;
const PRELOAD = join(
  WORKSPACE_ROOT,
  "packages/core/src/lib/build-safety/detect-initialization.ts"
);

function runProbe(entrySource: string) {
  const result = probe(
    [{ path: "entry.ts", source: entrySource }],
    NODE,
    ["--experimental-strip-types", "--import", PRELOAD, "entry.ts"]
  );
  const report: { resolved: readonly string[]; connections: readonly string[] } = JSON.parse(
    readFileSync(join(result.root, "probe-report.json"), "utf8")
  );

  return { ...result, report };
}

describe("the detectors", () => {
  it("reports a driver import, which opens no socket", () => {
    const run = runProbe(`import "pg";\n`);

    expect(run.report.resolved).toContain("pg");
    expect(run.report.connections).toEqual([]);
  });

  it("reports a real connection attempt", () => {
    const run = runProbe(
      `import pg from "pg";\n` +
        `const pool = new pg.Pool({ connectionString: "postgres://u@127.0.0.1:1/x" });\n` +
        `try { await pool.query("select 1"); } catch {}\n`
    );

    expect(run.report.connections.length).toBeGreaterThan(0);
  });
});

describe("the build-safe entrypoints", () => {
  const CLEARED = [
    "DATABASE_URL",
    "PUBLIC_URL",
    "KEYCLOAK_URL",
    "BETTER_AUTH_SECRET",
  ];

  it.each(["@genie/core/tenant-config", "@genie/core/contracts"])(
    "imports %s with no deployment variable and starts nothing",
    (specifier) => {
      for (const name of CLEARED) delete process.env[name];

      const run = runProbe(`await import(${JSON.stringify(specifier)});\n`);

      expect(run.failed).toBe(false);
      expect(run.report.resolved).toEqual([]);
      expect(run.report.connections).toEqual([]);
    }
  );
});
```

The two control cases run first. If either detector stays silent for its own control, the test fails and the entrypoint result means nothing.

- [ ] **Step 3: Run it and watch it fail**

```bash
rtk npx nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, the preload entry does not exist. Confirm the TypeScript strip-types flag Node 26 uses before relying on it; if the flag has changed, compile the fixture instead of stripping.

- [ ] **Step 4: Make both controls trip and both entrypoints clean**

Adjust the preload entry until the two control cases pass. Only then read the entrypoint result.

- [ ] **Step 5: Run the whole suite green**

```bash
rtk pnpm format
rtk npx nx affected -t build test lint typecheck
```

Expected: PASS.

- [ ] **Step 6: Propose the commit**

```bash
git add packages/core/src/lib/build-safety
git commit -m "test(core): prove the build-safe entrypoints start no service"
```

---

## Coverage against the ticket

| Ticket requirement | Task |
| --- | --- |
| Positive and negative fixtures for all contract points | 9, 10 |
| Exactly five field kinds, sixth rejected | 10 |
| Permission declarations, workspace use key, admin key | 10 |
| Pinned maximum six, and six accepted | 10 |
| Zero and duplicate landing flags | 10 |
| Optional record-resolver path | 10 |
| Categories provider and Settings metadata, additional permission as AND | 9, 10 |
| One lazy loader read per request, request isolation, placeholder-only grant | 3 |
| Omitted, empty, duplicate, invalid, throwing CSP providers, two contexts | 4 |
| Schema imports need no deployment environment and start no service | 11 |
| Import boundaries hold, both directions, including the schema subpath | 6 |
| Contract files participate in lint, typecheck and test collection | 1 |
| Build-safe TenantContext type | 7 |
| Strict tenant.yaml and branding seed schemas | 8 |

## Open items for the owner

1. The ticket acceptance line says "testing code and schema subpath". R-39 reserves `packages/core/testing` for S0-04 and S0-07, so this plan proves the import direction for that path with a planted lint fixture and creates neither the folder nor a `./testing` export. Confirm that reading.
2. The S0-02 owner has to agree the React and React types pin before Task 5 completes.
3. Whether the target-coverage harness later moves to a neutral location is S0-08's decision.

## Self-review notes

- Spec coverage: every requirement the ticket traces has a task in the table above. R-17's factory and R-15's placeholder belong to S0-04 and are named as out of scope.
- Placeholders: none. Three steps say to confirm a library detail against the installed version before relying on it; each names the exact fallback.
- Type consistency: `PermissionKey`, `ScopeSet`, `RequestPrincipal`, `TenantContext`, `FrameOriginProvider` and `Module` are defined once and imported by the tasks that use them, with the same spelling throughout.
