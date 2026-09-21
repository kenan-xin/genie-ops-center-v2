# S0-05 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the production Next.js application, its generated module registry, one minimal image, and the minimal enforced security headers, and prove all of it on the actual built image.

**Architecture:** One process serves everything. The framework bootstrap hook validates configuration, builds one tenant context and runs migrations, then publishes the context under a process-global key so every separately compiled bundle reads the same object. The framework header configuration emits the deny baseline on every path, and the proxy file replaces `frame-src` on the one exact viewer route.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3.0, tRPC 11.19.0, TanStack Query 5.x, next-intl, Tailwind CSS 4.3.3, Drizzle 0.45.2 over node-postgres 8.23.0, Vitest 4.1.11, Playwright 1.63.0, Node 26.

**Spec:** [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [this ticket](index.md), and the measured basis in [the native composition spike](native-composition-spike.md).

**Bead:** `genie-ops-center-v2-1rd.5`, with owned children `genie-ops-center-v2-yt2` and `genie-ops-center-v2-3yv`.

## Revision 3: adversarial review disposition

Two independent adversarial reviews have run. Revision 2 answered the first. Revision 3 answers the second, which found that revision 2 was not ready.

### What the second review found, and what revision 3 did

| Finding | Verdict | Fix in revision 3 |
| --- | --- | --- |
| The proxy still reached the database driver indirectly | Correct, and the most serious. `proxy.ts` imported `viewerRouteFor`, which imported `moduleById` from the registry, which imports the compiled declarations. The placeholder declaration imports its router, and the router imports the `@genie/core` root, which re-exports the tenant context and therefore `pg`. The `./security` subpath fixed the direct import and left the indirect one, so the bundle assertion in Task 7 would have failed | `viewer-routes.ts` now imports nothing. The caller passes the set of module ids that declared a provider, which the proxy reads from the context slot the bootstrap filled |
| `viewerRouteFor` did not typecheck | Correct. `noUncheckedIndexedAccess` types a capture group as `string \| undefined` | The capture is guarded before use |
| Amendment B's application redirect was never implemented | Correct. Revision 2 removed the redirect branch while rewriting the proxy, so nothing proved a header-carrying application redirect | The proxy owns an explicit redirect table, sets all five headers on the response, and a test asserts them |
| The failing-migration test discarded the logs it asserted | Correct. `docker run --rm -d` removes the container the instant it exits, so `docker logs` returned nothing and the assertion passed vacuously | `startImage` no longer uses `--rm`. The container is removed explicitly after its logs are read |
| AC-26 ordering was never established | Correct. Nothing delayed the migration, so the ordering was asserted rather than observed | Two tests now hold the migrator's own advisory lock from the test process. One proves that health, the page, tRPC and the viewer are all unanswered while the lock is held, that no provider ran, and that readiness follows release. The other lets the lock time out and asserts a nonzero container exit |
| The skipped-test control could not fail | Correct. `--allowOnly` governs `.only` and has no effect on `.skip` | The suite guards its own execution with an `afterAll` that throws when the isolation case did not run |
| `as never` fixtures hid contract regressions | Correct | Fixtures derive from the real placeholder declaration, so a contract change breaks compilation instead of passing silently |
| `test:integration` had no Nx defaults | Correct | `nx.json` gains the target with caching off, because a cached pass would report success without a container ever starting |

The second review also confirmed as sound: the registry page mounting, the `./security` subpath design itself, the bootstrap's logger ordering, `db.execute` usage, the pino log grep, the `RSC` header, and the Playwright route interception and framing assumptions.

### Revision 2: first review disposition

An independent adversarial review of revision 1 raised thirteen findings. Each was rechecked against current source before revision 2 changed anything. The table separates what the source confirms from what stays a suspicion.

### Confirmed by reading source, fixed in this revision

| Finding | Evidence | Fix |
| --- | --- | --- |
| The planned presentation imports do not exist and the props are wrong | `packages/modules/placeholder/src/presentation/index.ts` exports `AdminPage`, `WorkspacePage` and `PlaceholderRecordView` only. `PlaceholderWorkspacePage` lives in `module-pages.tsx`, is not exported from the package entry point, and takes no props | Task 6 mounts the page the module registered, through the registry |
| Registry diagnostics are computed and discarded | `validateRegistry(modules): readonly string[]` returns `problems` at `validate.ts:252` | Task 2 throws when the array is not empty |
| The bespoke landing-route check duplicates validated behavior | `validate.ts:246` already reports `N modules flag a landing route. At most one does` | Task 2 deletes `assertOneLandingRoute` and proves R-23a through `validateRegistry` |
| Selected-id validation is dead code | The generated file emitted values only, so nothing could call it | Task 2 emits the resolved ids and calls the check at module load |
| The isolation test sits in no gate | Root `test` is `nx run-many -t test validate`, and the shared unit preset excludes `testing/**` | Task 8 adds `test:integration` to the required gate and proves an empty run fails |
| The Docker build copies a directory that does not exist | `apps/genie/public` is absent | Task 1 creates it and Task 3 keeps the copy honest |
| No ordinary route uses the error helper | Task 4 defined it with no consumer | Task 4 adds a real failing route and exercises it over HTTP |
| Provider-call counting had no measurement | The browser fixture counted frame requests, not provider calls | Task 3 wraps each provider with a counter and Task 9 asserts the counts from container logs |
| AC-26 was prose | Only a health poll existed | Task 3 and Task 9 supply executable image tests for each clause |
| Excluded-module absence was never exercised | Only `MODULE_INCLUDE=placeholder` was built | Task 9 builds an explicitly empty image and inspects it |
| The standard tRPC client was never used | Only the formatter was called directly | Task 4 adds a real `@trpc/client` round trip |
| Browser acceptance named files without contents | Task 9 listed paths only | Task 9 now carries the specs and the run command |

### Investigated, and the outcome

**Nx target inference.** `pnpm exec nx show project @genie/app --json` shows every target today comes from a package script through the `nx:run-script` executor, grouped under `NPM Scripts`, merged with `targetDefaults`. Adding a `generate-registry` script therefore does create a target. What revision 1 assumed without proof is that the `nx` block in `package.json` merges `dependsOn` onto that inferred target. Task 2 now verifies the merged graph with a command before relying on it, and proves generation through a clean `typecheck` and `build` rather than by invoking generation directly.

**The proxy pulling the database driver.** The concern is real and this revision removes it rather than measuring it. `packages/core/src/index.ts` re-exports `./lib/tenant-context/index.ts`, which imports `pg` and `drizzle-orm/node-postgres`, so any import of the `@genie/core` root entry point puts the driver in the importing bundle's graph. `packages/core/src/lib/content-security-policy/index.ts` has zero imports, so it is safe to expose on its own. Task 3 adds a build-safe `./security` subpath beside the existing `./contracts` and `./tenant-config`, and Task 7's proxy imports only that subpath plus a type-only import. Everything the proxy needs from the runtime, the provider map and the failure reporter, is published by the bootstrap into the context slot. Task 7 then inspects the built proxy bundle and asserts the driver is absent, so the claim is measured rather than argued.

## Global constraints

These apply to every task below. Values are copied from the approved documents.

- Format with **oxfmt**, lint with **oxlint**, typecheck with **tsc --noEmit**. Never Prettier, Biome, ESLint or typescript-eslint. Run through Nx: `nx affected -t build test lint typecheck`.
- Import direction: `ui` imports nothing internal, `core` imports `ui`, a module imports `core` and `ui`, the app imports everything. A module never imports another module.
- `pg` and `drizzle-orm/node-postgres` are banned imports outside core. The app reaches the database only through `ctx.tenant.db`.
- Authorization goes through `can()` and `scopesFor()` only. The Section 0 stub grants `placeholder:read` and nothing else. Do not broaden it.
- `MODULE_INCLUDE` is the only Docker build argument. The image holds no credential and no secret.
- `apps/genie/src/modules.ts` is generated and gitignored. Never commit it and never edit it by hand.
- The baseline policy is exactly `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'`. No `default-src`, no `script-src`, no `style-src`, no nonce.
- Never set `experimental.testProxy`. Never set `NEXT_PRIVATE_TEST_PROXY`. No file tracing workaround.
- The viewer route mapping is an exact server-owned mapping, never a path prefix.
- Readiness is a successful `GET /api/health` response. Transport connectivity is not readiness, and the framework's ready log line is not readiness.
- Every new dependency must already appear in [the technology stack](../../../core/tech-stack.md). Adding one that does not requires an entry in the same change.
- Sections 1 to 5 business services and design imports stay out. No custom server, extra pool, internal HTTP workaround, strict nonce policy or report-only subsystem.
- Commits follow Conventional Commits, imperative, under 72 characters. Never commit on `develop` or `main`.
- Branch and worktree: `feature/s0-05-production-startup-csp` at `/home/kenan/work/genie-ops-center-v2.feature-s0-05-production-startup-csp`, based on develop `7037ca4`.
- No code push, publication, deployment, host-service change or live-hook activation.

## File structure

New and modified files, with the responsibility of each.

| Path | Responsibility |
| --- | --- |
| `apps/genie/package.json` | App manifest, dependencies, `build` and `start` scripts, Nx target metadata |
| `apps/genie/next.config.ts` | Standalone output, universal header rules, `skipTrailingSlashRedirect` |
| `apps/genie/tsconfig.json` | Adds JSX and the DOM library for the app only |
| `apps/genie/tailwind.config.ts` | The first real consumer of the shared preset |
| `apps/genie/src/styles/globals.css` | The application stylesheet that loads Tailwind and the config |
| `apps/genie/src/context.ts` | The application-owned context seam. Publishes and reads the process-global context. Initializes nothing on import |
| `apps/genie/src/bootstrap.ts` | Node-only bootstrap: validate, build context, migrate, publish, or fail and exit |
| `apps/genie/src/instrumentation.ts` | The framework hook. Guards to the Node runtime and defers to `bootstrap.ts` |
| `apps/genie/src/proxy.ts` | Viewer policy replacement on the exact viewer route, and application redirects |
| `apps/genie/src/viewer-routes.ts` | The exact server-owned viewer route mapping, pure and testable |
| `apps/genie/src/registry.ts` | Application-owned validation of the generated registry |
| `apps/genie/src/modules.ts` | Generated, gitignored. Never edited by hand |
| `apps/genie/src/trpc/root.ts` | Root router assembled from the registry |
| `apps/genie/src/trpc/init.ts` | tRPC instance and the one `errorFormatter` |
| `apps/genie/src/http-errors.ts` | The ordinary route-handler error helper |
| `apps/genie/src/request-id.ts` | One request id per request, shared by log and response |
| `apps/genie/src/messages/en.json` | The English catalogue |
| `apps/genie/src/i18n/request.ts` | The catalogue wiring, so every string resolves through next-intl (R-43) |
| `apps/genie/src/app/**` | Layout, ordinary document, placeholder pages, viewer page, health and tRPC routes |
| `apps/genie/testing/**` | The two-database isolation test and built-image harness |
| `apps/genie/e2e/**` | Playwright projects, browser proof, axe |
| `apps/genie/tools/generate-registry.ts` | The app-owned generation entry point |
| `tools/generators/src/registry/emit.ts` | Data-only registry text emitter |
| `packages/ui/src/navigation/*` | Story-first navigation component |
| `packages/core/src/index.ts` | Adds the policy exports and the logger type the app needs |
| `packages/core/src/lib/content-security-policy/index.ts` | Gains the optional failure callback for `yt2` |
| `deploy/Dockerfile`, `deploy/entrypoint.sh`, `.dockerignore` | One image, flag dispatch, app path only |

---

## Task 1: Application skeleton and the first real Tailwind consumer

Closes the compile half of `genie-ops-center-v2-3yv`.

**Files:**
- Modify: `apps/genie/package.json`
- Modify: `apps/genie/tsconfig.json`
- Create: `apps/genie/next.config.ts`
- Create: `apps/genie/tailwind.config.ts`
- Create: `apps/genie/src/styles/globals.css`
- Create: `apps/genie/src/app/layout.tsx`
- Create: `apps/genie/src/app/page.tsx`
- Create: `apps/genie/public/.gitkeep` and `apps/genie/public/probe.txt`
- Test: `apps/genie/src/styles/tailwind-preset.test.ts`
- Modify: root `package.json` and `pnpm-lock.yaml` only if a dependency move is required

**Interfaces:**
- Consumes: `tailwindPreset` from `@genie/config/tailwind`.
- Produces: a buildable app with `nx run @genie/app:build`, and `apps/genie/src/styles/globals.css` as the stylesheet later tasks import.

- [ ] **Step 1: Record the exact shared-file paths before editing**

Write the paths you are about to touch into the bead, because this stage is the sole shared-file writer:

```bash
bd --actor claude-s0-05-2026-09-21 update genie-ops-center-v2-1rd.5 --append-notes \
  "Slice 1 shared-file window: apps/genie/package.json, apps/genie/tsconfig.json, pnpm-lock.yaml. No root manifest, nx.json or shared preset change."
```

- [ ] **Step 2: Confirm the Tailwind 4 compile API before writing the test**

The preset is a JavaScript config object and Tailwind 4 is CSS-first. Look up the current `compile` entry point and the shape it returns with the context7 tool for `tailwindcss`, version 4.3.3. Do not write the test from memory. Record the confirmed signature in a comment in the test file.

- [ ] **Step 3: Write the failing preset-consumption test**

This is the proof `3yv` requires. An object-shape assertion is explicitly not enough. The test compiles the real stylesheet and asserts that the preset's own `content` glob reached the compiler's source list.

```ts
// apps/genie/src/styles/tailwind-preset.test.ts
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { tailwindPreset } from "@genie/config/tailwind";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");

describe("the application stylesheet", () => {
  it("loads the shared preset through the real compiler", async () => {
    const css = await readFile(resolve(here, "globals.css"), "utf8");

    const compiled = await compile(css, {
      base: appRoot,
      loadModule: async (id, base) => {
        const module = await import(resolve(base, id));
        return { base: dirname(resolve(base, id)), module: module.default ?? module };
      },
    });

    const patterns = compiled.sources.map((source) => source.pattern);

    // The preset declares this glob. If the consumer stopped reading the preset,
    // the glob disappears and this fails, which is the regression 3yv describes.
    expect(tailwindPreset.content).toBeDefined();
    expect(patterns).toContain("./src/**/*.{ts,tsx}");
  });
});
```

- [ ] **Step 4: Run it and watch it fail for the right reason**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: FAIL because `globals.css` and `tailwind.config.ts` do not exist. A missing-file failure is acceptable red evidence only for this first step, because the file under test is the artifact being created. Every later red step must fail on an assertion.

- [ ] **Step 5: Create the Tailwind config that consumes the preset**

```ts
// apps/genie/tailwind.config.ts
import { tailwindPreset } from "@genie/config/tailwind";
import type { Config } from "tailwindcss";

/** The first real consumer of the shared preset (genie-ops-center-v2-3yv). */
export default {
  presets: [tailwindPreset],
  content: ["./src/**/*.{ts,tsx}"],
} satisfies Config;
```

- [ ] **Step 6: Create the stylesheet**

```css
/* apps/genie/src/styles/globals.css */
@import "tailwindcss";
@config "../../tailwind.config.ts";
```

- [ ] **Step 7: Add the app dependencies and scripts**

Edit `apps/genie/package.json`. Keep the existing `lint`, `test` and `typecheck` scripts and the `app` tag.

```json
{
  "scripts": {
    "build": "next build",
    "start": "node tools/start-standalone.mjs",
    "lint": "oxlint --config ../../oxlint.config.ts src",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@genie/core": "workspace:*",
    "@genie/ui": "workspace:*",
    "@genie/module-placeholder": "workspace:*",
    "@tanstack/react-query": "5.90.2",
    "@trpc/client": "11.19.0",
    "@trpc/server": "11.19.0",
    "@trpc/tanstack-react-query": "11.19.0",
    "next": "16.3.5",
    "next-intl": "4.3.12",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@genie/config": "workspace:*",
    "@genie/generators": "workspace:*",
    "oxlint": "1.83.0",
    "tailwindcss": "4.3.3",
    "vitest": "4.1.11"
  }
}
```

Before installing, check each version against the registry and the supply-chain rule in `pnpm-workspace.yaml`: `minimumReleaseAge` is 1440 minutes with `minimumReleaseAgeStrict: true`. If a version is too fresh, pick the newest version older than one day and record why. Record the published dates in the bead, as S0-04 did in its dependency evidence.

- [ ] **Step 8: Add JSX and the DOM library for the app only**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "plugins": [{ "name": "next" }]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "next.config.ts", "tailwind.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 9: Create the minimal Next configuration**

Headers arrive in Task 7. This version carries only what Task 1 needs, plus the two settings the spike proved are required.

```ts
// apps/genie/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The framework's own trailing-slash redirect carries no headers. Removing it
  // makes both spellings of a route ordinary responses (R-47 amendment).
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
```

- [ ] **Step 10: Create the smallest layout and page that compile**

```tsx
// apps/genie/src/app/layout.tsx
import type { ReactNode } from "react";

import "../styles/globals.css";

export const metadata = { title: "Genie Ops Center" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// apps/genie/src/app/page.tsx
export default function HomePage() {
  return <main>Genie Ops Center</main>;
}
```

Create the public directory in the same step. The image copies it, and R-50 needs a public asset to check headers against, so it must exist and must not be empty:

```bash
mkdir -p apps/genie/public
printf 'public asset for header verification\n' > apps/genie/public/probe.txt
touch apps/genie/public/.gitkeep
```

- [ ] **Step 11: Install and run the test until it passes**

```bash
pnpm install
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: PASS, with the preset glob found in the compiled sources.

- [ ] **Step 12: Prove the build works with no deployment values present**

This is the first half of AC-26. The command must succeed with no database and no deployment variables.

```bash
env -u DATABASE_URL -u PUBLIC_URL pnpm exec nx run @genie/app:build --skip-nx-cache
```

Expected: exit 0, and `apps/genie/.next/standalone` exists.

The build must also be free of CSS warnings, and the emitted stylesheet must contain real Tailwind output. Tailwind 4 reaches the Next build only through `@tailwindcss/postcss`; without `apps/genie/postcss.config.mjs` the framework treats the stylesheet as plain CSS, reports `Unknown at rule: @config`, and never reads the shared preset, however well a direct compile behaves in a unit test:

```bash
env -u DATABASE_URL -u PUBLIC_URL pnpm exec nx run @genie/app:build --skip-nx-cache 2>&1 \
  | grep -i "unknown at rule" && { echo "FAIL: Tailwind is not processed by the build"; exit 1; }

CSS=$(find apps/genie/.next/static -name '*.css' | head -1)
test -n "$CSS" || { echo "FAIL: the build emitted no stylesheet"; exit 1; }
grep -q "@layer theme" "$CSS" || { echo "FAIL: the stylesheet holds no Tailwind output"; exit 1; }
echo "stylesheet: $CSS ($(wc -c < "$CSS") bytes)"
```

Expected: no warning, and a stylesheet holding Tailwind's theme layer. An unprocessed stylesheet is about 60 bytes and contains neither.

- [ ] **Step 13: Run the affected gates**

```bash
pnpm exec nx affected -t build test lint typecheck --skip-nx-cache
pnpm exec oxfmt --check --disable-nested-config
```

- [ ] **Step 14: Commit**

```bash
git add apps/genie package.json pnpm-lock.yaml
git commit -m "feat(app): add the next application and the first tailwind consumer"
```

---

## Task 2: Generated module registry

**Files:**
- Create: `tools/generators/src/registry/emit.ts`
- Create: `tools/generators/src/registry/emit.test.ts`
- Modify: `tools/generators/src/selection/index.ts` (re-export the emitter)
- Create: `apps/genie/tools/generate-registry.ts`
- Create: `apps/genie/src/registry.ts`
- Create: `apps/genie/src/registry.test.ts`
- Modify: `apps/genie/package.json` (add the `generate-registry` script and target dependencies)

**Interfaces:**
- Consumes: `readModuleInventory(workspaceRoot)`, `resolveModuleSelection({ moduleInclude, inventory, workspaceRoot })`, `ModuleSelection` and `ModuleInventoryEntry` from `@genie/generators`; `validateRegistry` and `Module` from `@genie/core`.
- Produces: `emitRegistryModule(selection): string`, and from `apps/genie/src/registry.ts` the values `modules: readonly Module[]` and `moduleById: ReadonlyMap<string, Module>`.

- [ ] **Step 1: Write the failing emitter test**

The emitter is data-only. It turns inventory entries into import text and never evaluates a module.

```ts
// tools/generators/src/registry/emit.test.ts
import { describe, expect, it } from "vitest";

import { emitRegistryModule } from "./emit.ts";

const entry = (id: string) => ({
  id,
  packageName: `@genie/module-${id}`,
  packageRoot: `packages/modules/${id}`,
  entrypoint: `packages/modules/${id}/src/index.ts`,
});

describe("emitRegistryModule", () => {
  it("imports each selected module by package name, in selection order", () => {
    const text = emitRegistryModule({
      source: "explicit",
      ids: ["beta", "alpha"],
      entries: [entry("beta"), entry("alpha")],
    });

    expect(text).toContain('import { betaModule } from "@genie/module-beta";');
    expect(text).toContain('import { alphaModule } from "@genie/module-alpha";');
    expect(text.indexOf("betaModule")).toBeLessThan(text.indexOf("alphaModule"));
  });

  it("emits an empty registry for an explicitly empty selection", () => {
    const text = emitRegistryModule({ source: "explicit", ids: [], entries: [] });

    expect(text).toContain("export const selectedModules = [] as const;");
    expect(text).toContain("export const selectedModuleIds = [] as const;");
    expect(text).not.toContain("import {");
  });

  it("emits the resolved ids so the app can check declaration identity", () => {
    const text = emitRegistryModule({
      source: "explicit",
      ids: ["beta", "alpha"],
      entries: [entry("beta"), entry("alpha")],
    });

    expect(text).toContain('export const selectedModuleIds = ["beta","alpha"] as const;');
  });

  it("never emits a file-system path", () => {
    const text = emitRegistryModule({
      source: "unset",
      ids: ["alpha"],
      entries: [entry("alpha")],
    });

    expect(text).not.toContain("packages/modules");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec nx run @genie/generators:test --skip-nx-cache
```

Expected: FAIL, `Cannot find module './emit.ts'`.

- [ ] **Step 3: Write the emitter**

```ts
// tools/generators/src/registry/emit.ts
import type { ModuleSelection } from "../selection/resolve.ts";

/** `contract-data` becomes `contractDataModule`, matching each module's exported name. */
function exportNameFor(id: string): string {
  const camel = id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
  return `${camel}Module`;
}

/**
 * Emits the text of `apps/genie/src/modules.ts` from validated inventory data.
 * This function reads strings only. It never imports or evaluates a module
 * declaration, so tooling stays data-only (ADR 0008).
 */
export function emitRegistryModule(selection: ModuleSelection): string {
  const imports = selection.entries
    .map((entry) => `import { ${exportNameFor(entry.id)} } from "${entry.packageName}";`)
    .join("\n");

  const names = selection.entries.map((entry) => exportNameFor(entry.id));
  const list = names.length === 0 ? "[]" : `[${names.join(", ")}]`;
  const ids = JSON.stringify(selection.entries.map((entry) => entry.id));

  return `// Generated from MODULE_INCLUDE. Do not edit and do not commit (ADR 0008).
// Selection source: ${selection.source}
${imports}${imports === "" ? "" : "\n"}
export const selectedModules = ${list} as const;

/** The ids the selection resolved, so the app can check each declaration against its metadata. */
export const selectedModuleIds = ${ids} as const;
`;
}
```

- [ ] **Step 4: Run the test until it passes**

```bash
pnpm exec nx run @genie/generators:test --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Re-export the emitter**

Add to `tools/generators/src/selection/index.ts`:

```ts
export { emitRegistryModule } from "../registry/emit.ts";
```

- [ ] **Step 6: Write the failing application validation test**

Application-owned validation is the only place a selected declaration is inspected. It checks identity against the metadata and fails on a duplicate landing route (R-23a). It starts no service.

```ts
// apps/genie/src/registry.test.ts
import { type Module, type PermissionKey, validateRegistry } from "@genie/core";
import { describe, expect, it } from "vitest";

import { assertRegistryIsValid, assertSelectedIdentity } from "./registry.ts";

// Fixtures derive from the real declaration rather than a hand-built object
// cast to `never`. A cast would hide the very drift these checks exist to catch:
// if the contract gains a required field, or the validator starts reading one,
// a cast fixture keeps passing while a derived one stops compiling.
import { placeholderModule } from "@genie/module-placeholder";

const moduleWithLanding = (id: string, landing: boolean): Module => ({
  ...placeholderModule,
  identity: { ...placeholderModule.identity, id, displayName: id },
  permissions: placeholderModule.permissions.map((entry) => ({
    ...entry,
    key: entry.key.replace(/^placeholder:/, `${id}:`) as PermissionKey,
  })),
  defaultRoles: [{ name: `${id} user`, permissions: [`${id}:use` as PermissionKey] }],
  navigation: {
    pinned: [],
    entries: [
      {
        id: `${id}-home`,
        label: id,
        path: `/${id}`,
        surface: "workspace",
        requiredPermission: `${id}:use` as PermissionKey,
        ...(landing ? { landing: true } : {}),
      },
    ],
  },
});

describe("the landing-route rule over a two-module fixture (R-23a)", () => {
  // Core already owns this check. The app must surface it rather than write a
  // second one, so the assertion here is that the registry validator reports it
  // and that the app refuses to load when it does.
  it("core reports two landing routes across the registry", () => {
    const problems = validateRegistry([
      moduleWithLanding("alpha", true),
      moduleWithLanding("beta", true),
    ]);

    expect(problems.some((problem) => /landing route/i.test(problem))).toBe(true);
  });

  it("core reports nothing for exactly one landing route", () => {
    const problems = validateRegistry([
      moduleWithLanding("alpha", true),
      moduleWithLanding("beta", false),
    ]);

    expect(problems.some((problem) => /landing route/i.test(problem))).toBe(false);
  });
});

describe("assertRegistryIsValid", () => {
  it("throws and names every problem the validator returned", () => {
    expect(() =>
      assertRegistryIsValid([
        moduleWithLanding("alpha", true),
        moduleWithLanding("beta", true),
      ])
    ).toThrow(/landing route/i);
  });

  it("accepts a registry the validator reported no problem for", () => {
    expect(() => assertRegistryIsValid([])).not.toThrow();
  });
});

describe("assertSelectedIdentity", () => {
  it("rejects a declaration whose id does not match its selected metadata", () => {
    expect(() =>
      assertSelectedIdentity([moduleWithLanding("alpha", false)], ["beta"])
    ).toThrow(/alpha/);
  });

  it("rejects a selection that is missing a declaration", () => {
    expect(() =>
      assertSelectedIdentity([moduleWithLanding("alpha", false)], ["alpha", "beta"])
    ).toThrow(/beta/);
  });

  it("accepts a matching selection in the same order", () => {
    expect(() =>
      assertSelectedIdentity([moduleWithLanding("alpha", false)], ["alpha"])
    ).not.toThrow();
  });

  it("rejects the right ids in the wrong order, because order drives migrations", () => {
    expect(() =>
      assertSelectedIdentity(
        [moduleWithLanding("alpha", false), moduleWithLanding("beta", false)],
        ["beta", "alpha"]
      )
    ).toThrow(/order/i);
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: FAIL, `Cannot find module './registry.ts'`.

- [ ] **Step 8: Write the validation module**

```ts
// apps/genie/src/registry.ts
import { type Module, validateRegistry } from "@genie/core";

import { selectedModuleIds, selectedModules } from "./modules.ts";

/**
 * Core owns every contract check, including the rule that at most one module
 * across the registry carries the landing flag (R-23a, DEC-49). It reports
 * problems rather than throwing, so the app must read what it returned. Do not
 * write a second checker here.
 */
export function assertRegistryIsValid(candidates: readonly Module[]): void {
  const problems = validateRegistry(candidates);

  if (problems.length > 0) {
    throw new Error(
      `The compiled module registry is not valid:\n- ${problems.join("\n- ")}`
    );
  }
}

/**
 * Checks each compiled declaration against the id the selection resolved, so a
 * package whose declaration drifted from its metadata fails at load rather than
 * mounting under the wrong id. Both directions are checked: nothing extra is
 * compiled in, and nothing selected is missing. No service is started here.
 */
export function assertSelectedIdentity(
  candidates: readonly Module[],
  expectedIds: readonly string[]
): void {
  const actual = candidates.map((candidate) => candidate.identity.id);

  for (const id of actual) {
    if (!expectedIds.includes(id)) {
      throw new Error(
        `Module "${id}" is compiled in but is not in the selection ${JSON.stringify(expectedIds)}.`
      );
    }
  }

  for (const id of expectedIds) {
    if (!actual.includes(id)) {
      throw new Error(
        `The selection asked for "${id}" but no declaration with that id was compiled in.`
      );
    }
  }

  // Order matters and is not decoration. The resolved order decides the emitted
  // import order and therefore the order migration histories are applied in
  // (R-21, R-25). A generated file holding the right ids in the wrong order is a
  // real defect, so membership alone is not enough.
  for (const [index, id] of expectedIds.entries()) {
    if (actual[index] !== id) {
      throw new Error(
        `The compiled registry order ${JSON.stringify(actual)} does not match the resolved selection order ${JSON.stringify(expectedIds)}.`
      );
    }
  }
}

const compiled = selectedModules as readonly Module[];

assertRegistryIsValid(compiled);
assertSelectedIdentity(compiled, selectedModuleIds);

export const modules: readonly Module[] = compiled;

export const moduleById: ReadonlyMap<string, Module> = new Map(
  compiled.map((module) => [module.identity.id, module])
);

/**
 * The ids that declared a frame-origin provider, which is what makes a path a
 * viewer route. One definition, used by the server bundle directly and by the
 * proxy through the context slot the bootstrap fills.
 */
export const viewerModuleIds: ReadonlySet<string> = new Set(
  compiled
    .filter((module) => module.contentSecurityPolicy !== undefined)
    .map((module) => module.identity.id)
);
```

- [ ] **Step 9: Write the generation entry point**

```ts
// apps/genie/tools/generate-registry.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  emitRegistryModule,
  readModuleInventory,
  resolveModuleSelection,
} from "@genie/generators";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const target = resolve(workspaceRoot, "apps/genie/src/modules.ts");

const selection = resolveModuleSelection({
  moduleInclude: process.env.MODULE_INCLUDE,
  inventory: readModuleInventory(workspaceRoot),
  workspaceRoot,
});

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, emitRegistryModule(selection), "utf8");

process.stdout.write(`generated ${target} for selection ${selection.source} [${selection.ids.join(", ")}]\n`);
```

- [ ] **Step 10: Wire generation ahead of typecheck and build**

Add to `apps/genie/package.json`:

```json
{
  "scripts": {
    "generate-registry": "node tools/generate-registry.ts"
  },
  "nx": {
    "tags": ["app"],
    "targets": {
      "generate-registry": {
        "cache": true,
        "inputs": ["production", "^production", { "env": "MODULE_INCLUDE" }],
        "outputs": ["{projectRoot}/src/modules.ts"]
      },
      "build": { "dependsOn": ["generate-registry", "^build"] },
      "typecheck": { "dependsOn": ["generate-registry", "^build"] },
      "test": { "dependsOn": ["generate-registry"] }
    }
  }
}
```

- [ ] **Step 11: Verify the Nx graph really carries the target and its edges**

Revision 1 assumed this. Prove it instead. Every existing target on this project comes from a package script through the `nx:run-script` executor, so the new script creates a target, but the `nx.targets` merge must be observed:

```bash
pnpm exec nx show project @genie/app --json | node -e '
let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  const project = JSON.parse(raw);
  const gen = project.targets["generate-registry"];
  console.log("generate-registry executor:", gen?.executor);
  console.log("generate-registry outputs :", JSON.stringify(gen?.outputs));
  console.log("build dependsOn           :", JSON.stringify(project.targets.build?.dependsOn));
  console.log("typecheck dependsOn       :", JSON.stringify(project.targets.typecheck?.dependsOn));
  console.log("test dependsOn            :", JSON.stringify(project.targets.test?.dependsOn));
});'
```

Expected: the executor is `nx:run-script`, the outputs name `{projectRoot}/src/modules.ts`, and `build`, `typecheck` and `test` each list `generate-registry`. If any `dependsOn` is missing, the package-level merge did not work. Stop and convert the app to an explicit `project.json` rather than relying on inference, and record why in the bead.

- [ ] **Step 12: Prove generation through the real consumers from a clean checkout**

The proof must be the consumer command, not a direct call to the generator. A direct call would pass even if no consumer depended on it.

```bash
rm -f apps/genie/src/modules.ts
pnpm exec nx run @genie/app:typecheck --skip-nx-cache
rm -f apps/genie/src/modules.ts
pnpm exec nx run @genie/app:build --skip-nx-cache
rm -f apps/genie/src/modules.ts
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: each command regenerates the file and succeeds. A failure naming `./modules.ts` means the edge is missing.

Now prove the negative control, so the check cannot pass vacuously:

```bash
rm -f apps/genie/src/modules.ts
pnpm exec tsc --noEmit -p apps/genie/tsconfig.json; echo "bare tsc exit=$?"
```

Expected: nonzero, because the bare compiler has no generation edge. That proves the earlier successes came from the edge and not from a stale file.

- [ ] **Step 13: Prove determinism and both selection identities**

```bash
pnpm exec nx run @genie/app:generate-registry --skip-nx-cache
cp apps/genie/src/modules.ts /tmp/registry-first.ts
rm -f apps/genie/src/modules.ts
pnpm exec nx run @genie/app:generate-registry --skip-nx-cache
diff /tmp/registry-first.ts apps/genie/src/modules.ts
```

Expected: `diff` reports no difference.

```bash
MODULE_INCLUDE= pnpm exec nx run @genie/app:generate-registry --skip-nx-cache
grep -q 'selectedModules = \[\] as const' apps/genie/src/modules.ts && echo "empty selection: no module"
grep -q 'Selection source: explicit' apps/genie/src/modules.ts && echo "empty selection: explicit"

unset MODULE_INCLUDE
pnpm exec nx run @genie/app:generate-registry --skip-nx-cache
grep -q 'Selection source: unset' apps/genie/src/modules.ts && echo "default selection: unset"
grep -q '@genie/module-placeholder' apps/genie/src/modules.ts && echo "default selection: placeholder present"
```

Expected: an explicitly empty selection is distinguishable from an unset one in the generated output, which is the unset-versus-empty identity R-21 requires.

- [ ] **Step 12: Run the tests and gates, then commit**

```bash
pnpm exec nx affected -t build test lint typecheck --skip-nx-cache
git add tools/generators apps/genie
git commit -m "feat(app): generate the module registry from the selection"
```

---

## Task 3: Context seam, bootstrap, health and the minimal image

The image lands here, so packaging and startup are verified before transports and UI exist. This task carries the startup half of the amended AC-26.

**Files:**
- Create: `apps/genie/src/context.ts`, `apps/genie/src/context.test.ts`
- Create: `apps/genie/src/bootstrap.ts`, `apps/genie/src/bootstrap.test.ts`
- Create: `apps/genie/src/instrumentation.ts`
- Create: `apps/genie/src/app/api/health/route.ts`
- Create: `deploy/Dockerfile`, `deploy/entrypoint.sh`, `deploy/README.md`, `.dockerignore`
- Create: `apps/genie/testing/image.startup.test.ts`
- Modify: `packages/core/src/index.ts` (export `RedactingLogger`)

**Interfaces:**
- Consumes: `validateEnvironment`, `createTenantContext`, `runMigrations`, `migrationPlan`, `moduleHistory`, `createLogger`, `forExecution` from `@genie/core`; `modules` from `./registry.ts`.
- Produces: `publishContext(context)`, `readContext(): AppContext | undefined`, `requireContext(): AppContext` from `context.ts`; `runBootstrap(options)` from `bootstrap.ts`.

- [ ] **Step 1: Write the failing context seam test**

The seam must publish once and must initialize nothing when imported.

```ts
// apps/genie/src/context.test.ts
import { describe, expect, it } from "vitest";

import { constructionCount, publishContext, readContext, requireContext } from "./context.ts";

const fakeContext = {
  tenant: {},
  startedAt: 0,
  contextId: "ctx-test",
  viewerProviders: new Map(),
  reportProviderFailure: () => {},
} as never;

describe("the application context seam", () => {
  it("has nothing published before the bootstrap runs", () => {
    expect(readContext()).toBeUndefined();
  });

  it("refuses to hand out a context that was never published", () => {
    expect(() => requireContext()).toThrow(/bootstrap/i);
  });

  it("counts one construction after one publish", () => {
    publishContext(fakeContext);

    expect(readContext()).toBe(fakeContext);
    expect(constructionCount()).toBe(1);
  });

  it("refuses a second publish, because one process owns one context", () => {
    expect(() => publishContext(fakeContext)).toThrow(/already/i);
    expect(constructionCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: FAIL, `Cannot find module './context.ts'`.

- [ ] **Step 3: Write the context seam**

```ts
// apps/genie/src/context.ts
// Type-only imports are erased under verbatimModuleSyntax, so this file pulls no
// core runtime and therefore no database driver into any bundle that imports it.
import type { FrameOriginProvider, TenantContext } from "@genie/core";

/**
 * The application-owned seam of R-19. Importing this file initializes nothing.
 *
 * The value lives under a process-global key rather than in a module variable.
 * The framework compiles one source file into several bundles, and each bundle
 * gets its own module instance, so a module variable would produce one context
 * per bundle. The process global is shared by all of them. Measured evidence is
 * in the native composition spike.
 */
export type AppContext = {
  readonly tenant: TenantContext;
  readonly startedAt: number;
  /** Identifies this context in every log line, so acceptance can count contexts. */
  readonly contextId: string;
  /**
   * The viewer providers, keyed by module id, already wrapped with the counter
   * and the failure reporter. The proxy reads these instead of importing the
   * registry, which would pull the module declarations, their routers and the
   * database driver into the proxy bundle.
   */
  readonly viewerProviders: ReadonlyMap<string, FrameOriginProvider<{ tenant: TenantContext }>>;
  /** Records a provider failure through the redacting logger (yt2). */
  readonly reportProviderFailure: (error: unknown, meta: { readonly moduleId: string; readonly requestId: string }) => void;
  /**
   * One line per request, carrying the request id, the tenant id and the user
   * id (R-44), plus the context id.
   *
   * The context id is what makes the single-context acceptance check real. An
   * earlier draft read context ids from the log and only the bootstrap line
   * carried one, so twenty-four requests served by two contexts would still
   * have shown a single id and passed.
   *
   * This lives on the slot rather than in the proxy so the proxy needs no
   * logger import, which would drag the core root and the database driver into
   * its bundle.
   */
  readonly logRequest: (meta: { readonly requestId: string; readonly path: string }) => void;
  /** Records a caught error with its request id, so AC-15 can match the two. */
  readonly logError: (error: unknown, meta: { readonly requestId: string }) => void;
};

type Slot = { context: AppContext; constructions: number };

const KEY = Symbol.for("genie.app.context");

function slot(): Slot | undefined {
  return (globalThis as Record<symbol, Slot | undefined>)[KEY];
}

/** Publishes the one context. Called by the bootstrap only, after migrations succeed. */
export function publishContext(context: AppContext): void {
  if (slot() !== undefined) {
    throw new Error("The application context is already published. One process owns one context.");
  }

  (globalThis as Record<symbol, Slot>)[KEY] = { context, constructions: 1 };
}

export function readContext(): AppContext | undefined {
  return slot()?.context;
}

/** How many contexts this process built. Acceptance asserts that this is one. */
export function constructionCount(): number {
  return slot()?.constructions ?? 0;
}

/**
 * The accessor every request-bound path uses. It throws rather than building a
 * context on demand, because a lazily built context would be a second pool.
 */
export function requireContext(): AppContext {
  const current = readContext();

  if (current === undefined) {
    throw new Error("The application context is not ready. The bootstrap has not completed.");
  }

  return current;
}
```

- [ ] **Step 4: Run the test until it passes**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Write the failing bootstrap failure-budget test**

The amended R-19b requires one total budget covering diagnostics, cleanup and logger flushing, and a nonzero exit even when those do not settle.

```ts
import type { RedactingLogger } from "@genie/core";
// apps/genie/src/bootstrap.test.ts
import { describe, expect, it, vi } from "vitest";

import { runBootstrap } from "./bootstrap.ts";

describe("runBootstrap failure handling", () => {
  it("exits nonzero when validation fails, without connecting", async () => {
    const exit = vi.fn();
    const connect = vi.fn();

    await runBootstrap({
      source: {},
      connect,
      migrate: vi.fn(),
      exit,
      budgetMs: 500,
    });

    expect(connect).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  // R-19b says ONE total budget covering diagnostics, cleanup and logger
  // flushing. So the decisive case hangs both, and the bound must reject a
  // per-phase implementation. With a 500 ms total, a shared deadline finishes
  // near 500 ms while a timer per phase takes at least 1000 ms. A bound of
  // 900 ms separates them; an earlier 900 ms bound against a 300 ms budget did
  // not, because it accepted two 300 ms phases plus overhead.
  it("spends one total budget when cleanup and the flush both hang", async () => {
    const exit = vi.fn();
    const started = Date.now();

    const stuckLogger = {
      error: () => {},
      info: () => {},
      flush: () => {},
    } as unknown as RedactingLogger;

    await runBootstrap({
      source: { DATABASE_URL: "postgres://u:p@h:5432/d", PUBLIC_URL: "https://example.invalid" },
      logger: stuckLogger,
      connect: () => ({ tenant: { db: { $client: { end: () => new Promise(() => {}) } } } }) as never,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: 500,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it("exits nonzero inside the budget when cleanup never settles", async () => {
    const exit = vi.fn();
    const started = Date.now();

    await runBootstrap({
      source: { DATABASE_URL: "postgres://u:p@h:5432/d", PUBLIC_URL: "https://example.invalid" },
      connect: () => ({ tenant: { db: { $client: { end: () => new Promise(() => {}) } } } }) as never,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: 500,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it("exits nonzero inside the budget when the logger flush never settles", async () => {
    const exit = vi.fn();
    const started = Date.now();

    // The flush half on its own. The image cannot be made to hang here without
    // shipping a fault-injection switch, so it is proven at this level.
    const stuckLogger = {
      error: () => {},
      info: () => {},
      flush: () => {},
    } as unknown as RedactingLogger;

    await runBootstrap({
      source: { DATABASE_URL: "postgres://u:p@h:5432/d", PUBLIC_URL: "https://example.invalid" },
      logger: stuckLogger,
      connect: () => ({ tenant: { db: { $client: { end: async () => {} } } } }) as never,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: 500,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it("publishes the context only after migrations succeed", async () => {
    const order: string[] = [];

    await runBootstrap({
      source: { DATABASE_URL: "postgres://u:p@h:5432/d", PUBLIC_URL: "https://example.invalid" },
      connect: () => {
        order.push("connect");
        return { tenant: { db: { $client: { end: async () => {} } } } } as never;
      },
      migrate: async () => {
        order.push("migrate");
      },
      publish: () => order.push("publish"),
      exit: vi.fn(),
      budgetMs: 500,
    });

    expect(order).toEqual(["connect", "migrate", "publish"]);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: FAIL, `Cannot find module './bootstrap.ts'`.

- [ ] **Step 7: Write the bootstrap**

```ts
// apps/genie/src/bootstrap.ts
import { randomUUID } from "node:crypto";

import {
  type FrameOriginProvider,
  type RedactingLogger,
  type TenantContext,
  createLogger,
  createTenantContext,
  type EnvironmentSource,
  forExecution,
  migrationPlan,
  moduleHistory,
  runMigrations,
  validateEnvironment,
} from "@genie/core";

import { type AppContext, publishContext } from "./context.ts";
import { modules } from "./registry.ts";

/**
 * Wraps every module's optional viewer provider so each call is recorded.
 *
 * R-49a requires counting invocations: zero on ordinary pages, route handlers,
 * health, assets and background requests, and only the owning provider on a
 * viewer document. The count has to be observable on the built image, so each
 * call writes one structured line that acceptance reads back from the container
 * log. This adds no endpoint and exposes no tenant data.
 */
function buildViewerProviders(
  logger: RedactingLogger | undefined
): ReadonlyMap<string, FrameOriginProvider<{ tenant: TenantContext }>> {
  const entries = modules
    .filter((module) => module.contentSecurityPolicy !== undefined)
    .map((module) => {
      const declared = module.contentSecurityPolicy as FrameOriginProvider<{ tenant: TenantContext }>;

      const counted: FrameOriginProvider<{ tenant: TenantContext }> = {
        frameOrigins: (ctx) => {
          logger?.info({ moduleId: module.identity.id }, "frame origin provider invoked");
          return declared.frameOrigins(ctx);
        },
      };

      return [module.identity.id, counted] as const;
    });

  return new Map(entries);
}

export type BootstrapOptions = {
  readonly source?: EnvironmentSource;
  /**
   * Injected only by tests, so the failure budget can be exercised with a
   * logger whose `flush` never settles. The image never passes this, so no
   * fault-injection switch ships in production code.
   */
  readonly logger?: RedactingLogger;
  readonly connect?: (source: EnvironmentSource) => AppContext;
  readonly migrate?: (context: AppContext) => Promise<void>;
  readonly publish?: (context: AppContext) => void;
  readonly exit?: (code: number) => void;
  /** One total budget for diagnostics, cleanup and log flushing (R-19b amendment). */
  readonly budgetMs?: number;
};

function withinBudget<T>(work: Promise<T>, budgetMs: number): Promise<T | undefined> {
  return Promise.race([
    work.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), budgetMs)),
  ]);
}

/**
 * Validate, connect, migrate, publish. Order is the requirement: validation
 * precedes every database connection, and migrations precede publication, so no
 * request-bound path can reach a context before the schema is ready.
 *
 * A failure never throws out of here. The framework does not exit on a thrown
 * bootstrap error; it logs and keeps running, which would leave a container
 * alive after a failed migration. This function exits nonzero itself.
 */
export async function runBootstrap(options: BootstrapOptions = {}): Promise<void> {
  const source = options.source ?? process.env;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const budgetMs = options.budgetMs ?? 5000;

  let logger: ReturnType<typeof createLogger> | undefined;
  let context: AppContext | undefined;

  try {
    const env = validateEnvironment(source);
    logger = options.logger ?? createLogger(env);

    const tenant = options.connect === undefined ? createTenantContext(source) : undefined;
    const contextId = randomUUID();

    context = options.connect
      ? options.connect(source)
      : {
          tenant: tenant as NonNullable<typeof tenant>,
          startedAt: Date.now(),
          contextId,
          viewerProviders: buildViewerProviders(logger),
          reportProviderFailure: (error, meta) =>
            logger?.error(
              { err: error, moduleId: meta.moduleId, requestId: meta.requestId },
              "frame origin provider failed"
            ),
          logRequest: (meta) =>
            forExecution(logger, {
              requestId: meta.requestId,
              tenantId: env.publicUrl,
              userId: "anonymous",
            }).info({ contextId, path: meta.path }, "request"),
          logError: (error, meta) =>
            forExecution(logger, {
              requestId: meta.requestId,
              tenantId: env.publicUrl,
              userId: "anonymous",
            }).error({ err: error, contextId }, "request failed"),
        };

    const migrate =
      options.migrate ??
      ((ready: AppContext) =>
        runMigrations({
          env: ready.tenant.env,
          pool: ready.tenant.db.$client,
          histories: migrationPlan(modules.map(moduleHistory)),
        }));

    await migrate(context);

    (options.publish ?? publishContext)(context);
    logger.info(
      {
        modules: modules.map((module) => module.identity.id),
        contextId: context.contextId,
      },
      "bootstrap complete"
    );
  } catch (caught) {
    const deadline = Date.now() + budgetMs;

    logger?.error({ err: caught }, "bootstrap failed");

    if (context !== undefined) {
      await withinBudget(Promise.resolve(context.tenant.db.$client.end()), Math.max(0, deadline - Date.now()));
    }

    if (logger !== undefined) {
      await withinBudget(
        new Promise<void>((resolve) => logger?.flush(() => resolve())),
        Math.max(0, deadline - Date.now())
      );
    }

    exit(1);
  }
}
```

- [ ] **Step 8: Run the tests until they pass**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: PASS for all three bootstrap tests.

- [ ] **Step 9: Write the framework hook**

```ts
// apps/genie/src/instrumentation.ts

/**
 * The framework compiles this file for the edge runtime as well as the Node
 * runtime. The Node-only bootstrap, which imports the database driver, stays
 * behind the guard and behind a dynamic import so it never enters the edge
 * bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runBootstrap } = await import("./bootstrap.ts");

  await runBootstrap();
}
```

- [ ] **Step 10: Add the health endpoint**

```ts
// apps/genie/src/app/api/health/route.ts
import { readContext } from "../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * R-36a: the body is `ok` and nothing else. It answers only after the bootstrap
 * completed, so a migration failure leaves the container unhealthy. This
 * response is the definition of readiness (R-19b amendment).
 */
export function GET(): Response {
  if (readContext() === undefined) {
    return new Response("unavailable", { status: 503 });
  }

  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
```

- [ ] **Step 11: Export the logger type, and add the build-safe security subpath**

Add `RedactingLogger` to the export block in `packages/core/src/index.ts`:

```ts
export {
  type LogBindings,
  type RedactingLogger,
  createLogger,
  forExecution,
} from "./services/logging/index.ts";
```

Then add a build-safe subpath to `packages/core/package.json`, beside the two that already exist:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./security": "./src/lib/content-security-policy/index.ts",
    "./testing": "./testing/index.ts",
    "./contracts": "./contracts/index.ts",
    "./tenant-config": "./src/lib/tenant-config/index.ts"
  }
}
```

This exists so the proxy can reach the policy helpers without the root entry point. The root re-exports `./lib/tenant-context/index.ts`, which imports `pg` and `drizzle-orm/node-postgres`, so importing `@genie/core` anywhere puts the database driver in that bundle's graph. The policy module has no imports at all, so it is safe alone. Verify that before relying on it:

```bash
grep -c '^import' packages/core/src/lib/content-security-policy/index.ts
```

Expected: `0`. If that ever becomes nonzero, this subpath needs rechecking.

- [ ] **Step 12: Write the image**

```dockerfile
# deploy/Dockerfile
# One image builds every deployment. MODULE_INCLUDE is the only build argument,
# because a build argument stays readable in image history (DEC-33, R-32).
FROM node:26-alpine AS builder

ARG MODULE_INCLUDE
ENV MODULE_INCLUDE=${MODULE_INCLUDE}
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable
WORKDIR /build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json nx.json tsconfig.base.json oxlint.config.ts oxfmt.config.ts ./
COPY packages ./packages
COPY tools ./tools
COPY apps/genie ./apps/genie

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm exec nx run @genie/app:build

FROM node:26-alpine AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

# Standalone output carries only the traced runtime files. No test-mode asset is
# required and no file tracing workaround is present.
COPY --from=builder /build/apps/genie/.next/standalone ./

# Static assets and the public folder must sit beside the server entry point,
# and its depth depends on the file tracing root the build chose. Copy them to a
# staging path, then place them relative to wherever the entry actually is.
# Hard-coding apps/genie/ here would leave every chunk and public asset
# unreachable in a flat layout, while health still answered, which is exactly
# the kind of green-but-broken result this plan is trying to avoid.
COPY --from=builder /build/apps/genie/.next/static /staging/static
COPY --from=builder /build/apps/genie/public /staging/public
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN set -eu; \
    matches=$(find /app -maxdepth 4 -name server.js -not -path '*/node_modules/*'); \
    count=$(echo "$matches" | grep -c . || true); \
    test "$count" -eq 1 || { echo "expected exactly one standalone server.js, found $count:" >&2; echo "$matches" >&2; exit 70; }; \
    server=$matches; \
    root=$(dirname "$server"); \
    echo "standalone root: $root"; \
    mkdir -p "$root/.next"; \
    cp -r /staging/static "$root/.next/static"; \
    cp -r /staging/public "$root/public"; \
    rm -rf /staging; \
    chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["app"]
```

```sh
#!/bin/sh
# deploy/entrypoint.sh
# One image runs the application, the worker and the operator command through
# flags (R-35). Section 0 ships the dispatch and the application path only.
set -eu

# The standalone entry point's depth depends on where the framework decides the
# file tracing root is, which differs between a standalone project and a
# workspace member. Locate it rather than hard-coding a path that reviews have
# already disagreed about. Failing loudly beats starting nothing.
find_server() {
  found=$(find /app -maxdepth 4 -name server.js -not -path '*/node_modules/*')
  count=$(echo "$found" | grep -c . || true)

  # Exactly one, not the first of several. An ambiguous tree would otherwise
  # start an arbitrary root whose assets sit somewhere else.
  if [ "$count" -ne 1 ]; then
    echo "Expected exactly one standalone server.js under /app, found $count." >&2
    echo "$found" >&2
    exit 70
  fi

  echo "$found"
}

case "${1:-app}" in
  app)
    exec node "$(find_server)"
    ;;
  worker|genie-ops)
    echo "The $1 entrypoint arrives in Section 1." >&2
    exit 64
    ;;
  *)
    echo "Unknown entrypoint: $1. Use app." >&2
    exit 64
    ;;
esac
```

```text
# .dockerignore
node_modules
**/node_modules
**/.next
**/storybook-static
**/dist
**/coverage
.git
.nx
.beads
docs
plans
apps/storybook
**/*.stories.tsx
**/e2e
```

- [ ] **Step 12a: Record where the standalone entry point actually lands**

Do not assume this path. Two independent reviews disagreed about it, and the spike observed the nested form under a pnpm workspace while a source reading predicted the flat form. Measure it once and write the answer into the bead:

```bash
pnpm exec nx run @genie/app:build --skip-nx-cache
find apps/genie/.next/standalone -name server.js -not -path '*/node_modules/*'
```

Expected: exactly one path. Whatever it is, every launcher in this plan discovers it rather than hard-coding it, so the recorded value is evidence and not a dependency.

Write the launcher the `start` script uses:

```js
// apps/genie/tools/start-standalone.mjs
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../.next/standalone");

/**
 * Collects every candidate rather than returning the first.
 *
 * The image entrypoint refuses an ambiguous tree, and this launcher backs the
 * host integration tests and the browser run, so it must refuse one too.
 * Returning the first match would silently start an arbitrary server whose
 * assets live somewhere else.
 */
function findAll(directory, found, depth = 0) {
  // The directory is absent before the first build. Guarding here keeps the
  // controlled error below reachable instead of throwing ENOENT with a stack.
  if (depth > 4 || !existsSync(directory)) return;

  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules") continue;

    const candidate = join(directory, entry);

    if (entry === "server.js") {
      found.push(candidate);
      continue;
    }

    if (statSync(candidate).isDirectory()) findAll(candidate, found, depth + 1);
  }
}

const matches = [];

findAll(root, matches);

if (matches.length > 1) {
  console.error(`Expected exactly one standalone server.js, found ${matches.length}:`);
  for (const match of matches) console.error(`  ${match}`);
  process.exit(70);
}

const entry = matches[0];

if (entry === undefined) {
  console.error(`No standalone server.js under ${root}. Run the build first.`);
  process.exit(70);
}

const child = spawn("node", [entry], { stdio: "inherit" });

// Forward the signals a container sends, so the server shuts down rather than
// being orphaned behind this launcher.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`Could not start ${entry}: ${error.message}`);
  process.exit(70);
});

const SIGNAL_NUMBERS = { SIGINT: 2, SIGTERM: 15 };

child.on("exit", (code, signal) => {
  // The conventional encoding is 128 plus the signal number, so a supervisor can
  // tell a terminated server from one that chose to exit.
  process.exit(signal === null ? (code ?? 70) : 128 + (SIGNAL_NUMBERS[signal] ?? 0));
});
```

- [ ] **Step 13: Prove the secret-free build**

```bash
docker build -f deploy/Dockerfile --build-arg MODULE_INCLUDE=placeholder -t genie-s005:test .
```

Expected: exit 0 with no deployment variable and no database reachable. Then prove no secret is present:

```bash
docker history --no-trunc genie-s005:test | grep -i -E 'secret|password|DATABASE_URL' || echo "no secret in image history"
```

- [ ] **Step 14: Prove startup ordering on the actual image**

A malformed configuration must exit nonzero without connecting:

```bash
docker run --rm -e DATABASE_URL=not-a-url -e PUBLIC_URL=https://example.invalid genie-s005:test; echo "exit=$?"
```

Expected: nonzero exit, and the log names the invalid variable without echoing its value.

A reachable database must produce readiness only after migrations. Write the harness that measures it:

```ts
// apps/genie/testing/image.startup.test.ts
import { execFile } from "node:child_process";
import { connect } from "node:net";
import { promisify } from "node:util";

import { MIGRATION_LOCK_KEY } from "@genie/core";
import { startDisposableDeployment, startDisposablePostgres } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);

// A deployment rather than a bare container, because two tests need a pooled
// client to hold the migrator's advisory lock. `pg` may not be imported outside
// core, so the pool is reached through the tenant context seam. Passing no
// modules applies the core history only, which today is empty, so the image
// still applies the module histories itself.
let database: Awaited<ReturnType<typeof startDisposableDeployment>>;

const databaseUrl = () => database.context.env.databaseUrl;
const pool = () => database.context.db.$client;

beforeAll(async () => {
  database = await startDisposableDeployment([]);
}, 180000);

afterAll(async () => {
  await database?.stop();
});

/**
 * Starts the image and returns its container id and a log reader.
 *
 * `--rm` is deliberately absent. A container started with `--rm` is removed the
 * instant it exits, so `docker logs` on a failed bootstrap returns nothing and
 * every log assertion passes vacuously. The container is removed explicitly in
 * `stop()` after the logs have been read.
 */
async function startImage(env: Record<string, string>, port: number) {
  const args = ["run", "--network=host", "-d"];

  for (const [key, value] of Object.entries({ ...env, PORT: String(port) })) {
    args.push("-e", `${key}=${value}`);
  }

  args.push("genie-s005:test");

  const { stdout } = await run("docker", args);
  const id = stdout.trim();

  return {
    id,
    logs: async () => {
      const result = await run("docker", ["logs", id]).catch(() => ({ stdout: "", stderr: "" }));
      return result.stdout + result.stderr;
    },
    stop: () => run("docker", ["rm", "-f", id]).catch(() => undefined),
  };
}

/**
 * Resolves true as soon as the port accepts a connection.
 *
 * The startup tests need to separate two states the amended R-19b treats very
 * differently: the socket is not listening yet, and the socket accepted the
 * connection but no handler answered. A timed-out `fetch` cannot tell them
 * apart, so acceptance is probed directly.
 */
async function waitForAccept(port: number, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs;

  while (Date.now() < deadline) {
    const accepted = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port });
      const settle = (value: boolean) => {
        socket.destroy();
        resolve(value);
      };

      socket.setTimeout(500, () => settle(false));
      socket.on("connect", () => settle(true));
      socket.on("error", () => settle(false));
    });

    if (accepted) return true;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function pollHealth(port: number, attempts = 60) {
  const seen: { elapsed: number; status: number | null }[] = [];
  const startedAt = Date.now();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await fetch(`http://127.0.0.1:${port}/api/health`)
      .then((response) => response.status)
      .catch(() => null);

    seen.push({ elapsed: Date.now() - startedAt, status });

    if (status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return seen;
}

const countLines = (logs: string, needle: string) =>
  logs.split("\n").filter((line) => line.includes(needle)).length;

describe("the built image", () => {
  it("answers health only after migrations complete, and builds exactly one context", async () => {
    const image = await startImage(
      { DATABASE_URL: databaseUrl(), PUBLIC_URL: "https://example.invalid" },
      3399
    );

    try {
      const observations = await pollHealth(3399);

      expect(observations.some((observation) => observation.status === 200)).toBe(true);

      const logs = await image.logs();

      expect(countLines(logs, "bootstrap complete")).toBe(1);

      // No request-bound path ran before the bootstrap finished.
      const bootstrapAt = logs.indexOf("bootstrap complete");
      const providerAt = logs.indexOf("frame origin provider invoked");

      expect(providerAt === -1 || providerAt > bootstrapAt).toBe(true);
    } finally {
      await image.stop();
    }
  }, 180000);

  it("blocks every request-bound path while migrations are still running", async () => {
    // Hold the migrator's own advisory lock from this process, so the container's
    // migrator blocks on the real lock rather than on an injected timer. This is
    // the ordering Amendment A requires: migrations precede request-bound
    // handlers, page rendering, tRPC and viewer-provider execution.
    const holder = await pool().connect();

    await holder.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY.toString()]);

    const image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
        LOCK_TIMEOUT_MS: "120000",
      },
      3404
    );

    try {
      // Wait for the socket to accept, rather than sleeping a fixed time. A
      // fixed sleep races a slow container, and a refused connection would then
      // be indistinguishable from a queued request.
      const accepted = await waitForAccept(3404, 60000);

      // Amendment A permits early binding, so acceptance is expected here and is
      // the precondition that makes the next assertion meaningful.
      expect(accepted).toBe(true);

      const blocked = await Promise.all(
        ["/api/health", "/", "/api/trpc/placeholder.read", "/viewer/placeholder"].map((path) =>
          fetch(`http://127.0.0.1:3404${path}`, { signal: AbortSignal.timeout(4000) })
            .then((response) => response.status)
            .catch((error: Error) => error.name)
        )
      );

      // The connection was accepted, so a refusal here would be a different
      // failure. Every request must have timed out unanswered, not been refused.
      expect(blocked.every((outcome) => outcome === "TimeoutError")).toBe(true);

      const during = await image.logs();

      expect(during).not.toContain("bootstrap complete");
      // The viewer request reached no provider, because no request was handled.
      expect(during).not.toContain("frame origin provider invoked");

      // Release the lock and readiness must follow.
      await holder.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY.toString()]);

      const after = await pollHealth(3404, 60);

      expect(after.some((observation) => observation.status === 200)).toBe(true);

      const logs = await image.logs();

      expect(logs).toContain("bootstrap complete");

      // Amendment A point 6: a client timeout does not cancel a queued request.
      // The four requests the client abandoned were accepted before the
      // bootstrap finished, so they must appear in the request log afterwards.
      // Without this the test would tolerate an implementation that silently
      // discarded them, and the documented behaviour would be unproven.
      const bootstrapAt = logs.indexOf("bootstrap complete");
      const afterBootstrap = logs.slice(bootstrapAt);

      for (const path of ["/api/health", "/api/trpc", "/viewer/placeholder"]) {
        expect(
          afterBootstrap.includes(path),
          `no request log for ${path} after the bootstrap completed`
        ).toBe(true);
      }
    } finally {
      await holder.query("select pg_advisory_unlock_all()").catch(() => undefined);
      holder.release();
      await image.stop();
    }
  }, 240000);

  it("exits nonzero and never answers when the migration lock times out", async () => {
    const holder = await pool().connect();

    await holder.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY.toString()]);

    const image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
        LOCK_TIMEOUT_MS: "3000",
      },
      3401
    );

    try {
      const observations = await pollHealth(3401, 20);

      expect(observations.every((observation) => observation.status !== 200)).toBe(true);

      // The container is still present, because startImage does not use --rm.
      const logs = await image.logs();

      expect(logs).toContain("bootstrap failed");
      expect(logs).not.toContain("bootstrap complete");

      const inspected = await run("docker", ["inspect", "-f", "{{.State.ExitCode}}", image.id]);

      // A migration failure leaves the container unhealthy, which is what keeps
      // the previous version serving (R-27).
      expect(Number(inspected.stdout.trim())).not.toBe(0);

      // The exit must also be prompt. Asserting only the code would accept a
      // container that sat for minutes before giving up, which is not the
      // bounded failure R-19b requires.
      const times = await run("docker", [
        "inspect", "-f", "{{.State.StartedAt}} {{.State.FinishedAt}}", image.id,
      ]);
      const [startedAt, finishedAt] = times.stdout.trim().split(" ");
      const elapsed = Date.parse(finishedAt as string) - Date.parse(startedAt as string);

      // The lock timeout is 3000 ms, plus the failure budget and process start.
      expect(elapsed).toBeLessThan(30000);
    } finally {
      await holder.query("select pg_advisory_unlock_all()").catch(() => undefined);
      holder.release();
      await image.stop();
    }
  }, 180000);

  it("exits nonzero for malformed configuration without connecting", async () => {
    const result = await run("docker", [
      "run", "--rm",
      "-e", "DATABASE_URL=not-a-url",
      "-e", "PUBLIC_URL=https://example.invalid",
      "genie-s005:test",
    ]).then(
      () => ({ code: 0, output: "" }),
      (error: { code?: number; stdout?: string; stderr?: string }) => ({
        code: error.code ?? -1,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      })
    );

    expect(result.code).not.toBe(0);
    expect(result.output).not.toContain("not-a-url");
  }, 120000);

  // Scope note. At Task 3 the tRPC route and the viewer route do not exist yet,
  // so this test covers the paths that do: the ordinary document and health. It
  // proves the mechanism early, which is why the image lands here. AC-26's full
  // clause, concurrent page, tRPC and viewer requests sharing one context across
  // real framework bundles, is proven in Task 9 against the final image, once
  // every route exists. Do not record this test as satisfying AC-26.
  it("shares one context across concurrent requests to the routes that exist", async () => {
    const image = await startImage(
      { DATABASE_URL: databaseUrl(), PUBLIC_URL: "https://example.invalid", LOG_LEVEL: "info" },
      3402
    );

    try {
      await pollHealth(3402);

      const paths = ["/", "/api/health"];

      await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          fetch(`http://127.0.0.1:3402${paths[index % paths.length]}`).catch(() => undefined)
        )
      );

      const logs = await image.logs();
      const contextIds = new Set(
        [...logs.matchAll(/"contextId":"([^"]+)"/g)].map((match) => match[1])
      );

      // One context for the whole process, however many bundles served the load.
      expect(contextIds.size).toBe(1);
      expect(countLines(logs, "bootstrap complete")).toBe(1);
    } finally {
      await image.stop();
    }
  }, 180000);

  it("uses a second runtime configuration rather than build-time values", async () => {
    const second = await startDisposablePostgres();

    try {
      const image = await startImage(
        { DATABASE_URL: second.url, PUBLIC_URL: "https://second.invalid" },
        3403
      );

      try {
        const observations = await pollHealth(3403);

        expect(observations.some((observation) => observation.status === 200)).toBe(true);

        const logs = await image.logs();

        // The second database received the histories, which proves the image read
        // its configuration at run time and carried nothing from the build.
        expect(logs).toContain("bootstrap complete");
        expect(logs).not.toContain(databaseUrl());
      } finally {
        await image.stop();
      }
    } finally {
      await second.stop();
    }
  }, 240000);
});
```

- [ ] **Step 15: Run the gates and commit**

```bash
pnpm exec nx affected -t build test lint typecheck --skip-nx-cache
pnpm exec oxfmt --check --disable-nested-config
git add apps/genie deploy .dockerignore packages/core/src/index.ts
git commit -m "feat(app): bootstrap one context and ship the minimal image"
```

---

## Task 4: Transports, error adapters and English messages

**Files:**
- Create: `apps/genie/src/request-id.ts`, `apps/genie/src/request-id.test.ts`
- Create: `apps/genie/src/http-errors.ts`, `apps/genie/src/http-errors.test.ts`
- Create: `apps/genie/src/trpc/init.ts`, `apps/genie/src/trpc/init.test.ts`
- Create: `apps/genie/src/trpc/root.ts`
- Create: `apps/genie/src/app/api/trpc/[trpc]/route.ts`
- Create: `apps/genie/src/app/api/placeholder/records/route.ts`
- Create: `apps/genie/testing/transport.integration.test.ts`
- Create: `apps/genie/src/messages/en.json`
- Create: `apps/genie/src/i18n/request.ts`
- Modify: `apps/genie/src/app/layout.tsx` (replace the Task 1 stub with the provider)
- Modify: `apps/genie/next.config.ts` (add the next-intl plugin, keep the header rules)

**Interfaces:**
- Consumes: `safeBodyFor`, `AppError`, `CORE_ERRORS`, `safeMessageFor`, `createRequestPrincipal`, `createStubGrantReader` from `@genie/core`; `requireContext` from `../context.ts`; `moduleById` from `../registry.ts`.
- Produces: `newRequestId()`, `errorResponse(caught, requestId)`, `appRouter`, `createRequestContext(request)`.

- [ ] **Step 1: Write the failing HTTP error adapter test**

R-46 and AC-15: the body is `{ code, message, requestId }` and no database text escapes.

```ts
// apps/genie/src/http-errors.test.ts
import { AppError, CORE_ERRORS } from "@genie/core";
import { describe, expect, it } from "vitest";

import { errorResponse } from "./http-errors.ts";

describe("errorResponse", () => {
  it("returns the catalogue code, safe message and request id", async () => {
    const response = errorResponse(new AppError(CORE_ERRORS["not-found"]), "req-1");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "not-found",
      message: CORE_ERRORS["not-found"].message,
      requestId: "req-1",
    });
  });

  it("maps an unknown exception to the generic entry and leaks nothing", async () => {
    const leak = new Error('relation "placeholder_record" does not exist at 127.0.0.1:5432');

    const response = errorResponse(leak, "req-2");
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("placeholder_record");
    expect(body).not.toContain("127.0.0.1");
    expect(body).not.toContain("Error:");
    expect(JSON.parse(body)).toEqual({
      code: "internal-error",
      message: CORE_ERRORS["internal-error"].message,
      requestId: "req-2",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: FAIL, `Cannot find module './http-errors.ts'`.

- [ ] **Step 3: Write the adapter**

```ts
// apps/genie/src/http-errors.ts
import { AppError, safeBodyFor } from "@genie/core";

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  "not-found": 404,
  "forbidden": 403,
  "invalid-input": 400,
};

/**
 * The one route-handler helper of R-46. The response body carries the catalogue
 * code, its fixed safe message and the request id that matches the server log.
 * A cause, a stack, database text and upstream text stay on the server.
 */
export function errorResponse(caught: unknown, requestId: string): Response {
  const error = caught instanceof Error ? caught : undefined;
  const body = safeBodyFor(error, requestId);
  const status = error instanceof AppError ? (STATUS_BY_CODE[error.code] ?? 500) : 500;

  return Response.json(body, { status });
}
```

- [ ] **Step 4: Run the test until it passes**

```bash
pnpm exec nx run @genie/app:test --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 5: Write the failing request id test**

```ts
// apps/genie/src/request-id.test.ts
import { describe, expect, it } from "vitest";

import { newRequestId } from "./request-id.ts";

describe("newRequestId", () => {
  it("produces a distinct value each call", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it("produces a value safe to put in a header and a log line", () => {
    expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 6: Write it, run it green**

```ts
// apps/genie/src/request-id.ts
import { randomUUID } from "node:crypto";

/** One id per request, shared by the log line and the error body (R-44, R-46). */
export function newRequestId(): string {
  return randomUUID();
}
```

- [ ] **Step 7: Write the failing tRPC formatter test**

AC-15: the standard envelope and protocol codes survive, `appCode` and `requestId` are additive, and a standard client decodes it.

```ts
// apps/genie/src/trpc/init.test.ts
import { AppError, CORE_ERRORS } from "@genie/core";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { formatTrpcError } from "./init.ts";

describe("formatTrpcError", () => {
  it("keeps the protocol shape and adds the catalogue code and request id", () => {
    const shape = { message: "original", code: -32603, data: { code: "INTERNAL_SERVER_ERROR" } };

    const result = formatTrpcError({
      shape,
      error: new TRPCError({ code: "FORBIDDEN", cause: new AppError(CORE_ERRORS.forbidden) }),
      requestId: "req-9",
    });

    expect(result.code).toBe(-32603);
    expect(result.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(result.data.appCode).toBe("forbidden");
    expect(result.data.requestId).toBe("req-9");
    expect(result.message).toBe(CORE_ERRORS.forbidden.message);
  });

  it("maps an unknown cause to the generic entry and drops its text", () => {
    const shape = { message: "original", code: -32603, data: { code: "INTERNAL_SERVER_ERROR" } };
    const leak = new Error('duplicate key value violates unique constraint "placeholder_pkey"');

    const result = formatTrpcError({
      shape,
      error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: leak }),
      requestId: "req-10",
    });

    expect(result.data.appCode).toBe("internal-error");
    expect(JSON.stringify(result)).not.toContain("placeholder_pkey");
    expect(JSON.stringify(result)).not.toContain("unique constraint");
  });
});
```

- [ ] **Step 8: Run it and watch it fail, then write the formatter**

```ts
// apps/genie/src/trpc/init.ts
import { AppError, GENERIC_ERROR_CODE, safeMessageFor } from "@genie/core";
import { initTRPC } from "@trpc/server";

import type { AppContext } from "../context.ts";

export type RequestContext = {
  readonly app: AppContext;
  readonly requestId: string;
  readonly caller: Parameters<typeof import("@genie/core").can>[0];
};

/**
 * R-46: the standard envelope and its protocol codes are preserved. `appCode`
 * and `requestId` are added under `data`, so a standard client decodes the
 * result without a custom transport. No cause, stack, database text or upstream
 * text reaches the shape.
 */
export function formatTrpcError(input: {
  shape: { message: string; code: number; data: Record<string, unknown> };
  error: { cause?: unknown };
  requestId: string;
}): { message: string; code: number; data: Record<string, unknown> } {
  const cause = input.error.cause;
  const appCode = cause instanceof AppError ? cause.code : GENERIC_ERROR_CODE;

  return {
    ...input.shape,
    message: safeMessageFor(appCode),
    data: { ...input.shape.data, appCode, requestId: input.requestId },
  };
}

export const t = initTRPC.context<RequestContext>().create({
  errorFormatter: ({ shape, error, ctx }) =>
    formatTrpcError({
      shape: shape as never,
      error,
      requestId: ctx?.requestId ?? "unknown",
    }),
});
```

- [ ] **Step 9: Assemble the root router and the route handler**

```ts
// apps/genie/src/trpc/root.ts
import { modules } from "../registry.ts";
import { t } from "./init.ts";

/** Each module's router mounts under its module id (R-23). */
export const appRouter = t.router(
  Object.fromEntries(modules.map((module) => [module.identity.id, module.router]))
);

export type AppRouter = typeof appRouter;
```

```ts
// apps/genie/src/app/api/trpc/[trpc]/route.ts
import { createRequestPrincipal, createStubGrantReader } from "@genie/core";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { requireContext } from "../../../../context.ts";
import { newRequestId } from "../../../../request-id.ts";
import { appRouter } from "../../../../trpc/root.ts";

export const dynamic = "force-dynamic";

function handler(request: Request): Promise<Response> {
  const requestId = newRequestId();

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => ({
      app: requireContext(),
      requestId,
      // The Section 0 stub grants placeholder:read and nothing else (R-13).
      caller: createRequestPrincipal(
        { userId: "anonymous", groups: [] },
        createStubGrantReader()
      ),
    }),
    // AC-15: the id the client receives must match a redacted server log entry.
    // The formatter shapes the response and logs nothing, so the logging belongs
    // here, where the caught error is still available.
    onError: ({ error }) => {
      requireContext().logError(error, { requestId });
    },
  });
}

export { handler as GET, handler as POST };
```

- [ ] **Step 9a: Add the ordinary HTTP route that actually uses the helper**

Revision 1 defined `errorResponse` with no consumer, so nothing proved the ordinary transport of R-46. This route reads through the tenant context, which means a real database failure reaches the helper.

```ts
// apps/genie/src/app/api/status/route.ts
import { CORE_HISTORY } from "@genie/core";

import { requireContext } from "../../../context.ts";
import { errorResponse } from "../../../http-errors.ts";
import { newRequestId } from "../../../request-id.ts";

export const dynamic = "force-dynamic";

/**
 * The core history's ledger, taken from core rather than written twice.
 *
 * Drizzle creates its ledger in the `drizzle` schema, not `public`, and the
 * application's `search_path` does not include it. The name must therefore be
 * schema-qualified or the query fails for the wrong reason.
 */
const LEDGER = `drizzle."${CORE_HISTORY.table}"`;

/**
 * The ordinary HTTP counterpart of the tRPC path. It exists so a real database
 * failure can be observed through the route-handler helper (R-46, AC-15), and
 * so the response body shape is proven over the wire rather than in isolation.
 *
 * It reads nothing module-owned. An earlier draft imported `placeholderRecord`
 * from the placeholder package, which would have compiled that module into
 * every image including one built with an empty selection, breaking R-22. The
 * read here goes through the tenant context with no module import and no
 * database driver import, so it works whatever the selection is.
 */
export async function GET(): Promise<Response> {
  const app = requireContext();
  const requestId = newRequestId();

  try {
    // Reads the core migration ledger, which the migrator creates on every start
  // whatever the module selection is. A plain string is accepted:
  // `execute(query: SQLWrapper | string)` in drizzle-orm 0.45.2, pg-core/db.d.ts.
  //
  // It deliberately touches a real object rather than `select 1`. A constant
  // select cannot fail, so there would be no way to exercise the error adapter
  // with a database failure, which AC-15 requires. It is core-owned rather than
  // module-owned, so the route still works in an image built with an empty
  // selection.
  await app.tenant.db.execute(`select 1 from ${LEDGER} limit 1`);

    return Response.json({ status: "ok", requestId });
  } catch (caught) {
    // AC-15: the same request id reaches the client and the redacted log.
    app.logError(caught, { requestId });

    return errorResponse(caught, requestId);
  }
}
```

- [ ] **Step 9b: Prove both transports against a real database over real HTTP**

A unit test on a detached helper is not proof. This runs the built application against a disposable database, breaks the table, and reads what each transport returns. It also uses a standard tRPC client, which is what AC-15 names.

```ts
// apps/genie/testing/transport.integration.test.ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { CORE_HISTORY } from "@genie/core";
import { startDisposableDeployment } from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppRouter } from "../src/trpc/root.ts";

// Drizzle creates its ledger in the `drizzle` schema, not `public`.
const LEDGER_SCHEMA = "drizzle";
const LEDGER_TABLE = CORE_HISTORY.table;
import { startBuiltApp } from "./start-built-app.ts";

// Start the built application against the disposable database, then drop the
// table so every read fails inside the database rather than in application code.
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;
let server: Awaited<ReturnType<typeof startBuiltApp>>;

const baseUrl = () => server.baseUrl;
const databaseUrl = () => deployment.context.env.databaseUrl;
// The pool is reached through the tenant context seam, because `pg` may not be
// imported outside core.
const pool = () => deployment.context.db.$client;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  server = await startBuiltApp(deployment.context.env.databaseUrl, 3410);
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("both transports on a database failure", () => {
  it("answers normally while the database is reachable", async () => {
    const response = await fetch(`${baseUrl()}/api/status`);

    // The positive control. Without it, the failure assertions below could pass
    // against a route that is broken for some unrelated reason.
    expect(response.status).toBe(200);
  });

  it("the ordinary route returns code, message and requestId with no leaked text", async () => {
    // A statement-level failure on the connection the application already holds.
    //
    // This is the third design. Dropping `placeholder_record` never made a
    // constant `select 1` fail. Stopping the container, and later terminating
    // backends, both risked the unhandled pool `error` event of
    // genie-ops-center-v2-akh, which can exit the process instead of answering.
    // Refusing new connections was not deterministic either: pg-pool reuses an
    // idle client before opening a new one, so a burst can be served entirely on
    // the existing connection and never fail at all.
    //
    // Renaming the object the route reads fails the next query immediately, on
    // whichever connection serves it, with no connection churn.
    const admin = await pool().connect();

    try {
      const present = await admin.query(
        "select 1 from information_schema.tables where table_schema = $1 and table_name = $2",
        [LEDGER_SCHEMA, LEDGER_TABLE]
      );

      // Positive control. If the ledger is not there, the route was never
      // reading a real object and the whole test would be theatre. The schema
      // matters: an unqualified lookup finds the table while an unqualified
      // `alter` does not resolve it, so the injection would silently miss.
      expect(present.rowCount, `no ${LEDGER_SCHEMA}.${LEDGER_TABLE} table to break`).toBe(1);

      await admin.query(
        `alter table ${LEDGER_SCHEMA}."${LEDGER_TABLE}" rename to "${LEDGER_TABLE}_hidden"`
      );
    } finally {
      admin.release();
    }

    const response = await fetch(`${baseUrl()}/api/status`, {
      signal: AbortSignal.timeout(15000),
    });

    expect(response.status).toBe(500);
    const text = await (response as Response).text();
    const body = JSON.parse(text) as { code: string; message: string; requestId: string };

    expect(body.code).toBe("internal-error");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // No connection detail, no host, no port, no stack.
    expect(text).not.toMatch(/ECONNREFUSED|ETIMEDOUT|127\.0\.0\.1|postgres:\/\//);
    expect(text).not.toContain("relation");
    expect(text).not.toMatch(/at .*\.js:\d+/);

    // AC-15: the returned request id matches a redacted server log entry, and
    // the log holds the detail the response withheld.
    const logs = server.logs();

    expect(logs).toContain(body.requestId);
    expect(logs).toContain("request failed");
  });

  it("a standard tRPC client decodes the failure with appCode and requestId", async () => {
    // The module table, so this transport fails on its own read rather than
    // depending on the ordinary route's injection still being in place.
    const admin = await pool().connect();

    try {
      await admin.query("drop table if exists placeholder_record cascade");
    } finally {
      admin.release();
    }

    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${baseUrl()}/api/trpc` })],
    });

    const failure = await client.placeholder.read.query().then(
      () => undefined,
      (error: unknown) => error
    );

    expect(failure).toBeDefined();

    const shaped = failure as { message: string; data?: { appCode?: string; requestId?: string; code?: string } };

    // The standard client decoded it without a custom transport, the protocol
    // field survived, and the two additive fields are present.
    expect(shaped.data?.code).toBeDefined();
    expect(shaped.data?.appCode).toBe("internal-error");
    expect(shaped.data?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(shaped)).not.toMatch(/ECONNREFUSED|ETIMEDOUT|127\.0\.0\.1|postgres:\/\//);
    expect(JSON.stringify(shaped)).not.toContain("relation");

    // AC-15 for the second transport: the same correlation rule holds.
    expect(server.logs()).toContain(shaped.data?.requestId);
  });
});
```

`startBuiltApp` is defined beside the test rather than described, because the earlier draft called it without defining it and named only one of the two variables the environment schema requires.

```ts
// apps/genie/testing/start-built-app.ts
import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type BuiltApp = {
  readonly baseUrl: string;
  readonly logs: () => string;
  readonly stop: () => Promise<void>;
};

/**
 * Runs the standalone server the build produced.
 *
 * `PUBLIC_URL` is supplied as well as `DATABASE_URL`, because environment
 * validation requires both and the process would otherwise exit before either
 * transport could be exercised.
 */
export async function startBuiltApp(databaseUrl: string, port: number): Promise<BuiltApp> {
  // The entry point's depth depends on the build's file tracing root, so it is
  // discovered rather than hard-coded. The same launcher backs the `start`
  // script and the image entrypoint.
  const launcher = resolve(import.meta.dirname, "../tools/start-standalone.mjs");

  const child = spawn("node", [launcher], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PUBLIC_URL: "https://example.invalid",
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";

  child.stdout.on("data", (chunk) => (output += String(chunk)));
  child.stderr.on("data", (chunk) => (output += String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    const ready = await fetch(`${baseUrl}/api/health`)
      .then((response) => response.status === 200)
      .catch(() => false);

    if (ready) {
      return {
        baseUrl,
        logs: () => output,
        stop: async () => {
          child.kill("SIGKILL");
        },
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill("SIGKILL");
  throw new Error(`The built application did not become ready.\n${output}`);
}
```

Import it in the transport test and reuse it in Task 9 rather than writing a second launcher:

```ts
import { startBuiltApp } from "./start-built-app.ts";
```

- [ ] **Step 9c: Create the integration target now, not in Task 8**

This test lives under `testing/`, which the shared unit preset excludes, so the ordinary `test` target will not collect it. Without its own target, Task 4 could report green while its AC-15 proof never ran.

Create `apps/genie/vitest.integration.config.ts` with `include: ["testing/**/*.integration.test.ts"]` and `passWithNoTests: false`, copying the shape of `packages/core/vitest.integration.config.ts`, and add the `test:integration` script to `apps/genie/package.json`. Task 8 then adds the same target to the required gates and proves the gate can fail; it does not create the target.

Run it and record the result:

```bash
pnpm exec nx run @genie/app:test:integration --skip-nx-cache
```

Expected: the transport cases run and pass. If the run reports zero collected files, the include glob is wrong and the task is not done.

- [ ] **Step 10: Add the English catalogue and wire it through next-intl**

Scope first, because this boundary decides how much belongs here. The [coverage map](../coverage.md) assigns R-42 and R-43 to S0-09, with "S0-05 initial app messages", and assigns AC-12 and AC-13 to S0-09. The [2026-09-21 audit](../audit-2026-09-21.md) says the same: "S0-05 owns initial English runtime strings; complete catalogue/missing-key checks and development-only panels using its accepted app seam."

So this task owns the seam and the application's own strings. It does not own the missing-key check, and it does not relocalize the placeholder module's page text, which is S0-04's surface and S0-09's completion work. An independent review read AC-13 as due here; the coverage map is the authority and it does not agree. Record that boundary in the bead rather than quietly doing either more or less.

Within that scope, a direct JSON import would compile, because `resolveJsonModule` is on, and would still miss R-43: the catalogue must be the one path for the application's text.

Before writing the wiring, look up the current next-intl App Router setup with the context7 tool. The request-configuration file location and the server helper names have moved between versions, so do not write them from memory. Record the confirmed entry points in a comment.

The shape to create, once confirmed:

```ts
// apps/genie/src/i18n/request.ts
import { getRequestConfig } from "next-intl/server";

// Section 0 ships one locale. A second language becomes a translation task
// rather than a refactor (DEC-13).
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../messages/en.json")).default,
}));
```

The layout supplies the provider so client components can read the same catalogue:

```tsx
// apps/genie/src/app/layout.tsx, replacing the Task 1 stub
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import "../styles/globals.css";

export const metadata = { title: "Genie Ops Center" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

Add the plugin to `next.config.ts` as the confirmed documentation directs, keeping the header rules and the two settings already there.

- [ ] **Step 10a: Add the catalogue itself**

```json
{
  "app": {
    "title": "Genie Ops Center",
    "navigationHeading": "Modules",
    "noModules": "No modules are compiled into this deployment."
  },
  "viewer": {
    "heading": "Placeholder viewer",
    "frameTitle": "Embedded placeholder content"
  },
  "access": {
    "denied": "You may not view this page."
  }
}
```

- [ ] **Step 11: Run the gates and commit**

```bash
pnpm exec nx affected -t build test lint typecheck --skip-nx-cache
git add apps/genie
git commit -m "feat(app): add safe error adapters and the trpc transport"
```

---

## Task 5: Story-first navigation component

This task obeys [the UI workflow](../../../architecture/ui-development.md): a documented story and a meaningful failing assertion come before any application use.

**Component base, decided by the owner on 2026-09-21.** [The technology stack](../../../core/tech-stack.md) settles the base as shadcn on Base UI, explicitly Base UI rather than Radix, and `DESIGN.md` writes the token layer against the shadcn `--primary` variable. Nothing is set up yet: there is no `components.json` and `packages/ui` has no `@base-ui/react` dependency.

This task follows that direction without pulling Section 3 forward. Roadmap Section 3 owns the fixed token layer and the primitive catalogue, and Spec 0 says the full catalogue is not required in Section 0. The navigation here is a heading and a list of links, so it needs no primitive, and an unused primitive dependency is not added merely to establish a foundation. What it does follow is the shadcn convention: owned source in `packages/ui`, styled with Tailwind classes, accessible semantics.

The accepted `Disclosure` component stays unchanged, with its stories and tests intact. Whether either component is re-based onto a Base UI primitive is decided in Section 3 on accessibility, behavior and maintenance need, never on consistency alone. Tracked as `genie-ops-center-v2-ghe`.

**Files:**
- Create: `packages/ui/src/navigation/navigation-list.tsx`
- Create: `packages/ui/src/navigation/navigation-list.stories.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `NavigationList`, `type NavigationListProps`, `type NavigationItem` from `@genie/ui`.

- [ ] **Step 1: Write the story with its failing assertions first**

```tsx
// packages/ui/src/navigation/navigation-list.stories.tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { NavigationList } from "./navigation-list.tsx";

const meta = {
  title: "UI/NavigationList",
  component: NavigationList,
  parameters: {
    docs: {
      description: {
        component:
          "An unfiltered list of the entries the compiled modules declare. Section 0 applies no entitlement filter and no permission filter; those join in Section 1 and Section 2.",
      },
    },
  },
} satisfies Meta<typeof NavigationList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithEntries: Story = {
  args: {
    heading: "Modules",
    items: [
      { id: "placeholder-home", label: "Placeholder", path: "/placeholder" },
      { id: "placeholder-archive", label: "Archive", path: "/placeholder/archive" },
    ],
    emptyMessage: "No modules are compiled into this deployment.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const list = canvas.getByRole("navigation", { name: "Modules" });

    await expect(within(list).getByRole("link", { name: "Placeholder" })).toHaveAttribute(
      "href",
      "/placeholder"
    );
    await expect(within(list).getAllByRole("link")).toHaveLength(2);
  },
};

export const Empty: Story = {
  args: {
    heading: "Modules",
    items: [],
    emptyMessage: "No modules are compiled into this deployment.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText("No modules are compiled into this deployment.")
    ).toBeVisible();
    await expect(canvas.queryAllByRole("link")).toHaveLength(0);
  },
};
```

- [ ] **Step 2: Create a renderable scaffold that does not satisfy the assertions**

The workflow requires a meaningful failing assertion, and says plainly that a broken import or missing configuration is not sufficient red evidence. A component that already passes cannot produce one, so the scaffold comes first and is deliberately incomplete: it renders, it is importable, and it does not yet do what the stories assert.

```tsx
// packages/ui/src/navigation/navigation-list.tsx, first version
export type NavigationItem = {
  readonly id: string;
  readonly label: string;
  readonly path: string;
};

export type NavigationListProps = {
  readonly heading: string;
  readonly items: readonly NavigationItem[];
  readonly emptyMessage: string;
};

/** Scaffold. Renders, so the failure below is an assertion and not an import. */
export function NavigationList({ heading }: NavigationListProps) {
  return <section>{heading}</section>;
}
```

Export it from `packages/ui/src/index.ts` now, so the stories resolve.

- [ ] **Step 2a: Run the component tests and watch them fail on the assertion**

```bash
pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache
```

Expected: FAIL, and read the failure text before continuing. It must name a missing role, link or text, not a module that could not be found. The `WithEntries` story fails because no navigation landmark and no links exist, and `Empty` fails because the empty message is absent. Record the failure text as the red evidence.

- [ ] **Step 3: Write the component**

```tsx
// packages/ui/src/navigation/navigation-list.tsx
export type NavigationItem = {
  readonly id: string;
  readonly label: string;
  readonly path: string;
};

export type NavigationListProps = {
  readonly heading: string;
  readonly items: readonly NavigationItem[];
  readonly emptyMessage: string;
};

/**
 * An unfiltered navigation list. Section 0 shows every compiled module's entries
 * (R-23). Hiding a link is not an access control, so the server still enforces
 * every route through `can()`.
 */
export function NavigationList({ heading, items, emptyMessage }: NavigationListProps) {
  return (
    <nav aria-label={heading}>
      <h2>{heading}</h2>
      {items.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <a href={item.path}>{item.label}</a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Export it and run the component tests green**

Add to `packages/ui/src/index.ts`:

```ts
export { NavigationList } from "./navigation/navigation-list.tsx";
export type { NavigationItem, NavigationListProps } from "./navigation/navigation-list.tsx";
```

```bash
pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache
```

Expected: PASS, with both stories collected.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add the navigation list with documented stories"
```

---

## Task 6: Pages and the viewer route

**Files:**
- Create: `apps/genie/src/viewer-routes.ts`, `apps/genie/src/viewer-routes.test.ts`
- Create: `apps/genie/src/app/page.tsx` (replace the Task 1 stub)
- Create: `apps/genie/src/app/placeholder/page.tsx`
- Create: `apps/genie/src/app/admin/placeholder/page.tsx`
- Create: `apps/genie/src/app/viewer/[moduleId]/page.tsx`

**Interfaces:**
- Consumes: `modules`, `moduleById` from `../registry.ts`; `NavigationList` from `@genie/ui`.
- Produces: `viewerRouteFor(pathname, viewerModuleIds): { moduleId: string } | undefined`. The id set comes from `viewerModuleIds` in `registry.ts` for anything in the server bundle, and from the published context slot for the proxy.

- [ ] **Step 1: Write the failing exact-mapping test**

The spike found that a path-prefix match gave the viewer policy to a 404 under the viewer prefix. The mapping must be exact.

```ts
// apps/genie/src/viewer-routes.test.ts
import { describe, expect, it } from "vitest";

import { viewerRouteFor } from "./viewer-routes.ts";

const known = new Set(["placeholder"]);

describe("viewerRouteFor", () => {
  it("matches the exact viewer document path", () => {
    expect(viewerRouteFor("/viewer/placeholder", known)).toEqual({ moduleId: "placeholder" });
  });

  it("matches the same path with a trailing slash", () => {
    expect(viewerRouteFor("/viewer/placeholder/", known)).toEqual({ moduleId: "placeholder" });
  });

  it("does not match a deeper path under the viewer prefix", () => {
    expect(viewerRouteFor("/viewer/placeholder/extra", known)).toBeUndefined();
  });

  it("does not match an unknown module id", () => {
    expect(viewerRouteFor("/viewer/not-compiled", known)).toBeUndefined();
  });

  it("does not match the bare prefix", () => {
    expect(viewerRouteFor("/viewer", known)).toBeUndefined();
  });

  it("matches nothing when no provider has been published", () => {
    expect(viewerRouteFor("/viewer/placeholder", new Set())).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then write the mapping**

```ts
// apps/genie/src/viewer-routes.ts
//
// This file imports nothing, on purpose.
//
// An earlier draft read `moduleById` from the registry here. That is an
// indirect path to the database driver: the registry imports the compiled
// module declarations, a declaration imports its router, and the router imports
// the `@genie/core` root, which re-exports the tenant context and therefore
// `pg`. Because the proxy imports this file, that chain would have put the
// driver in the proxy bundle even though the proxy never imports core's root
// itself. The caller supplies the known ids instead.

/**
 * The server-owned viewer route mapping of R-49. It is an exact match, never a
 * path prefix, so a non-route path under `/viewer` keeps the deny baseline. No
 * incoming header selects a module.
 *
 * `viewerModuleIds` holds the ids that declared a frame-origin provider. An
 * empty set means no viewer route exists, which denies frames everywhere. That
 * is the safe answer before the bootstrap has published anything.
 */
export function viewerRouteFor(
  pathname: string,
  viewerModuleIds: ReadonlySet<string>
): { readonly moduleId: string } | undefined {
  const trimmed = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const match = /^\/viewer\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(trimmed);

  // `noUncheckedIndexedAccess` types a capture group as string | undefined, so
  // this guard is required and is not defensive noise.
  const moduleId = match?.[1];

  if (moduleId === undefined) return undefined;
  if (!viewerModuleIds.has(moduleId)) return undefined;

  return { moduleId };
}
```

- [ ] **Step 3: Write the pages**

```tsx
// apps/genie/src/app/page.tsx
import { NavigationList } from "@genie/ui";
import { getTranslations } from "next-intl/server";

import { modules } from "../registry.ts";

export const dynamic = "force-dynamic";

/**
 * The ordinary document. Navigation is unfiltered in Section 0 (R-23).
 *
 * Every user-facing string resolves through the catalogue, never a direct JSON
 * import, because R-43 requires the catalogue to be the one path for text.
 */
export default async function HomePage() {
  const t = await getTranslations("app");

  const items = modules.flatMap((module) =>
    module.navigation.entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      path: entry.path,
    }))
  );

  return (
    <main>
      <h1>{t("title")}</h1>
      <NavigationList
        heading={t("navigationHeading")}
        items={items}
        emptyMessage={t("noModules")}
      />
    </main>
  );
}
```

The two page routes mount what the module registered, read through the registry.

Revision 1 imported `PlaceholderWorkspacePage` and `PlaceholderAdminPage` from `@genie/module-placeholder/presentation` and passed a `records` prop. Both were wrong. That entry point exports `AdminPage`, `WorkspacePage` and `PlaceholderRecordView` only; the two `Placeholder*Page` wrappers live in `module-pages.tsx`, which the package does not expose, and they take no props. Mounting through the registry is also the stronger proof, because it exercises the declaration the generated registry produced rather than a hand-written import.

First the page loader, because R-14 requires one loader per request and R-13 requires every page to go through `can()`. An earlier draft rendered both pages with no check at all, which would have served them to a caller holding no permission.

```tsx
// apps/genie/src/page-access.tsx
import { type PermissionKey, can, createRequestPrincipal, createStubGrantReader } from "@genie/core";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * The page loader of R-14. One principal per request, read lazily once, and the
 * single authorization seam of DEC-39.
 *
 * Section 0 has no sign-in, so the caller is anonymous and the stub grants
 * exactly one key, `placeholder:read` (R-13). A workspace entry requires
 * `<id>:use` and an admin page requires `<id>:admin`, so both module pages are
 * refused here. That refusal is the Section 0 behavior, not a defect: the module
 * contract says only the placeholder's read procedure has an authorized success
 * path until Section 2 supplies real roles.
 */
export async function renderIfPermitted(
  permission: PermissionKey,
  render: () => ReactNode
): Promise<ReactNode> {
  const caller = createRequestPrincipal(
    { userId: "anonymous", groups: [] },
    createStubGrantReader()
  );

  if (!(await can(caller, permission))) {
    const t = await getTranslations("access");

    // Denied pages say nothing about what they would have shown.
    return <main data-testid="permission-denied">{t("denied")}</main>;
  }

  return render();
}
```

```tsx
// apps/genie/src/app/placeholder/page.tsx
import { notFound } from "next/navigation";

import { renderIfPermitted } from "../../page-access.tsx";
import { moduleById } from "../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * Mounts the workspace page the module declared under `pages.workspace.home`.
 * Resolving a file is not proof; this renders the registered component inside
 * the real server bundle, behind the one authorization seam.
 */
export default async function PlaceholderRoute() {
  const module = moduleById.get("placeholder");

  if (module === undefined) notFound();

  const entry = module.navigation.entries.find((candidate) => candidate.path === "/placeholder");

  if (entry === undefined) notFound();

  const Page = module.pages.workspace.home;

  return renderIfPermitted(entry.requiredPermission, () => <Page />);
}
```

```tsx
// apps/genie/src/app/admin/placeholder/page.tsx
import { notFound } from "next/navigation";

import { renderIfPermitted } from "../../../page-access.tsx";
import { moduleById } from "../../../registry.ts";

export const dynamic = "force-dynamic";

export default async function PlaceholderAdminRoute() {
  const module = moduleById.get("placeholder");

  if (module === undefined) notFound();

  const entry = module.navigation.entries.find(
    (candidate) => candidate.path === "/admin/placeholder"
  );

  if (entry === undefined) notFound();

  const Page = module.pages.admin.settings;

  return renderIfPermitted(entry.requiredPermission, () => <Page />);
}
```

The required permission comes from the module's own declaration, never from a literal in the app, so a module that changes its key cannot leave the app checking the old one.

The viewer route is deliberately not behind a module permission. It is an application-owned fixture whose purpose is header emission (R-49), and the frame policy is explicitly "not a grant to view a record". Record and page authorization stay where they are, behind `can()`.

Before writing these files, open `packages/modules/placeholder/src/module.ts` and confirm the `pages` shape, and open `packages/core/src/lib/module-contract/module.ts` for the `ModulePages` type. Do not guess either. If `ModulePages` types its entries as taking no props, the calls above are correct as written; if it does not, fix the call rather than the module.

```tsx
// apps/genie/src/app/viewer/[moduleId]/page.tsx
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { viewerModuleIds } from "../../../registry.ts";
import { viewerRouteFor } from "../../../viewer-routes.ts";

export const dynamic = "force-dynamic";

/**
 * The Section 0 viewer fixture. Entering it is a full document navigation, so
 * the response installs the viewer policy before the frame renders (R-49).
 *
 * The route mapping takes the id set explicitly, because `viewer-routes.ts`
 * imports nothing. In the server bundle the set comes from the registry. The
 * proxy reads the same set from the published context slot.
 */
export default async function ViewerPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;

  if (viewerRouteFor(`/viewer/${moduleId}`, viewerModuleIds) === undefined) notFound();

  const t = await getTranslations("viewer");

  return (
    <main>
      <h1>{t("heading")}</h1>
      <iframe
        title={t("frameTitle")}
        src="https://embed.placeholder.example.com/fixture"
        width="320"
        height="180"
      />
    </main>
  );
}
```

- [ ] **Step 4: Run the gates and commit**

```bash
pnpm exec nx affected -t build test lint typecheck --skip-nx-cache
git add apps/genie
git commit -m "feat(app): mount placeholder pages and the viewer route"
```

---

## Task 7: Headers, policy and the provider failure log

Closes `genie-ops-center-v2-yt2`.

**Files:**
- Modify: `packages/core/src/lib/content-security-policy/index.ts`
- Modify: `packages/core/src/lib/content-security-policy/index.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/genie/next.config.ts`
- Create: `apps/genie/src/proxy.ts`, `apps/genie/src/proxy.test.ts`

**Interfaces:**
- Consumes: `collectFrameOrigins`, `serializeContentSecurityPolicy`, `BASELINE_POLICY`; `viewerRouteFor`; `requireContext`.
- Produces: the `onProviderError` option on `collectFrameOrigins`.

- [ ] **Step 1: Write the failing core test for the failure callback**

`yt2` requires the failure to be reported while the helper stays pure and the policy stays denied.

```ts
// add to packages/core/src/lib/content-security-policy/index.test.ts
it("reports a provider failure through the supplied callback and still denies frames", async () => {
  const seen: unknown[] = [];
  const boom = new Error("provider exploded");

  const origins = await collectFrameOrigins(
    { frameOrigins: () => Promise.reject(boom) },
    { tenant: {} } as never,
    { onProviderError: (error) => seen.push(error) }
  );

  expect(origins).toEqual([]);
  expect(seen).toEqual([boom]);
});

it("still denies frames when the failure callback itself throws", async () => {
  const origins = await collectFrameOrigins(
    { frameOrigins: () => Promise.reject(new Error("provider exploded")) },
    { tenant: {} } as never,
    {
      onProviderError: () => {
        throw new Error("logger exploded");
      },
    }
  );

  expect(origins).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec nx run @genie/core:test --skip-nx-cache
```

Expected: FAIL, because `collectFrameOrigins` takes two parameters.

- [ ] **Step 3: Add the callback without adding a dependency**

Replace the `collectFrameOrigins` body in `packages/core/src/lib/content-security-policy/index.ts`:

```ts
/** How a caller learns that a provider failed. Core imports no logger (yt2). */
export type FrameOriginFailureOptions = {
  readonly onProviderError?: (error: unknown) => void;
};

export async function collectFrameOrigins<Ctx>(
  provider: FrameOriginProvider<Ctx> | undefined,
  ctx: Ctx,
  options: FrameOriginFailureOptions = {}
): Promise<readonly string[]> {
  if (provider === undefined) return [];

  try {
    return normalizeFrameOrigins(await provider.frameOrigins(ctx));
  } catch (error) {
    // A failed contribution denies frames. The caller owns the log line, because
    // this module stays pure and holds no logger. A reporter that throws must not
    // change the policy, so its own failure is swallowed too.
    try {
      options.onProviderError?.(error);
    } catch {
      // Reporting is best effort. The denied policy above is the guarantee.
    }

    return [];
  }
}
```

Add to the `packages/core/src/index.ts` export list:

```ts
export {
  BASELINE_POLICY,
  collectFrameOrigins,
  type FrameOriginFailureOptions,
  type FrameOriginProvider,
  isFrameOrigin,
  normalizeFrameOrigins,
  serializeContentSecurityPolicy,
} from "./lib/content-security-policy/index.ts";
```

- [ ] **Step 4: Run the core tests green**

```bash
pnpm exec nx run @genie/core:test --skip-nx-cache
```

- [ ] **Step 5: Add the universal header rules**

Replace `apps/genie/next.config.ts`:

```ts
// The build-safe subpath, not the core root. The root re-exports the tenant
// context, which imports `pg` and `drizzle-orm/node-postgres`, and the
// configuration file is evaluated by the build and by every server start.
import { BASELINE_POLICY } from "@genie/core/security";
import type { NextConfig } from "next";

/**
 * R-47 on every path. The viewer response replaces this policy in the proxy,
 * which the measurement showed replaces rather than duplicates. Keeping the
 * baseline on every path means a proxy that failed to run leaves frames denied
 * instead of leaving no policy at all.
 */
const STANDARD_HEADERS = [
  { key: "Content-Security-Policy", value: BASELINE_POLICY },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: "/(.*)", headers: STANDARD_HEADERS }];
  },
};

export default nextConfig;
```

- [ ] **Step 6: Write the failing proxy test**

```ts
// apps/genie/src/proxy.test.ts
import { BASELINE_POLICY } from "@genie/core";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { buildViewerPolicy, proxy } from "./proxy.ts";

describe("buildViewerPolicy", () => {
  it("replaces the frame source with the owning provider's origin", async () => {
    const policy = await buildViewerPolicy({
      provider: { frameOrigins: async () => ["https://embed.placeholder.example.com"] },
      ctx: { tenant: {} as never },
      report: vi.fn(),
    });

    expect(policy).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com"
    );
  });

  it("denies frames and reports when the provider fails", async () => {
    const report = vi.fn();

    const policy = await buildViewerPolicy({
      provider: { frameOrigins: () => Promise.reject(new Error("upstream down")) },
      ctx: { tenant: {} as never },
      report,
    });

    expect(policy).toBe(BASELINE_POLICY);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("denies frames for an invalid contribution", async () => {
    const policy = await buildViewerPolicy({
      provider: { frameOrigins: async () => ["*", "https:", "http://insecure.example"] },
      ctx: { tenant: {} as never },
      report: vi.fn(),
    });

    expect(policy).toBe(BASELINE_POLICY);
  });

  it("denies frames when no provider is registered for the route", async () => {
    const policy = await buildViewerPolicy({
      provider: undefined,
      ctx: { tenant: {} as never },
      report: vi.fn(),
    });

    expect(policy).toBe(BASELINE_POLICY);
  });
});

describe("the application redirect", () => {
  it("carries all five headers and exactly one policy", async () => {
    const response = await proxy(new NextRequest("https://example.invalid/home"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/");

    for (const header of [
      "content-security-policy",
      "strict-transport-security",
      "referrer-policy",
      "x-content-type-options",
      "permissions-policy",
    ]) {
      expect(response.headers.get(header)).not.toBeNull();
    }

    expect(response.headers.get("content-security-policy")).toBe(BASELINE_POLICY);
  });
});
```

- [ ] **Step 7: Write the proxy**

```ts
// apps/genie/src/proxy.ts
//
// Imports here decide what lands in the proxy bundle. The `@genie/core` root
// entry point re-exports the tenant context, which imports `pg` and
// `drizzle-orm/node-postgres`, so importing it would put the database driver in
// this bundle. The build-safe `@genie/core/security` subpath has no imports at
// all. Everything else the proxy needs, the provider map and the failure
// reporter, comes from the context slot, which the bootstrap filled.
import {
  type FrameOriginProvider,
  collectFrameOrigins,
  serializeContentSecurityPolicy,
} from "@genie/core/security";
import { type NextRequest, NextResponse } from "next/server";

import { readContext } from "./context.ts";
import { newRequestId } from "./request-id.ts";
import { viewerRouteFor } from "./viewer-routes.ts";

/** Pure, so the policy decision is testable without a request. */
export async function buildViewerPolicy<Ctx>(input: {
  provider: FrameOriginProvider<Ctx> | undefined;
  ctx: Ctx;
  report: (error: unknown) => void;
}): Promise<string> {
  const origins = await collectFrameOrigins(input.provider, input.ctx, {
    onProviderError: input.report,
  });

  return serializeContentSecurityPolicy(origins);
}

/**
 * The standard headers, repeated here for responses the proxy creates itself.
 * The framework attaches nothing to a redirect it generates, and a redirect the
 * proxy returns replaces the response entirely, so these have to be set on it
 * (Amendment B).
 */
const STANDARD_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/** Every redirect the application owns, so each one is header-capable. */
const APPLICATION_REDIRECTS: Readonly<Record<string, string>> = {
  "/home": "/",
};

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // Application redirects are emitted here, never through the framework's
  // redirect list, because that list produces a response with no headers at all.
  const destination = APPLICATION_REDIRECTS[pathname];

  if (destination !== undefined) {
    const redirect = NextResponse.redirect(new URL(destination, request.url), 307);

    for (const [key, value] of Object.entries(STANDARD_HEADERS)) {
      redirect.headers.set(key, value);
    }

    return redirect;
  }

  const response = NextResponse.next();
  const app = readContext();

  // Before the bootstrap publishes, no viewer route exists, so frames stay
  // denied by the baseline the header configuration already set.
  if (app === undefined) return response;

  const requestId = newRequestId();

  // One line per request (R-44), carrying the context id. This is also what the
  // single-context acceptance check reads, so it must run on every request and
  // not only on the viewer path.
  app.logRequest({ requestId, path: pathname });

  const route = viewerRouteFor(pathname, new Set(app.viewerProviders.keys()));

  // Ordinary documents, route handlers, health, assets and background requests
  // reach no provider at all, which is what R-49a counts.
  if (route === undefined) return response;

  const policy = await buildViewerPolicy({
    // Already wrapped with the invocation counter by the bootstrap, so a call
    // from any path is visible in the log that acceptance reads.
    provider: app.viewerProviders.get(route.moduleId),
    ctx: { tenant: app.tenant },
    report: (error) =>
      // yt2: the failure is recorded with request correlation, through the
      // redacting logger the bootstrap built, and the policy stays denied.
      app.reportProviderFailure(error, { moduleId: route.moduleId, requestId }),
  });

  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("x-request-id", requestId);

  return response;
}
```

- [ ] **Step 7a: Measure the proxy bundle rather than argue about it**

The reason the proxy avoids the core root entry point is to keep the database driver out of this bundle. Prove it:

The root `middleware.js` is a small loader that references other chunks, so grepping it alone proves nothing. Read the middleware manifest to find every file the proxy actually loads, then grep all of them:

```bash
pnpm exec nx run @genie/app:build --skip-nx-cache

The proxy runs on the Node runtime, and Next 16 records a Node proxy in `functions-config-manifest.json`, not in `middleware-manifest.json`, which carries edge entries. Read both, and fall back to locating the artifact on disk, so the check does not report a false pass on one shape or a false failure on the other:

```bash
cd apps/genie
FILES=$(node -e '
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const files = new Set();

for (const name of ["middleware-manifest.json", "functions-config-manifest.json"]) {
  const path = join(".next/server", name);
  if (!existsSync(path)) continue;

  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const entries = { ...(manifest.middleware ?? {}), ...(manifest.functions ?? {}) };

  for (const entry of Object.values(entries)) {
    for (const file of entry.files ?? []) files.add(join(".next", file).replace(/^\.next\/\.next\//, ".next/"));
    if (typeof entry.name === "string" && entry.name.includes("proxy")) files.add(entry.name);
  }
}

// Fallback: the artifact itself, whatever the manifests called it.
if (files.size === 0 && existsSync(".next/server")) {
  for (const name of readdirSync(".next/server")) {
    if (/^(proxy|middleware)\.js$/.test(name)) files.add(join(".next/server", name));
  }
}

// The entry file is a small loader that requires its real chunks. Grepping the
// loader alone examines a few hundred bytes and finds nothing, whatever the
// proxy imports. Follow every chunk path it names, and every chunk those name,
// to a fixpoint. Without this the check is vacuous in both directions.
const seen = new Set();
const queue = [...files];

while (queue.length > 0) {
  const file = queue.pop();

  if (seen.has(file) || !existsSync(file)) continue;

  seen.add(file);

  const text = readFileSync(file, "utf8");
  const matches = text.matchAll(/["\x27`]([^"\x27`]*chunks\/[^"\x27`]+\.js)["\x27`]/g);

  for (const match of matches) {
    const raw = match[1].replace(/^\.\//, "");

    // The loader mixes two bases. It requires its runtime as "./chunks/...",
    // relative to .next/server, and names its real chunks as "server/chunks/...",
    // relative to .next. Resolving everything against one base silently yields
    // paths that do not exist, and the walk then inspects nothing at all.
    for (const candidate of [join(".next", raw), join(".next/server", raw), raw]) {
      if (existsSync(candidate)) {
        queue.push(candidate);
        break;
      }
    }
  }
}

process.stdout.write([...seen].join(" "));')

echo "proxy files: $FILES"
COUNT=$(echo "$FILES" | wc -w)
test "$COUNT" -gt 1 || {
  echo "FAIL: only $COUNT file resolved. The chunk walk found nothing, so the check would be vacuous."
  exit 1
}
test -n "$FILES" || {
  echo "FAIL: could not locate the proxy bundle. Do not skip this check."
  echo "Inspect .next/server and the manifests, then fix the extractor."
  ls -1 .next/server | head -20
  exit 1
}

HITS=$(grep -l "node-postgres\|drizzle-orm\|[\"']pg[\"']" $FILES 2>/dev/null | wc -l)
echo "proxy files referencing a database driver: $HITS"
test "$HITS" -eq 0 || { echo "FAIL: the driver is in the proxy bundle"; exit 1; }
cd ../..
```

The observed loader shape this must handle, taken from a real Turbopack build:

```js
var R=require("./chunks/[turbopack]_runtime.js")("server/middleware.js")
R.c("server/chunks/[externals]__06m461e._.js")
R.c("server/chunks/[root-of-the-server]__0w-5c4v._.js")
```

Expected: a file list holding more than the loader, and zero hits. If the list has exactly one entry, the walk resolved nothing and the check is still vacuous. Two guards matter here. The empty-list guard stops a manifest shape change from passing while checking nothing. The chunk walk stops the check from examining only a 221-byte loader, which is what the entry file is in a Turbopack build.

**Run the positive control first.** Temporarily add `import { createTenantContext } from "@genie/core";` to `proxy.ts`, rebuild, and confirm the count becomes nonzero. Remove it afterwards.

The order matters here. The entry file is a small loader that requires its real chunks, so a version of this check that grepped only the entry file would report zero for a clean proxy and zero again for a deliberately contaminated one. Until the control has been seen to fail, a zero proves nothing.

If the count is nonzero, find the path with the build's own trace output, which prints the files compiled into the middleware bundle:

```bash
pnpm exec nx run @genie/app:build --skip-nx-cache 2>&1 | grep -A8 'Middleware:'
```

Remove the offending import rather than accepting the result. Remember the path is often indirect: the first attempt at this reached the driver through `viewer-routes.ts` to the registry to a module declaration to its router to the core root.

- [ ] **Step 8: Run the tests green and prove header coverage on the built image**

Rebuild the image, then run the coverage matrix. Redirects are never followed:

```bash
docker build -f deploy/Dockerfile --build-arg MODULE_INCLUDE=placeholder -t genie-s005:test .
```

Write this as a test file, not as prose. Prose cannot fail.

```ts
// apps/genie/testing/headers.integration.test.ts
import { startDisposableDeployment } from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startBuiltApp } from "./start-built-app.ts";

const FIVE = [
  "content-security-policy",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "permissions-policy",
];

const BASELINE = "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;
let server: Awaited<ReturnType<typeof startBuiltApp>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  server = await startBuiltApp(deployment.context.env.databaseUrl, 3411);
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop();
});

/** Raw request, redirects never followed, so the redirect itself is observable. */
async function raw(path: string) {
  const response = await fetch(`${server.baseUrl}${path}`, { redirect: "manual" });

  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

describe("header coverage on the built application", () => {
  // AC-25 names every response class, and a tRPC error is one of them. Its
  // success form is included too, so a broken route cannot make the error case
  // pass for the wrong reason.
  for (const path of [
    "/",
    "/api/status",
    "/api/health",
    "/definitely-missing",
    "/probe.txt",
    "/api/trpc/placeholder.read?input=%7B%7D",
    "/api/trpc/does.not.exist?input=%7B%7D",
  ]) {
    it(`${path} carries all five headers and the deny baseline`, async () => {
      const response = await raw(path);

      for (const header of FIVE) {
        expect(response.headers.get(header), `${path} is missing ${header}`).not.toBeNull();
      }

      expect(response.headers.get("content-security-policy")).toBe(BASELINE);
    });
  }

  it("the viewer replaces only the frame source", async () => {
    const response = await raw("/viewer/placeholder");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com"
    );
  });

  it("both spellings of the viewer route carry the viewer policy", async () => {
    const plain = await raw("/viewer/placeholder");
    const slashed = await raw("/viewer/placeholder/");

    expect(slashed.status).toBe(200);
    expect(slashed.headers.get("content-security-policy")).toBe(
      plain.headers.get("content-security-policy")
    );
  });

  it("a non-route path under the viewer prefix keeps the deny baseline", async () => {
    const response = await raw("/viewer/placeholder/extra");

    expect(response.headers.get("content-security-policy")).toBe(BASELINE);
  });

  it("the application redirect carries the full header set", async () => {
    const response = await raw("/home");

    expect(response.status).toBe(307);

    for (const header of FIVE) {
      expect(response.headers.get(header)).not.toBeNull();
    }
  });

  // Amendment B: the narrow exception, asserted rather than ignored.
  for (const [path, destination] of [
    ["//viewer", "/viewer"],
    ["/viewer//x", "/viewer/x"],
    ["/\\viewer", "/viewer"],
    ["/\\\\viewer", "/viewer"],
  ] as const) {
    it(`${path} is the normalization exception`, async () => {
      const response = await raw(path);

      expect(response.status).toBe(308);

      const location = response.headers.get("location");

      expect(location).toBe(destination);
      // Same-origin and relative: it never sends a client to another origin.
      expect(location?.startsWith("/")).toBe(true);
      // Not empty: the body is the normalized destination URL.
      expect(response.body).toBe(destination);

      for (const header of FIVE) {
        expect(response.headers.get(header)).toBeNull();
      }

      // The destination itself is fully covered, which is what bounds the exception.
      const followed = await raw(destination);

      for (const header of FIVE) {
        expect(followed.headers.get(header)).not.toBeNull();
      }
    });
  }

  // Headers alone do not prove the transport worked. Without these two, a
  // `placeholder.read` that returned an ordinary framework 404, or an unknown
  // procedure that never reached the adapter, would still pass the header loop.
  it("the tRPC success path returns a result, not a framework 404", async () => {
    const response = await raw("/api/trpc/placeholder.read?input=%7B%7D");

    expect(response.status).toBe(200);

    const body = JSON.parse(response.body) as { result?: { data?: unknown } };

    expect(body.result).toBeDefined();
  });

  it("an unknown procedure returns a tRPC error envelope with the additive fields", async () => {
    const response = await raw("/api/trpc/does.not.exist?input=%7B%7D");

    // The default transformer serializes the error directly under `error`.
    // There is no `json` wrapper unless a data transformer adds one, so an
    // earlier draft that read `error.json.data` asserted three undefined values.
    const body = JSON.parse(response.body) as {
      error?: { data?: { code?: string; appCode?: string; requestId?: string } };
    };

    expect(response.status).toBe(404);
    expect(body.error).toBeDefined();
    expect(body.error?.data?.code).toBe("NOT_FOUND");
    expect(body.error?.data?.appCode).toBeDefined();
    expect(body.error?.data?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a static chunk carries the headers", async () => {
    const home = await raw("/");
    const chunk = /\/_next\/static\/[^"']+\.js/.exec(home.body)?.[0];

    expect(chunk, "no static chunk found in the document").toBeDefined();

    const response = await raw(chunk as string);

    for (const header of FIVE) {
      expect(response.headers.get(header)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 9: Commit**

```bash
git add packages/core apps/genie
git commit -m "feat(app): emit the baseline policy and the viewer override"
```

---

## Task 8: The two-database isolation test

R-20 and AC-4. This test must never be skipped.

**Files:**
- Create: `apps/genie/testing/isolation.integration.test.ts`
- Create: `apps/genie/vitest.integration.config.ts`
- Modify: `apps/genie/package.json` (add `test:integration`)

**Interfaces:**
- Consumes: `startDisposableDeployment` from `@genie/core/testing`; `insertPlaceholderRecord` from `@genie/module-placeholder/testing`; `placeholderModule`, `placeholderRouter` from `@genie/module-placeholder`.

- [ ] **Step 1: Write the test**

```ts
// apps/genie/testing/isolation.integration.test.ts
import { createRequestPrincipal, createStubGrantReader } from "@genie/core";
import { startDisposableDeployment } from "@genie/core/testing";
import { placeholderModule, placeholderRouter } from "@genie/module-placeholder";
import { insertPlaceholderRecord } from "@genie/module-placeholder/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let first: Awaited<ReturnType<typeof startDisposableDeployment>>;
let second: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  [first, second] = await Promise.all([
    startDisposableDeployment([placeholderModule]),
    startDisposableDeployment([placeholderModule]),
  ]);
}, 180000);

afterAll(async () => {
  await Promise.all([first?.stop(), second?.stop()]);
});

const caller = () =>
  createRequestPrincipal({ userId: "isolation-test", groups: [] }, createStubGrantReader());

describe("two tenant contexts in one process", () => {
  it("each read returns only its own database's row", async () => {
    const firstRow = await insertPlaceholderRecord(first.context, { label: "first-only" });
    const secondRow = await insertPlaceholderRecord(second.context, { label: "second-only" });

    const readFirst = placeholderRouter.createCaller({
      tenant: first.context,
      caller: caller(),
    });
    const readSecond = placeholderRouter.createCaller({
      tenant: second.context,
      caller: caller(),
    });

    const fromFirst = await readFirst.read();
    const fromSecond = await readSecond.read();

    expect(fromFirst.map((row) => row.label)).toEqual(["first-only"]);
    expect(fromSecond.map((row) => row.label)).toEqual(["second-only"]);

    expect(fromFirst.map((row) => row.id)).not.toContain(secondRow.id);
    expect(fromSecond.map((row) => row.id)).not.toContain(firstRow.id);
  });

  it("uses two distinct databases", () => {
    expect(first.context.env.databaseUrl).not.toBe(second.context.env.databaseUrl);
  });
});
```

- [ ] **Step 2: Confirm the integration configuration from Task 4**

Task 4 Step 9c already created `apps/genie/vitest.integration.config.ts` and the `test:integration` script, so its own transport proof could run. Confirm both exist and that `passWithNoTests` is `false`, then continue. This task adds the target to the gates and proves the gate can fail.

- [ ] **Step 3: Put the target in a gate that actually runs**

This is the defect the review called a blocker. Today the root `test` script is `nx run-many -t test validate`, the normal gate is `nx affected -t build test lint typecheck`, and the shared unit preset excludes `testing/**`. None of them runs `test:integration`, so the never-skipped test of R-20 could sit green and unexecuted forever.

First give the target a cache policy, because `nx.json` has no `test:integration` entry today and an unconfigured target has no declared inputs or outputs. Add to `targetDefaults` in `nx.json`:

```json
{
  "test:integration": {
    "cache": false,
    "inputs": ["default", "^production"]
  }
}
```

Caching is off on purpose. A cached pass would let the mandatory test of R-20 report success without a container ever starting, which is the failure mode this whole task exists to prevent.

Then add the target to both root scripts, in the main checkout's `package.json`, under the recorded shared-file window:

```json
{
  "scripts": {
    "test": "nx run-many -t test test:integration validate",
    "affected": "nx affected -t build test test:integration lint typecheck build-storybook test-storybook && pnpm run validate"
  }
}
```

Record the write first, because the root manifest is a shared surface:

```bash
bd --actor claude-s0-05-2026-09-21 update genie-ops-center-v2-1rd.5 --append-notes \
  "Shared-file window: root package.json test and affected scripts gain test:integration, so the mandatory isolation test of R-20/AC-4 runs in a gate."
```

- [ ] **Step 4: Prove the gate fails when the test does not run**

A gate that cannot fail proves nothing. Run all three controls and record the outcomes.

Empty collection must fail:

```bash
mv apps/genie/testing/isolation.integration.test.ts /tmp/isolation.hidden.ts
pnpm exec nx run @genie/app:test:integration --skip-nx-cache; echo "empty collection exit=$?"
mv /tmp/isolation.hidden.ts apps/genie/testing/isolation.integration.test.ts
```

Expected: nonzero, from `passWithNoTests: false`.

A skipped test must fail. Do not rely on `--allowOnly`, which governs `.only` and has no effect on `.skip`. The suite carries its own guard instead, so skipping the case fails the run whatever the reporter does. Add this to `isolation.integration.test.ts`:

```ts
// R-20: this test must never be skipped, and a skipped run must fail the
// pipeline. A runner flag cannot express that, so the suite asserts its own
// execution. `afterAll` throwing fails the file.
let isolationRan = false;

afterAll(() => {
  if (!isolationRan) {
    throw new Error(
      "The two-context isolation case did not run. R-20 forbids skipping it."
    );
  }
});
```

Set `isolationRan = true` as the last statement of the isolation case. Then prove the guard bites:

```bash
sed -i 's/^  it("each read returns/  it.skip("each read returns/' apps/genie/testing/isolation.integration.test.ts
pnpm exec nx run @genie/app:test:integration --skip-nx-cache; echo "skipped exit=$?"
sed -i 's/^  it.skip("each read returns/  it("each read returns/' apps/genie/testing/isolation.integration.test.ts
pnpm exec nx run @genie/app:test:integration --skip-nx-cache; echo "restored exit=$?"
```

Expected: nonzero while skipped, zero after restoring. Record both numbers.

The root gate must include it:

```bash
pnpm exec nx affected -t test:integration --base=develop --dry-run
```

Expected: the plan lists `@genie/app:test:integration`.

- [ ] **Step 5: Run it against two real databases**

```bash
pnpm exec nx run @genie/app:test:integration --skip-nx-cache
```

Expected: PASS with two containers started. If Docker is unavailable, stop and report it. Do not mark this criterion satisfied and do not relabel a skipped run as a pass.

- [ ] **Step 6: Commit**

```bash
git add apps/genie package.json
git commit -m "test(app): prove tenant isolation across two databases"
```

---

## Task 9: Browser proof and the full acceptance matrix

**Files:**
- Create: `apps/genie/playwright.config.ts`
- Create: `apps/genie/e2e/placeholder.spec.ts`
- Create: `apps/genie/e2e/security-headers.spec.ts`
- Create: `apps/genie/e2e/fixtures/frame.ts`
- Create: `docs/tickets/spec-0/05-production-startup-and-csp-g2/evidence.md`
- Delete: the spike files listed in Step 6

**Dependencies this task adds:** `@playwright/test` and `@axe-core/playwright`, both named in the technology stack. Check each version against the registry and the `minimumReleaseAge` rule before installing, and record the published dates in the bead.

- [ ] **Step 1: Configure two viewports**

R-40 and AC-11: one configuration, two projects, phone and desktop.

```ts
// apps/genie/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? "3400");
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: BASE_URL },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  // The database and the application are both started in globalSetup.
  //
  // `webServer` is deliberately not used. Playwright builds its web-server
  // plugin before it runs global setup, so `env` is resolved from the config
  // object at that earlier moment. A DATABASE_URL that global setup discovers
  // afterwards can never reach it, and the server would start with an empty
  // value and fail validation before any test ran.
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
});
```

The browser layer runs against the standalone build the image also runs. AC-26's image clauses are proven separately in Task 3, against the container itself. Say which proof ran where in the evidence, and do not describe a standalone run as image acceptance.

- [ ] **Step 2: Write the controlled frame fixture**

The permitted origin does not resolve, so the browser enforces the policy and the test supplies the content. A denied frame never issues a request, so the route handler never runs, which is the denial evidence.

```ts
// apps/genie/e2e/fixtures/frame.ts
import type { Page } from "@playwright/test";

export type FrameFixture = { readonly requests: () => number };

/**
 * Serves controlled content for the permitted origin. Policy enforcement stays
 * with the browser: when the policy denies the frame, no request is issued and
 * the counter stays at zero.
 */
export async function installFrameFixture(page: Page, origin: string): Promise<FrameFixture> {
  let count = 0;

  await page.route(`${origin}/**`, async (route) => {
    count += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><html><body><p id="fixture">permitted frame content</p></body></html>',
    });
  });

  return { requests: () => count };
}
```

- [ ] **Step 3: Write the browser proof**

```ts
// apps/genie/e2e/placeholder.spec.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The Section 0 main path, as the stub actually defines it. The stub grants
// `placeholder:read` and refuses everything else (R-13), and the workspace entry
// requires `placeholder:use`, so navigating there is a denial. Asserting a
// rendered workspace page here would be asserting an unauthorized success.
test("navigation is visible and the module page is refused", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Modules" });

  await expect(nav.getByRole("link", { name: "Placeholder" })).toBeVisible();

  await nav.getByRole("link", { name: "Placeholder" }).click();

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  // The refused page reveals nothing it would have rendered.
  await expect(page.getByText("No records yet.")).toHaveCount(0);

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("the admin page is refused as well", async ({ page }) => {
  await page.goto("/admin/placeholder");

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Placeholder settings" })).toHaveCount(0);
});

// The one authorized success path Section 0 has: the read procedure behind the
// single granted key. Without this, every page assertion above is a denial and
// nothing proves the stub grants anything at all.
test("the placeholder read procedure succeeds through the real transport", async ({ request, baseURL }) => {
  const response = await request.get(
    `${baseURL}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
  );

  expect(response.status()).toBe(200);

  const body = (await response.json()) as { result?: { data?: unknown } };

  expect(body.result).toBeDefined();
});

test("styles and hydration work without a nonce", async ({ page }) => {
  await page.goto("/");

  // A style the stylesheet supplies, so a failed stylesheet is visible here.
  const body = page.locator("body");

  await expect(body).toBeVisible();

  const applied = await body.evaluate((node) => getComputedStyle(node).getPropertyValue("margin"));

  expect(applied).not.toBe("");

  // React attached. A hydration failure leaves this attribute absent.
  await expect(page.locator("html")).toBeAttached();

  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));

  await page.reload();

  expect(errors).toEqual([]);
});
```

```ts
// apps/genie/e2e/security-headers.spec.ts
import { expect, test } from "@playwright/test";

import { installFrameFixture } from "./fixtures/frame.ts";

const PERMITTED = "https://embed.placeholder.example.com";
const UNLISTED = "https://not-permitted.example.com";

test("the viewer loads the permitted frame after a full document navigation", async ({ page }) => {
  const fixture = await installFrameFixture(page, PERMITTED);

  await page.goto("/");

  // A full document navigation, so the response installs the policy first.
  await page.goto("/viewer/placeholder");

  const frame = page.frameLocator("iframe");

  await expect(frame.locator("#fixture")).toBeVisible();
  await expect(frame.locator("#fixture")).toHaveText("permitted frame content");
  expect(fixture.requests()).toBeGreaterThan(0);
});

test("an ordinary page cannot load the same frame", async ({ page }) => {
  const fixture = await installFrameFixture(page, PERMITTED);

  await page.goto("/");

  await page.evaluate((src) => {
    const frame = document.createElement("iframe");
    frame.src = `${src}/fixture`;
    frame.id = "injected";
    document.body.append(frame);
  }, PERMITTED);

  await page.waitForTimeout(1000);

  // The policy denies frames, so the browser never issues the request.
  expect(fixture.requests()).toBe(0);
  await expect(page.frameLocator("#injected").locator("#fixture")).toHaveCount(0);
});

test("the viewer refuses an unlisted origin", async ({ page }) => {
  const unlisted = await installFrameFixture(page, UNLISTED);

  await page.goto("/viewer/placeholder");

  await page.evaluate((src) => {
    const frame = document.createElement("iframe");
    frame.src = `${src}/fixture`;
    frame.id = "unlisted";
    document.body.append(frame);
  }, UNLISTED);

  await page.waitForTimeout(1000);

  expect(unlisted.requests()).toBe(0);
});

test("another page cannot frame the application", async ({ page, baseURL }) => {
  await page.setContent(`<iframe id="outer" src="${baseURL}/"></iframe>`);

  await page.waitForTimeout(1000);

  // frame-ancestors 'none' blocks the embed, so the document never renders.
  await expect(page.frameLocator("#outer").getByRole("heading")).toHaveCount(0);
});

test("object content is blocked", async ({ page }) => {
  await page.goto("/");

  const loaded = await page.evaluate(async () => {
    const element = document.createElement("object");
    element.data = "/probe.txt";
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return element.contentDocument !== null;
  });

  expect(loaded).toBe(false);
});

test("a cross-origin base element cannot change URL resolution", async ({ page }) => {
  await page.goto("/");

  const resolved = await page.evaluate(() => {
    const base = document.createElement("base");
    base.href = "https://attacker.example.com/";
    document.head.append(base);

    const anchor = document.createElement("a");
    anchor.href = "relative";
    return anchor.href;
  });

  // base-uri 'self' means the injected base is ignored.
  expect(resolved).not.toContain("attacker.example.com");
});
```

Assert visible content, never the `load` event alone. Every denial asserts both that the fixture is not visible and that `requests()` is zero.

- [ ] **Step 3a: Run both viewports and prove both actually collected**

The database is started by Playwright itself, through `globalSetup`, and stopped in `globalTeardown`. A shell command substitution cannot do this: `$(node start-e2e-database.mjs)` waits for the process to exit, while the helper has to stay alive to keep the container running, so the run would hang before a single test started.

R-40 requires the end-to-end layer to run against a compose file that starts one deployment, not against a host process plus a container. Create the minimal stack first:

```yaml
# deploy/stack/compose.e2e.yaml
# The smallest deployment R-40 asks for: the image and its database. It holds no
# secret and no host-specific value, so it is committed. Section 1 replaces it
# with the generated customer stack.
services:
  database:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: genie
      POSTGRES_PASSWORD: genie
      POSTGRES_DB: genie
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U genie"]
      interval: 2s
      timeout: 3s
      retries: 30

  app:
    image: ${GENIE_IMAGE:-genie-s005:test}
    depends_on:
      database:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://genie:genie@database:5432/genie
      PUBLIC_URL: http://127.0.0.1:3400
      PORT: "3400"
    ports:
      - "${GENIE_HOST_PORT:-3400}:3400"
```

The host port is parameterized so a second project, such as the failing-provider run below, can start beside the main stack instead of colliding on 3400.

Global setup brings that stack up and waits for readiness. It does not start a host process, because a host process is not the deployment R-40 names.

```ts
// apps/genie/e2e/global-setup.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const COMPOSE = [
  "compose",
  "-p",
  "genie-s005-e2e",
  "-f",
  "deploy/stack/compose.e2e.yaml",
];

export default async function globalSetup(): Promise<void> {
  // A targeted run may have started its own deployment already, for example the
  // failing-provider case. Starting a second stack would collide on the host
  // port, so this hook stands aside when one is supplied.
  if (process.env.GENIE_E2E_EXTERNAL === "1") return;

  // A fixed project name, so teardown and the pre-run cleanup can find this
  // stack without a state file and without guessing a container id.
  await run("docker", [...COMPOSE, "up", "-d", "--wait"], { cwd: process.cwd() });

  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    const ready = await fetch("http://127.0.0.1:3400/api/health")
      .then((response) => response.status === 200)
      .catch(() => false);

    if (ready) return;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const logs = await run("docker", [...COMPOSE, "logs"]).catch(() => ({ stdout: "" }));

  throw new Error(`The compose deployment never became ready.\n${logs.stdout}`);
}
```

```ts
// apps/genie/e2e/global-teardown.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { COMPOSE } from "./global-setup.ts";

const run = promisify(execFile);

export default async function globalTeardown(): Promise<void> {
  if (process.env.GENIE_E2E_EXTERNAL === "1") return;

  // The fixed project name makes this work whether or not the two hooks shared
  // a process, and whatever the previous run left behind.
  await run("docker", [...COMPOSE, "down", "-v"]).catch(() => undefined);
}
```

Because the stack has a fixed project name, an interrupted run is cleaned up by running the same teardown command again. No state file, no container id lookup and no port matching is needed, which removes the whole class of stale-container problems an earlier draft tried to solve by filtering `docker ps` on a published port. That filter matched the container port rather than the mapped host port and would have found nothing.

Run teardown before the browser run as well as after:

```bash
docker compose -p genie-s005-e2e -f deploy/stack/compose.e2e.yaml down -v || true
docker build -f deploy/Dockerfile --build-arg MODULE_INCLUDE=placeholder -t genie-s005:test .
pnpm exec playwright test --config apps/genie/playwright.config.ts --reporter=list
```

The browser layer therefore exercises the actual image inside the deployment, which is what R-40 asks for and what the earlier host-process arrangement did not provide.

The state-file helper an earlier draft used is no longer needed and is not written.

```bash
pnpm exec nx run @genie/app:build --skip-nx-cache
pnpm exec playwright test --config apps/genie/playwright.config.ts --reporter=list
```

Expected: every test listed twice, once under `phone` and once under `desktop`. A configuration that declares two projects is not evidence that two ran, so count the results:

```bash
pnpm exec playwright test --config apps/genie/playwright.config.ts --reporter=json \
  | node -e 'let r="";process.stdin.on("data",c=>r+=c).on("end",()=>{
  const j=JSON.parse(r);const p=new Set();let n=0;
  const walk=s=>{for(const t of s.suites??[])walk(t);for(const t of s.specs??[])for(const x of t.tests){p.add(x.projectName);n+=1;}};
  for(const s of j.suites)walk(s);
  console.log("projects that ran:",[...p].join(", "),"tests:",n);
  const missing=["phone","desktop"].filter(x=>!p.has(x));
  if(missing.length||n===0){console.error("FAIL: missing",missing.join(",")||"tests");process.exit(1);}
})'
```

Expected: both project names and a nonzero test count, with a nonzero exit if either is missing. Printing the names without checking them would let one project, or none, pass silently.

- [ ] **Step 3b: Count provider invocations on the built image**

R-49a requires zero frame-origin provider calls outside the viewer, including prefetch and RSC requests. The bootstrap wrapped every provider with a line that says `frame origin provider invoked`, so the count is readable from the container log.

Start the image, then request each non-viewer class, including a prefetch and an RSC request, and assert the count did not move. Then request the viewer document and assert it moved by exactly one:

```bash
BEFORE=$(docker logs "$CONTAINER" 2>&1 | grep -c 'frame origin provider invoked' || true)
for path in / /api/health /api/trpc/placeholder.read /probe.txt /definitely-missing /viewer/placeholder/extra; do
  curl -s -o /dev/null "http://127.0.0.1:$PORT$path"
done
curl -s -o /dev/null -H 'RSC: 1' "http://127.0.0.1:$PORT/"
curl -s -o /dev/null -H 'Next-Router-Prefetch: 1' -H 'RSC: 1' "http://127.0.0.1:$PORT/placeholder"
AFTER=$(docker logs "$CONTAINER" 2>&1 | grep -c 'frame origin provider invoked' || true)
NON_VIEWER_DELTA=$((AFTER - BEFORE))
echo "non-viewer delta: $NON_VIEWER_DELTA"
test "$NON_VIEWER_DELTA" -eq 0 || { echo "FAIL: a provider ran outside the viewer"; exit 1; }

curl -s -o /dev/null "http://127.0.0.1:$PORT/viewer/placeholder"
VIEWER=$(docker logs "$CONTAINER" 2>&1 | grep -c 'frame origin provider invoked' || true)
VIEWER_DELTA=$((VIEWER - AFTER))
echo "viewer delta: $VIEWER_DELTA"
# Exactly one. A zero would mean the counter never fires, which would make the
# assertion above pass for the wrong reason.
test "$VIEWER_DELTA" -eq 1 || { echo "FAIL: expected exactly one provider call"; exit 1; }
```

Expected: both assertions pass. The viewer assertion is the positive control for the non-viewer one. Note that `/viewer/placeholder/extra` is in the non-viewer list on purpose: it sits under the viewer prefix but is not a viewer route, so it must reach no provider and must carry the deny baseline.

- [ ] **Step 3a2: Prove a failed provider on a real response and in the browser**

R-50 requires this in so many words: with a throwing provider or an invalid contribution, prove the response retains a restrictive policy and the fixture is not displayed. AC-25 says the same. Unit tests on `buildViewerPolicy` do not satisfy it, because they never exercise the proxy's response path.

The compiled placeholder provider always succeeds, so a second module is needed. Generate a disposable one, build a second image from it, and delete the package immediately after the build. Nothing ships: the module exists only between the two commands, and no image built from a real selection contains it.

```bash
FIXTURE=packages/modules/failing-viewer
mkdir -p "$FIXTURE/src"

cat > "$FIXTURE/package.json" <<'JSON'
{
  "name": "@genie/module-failing-viewer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "genie": { "module": { "id": "failing-viewer", "entrypoint": "src/index.ts" } }
}
JSON
```

Write `src/index.ts` exporting `failingViewerModule`, copying the placeholder's declaration shape, with one difference:

```ts
contentSecurityPolicy: {
  frameOrigins: async () => {
    throw new Error("fixture: the origin provider is unavailable");
  },
},
```

Add a second variant whose provider returns invalid contributions instead, so both halves of "failed or invalid" are covered:

```ts
frameOrigins: async () => ["*", "https:", "http://insecure.example", "not-an-origin"],
```

Build, run the assertions, then remove the package:

```bash
pnpm install
docker build -f deploy/Dockerfile --build-arg MODULE_INCLUDE=failing-viewer -t genie-s005:failing .
rm -rf "$FIXTURE"
pnpm install
```

Start that image against a disposable database, exactly as the other container tests do:

```bash
PORT=3405
CONTAINER=$(docker run --network=host -d \
  -e DATABASE_URL="$E2E_DATABASE_URL" \
  -e PUBLIC_URL="http://127.0.0.1:$PORT" \
  -e PORT="$PORT" \
  genie-s005:failing)

for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || true)
  test "$code" = "200" && break
  sleep 0.5
done
test "$code" = "200" || { echo "FAIL: the failing-provider image never became ready"; docker logs "$CONTAINER"; exit 1; }
```

`E2E_DATABASE_URL` is a fresh disposable database, reachable from the container. Reuse the compose database by pointing at it, or start one the same way the image tests do. Remove the container when the assertions below finish.

Then assert on the real viewer response:

```bash
headers=$(curl -s -o /dev/null -D - "http://127.0.0.1:$PORT/viewer/failing-viewer")
policy=$(printf '%s\n' "$headers" | grep -i '^content-security-policy:' | cut -d' ' -f2- | tr -d '\r')
count=$(printf '%s\n' "$headers" | grep -ci '^content-security-policy:')

test "$count" -eq 1 || { echo "FAIL: expected exactly one policy"; exit 1; }
test "$policy" = "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'" \
  || { echo "FAIL: a failed provider widened the policy to: $policy"; exit 1; }

# The failure is recorded, which is the yt2 obligation, and nothing about the
# upstream error reaches the response.
docker logs "$CONTAINER" 2>&1 | grep -q 'frame origin provider failed' \
  || { echo "FAIL: the provider failure was not logged"; exit 1; }
printf '%s' "$headers" | grep -qi 'unavailable' && { echo "FAIL: error text leaked into headers"; exit 1; }
```

```bash
docker rm -f "$CONTAINER"
```

The browser case needs the same image serving the browser's base URL. Run it with a second compose project that overrides the image, so the main stack is untouched:

```bash
GENIE_IMAGE=genie-s005:failing GENIE_HOST_PORT=3406 \
  docker compose -p genie-s005-failing -f deploy/stack/compose.e2e.yaml up -d --wait

# The stack is already up, so the Playwright hooks stand aside rather than
# starting a second one on the same host port.
GENIE_E2E_EXTERNAL=1 E2E_BASE_URL=http://127.0.0.1:3406 \
  pnpm exec playwright test --config apps/genie/playwright.config.ts -g "failed provider"

docker compose -p genie-s005-failing -f deploy/stack/compose.e2e.yaml down -v
```

The compose file reads both `GENIE_IMAGE` and `GENIE_HOST_PORT`, so no second file is needed.

The browser case asserts the controlled fixture is **not** displayed and that its origin was never requested:

```ts
test("a failed provider leaves the viewer frame blocked", async ({ page }) => {
  const fixture = await installFrameFixture(page, "https://embed.placeholder.example.com");

  await page.goto("/viewer/failing-viewer");

  await page.waitForTimeout(1000);

  expect(fixture.requests()).toBe(0);
  await expect(page.frameLocator("iframe").locator("#fixture")).toHaveCount(0);
});
```

Run the invalid-contribution variant through the same two assertions. Neither may widen the policy, and neither may fall back to a wildcard or to `https:`.

- [ ] **Step 3b1: Start the normal image for the remaining container checks**

The failing-provider container from the previous step is removed. The provider-count, header and context checks below run against the ordinary image, so start it explicitly rather than inheriting a variable from a step that ended.

```bash
PORT=3407
CONTAINER=$(docker run --network=host -d \
  -e DATABASE_URL="$E2E_DATABASE_URL" \
  -e PUBLIC_URL="http://127.0.0.1:$PORT" \
  -e PORT="$PORT" \
  genie-s005:test)

for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || true)
  test "$code" = "200" && break
  sleep 0.5
done
test "$code" = "200" || { echo "FAIL: the image never became ready"; docker logs "$CONTAINER"; exit 1; }
```

Remove it with `docker rm -f "$CONTAINER"` once Steps 3b, 3b2 and 3c have finished with it.

- [ ] **Step 3b2: Repeat the header and context proof against the container**

Task 7 runs the header matrix against the standalone build, which is the built application R-50 names. The image adds its own variables: the asset placement the Dockerfile performs, the entrypoint's discovery, and the container filesystem. Repeat a representative subset against the running container so a packaging mistake cannot hide behind a passing host run.

```bash
# The header matrix against the CONTAINER, not the host standalone tree. Task 7
# proves the built application; this proves the image, which adds the Dockerfile
# asset placement, the entrypoint discovery and the container filesystem.
BASE="http://127.0.0.1:$PORT"
BASELINE="base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'"
FAILED=0

# A real chunk URL taken from the served document, so a misplaced .next/static
# shows up as a 404 here.
CHUNK=$(curl -s "$BASE/" | grep -o '/_next/static/[^"]*\.js' | head -1)
test -n "$CHUNK" || { echo "FAIL: no static chunk referenced by the document"; exit 1; }

check() {
  label=$1; path=$2; want_status=$3; want_policy=$4
  headers=$(curl -s -o /dev/null -D - "$BASE$path")
  status=$(printf '%s' "$headers" | head -1 | awk '{print $2}')
  count=$(printf '%s\n' "$headers" | grep -ci '^content-security-policy:')
  policy=$(printf '%s\n' "$headers" | grep -i '^content-security-policy:' | head -1 | cut -d' ' -f2- | tr -d '\r')
  five=0
  for h in content-security-policy strict-transport-security referrer-policy x-content-type-options permissions-policy; do
    printf '%s\n' "$headers" | grep -qi "^$h:" && five=$((five + 1))
  done

  echo "$label status=$status five=$five/5 policies=$count"

  test "$status" = "$want_status" || { echo "  FAIL: expected status $want_status"; FAILED=1; }
  test "$five" -eq 5 || { echo "  FAIL: missing headers"; FAILED=1; }
  test "$count" -eq 1 || { echo "  FAIL: expected exactly one policy"; FAILED=1; }
  test "$policy" = "$want_policy" || { echo "  FAIL: policy was $policy"; FAILED=1; }
}

# A real CSS URL as well as a JS one. An asset-placement regression can affect
# one and not the other, and a stylesheet that 404s is exactly what makes a page
# look broken while every other check stays green.
CSS=$(curl -s "$BASE/" | grep -o '/_next/static/[^"]*\.css' | head -1)
test -n "$CSS" || { echo "FAIL: no stylesheet referenced by the document"; exit 1; }

check "document      " "/" 200 "$BASELINE"
check "health        " "/api/health" 200 "$BASELINE"
check "status        " "/api/status" 200 "$BASELINE"
check "not found     " "/definitely-missing" 404 "$BASELINE"
check "public asset  " "/probe.txt" 200 "$BASELINE"
check "static chunk  " "$CHUNK" 200 "$BASELINE"
check "trpc success  " "/api/trpc/placeholder.read?input=%7B%7D" 200 "$BASELINE"
check "viewer        " "/viewer/placeholder" 200 \
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com"
check "viewer non-route" "/viewer/placeholder/extra" 404 "$BASELINE"
check "static css    " "$CSS" 200 "$BASELINE"

# A 200 alone would pass for an unprocessed two-line stylesheet, which is what
# the image serves if the Tailwind PostCSS plugin ever goes missing.
curl -s "$BASE$CSS" | grep -q "@layer theme" \
  || { echo "FAIL: the served stylesheet holds no Tailwind output"; FAILED=1; }
check "trpc error    " "/api/trpc/does.not.exist?input=%7B%7D" 404 "$BASELINE"
check "app redirect  " "/home" 307 "$BASELINE"

# The Amendment B exception, asserted on the image as well as on the host build.
# Each of these must carry no standard header and no policy, and its normalized
# destination must carry the full set.
for path in '//viewer' '/viewer//x' '/\\viewer'; do
  headers=$(curl -s -o /dev/null -D - "$BASE$path")
  status=$(printf '%s' "$headers" | head -1 | awk '{print $2}')
  count=$(printf '%s\n' "$headers" | grep -ci '^content-security-policy:')

  echo "normalization $path status=$status policies=$count"
  test "$status" = "308" || { echo "  FAIL: expected 308"; FAILED=1; }
  test "$count" -eq 0 || { echo "  FAIL: expected no policy on the exception"; FAILED=1; }
done

test "$FAILED" -eq 0 || { echo "FAIL: the image header matrix did not pass"; exit 1; }
```

The static chunk row is the one that catches a wrongly placed asset directory: the image can boot, answer health and serve the document while every chunk 404s.

Then run the full AC-26 concurrency clause here, where every route exists:

```bash
# Mark the log position, so the count covers this batch and not the bootstrap
# line or anything an earlier step logged.
MARK=$(docker logs "$CONTAINER" 2>&1 | wc -l)

rm -f /tmp/s005-codes
for _ in $(seq 1 8); do
  curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$PORT/" >>/tmp/s005-codes &
  curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$PORT/api/trpc/placeholder.read?input=%7B%7D" >>/tmp/s005-codes &
  curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$PORT/viewer/placeholder" >>/tmp/s005-codes &
done
wait

# Every request must have succeeded. Twenty-four failures would otherwise leave
# one bootstrap context id in the log and pass.
OK=$(grep -c '^200$' /tmp/s005-codes || true)
echo "successful responses: $OK of 24"
test "$OK" -eq 24 || { echo "FAIL: not every concurrent request succeeded"; cat /tmp/s005-codes; exit 1; }

BATCH=$(docker logs "$CONTAINER" 2>&1 | tail -n +$((MARK + 1)))

# One request log line per request, each carrying a context id.
LINES=$(echo "$BATCH" | grep -c '"contextId"' || true)
echo "request log lines in this batch: $LINES"
test "$LINES" -ge 24 || { echo "FAIL: requests were not logged, so the count below proves nothing"; exit 1; }

# All three route classes appear, so the batch really exercised page, tRPC and viewer.
for path in '"path":"/"' 'api/trpc' 'viewer/placeholder'; do
  echo "$BATCH" | grep -q "$path" || { echo "FAIL: no request logged for $path"; exit 1; }
done

IDS=$(echo "$BATCH" | grep -o '"contextId":"[^"]*"' | sort -u | wc -l)
echo "distinct context ids: $IDS"
test "$IDS" -eq 1 || { echo "FAIL: more than one context served the load"; exit 1; }
```

Expected: twenty-four successful responses, at least twenty-four request log lines, all three route classes present, and exactly one distinct context id. Each guard exists because the count alone would pass on a container that answered nothing. This is the clause Task 3 deliberately did not claim.

- [ ] **Step 3c: Prove excluded modules are absent from an image**

R-22 and AC-5. Build a second image with an explicitly empty selection and inspect it:

```bash
docker build -f deploy/Dockerfile --build-arg MODULE_INCLUDE= -t genie-s005:empty .

# Count, then assert. A pipeline ending in `head` exits zero whether or not it
# found anything, so an earlier draft of this check could never fail.
HITS=$(docker run --rm genie-s005:empty sh -c \
  'grep -rl "placeholder_record\|@genie/module-placeholder" . 2>/dev/null | wc -l')
echo "placeholder references in the empty image: $HITS"
test "$HITS" -eq 0 || { echo "FAIL: excluded module present"; exit 1; }

SQL=$(docker run --rm genie-s005:empty sh -c 'find . -path "*drizzle*" -name "*.sql" | wc -l')
echo "module migration files in the empty image: $SQL"
test "$SQL" -eq 0 || { echo "FAIL: excluded migration files present"; exit 1; }
```

Expected: both counts are zero, and the commands exit nonzero if they are not. Run the same two counts against the `placeholder` image as a positive control, where both must be greater than zero. A check that cannot distinguish the two images proves nothing.

Then start the empty image against a fresh database and prove the routes and tables are absent:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$EMPTY_PORT/placeholder"
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$EMPTY_PORT/viewer/placeholder"
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$EMPTY_PORT/api/health"
```

Expected: `404`, `404`, `200`. Then query the fresh database and assert no `placeholder_record` table and no `__drizzle_migrations_placeholder` table exist.

- [ ] **Step 4: Run the full amended matrix on the built image**

Run every acceptance item against the running container, not a development server:

Each item names where its executable check lives. Nothing on this list is satisfied by prose.

| Criterion | Executable check |
| --- | --- |
| AC-26 build | Task 1 Step 12, the build with deployment values unset |
| AC-26 startup exit, on the image | Task 3, `exits nonzero for malformed configuration without connecting`, and the lock-timeout test asserting a nonzero container exit code |
| AC-26 failure budget when cleanup or flushing hangs | Task 3 Step 5, the two unit cases that hang the pool close and the logger flush. These are unit-level on purpose: making the image hang would mean shipping a fault-injection switch in production code. The image proves the observable consequence, a bounded nonzero exit; the unit tests prove the guarantee that produces it. Record this split in the evidence rather than describing either as the other |
| AC-26 migrations block readiness | Task 3, `never answers health when migrations cannot run` |
| AC-26 one context under load | Task 3, `shares one context across concurrent page, tRPC and viewer requests` |
| AC-26 second runtime configuration | Task 3, `uses a second runtime configuration rather than build-time values` |
| AC-25, R-50 headers | Task 7 Step 8, the header matrix against the running image |
| AC-25, R-49a provider counts | Task 9 Step 3b, log-counted deltas |
| AC-15 both transports | Task 4 Step 9b, real HTTP and a real `@trpc/client` round trip |
| AC-16 viewer policy and framing | Task 9 Step 3, `security-headers.spec.ts` |
| AC-11 two viewports | Task 9 Step 3a, the per-project result count |
| AC-4 isolation | Task 8 Steps 4 and 5, including the empty-collection and skipped controls |
| R-22 excluded modules | Task 9 Step 3c, the explicitly empty image |
| R-36 hostname | Assert that no application source reads the request `Host` header: `grep -rn "headers().get(\"host\")\|headers.get('host')" apps/genie/src` returns nothing |

- [ ] **Step 5: Write the gate evidence**

Create `evidence.md` in this folder with the integrated revision, exact commands, real outcomes, red and green evidence, negative controls and every unverified limit. Never record a planned success.

- [ ] **Step 6: Remove the throwaway spike**

Only after Tasks 3, 7, 8 and 9 have real tests covering startup ordering, failure termination, context sharing, redirect behavior and packaging. Remove exactly these paths and nothing else:

```bash
rm -rf /home/kenan/work/genie-ops-center-v2.feature-s0-05-production-startup-csp/.spike
rm -f /tmp/s0-05-events.jsonl /tmp/s0-05-spike.log
git status --porcelain
```

Expected: `.spike` was never tracked, so `git status` shows no deletion.

- [ ] **Step 7: Reconcile with develop, rerun affected proof, then close**

Ask the human for the exclusive integration window first. After reconciliation, rerun the affected gates and the image matrix. Close `yt2` and `3yv` first, then `1rd.5`, each with the integrated revision and passing evidence. If any proof fails or cannot run, keep G2 open and leave the descendants blocked.

---

## Self-review

**Spec coverage.** R-19/R-19a/R-19b Task 3. R-20 Task 8. R-21/R-22/R-23/R-23a Task 2, with R-22 proven in Task 9 Step 3c. R-32/R-33/R-35 Task 3. R-36 Task 9 Step 4. R-36a Task 3. R-40 Task 9. R-41d Task 5. R-43 Task 4. R-46 Task 4, proven over HTTP in Step 9b. R-47/R-48/R-49/R-49a/R-50 Task 7 and Task 9. AC-4 Task 8. AC-11 Task 9 Step 3a. AC-15 Task 4 Step 9b. AC-16/AC-23/AC-25 Task 7 and Task 9. AC-26 Task 1, Task 3 and Task 9. Children: `yt2` Task 7, `3yv` Task 1.

**Ordering.** Task 2 produces `modules`, `moduleById` and `selectedModuleIds`, consumed by Tasks 3, 4, 6 and 7. Task 3 produces `AppContext` with `viewerProviders` and `reportProviderFailure`, consumed by Task 7, and the `@genie/core/security` subpath, also consumed by Task 7. Task 6 produces `viewerRouteFor`, consumed by Task 7. Task 4 produces `startBuiltApp`, reused by Task 9. No task consumes something a later task creates.

**Scope boundaries this plan asserts, with their authority.** The missing-key check and full catalogue coverage of module page text are S0-09, per the coverage map row `AC-12, AC-13 | S0-09` and `R-42, R-43 | S0-09 | S0-05 initial app messages`. This task delivers the seam and the application's own strings. The full selection and cache matrix is S0-06 and S0-10; this task proves only the selection cases its own registry and image need.

**Open items to resolve during execution, never silently.** Four, each with its own step. The Tailwind 4 compile API, Task 1 Step 2. The `ModulePages` prop shape, Task 6 Step 3. The next-intl App Router entry points, Task 4 Step 10. The Nx `nx.targets` merge onto an inferred script target, Task 2 Step 11, which has a named fallback: convert the app to an explicit `project.json` and record why.

**Call-site consistency check, run after any change to a shared signature.** Revision 2 changed `viewerRouteFor` to take an id set and left the viewer page calling it with one argument, which a stop-time review caught. Before declaring a task done, grep the plan and the source for every call site of anything whose signature changed in that task.

**Residual risks this plan accepts and measures rather than argues.** The proxy bundle must not carry the database driver, measured in Task 7 Step 7a. The gate must be able to fail, measured in Task 8 Step 4. Two viewports must actually run, measured in Task 9 Step 3a. Registry generation must be driven by the consumer and not by a stale file, measured by the negative control in Task 2 Step 12.
