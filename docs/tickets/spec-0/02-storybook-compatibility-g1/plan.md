# S0-02 Storybook and component-test compatibility implementation plan (G1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that one development-only Storybook host, its addons, and one Vitest-addon component-test runner work together on this repository's pinned toolchain, with documented stories, real interaction and accessibility failures, and a private local MCP endpoint.

**Architecture:** One `apps/storybook` project, tagged `app`, running `@storybook/nextjs-vite`. `packages/config` owns the shared preset body and a new shared component-test preset. Story discovery calls the S0-01 data-only selection resolver, so the host never imports a runtime registry, a database factory, or a deployment environment value. Component tests run through the Storybook Vitest addon in a separate Vitest project, so the unit collection and the component collection stay distinct.

**Tech Stack:** Node 26.9.0, pnpm 12.4.2, Nx 23.2.1, TypeScript 7.0.2, Oxlint 1.83.0, oxfmt 0.68.0, Storybook 10.6.0, `@nx/storybook` 23.2.1, Vitest 4.1.11, Next.js 16.3.5, React 19.3.0, Vite 8.3.0, Tailwind CSS 4.3.3.

**Spec:** [Spec 0](../../../specs/00-monorepo-foundation.md) R-41a to R-41e and AC-27, [technical plan](../../../tech-plans/00-monorepo-foundation.md) Stage 1 and Gate G1, [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [UI development workflow](../../../architecture/ui-development.md), [ticket](index.md).

**Bead:** `genie-ops-center-v2-1rd.2`. Branch `feature/s0-02-storybook-g1`. Base `develop` at `7fe04be`.

## Start gate

Do not begin Task 1 until all four conditions hold.

1. Bead `genie-ops-center-v2-1rd.1` is closed in the shared Beads database. It was `IN_PROGRESS` when this plan was written.
2. `bd ready` lists `genie-ops-center-v2-1rd.2`.
3. `develop` contains the integrated S0-01 revision. Confirmed at `7fe04be`, the merge of pull request 1.
4. Bead `genie-ops-center-v2-1rd.2` is claimed by this session with a unique actor name.

Do not close the prerequisite bead. That is the integration owner's action.

## Global constraints

Every task inherits the constraints below. Copy the exact values.

- A test-first step must be able to fail. Before recording a red result, read the output and confirm that it names the assertion that failed. A missing import, a configuration error, an empty collection, and a run that matched no package are all different from a red step, and none of them proves a test works.
- Exact pins, no range prefix, for every dependency this ticket adds.
- Every `@storybook/*` package holds the identical version, 10.6.0.
- `@nx/storybook` and `@nx/web` hold the same version as `nx`, 23.2.1.
- Node major 26. TypeScript runs in strict mode.
- Nx local caching is on. Remote caching is off. No cache provider, account, or token.
- Every project carries exactly one classification tag. `apps/storybook` is tagged `app`.
- Every folder named in [the repository layout](../../../architecture/repository-layout.md) holds a `README.md` that says what the folder is for, what belongs in it, and what must not go in it. The file never lists the folder's files.
- Every pnpm setting lives in `pnpm-workspace.yaml`, in camel case. Never relax `strictPeerDependencies`, `minimumReleaseAge`, or `minimumReleaseAgeStrict` to make an install pass. Add a named exception instead, and never use `dangerouslyAllowAllBuilds`. Every version this plan pins was published before 2026-09-12, so the 1440 minute release-age guard needs no exception.
- Formatting is oxfmt. Linting is oxlint. Never add Prettier, Biome, ESLint, or a second linter.
- A new dependency needs a one-line reason in [the tech stack](../../../core/tech-stack.md) in the same change.
- The Storybook host is development-only. No Storybook package, story, fixture, or static output may enter a customer runtime image.
- The MCP endpoint stays on `localhost`. Never bind it to a public interface and never publish it.
- Do not create the placeholder module's schema, router, tRPC procedure, or any server declaration. S0-04 owns those.
- Do not commit, merge, push, publish, or run a Dolt remote sync. The repository policy requires separate authority.
- Write every document in the style of the repository: short sentences, active voice, no contractions, no semicolons.

## Approved deviations

The product owner approved items 1 and 2 on 2026-09-20, after the compatibility evidence below was presented. Items 3 and 4 follow repository convention and need no separate approval, but a reviewer should see them named.

### 1. Vitest moves from 5.0.1 to 4.1.11 across the workspace

`@storybook/addon-vitest@10.6.0` declares `vitest: "^3.0.0 || ^4.0.0"`. This repository pinned `vitest@5.0.1` and sets `strictPeerDependencies: true`, so the install fails before any story runs. The only Storybook line that accepts Vitest 5 is `11.0.0-alpha.1`, and `@nx/storybook` (23.2.1 and the 23.3.0-beta.1 prerelease) declares `storybook: ">=8.0.0 <11.0.0"`, so the alpha also costs the official Nx inference that R-2 and R-41c require.

The chosen resolution keeps every peer satisfied with released software: Storybook 10.6.0, Vitest 4.1.11, `@vitest/browser-playwright` 4.1.11, and `@nx/storybook` 23.2.1. [The tech stack](../../../core/tech-stack.md) states Vitest 5.x, so Task 1 amends that document and records the decision in a new ADR. The upgrade path reopens when Storybook 11 reaches a stable release and `@nx/storybook` raises its `<11.0.0` cap. Record both conditions in the ADR.

### 2. S0-02 pins the framework peers

`@storybook/nextjs-vite@10.6.0` declares `next`, `react`, `react-dom`, `vite`, `@types/react`, and `@types/react-dom` as peers, and none of them exists in the workspace yet. S0-02 pins them at the versions [the tech stack](../../../core/tech-stack.md) already names: Next.js 16.3.5, React 19.3.0, React DOM 19.3.0, Vite 8.3.0. S0-04 and S0-05 inherit these pins rather than choosing them. Name this in the handoff so the integration owner sees it.

### 3. Plan location

The Superpowers default is `docs/superpowers/plans/`. This plan lives beside its ticket, because [the ticket execution contract](../README.md) says ticket-local execution plans belong with the ticket. S0-01 used the same location.

### 4. The placeholder module package is created presentation-only

The ticket requires placeholder presentation stories and a `Modules` group in the sidebar, and it forbids placeholder server declarations. A sidebar group needs a package the selection resolver can see, so Task 7 creates `packages/modules/placeholder` with package metadata, one page component, its stories, and browser-safe fixtures, and nothing else. S0-04 adds the schema, the router, the permission keys, and every other contract point to the same package. Tell the integration owner, because S0-04's ticket names that package as its own.

## Evidence this plan already rests on

Read from the npm registry on 2026-09-20. These are published facts, not installed proof. Task 2 replaces them with installed versions.

| Package | Version | Relevant declaration |
| --- | --- | --- |
| `storybook` | 10.6.0 | Published 2026-09-02 |
| `@storybook/nextjs-vite` | 10.6.0 | Peers `next ^14.1 \|\| ^15 \|\| ^16`, `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8`, `react ^16.8 \|\| ^17 \|\| ^18 \|\| ^19` |
| `@storybook/addon-vitest` | 10.6.0 | Peers `vitest ^3 \|\| ^4`, `@vitest/browser ^3 \|\| ^4`, `@vitest/browser-playwright ^4` |
| `@storybook/addon-docs` | 10.6.0 | Peer `storybook ^10.6.0` |
| `@storybook/addon-a11y` | 10.6.0 | Peer `storybook ^10.6.0` |
| `@storybook/addon-mcp` | 10.6.0 | Peers `storybook ^10.6.0`, `@storybook/addon-vitest ^10.6.0` |
| `@nx/storybook` | 23.2.1 | Peers `@nx/web 23.2.1`, `storybook >=8.0.0 <11.0.0` |
| `vitest` | 4.1.11 | Published 2026-08-18. Peer `vite ^6 \|\| ^7 \|\| ^8` |
| `next` | 16.3.5 | Published 2026-09-11 |
| `react`, `react-dom` | 19.3.0 | Published 2026-09-09 |
| `vite` | 8.3.0 | Published 2026-09-10 |

Two API details were read from current documentation and must be used as written.

- Vitest 4 takes the browser provider as a function: `import { playwright } from "@vitest/browser-playwright"`, then `provider: playwright()`. The Vitest 3 string form, `provider: "playwright"`, is wrong for this pin.
- The accessibility addon fails a component test through `parameters.a11y.test = "error"`, set in `.storybook/preview.tsx` at project level. The other two values are `"todo"`, which warns, and `"off"`.

## File structure

| Path | Responsibility |
| --- | --- |
| `package.json` | Root manifest. The Vitest pin moves to 4.1.11. |
| `nx.json` | Adds the `@nx/storybook` plugin entry and the three Storybook target defaults, with `MODULE_INCLUDE` as a declared input. |
| `docs/core/tech-stack.md` | Records the Vitest 4 pin, the Storybook versions, and the framework peers. |
| `docs/adr/0009-storybook-pins-the-vitest-major.md` | Records why Vitest sits a major below its own line, and what reopens it. |
| `packages/config/src/storybook/index.ts` | The shared preset body. Story globs, addon list, framework name. |
| `packages/config/src/storybook/index.test.ts` | Proves the preset resolves globs from a selection and never from a blanket module glob. |
| `packages/config/src/vitest/component.ts` | The shared component-test preset. Browser mode, Playwright Chromium provider, headless. |
| `apps/storybook/package.json` | The host manifest. Tag `app`. Scripts for the three targets. |
| `apps/storybook/.storybook/main.ts` | Host configuration. Calls the selection resolver, then spreads the shared preset. |
| `apps/storybook/.storybook/preview.tsx` | Global decorators, theme and viewport globals, `a11y.test` set to `error`. |
| `apps/storybook/.storybook/vitest.setup.ts` | Applies project annotations for the component runner. |
| `apps/storybook/vitest.config.ts` | The component-test project. Merges the shared component preset. |
| `apps/storybook/README.md` | What the host is for and what must not go in it. |
| `packages/ui/src/disclosure/disclosure.tsx` | The representative UI component. |
| `packages/ui/src/disclosure/disclosure.stories.tsx` | Its documented stories and interaction assertions. |
| `packages/core/src/lib/story-seam/core-group.tsx` | The browser-safe Core grouping seam. |
| `packages/core/src/lib/story-seam/core-group.stories.tsx` | Its render and accessibility coverage. |
| `packages/modules/placeholder/package.json` | Module metadata the data-only inventory reads. |
| `packages/modules/placeholder/src/presentation/workspace-page.tsx` | The presentation-only page. |
| `packages/modules/placeholder/src/presentation/workspace-page.stories.tsx` | Its stories at two viewports and two themes. |
| `packages/modules/placeholder/src/presentation/__fixtures__/records.ts` | Deterministic English fixtures. No network, no service. |
| `docs/tickets/spec-0/02-storybook-compatibility-g1/evidence.md` | The G1 evidence record. |

---

### Task 1: Move the workspace to Vitest 4.1.11

This task comes first because every later task runs tests, and the whole ticket fails if the existing suite does not survive the change.

**Files:**
- Modify: `package.json`
- Modify: `apps/genie/package.json`, `packages/config/package.json`, `packages/core/package.json`, `packages/ui/package.json`, `tools/generators/package.json`
- Modify: `docs/core/tech-stack.md`
- Create: `docs/adr/0009-storybook-pins-the-vitest-major.md`

**Interfaces:**
- Consumes: the S0-01 workspace at `develop` `7fe04be`.
- Produces: a workspace whose every `vitest` entry reads `4.1.11`, so Task 4 can add `@storybook/addon-vitest` without a peer conflict.

- [ ] **Step 1: Record the baseline**

Run in the worktree:

```bash
rtk proxy pnpm exec vitest --version
rtk proxy pnpm exec nx run-many -t test --skip-nx-cache
```

Write down the version, the task count, and the total test count. S0-01 recorded 91 unit tests across five projects. If the number differs, record the number you observed and continue.

- [ ] **Step 2: Change every pin**

Set `"vitest": "4.1.11"` in the root `package.json` and in the five package manifests listed above. Change nothing else.

- [ ] **Step 3: Install**

```bash
rtk proxy pnpm install
```

Expected: exit 0, no peer warning naming `vitest`. If the install fails on the release-age guard, stop and report it. Do not relax the guard.

- [ ] **Step 4: Prove the existing suite still passes**

```bash
rtk proxy pnpm exec vitest --version
rtk proxy pnpm exec nx run-many -t test --skip-nx-cache
```

Expected: the version prints `4.1.11`, and the same number of tests passes as in Step 1. A smaller number means a collection regression. Investigate before continuing.

- [ ] **Step 5: Check the shared preset against the new major**

`packages/config/src/vitest/unit.ts` imports `ViteUserConfig` from `vitest/config`. Run:

```bash
rtk proxy pnpm exec nx run-many -t typecheck --skip-nx-cache
```

Expected: exit 0. If the type name moved in Vitest 4, correct the import and say so in the evidence record.

- [ ] **Step 6: Amend the tech stack**

In `docs/core/tech-stack.md`, change the unit-test and integration-test rows from `5.x` to `4.1.11 exactly`, and add the reason in one line: Storybook 10's Vitest addon accepts Vitest 3 and 4 only. Update the Storybook rows to name the pinned versions from this plan.

- [ ] **Step 7: Write ADR 0009**

Create `docs/adr/0009-storybook-pins-the-vitest-major.md` with the accepted status, the date, the two peer ranges that conflict, the four options that were weighed, the chosen option, and the two conditions that reopen it: a stable Storybook 11 release, and an `@nx/storybook` release that accepts it. Follow the format of `docs/adr/0008-foundation-integration-and-generated-registry.md`.

- [ ] **Step 8: Run the gates**

```bash
rtk proxy pnpm exec nx run-many -t lint typecheck test --skip-nx-cache
rtk proxy pnpm run format:check
```

Expected: exit 0 for both.

---

### Task 2: Install the Storybook toolchain and stand up the host

**Files:**
- Modify: `package.json`, `docs/core/tech-stack.md`
- Create: `apps/storybook/package.json`, `apps/storybook/README.md`, `apps/storybook/tsconfig.json`
- Create: `apps/storybook/.storybook/main.ts`, `apps/storybook/.storybook/preview.tsx`
- Modify: `packages/config/src/storybook/index.ts`, `packages/config/src/storybook/README.md`
- Create: `packages/config/src/storybook/index.test.ts`
- Create: `packages/core/src/lib/story-seam/core-group.tsx`, `packages/core/src/lib/story-seam/core-group.stories.tsx`, `packages/core/src/lib/story-seam/README.md`
- Modify: `packages/core/package.json`, `packages/ui/package.json`

**Interfaces:**
- Consumes: `resolveModuleSelection`, `readModuleInventory` from `@genie/generators`, exported by `tools/generators/src/selection/index.ts`.
- Produces: `sharedStorybookConfig(selection)` from `@genie/config/storybook`, returning `{ framework, stories, addons }`. Task 4 and Task 8 both read it.

- [ ] **Step 1: Write the failing preset test**

Create `packages/config/src/storybook/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sharedStorybookConfig } from "./index.ts";

describe("sharedStorybookConfig", () => {
  it("always includes the ui and core story globs", () => {
    const config = sharedStorybookConfig({ moduleRoots: [] });

    expect(config.stories).toContain(
      "../../../packages/ui/src/**/*.stories.@(ts|tsx|mdx)"
    );
    expect(config.stories).toContain(
      "../../../packages/core/src/**/*.stories.@(ts|tsx|mdx)"
    );
  });

  it("adds one glob for each selected module root and no blanket module glob", () => {
    const config = sharedStorybookConfig({
      moduleRoots: ["packages/modules/placeholder"],
    });

    expect(config.stories).toContain(
      "../../../packages/modules/placeholder/src/**/*.stories.@(ts|tsx|mdx)"
    );
    expect(
      config.stories.some((glob) => glob.includes("modules/*/"))
    ).toBe(false);
  });

  it("produces no module glob for an explicitly empty selection", () => {
    const config = sharedStorybookConfig({ moduleRoots: [] });

    expect(
      config.stories.some((glob) => glob.includes("packages/modules"))
    ).toBe(false);
  });

  it("names the framework and the four required addons", () => {
    const config = sharedStorybookConfig({ moduleRoots: [] });

    expect(config.framework).toBe("@storybook/nextjs-vite");
    expect(config.addons).toEqual([
      "@storybook/addon-docs",
      "@storybook/addon-a11y",
      "@storybook/addon-vitest",
    ]);
  });
});
```

- [ ] **Step 2: Run it and read the failure**

```bash
rtk proxy pnpm --filter @genie/config exec vitest run src/storybook/index.test.ts
```

Expected: FAIL. `sharedStorybookConfig` is not a function, because S0-01 reserved a constant of that name. Confirm the output names the failing assertion, not a missing file.

- [ ] **Step 3: Write the preset**

Replace `packages/config/src/storybook/index.ts`:

```ts
/**
 * The shared Storybook configuration. The host in apps/storybook spreads it.
 *
 * This file stays build-safe. It imports no Storybook package, reads no
 * environment value, and starts no service. The host passes in the module roots
 * that the S0-01 selection resolver already resolved, so discovery never globs
 * every module and then hides the excluded ones.
 */
export type SharedStorybookInput = {
  /** Repository-relative roots of the selected module packages, in the supplied order. */
  readonly moduleRoots: readonly string[];
};

export type SharedStorybookConfig = {
  readonly framework: "@storybook/nextjs-vite";
  readonly stories: readonly string[];
  readonly addons: readonly string[];
};

const STORY_GLOB = "src/**/*.stories.@(ts|tsx|mdx)";

// The host configuration lives in apps/storybook/.storybook, three levels below
// the repository root, so every glob is written from there.
const FROM_HOST = "../../..";

export function sharedStorybookConfig(
  input: SharedStorybookInput
): SharedStorybookConfig {
  return {
    framework: "@storybook/nextjs-vite",
    stories: [
      `${FROM_HOST}/packages/ui/${STORY_GLOB}`,
      `${FROM_HOST}/packages/core/${STORY_GLOB}`,
      ...input.moduleRoots.map((root) => `${FROM_HOST}/${root}/${STORY_GLOB}`),
    ],
    addons: [
      "@storybook/addon-docs",
      "@storybook/addon-a11y",
      "@storybook/addon-vitest",
    ],
  };
}
```

Rewrite `packages/config/src/storybook/README.md` so it describes the real preset rather than the reserved shape.

- [ ] **Step 4: Run the test again**

```bash
rtk proxy pnpm --filter @genie/config exec vitest run src/storybook/index.test.ts
```

Expected: PASS, four tests.

- [ ] **Step 5: Install the Storybook toolchain**

Add to the root `package.json` `devDependencies`, exact versions, then install:

```json
"@nx/storybook": "23.2.1",
"@nx/web": "23.2.1",
"@storybook/addon-a11y": "10.6.0",
"@storybook/addon-docs": "10.6.0",
"@storybook/nextjs-vite": "10.6.0",
"@types/react": "19.3.0",
"@types/react-dom": "19.3.0",
"next": "16.3.5",
"react": "19.3.0",
"react-dom": "19.3.0",
"storybook": "10.6.0",
"vite": "8.3.0"
```

```bash
rtk proxy pnpm install
```

Expected: exit 0 with no peer error. `@types/react` and `@types/react-dom` must match the real published versions. If 19.3.0 does not exist for either, use the current matching release and record the exact number.

Stop and report if the install prints a peer conflict. Do not relax `strictPeerDependencies`.

- [ ] **Step 6: Add React to the packages that render**

Add `react` and `react-dom` at `19.3.0` to `packages/ui/package.json` dependencies, and `react` at `19.3.0` to `packages/core/package.json` dependencies. Add `@types/react` and `@types/react-dom` to the devDependencies of both.

- [ ] **Step 7: Write the Core grouping seam and its story**

Create `packages/core/src/lib/story-seam/core-group.tsx`:

```tsx
/**
 * The browser-safe seam that proves the Core group renders in Storybook.
 *
 * It is a fixture, not a feature. Section 1 replaces it with the first real core
 * screen. It holds no data access, no registry import, and no environment read,
 * so the host can render it without a database or an identity provider.
 */
export type CoreGroupProps = {
  readonly heading: string;
  readonly body: string;
};

export function CoreGroup(props: CoreGroupProps) {
  return (
    <section aria-labelledby="core-group-heading">
      <h2 id="core-group-heading">{props.heading}</h2>
      <p>{props.body}</p>
    </section>
  );
}
```

Create `packages/core/src/lib/story-seam/core-group.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CoreGroup } from "./core-group.tsx";

const meta = {
  title: "Core/Story seam",
  component: CoreGroup,
  parameters: {
    docs: {
      description: {
        component:
          "A static fixture that proves the Core group renders. Section 1 replaces it with the first real core screen.",
      },
    },
  },
  args: {
    heading: "Core renders in the workbench",
    body: "This fixture imports no database, no registry, and no environment value.",
  },
} satisfies Meta<typeof CoreGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Core renders in the workbench" })
    ).toBeInTheDocument();
  },
};
```

Write `packages/core/src/lib/story-seam/README.md` naming the folder as a Section 0 fixture that Section 1 removes.

- [ ] **Step 8: Create the host**

Create `apps/storybook/package.json`:

```json
{
  "name": "@genie/storybook",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "oxlint --config ../../oxlint.config.ts .storybook",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@genie/core": "workspace:*",
    "@genie/ui": "workspace:*"
  },
  "devDependencies": {
    "@genie/config": "workspace:*",
    "@genie/generators": "workspace:*",
    "@storybook/addon-a11y": "10.6.0",
    "@storybook/addon-docs": "10.6.0",
    "@storybook/nextjs-vite": "10.6.0",
    "next": "16.3.5",
    "oxlint": "1.83.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "storybook": "10.6.0",
    "vite": "8.3.0"
  },
  "nx": {
    "tags": ["app"]
  }
}
```

The `storybook`, `build-storybook`, and `test-storybook` scripts are deliberately absent. Task 3 decides whether the Nx plugin infers them or whether this manifest declares them, after reading the real target resolution.

Create `apps/storybook/.storybook/main.ts`:

```ts
import { readModuleInventory, resolveModuleSelection } from "@genie/generators";
import { sharedStorybookConfig } from "@genie/config/storybook";
import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// Selection is resolved here, before story collection, so an excluded module is
// never globbed and then hidden. MODULE_INCLUDE unset means every available
// module. An empty string means none.
const selection = resolveModuleSelection({
  moduleInclude: process.env.MODULE_INCLUDE,
  inventory: readModuleInventory(workspaceRoot),
  workspaceRoot,
});

const shared = sharedStorybookConfig({
  moduleRoots: selection.entries.map((entry) => entry.packageRoot),
});

const config: StorybookConfig = {
  framework: shared.framework,
  stories: [...shared.stories],
  addons: [...shared.addons],
};

export default config;
```

The `@storybook/addon-vitest` entry is already in the shared addon list. Task 4 installs that package. Until then the host will not boot, so Step 10 below installs it early enough to launch.

Create `apps/storybook/.storybook/preview.tsx`:

```tsx
import type { Preview } from "@storybook/nextjs-vite";

const preview: Preview = {
  parameters: {
    // Violations fail the component test in the user interface and on the
    // command line. "todo" only warns, and this gate must not warn.
    a11y: { test: "error" },
    docs: { toc: true },
  },
  initialGlobals: {
    theme: "light",
  },
  globalTypes: {
    theme: {
      description: "The colour scheme the story renders in.",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => (
      <div data-theme={context.globals.theme as string}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

Create `apps/storybook/tsconfig.json` extending `@genie/config/typescript/base`, with `jsx` set to `react-jsx`. Create `apps/storybook/README.md` saying the host is development-only, that it composes browser-safe entrypoints only, and that no server barrel, database factory, tenant bootstrap, or deployment environment read belongs in it.

- [ ] **Step 9: Install the Vitest addon so the host can boot**

Add `"@storybook/addon-vitest": "10.6.0"` to the root `devDependencies` and to `apps/storybook/package.json` devDependencies, then:

```bash
rtk proxy pnpm install
```

Expected: exit 0, no peer error naming `vitest`. This is the install that Task 1 made possible. If it fails here, the Vitest 4 decision did not hold, so stop and report the exact output.

- [ ] **Step 10: Launch the development server for real**

```bash
rtk proxy pnpm --filter @genie/storybook exec storybook dev --port 6006 --no-open
```

Expected: the server starts and prints the local address. Open `http://localhost:6006`, confirm the sidebar shows a `Core` group holding `Story seam`, and confirm the Docs tab renders the component description. No deployment environment variable, database, or identity provider may be needed. Record the startup time and any warning. Stop the server.

- [ ] **Step 11: Build the static output**

```bash
rtk proxy pnpm --filter @genie/storybook exec storybook build --output-dir storybook-static
```

Expected: exit 0 and a populated `apps/storybook/storybook-static` directory holding `index.html` and an `index.json`. Confirm `index.json` names the Core story. Add `storybook-static` to `.gitignore`.

- [ ] **Step 12: Run the gates**

```bash
rtk proxy pnpm exec nx run-many -t lint typecheck test --skip-nx-cache
rtk proxy pnpm run format:check
```

Expected: exit 0. The lint run must accept `apps/storybook/.storybook/main.ts` importing `@genie/generators`: the `apps/**` boundary entry bans database drivers only, and the host is development composition rather than product runtime. If lint rejects it, stop and report, because changing a boundary rule is S0-01's surface.

---

### Task 3: Wire the Nx targets and prove one owner per target

**Files:**
- Modify: `nx.json`
- Modify: `apps/storybook/package.json`

**Interfaces:**
- Consumes: the host from Task 2.
- Produces: the targets `storybook`, `build-storybook`, and `test-storybook` on project `@genie/storybook`, each with exactly one owner.

- [ ] **Step 1: Read the resolution before changing anything**

```bash
rtk proxy pnpm exec nx show project @genie/storybook --json
```

Write down every target the project already has and where each one comes from. Nx infers targets from `package.json` scripts in this repository, so a script and a plugin can both claim one name. That collision is the duplicate-runner risk the ticket forbids.

- [ ] **Step 2: Register the plugin**

Add to `nx.json`:

```json
"plugins": [
  {
    "plugin": "@nx/storybook/plugin",
    "options": {
      "serveStorybookTargetName": "storybook",
      "buildStorybookTargetName": "build-storybook",
      "testStorybookTargetName": "legacy-test-storybook-unused",
      "staticStorybookTargetName": "static-storybook"
    }
  }
]
```

The legacy test target is deliberately renamed to a name nothing runs. `@nx/storybook` wires that target to the old Storybook test-runner, and [the UI workflow](../../../architecture/ui-development.md) says the Vitest addon is the story runner and forbids a second execution path. Task 4 gives `test-storybook` to Vitest.

- [ ] **Step 3: Add the target defaults**

Add to `nx.json` `targetDefaults`:

```json
"storybook": {
  "cache": false
},
"build-storybook": {
  "cache": true,
  "dependsOn": ["^build"],
  "inputs": ["default", "^production", { "env": "MODULE_INCLUDE" }],
  "outputs": ["{projectRoot}/storybook-static"]
},
"test-storybook": {
  "cache": true,
  "inputs": ["default", "^production", { "env": "MODULE_INCLUDE" }]
}
```

The serve target is a watch process, so it is never cacheable. `MODULE_INCLUDE` is a declared input on both deterministic targets, so a different selection cannot replay another selection's output.

- [ ] **Step 4: Prove the targets resolve to one owner each**

```bash
rtk proxy pnpm exec nx show project @genie/storybook --json
```

Expected: `storybook` and `build-storybook` exist and name the plugin as their source. No target named `test-storybook` exists yet. No target is defined twice. Record the actual output, including any name the plugin chose that this plan did not predict.

- [ ] **Step 5: Run the build through Nx**

```bash
rtk proxy pnpm exec nx run @genie/storybook:build-storybook --skip-nx-cache
```

Expected: exit 0, static output written to the declared directory.

- [ ] **Step 6: Prove the cache replays and that selection busts it**

```bash
rtk proxy pnpm exec nx run @genie/storybook:build-storybook
rtk proxy pnpm exec nx run @genie/storybook:build-storybook
MODULE_INCLUDE="" rtk proxy pnpm exec nx run @genie/storybook:build-storybook
```

Expected: the second run reports a cache hit. The third run, with an explicitly empty selection, misses the cache and rebuilds. Record both outcomes. The full selection matrix belongs to S0-10, so prove only that the input is declared and effective.

---

### Task 4: Give `test-storybook` to the Vitest addon

**Files:**
- Create: `packages/config/src/vitest/component.ts`, `packages/config/src/vitest/component.test.ts`
- Create: `apps/storybook/vitest.config.ts`, `apps/storybook/.storybook/vitest.setup.ts`
- Modify: `apps/storybook/package.json`, `package.json`

**Interfaces:**
- Consumes: `sharedStorybookConfig` from Task 2, the Core story from Task 2.
- Produces: `componentTestPreset` from `@genie/config/vitest/component`, and a `test-storybook` script that runs `vitest --project storybook run`.

- [ ] **Step 1: Install the browser runner**

Add to the root `devDependencies`, exact:

```json
"@vitest/browser": "4.1.11",
"@vitest/browser-playwright": "4.1.11",
"playwright": "1.58.2"
```

Check the current Playwright release before pinning, and use the version that `@vitest/browser-playwright@4.1.11` accepts. Then:

```bash
rtk proxy pnpm install
rtk proxy pnpm exec playwright install chromium
```

Expected: exit 0 for both. `playwright install` downloads a browser, so it needs network access but no deployment service.

- [ ] **Step 2: Write the failing collection test**

Create `packages/config/src/vitest/component.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { componentTestPreset } from "./component.ts";
import { unitTestPreset } from "./unit.ts";

describe("componentTestPreset", () => {
  it("runs in a real browser, headless, on chromium", () => {
    expect(componentTestPreset.test?.browser?.enabled).toBe(true);
    expect(componentTestPreset.test?.browser?.headless).toBe(true);
    expect(componentTestPreset.test?.browser?.instances).toEqual([
      { browser: "chromium" },
    ]);
  });

  it("names its project so the two collections stay separate", () => {
    expect(componentTestPreset.test?.name).toBe("storybook");
    expect(unitTestPreset.test?.name).not.toBe("storybook");
  });

  it("never collects a story as a unit test", () => {
    expect(unitTestPreset.test?.exclude).toContain("**/*.stories.*");
  });
});
```

- [ ] **Step 3: Run it and read the failure**

```bash
rtk proxy pnpm --filter @genie/config exec vitest run src/vitest/component.test.ts
```

Expected: FAIL, because `./component.ts` does not exist. That is a missing-file failure, which is weak red evidence. Create the file exporting an empty object, rerun, and confirm the failure now names the browser assertion. Record the second failure as the red result.

- [ ] **Step 4: Write the preset**

Create `packages/config/src/vitest/component.ts`:

```ts
import { playwright } from "@vitest/browser-playwright";
import type { ViteUserConfig } from "vitest/config";

/**
 * The shared component-test preset. apps/storybook merges it.
 *
 * The browser provider runs isolated components. It is not the end-to-end
 * runner, and it needs neither a running Storybook server nor a database.
 */
export const componentTestPreset: ViteUserConfig = {
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
};
```

Add the `./vitest/component` subpath to the `exports` map in `packages/config/package.json`. Add `@vitest/browser-playwright` at `4.1.11` to that package's devDependencies.

- [ ] **Step 5: Give the unit preset a name and confirm the exclusion**

In `packages/config/src/vitest/unit.ts`, add `name: "unit"` to the `test` object. The `exclude` array already holds `"**/*.stories.*"`. Change nothing else.

- [ ] **Step 6: Run the test again**

```bash
rtk proxy pnpm --filter @genie/config exec vitest run src/vitest/component.test.ts
```

Expected: PASS, three tests.

- [ ] **Step 7: Wire the host's Vitest project**

Create `apps/storybook/.storybook/vitest.setup.ts`:

```ts
import { setProjectAnnotations } from "@storybook/nextjs-vite";
import { beforeAll } from "vitest";

import * as previewAnnotations from "./preview.tsx";

const annotations = setProjectAnnotations([previewAnnotations]);

beforeAll(annotations.beforeAll);
```

Create `apps/storybook/vitest.config.ts`:

```ts
import { componentTestPreset } from "@genie/config/vitest/component";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      mergeConfig(componentTestPreset, {
        extends: true,
        plugins: [
          storybookTest({
            configDir: join(here, ".storybook"),
          }),
        ],
        test: {
          setupFiles: ["./.storybook/vitest.setup.ts"],
        },
      }),
    ],
  },
});
```

Add to `apps/storybook/package.json` scripts:

```json
"test-storybook": "vitest --project storybook run"
```

Add `vitest` at `4.1.11`, `@genie/config` and `@storybook/addon-vitest` at `10.6.0` to that package's devDependencies if they are not already there, then `rtk proxy pnpm install`.

- [ ] **Step 8: Run the component tests from the command line**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: PASS, one test, from the Core story's `play` function. A run that collects zero tests is a failure of this step, not a pass. Read the printed count.

- [ ] **Step 9: Prove the two collections are separate and both nonempty**

```bash
rtk proxy pnpm exec nx run-many -t test --skip-nx-cache
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: the unit run collects the S0-01 tests plus the new preset tests, and collects no story. The component run collects stories only. Record both counts. Neither may be zero.

- [ ] **Step 10: Prove `test-storybook` has one owner**

```bash
rtk proxy pnpm exec nx show project @genie/storybook --json
rtk proxy pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache
```

Expected: exactly one `test-storybook` target, sourced from the `package.json` script, running Vitest. No Storybook test-runner appears anywhere in the output. If the plugin still claims the name, change the plugin option and rerun.

- [ ] **Step 11: Run the in-user-interface test panel**

Start the development server, open the Core story, and run its test from the Storybook testing panel. Confirm it passes there as well as on the command line. Record what you saw.

---

### Task 5: The representative UI component, story first

This task follows [the story-first workflow](../../../architecture/ui-development.md) one behavior at a time. Do not write the whole component and then its stories.

**Files:**
- Create: `packages/ui/src/disclosure/disclosure.tsx`, `packages/ui/src/disclosure/disclosure.stories.tsx`, `packages/ui/src/disclosure/README.md`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `Disclosure` from `@genie/ui`, with props `{ summary: string; children: ReactNode; defaultOpen?: boolean }`.

- [ ] **Step 1: Write the first story and its failing assertion**

Create `packages/ui/src/disclosure/disclosure.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { Disclosure } from "./disclosure.tsx";

const meta = {
  title: "UI/Disclosure",
  component: Disclosure,
  parameters: {
    docs: {
      description: {
        component:
          "A summary that shows and hides its content. The trigger is a button, it carries aria-expanded, and it responds to Enter and to Space.",
      },
    },
  },
  args: {
    summary: "Deployment notes",
    children: "One deployment serves one customer.",
  },
} satisfies Meta<typeof Disclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Deployment notes" });

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByText("One deployment serves one customer.")
    ).not.toBeInTheDocument();
  },
};

export const OpensOnClick: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Deployment notes" });

    await userEvent.click(trigger);

    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByText("One deployment serves one customer.")
    ).toBeInTheDocument();
  },
};
```

- [ ] **Step 2: Run it and read the failure**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: FAIL. The import of `./disclosure.tsx` does not resolve. That is weak red evidence, so continue to Step 3 and produce a real assertion failure.

- [ ] **Step 3: Write a scaffold that renders but does not behave**

Create `packages/ui/src/disclosure/disclosure.tsx`:

```tsx
import type { ReactNode } from "react";

export type DisclosureProps = {
  readonly summary: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
};

export function Disclosure(props: DisclosureProps) {
  return (
    <div>
      <button type="button" aria-expanded="false">
        {props.summary}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run again and record the real red**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: `Closed` passes. `OpensOnClick` fails with an assertion that `aria-expanded` is `"false"` when `"true"` was expected. Record that message. This is the meaningful interaction failure the gate requires.

- [ ] **Step 5: Implement the toggle**

Replace the component body:

```tsx
import { useId, useState } from "react";
import type { ReactNode } from "react";

export type DisclosureProps = {
  readonly summary: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
};

export function Disclosure(props: DisclosureProps) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const regionId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
      >
        {props.summary}
      </button>
      {open ? (
        <div id={regionId} role="region" aria-label={props.summary}>
          {props.children}
        </div>
      ) : null}
    </div>
  );
}
```

A native `button` already answers Enter and Space, so the keyboard behavior needs no key handler. The next step proves that rather than assuming it.

- [ ] **Step 6: Run and confirm green**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: PASS, three tests including the Core story.

- [ ] **Step 7: Add the keyboard story**

Append to the stories file:

```tsx
export const OpensFromTheKeyboard: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Deployment notes" });

    await userEvent.tab();
    await expect(trigger).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard(" ");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  },
};
```

Run the component tests. Expected: PASS. If Space does not toggle, the element is not a real button, so fix the component rather than the test.

- [ ] **Step 8: Prove state resets between stories**

Append:

```tsx
export const OpenByDefault: Story = {
  args: { defaultOpen: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Deployment notes" })
    ).toHaveAttribute("aria-expanded", "true");
  },
};

export const StateResets: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Deployment notes" })
    ).toHaveAttribute("aria-expanded", "false");
  },
};
```

`StateResets` runs after stories that opened the component. It passes only if each story mounts a fresh instance. Run the component tests and record the pass.

- [ ] **Step 9: Export and document**

Add `export { Disclosure } from "./disclosure/disclosure.tsx";` and the prop type export to `packages/ui/src/index.ts`. Write `packages/ui/src/disclosure/README.md`.

- [ ] **Step 10: Run the gates**

```bash
rtk proxy pnpm exec nx run-many -t lint typecheck test --skip-nx-cache
rtk proxy pnpm --filter @genie/storybook run test-storybook
rtk proxy pnpm run format:check
```

Expected: exit 0 everywhere.

---

### Task 6: Prove the accessibility gate fails and then passes

**Files:**
- Modify: `packages/ui/src/disclosure/disclosure.tsx` (temporarily), then restore
- Modify: `docs/tickets/spec-0/02-storybook-compatibility-g1/evidence.md`

**Interfaces:**
- Consumes: the component and stories from Task 5.
- Produces: recorded red and green evidence for the accessibility gate. No file changes survive this task except the evidence record.

- [ ] **Step 1: Introduce one real violation**

Change the trigger from a `button` element to a `div` carrying `onClick` and no role or tab index:

```tsx
<div aria-expanded={open} onClick={() => setOpen((value) => !value)}>
  {props.summary}
</div>
```

This removes the accessible role and the keyboard path at once, so axe reports a violation and the keyboard story fails too.

- [ ] **Step 2: Run and record the red**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: FAIL. The output names an axe rule, for example `aria-allowed-attr`, alongside the failing keyboard and interaction assertions. Copy the exact rule identifiers and the failing story names into the evidence record. A failure that names only the missing role and no axe rule is not enough. If axe reports nothing, the `a11y.test` parameter is not reaching the runner, so fix that before continuing.

- [ ] **Step 3: Restore the component**

Revert to the Task 5 implementation.

```bash
rtk proxy git diff --stat
```

Expected: the component file matches the Task 5 version exactly.

- [ ] **Step 4: Run and record the green**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: PASS, with the same test count as at the end of Task 5.

- [ ] **Step 5: Prove the failure reaches the Nx target**

Repeat Steps 1 and 2 through Nx rather than the package script, so the gate itself is proved:

```bash
rtk proxy pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache
```

Expected: a nonzero exit while the violation is present, and exit 0 after the restore. Record both exit codes.

---

### Task 7: The placeholder presentation module

Create presentation only. No schema, no router, no permission key evaluation, no server declaration. S0-04 owns those.

**Files:**
- Create: `packages/modules/placeholder/package.json`, `README.md`, `tsconfig.json`
- Create: `packages/modules/placeholder/src/index.ts`, `src/README.md`
- Create: `packages/modules/placeholder/src/presentation/workspace-page.tsx`, `workspace-page.stories.tsx`, `README.md`
- Create: `packages/modules/placeholder/src/presentation/__fixtures__/records.ts`, `__fixtures__/README.md`

**Interfaces:**
- Consumes: `Disclosure` from `@genie/ui`.
- Produces: a package the data-only inventory reads, so `Modules/Placeholder` appears in the sidebar.

- [ ] **Step 1: Create the package metadata**

`packages/modules/placeholder/package.json`:

```json
{
  "name": "@genie/modules-placeholder",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "oxlint --config ../../../oxlint.config.ts src",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@genie/ui": "workspace:*",
    "react": "19.3.0"
  },
  "devDependencies": {
    "@genie/config": "workspace:*",
    "@types/react": "19.3.0",
    "oxlint": "1.83.0",
    "vitest": "4.1.11"
  },
  "genie": {
    "module": {
      "id": "placeholder",
      "entrypoint": "src/index.ts"
    }
  },
  "nx": {
    "tags": ["module"]
  }
}
```

The hyphen form of the package name is the realizable spelling, and S0-01's boundary rules already cover it.

- [ ] **Step 2: Prove the inventory and the resolver see it**

```bash
rtk proxy pnpm install
rtk proxy pnpm --filter @genie/generators exec vitest run
rtk proxy pnpm exec nx show projects --json
```

Expected: the resolver suite still passes, and the project list now holds `@genie/modules-placeholder` tagged `module`. The S0-01 hygiene test checks every project's tag, so a wrong tag fails here.

- [ ] **Step 3: Write the fixtures**

`src/presentation/__fixtures__/records.ts`:

```ts
/**
 * Deterministic English fixtures for the presentation stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant.
 * They are not seed data and they never reach a runtime path.
 */
export type PlaceholderRecordView = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
};

export const placeholderRecords: readonly PlaceholderRecordView[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    label: "First record",
    detail: "A fixture row. It proves layout, not persistence.",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Second record",
    detail: "A second fixture row, so the empty state differs from the list.",
  },
];
```

- [ ] **Step 4: Write the story before the page**

`src/presentation/workspace-page.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { placeholderRecords } from "./__fixtures__/records.ts";
import { WorkspacePage } from "./workspace-page.tsx";

const meta = {
  title: "Modules/Placeholder/Workspace page",
  component: WorkspacePage,
  parameters: {
    docs: {
      description: {
        component:
          "The placeholder workspace page, rendered from fixtures. It proves presentation only. S0-04 adds the schema, the router, and the permission keys.",
      },
    },
  },
  args: { records: placeholderRecords },
} satisfies Meta<typeof WorkspacePage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("First record")).toBeInTheDocument();
    await expect(canvas.getByText("Second record")).toBeInTheDocument();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("First record")).toBeInTheDocument();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Placeholder" })
    ).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { records: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No records yet.")).toBeInTheDocument();
  },
};
```

Check the viewport global's exact shape against the installed Storybook before running. Storybook 9 changed it from `parameters.viewport.defaultViewport` to the `globals.viewport` object above. Use whatever the installed version documents and record which form you used.

- [ ] **Step 5: Run and read the failure**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: FAIL, because the page does not exist. Create the page as an empty component that renders nothing, rerun, and record the assertion failure naming `First record`.

- [ ] **Step 6: Write the page**

`src/presentation/workspace-page.tsx`:

```tsx
import { Disclosure } from "@genie/ui";

import type { PlaceholderRecordView } from "./__fixtures__/records.ts";

export type WorkspacePageProps = {
  readonly records: readonly PlaceholderRecordView[];
};

export function WorkspacePage(props: WorkspacePageProps) {
  return (
    <main>
      <h1>Placeholder</h1>
      {props.records.length === 0 ? (
        <p>No records yet.</p>
      ) : (
        <ul>
          {props.records.map((record) => (
            <li key={record.id}>
              <Disclosure summary={record.label}>{record.detail}</Disclosure>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

`src/index.ts` exports the page and the view type, and nothing else.

- [ ] **Step 7: Run and confirm green**

```bash
rtk proxy pnpm --filter @genie/storybook run test-storybook
```

Expected: PASS. Record the total count.

- [ ] **Step 8: Inspect the sidebar**

Start the development server. Confirm three groups: `UI`, `Core`, and `Modules`, with `Placeholder` beneath `Modules`. Switch the theme toolbar between light and dark and confirm the story re-renders. Switch the viewport control between a phone and a desktop size. Open the Docs tab and confirm the description and the generated controls table appear. Record what you saw.

- [ ] **Step 9: Prove selection controls discovery**

```bash
MODULE_INCLUDE="" rtk proxy pnpm --filter @genie/storybook exec storybook build --output-dir storybook-static-empty
rtk proxy grep -rl "First record" apps/storybook/storybook-static-empty || echo "absent, as intended"
```

Expected: the empty-selection build contains no placeholder story and no fixture string. Record the result. The full selection matrix, including two explicit selections and source-map inspection, belongs to S0-10. Say so in the evidence record.

- [ ] **Step 10: Write the folder READMEs and run the gates**

Write a `README.md` in every folder this task created. Each one says what the folder is for and what must not go in it. The module README states plainly that the package holds presentation only in Section 0, and that S0-04 adds the server declarations.

```bash
rtk proxy pnpm exec nx run-many -t lint typecheck test --skip-nx-cache
rtk proxy pnpm --filter @genie/storybook run test-storybook
rtk proxy pnpm run format:check
```

Expected: exit 0 everywhere. `@genie/modules-placeholder` has a `test` script but no unit test file, and the shared preset sets `passWithNoTests: false`, so add one unit test for the fixture shape, or the run fails. Adding that test is in scope.

---

### Task 8: Install the MCP addon and prove a private local connection

**Files:**
- Modify: `packages/config/src/storybook/index.ts`, `packages/config/src/storybook/index.test.ts`
- Modify: `apps/storybook/package.json`, `package.json`
- Modify: `docs/core/tech-stack.md`

**Interfaces:**
- Consumes: the running host from Task 2 and the component runner from Task 4.
- Produces: an MCP endpoint at `http://localhost:6006/mcp`, reachable only from this machine.

- [ ] **Step 1: Confirm the official instructions before installing**

Read the addon's current documentation. As of 2026-09-20 it says: install with `storybook add @storybook/addon-mcp`, the endpoint defaults to the `/mcp` pathname on the development server, `options.endpoint` changes that pathname, and `options.toolsets.dev` set to `false` disables the development toolset. Its peers are `storybook ^10.6.0` and `@storybook/addon-vitest ^10.6.0`, both already installed. If the current documentation differs from this paragraph, follow the documentation and record the difference.

- [ ] **Step 2: Run the requested command**

```bash
rtk proxy pnpm --filter @genie/storybook exec storybook add @storybook/addon-mcp
```

Expected: the command installs the package and edits `.storybook/main.ts`.

- [ ] **Step 3: Review every generated edit**

```bash
rtk proxy git diff
```

Read the whole diff. The command may append the addon to the `addons` array in `main.ts`, which this repository builds from the shared preset. Move the entry into `packages/config/src/storybook/index.ts` so one file owns the addon list, and extend the preset test to expect four addons. Revert any edit that changes a pin, a lockfile entry, or a configuration this ticket does not own. Record what the command changed and what you moved.

- [ ] **Step 4: Prove the endpoint answers locally**

Start the development server, then from the same machine:

```bash
rtk proxy curl -sS -i -X POST http://localhost:6006/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: an HTTP 200 response listing the addon's tools. If the transport needs a session handshake first, follow the addon's documented handshake and record the exact exchange. Record the tool names.

- [ ] **Step 5: Prove the endpoint is not public**

```bash
rtk proxy ss -ltnp | grep 6006
```

Expected: the listener binds to a loopback address. If it binds to `0.0.0.0`, restrict it with the development server's host option and record the change. Confirm that no configuration file or document publishes the address, and that the addon is a development dependency only.

- [ ] **Step 6: Record what the smoke check does not prove**

A tool listing proves the endpoint answers. It does not prove an agent wrote a correct story, and it does not prove confidentiality under a scoped selection. S0-10 owns the confidentiality matrix. Write both sentences into the evidence record.

- [ ] **Step 7: Add the dependency line and run the gates**

Add one line for `@storybook/addon-mcp` to [the tech stack](../../../core/tech-stack.md) with its reason.

```bash
rtk proxy pnpm exec nx run-many -t lint typecheck test --skip-nx-cache
rtk proxy pnpm --filter @genie/storybook run test-storybook
rtk proxy pnpm run format:check
```

Expected: exit 0 everywhere.

---

### Task 9: Write the G1 evidence record

**Files:**
- Create: `docs/tickets/spec-0/02-storybook-compatibility-g1/evidence.md`

**Interfaces:**
- Consumes: every recorded result from Tasks 1 to 8.
- Produces: the record the integration owner reads before closing the bead.

- [ ] **Step 1: Write the record**

Follow the shape of `docs/tickets/spec-0/01-workspace-and-build-inputs/evidence.md`. It must hold:

1. Branch, base revision, head revision, and commit count.
2. Installed versions read from `pnpm list --depth=0 -r`, not manifest ranges. Include every `@storybook/*` package, `@nx/storybook`, `vitest`, `@vitest/browser-playwright`, `playwright`, `next`, `react`, `vite`, and `node`.
3. The project graph, with `@genie/storybook` tagged `app` and `@genie/modules-placeholder` tagged `module`.
4. Every gate command, its exit status, and its real task and test counts.
5. The resolved ownership of `storybook`, `build-storybook`, and `test-storybook`, copied from `nx show project`.
6. The interaction red and green from Task 5, with the exact assertion messages.
7. The accessibility red and green from Task 6, with the exact axe rule identifiers and both Nx exit codes.
8. The two collection counts from Task 4, unit and component, both nonempty.
9. The theme, viewport, keyboard, state-reset, docs, and controls observations.
10. The MCP connection result, the listening address, and the tool names.
11. The G1 disposition: pass or fail, stated plainly.

- [ ] **Step 2: Write the "Not proved" section**

Name at least these limits.

- Synthetic browser fixtures prove presentation. They prove no database behavior, no authorization, no routing, and no deployed end-to-end path.
- The full selection and cache matrix of R-41b and AC-28 belongs to S0-10. This ticket proves only that `MODULE_INCLUDE` is a declared input and that an empty selection excludes the module's stories.
- Customer runtime image exclusion is unproved, because no image exists yet. S0-11 owns it.
- The placeholder module holds presentation only. S0-04 adds every server declaration.
- Vitest sits one major below the line in the tech stack. ADR 0009 records the reason and the reopening conditions.

- [ ] **Step 3: Update the bead**

Record on `genie-ops-center-v2-1rd.2`: the changed paths, the base revision, the red and green evidence, the exact commands and results, the unverified checks, and the integration needs. Keep the bead in progress. Only the integration owner closes it.

- [ ] **Step 4: File deferred findings**

Any valid finding that this ticket does not fix becomes a Beads issue with the file, the line, the evidence, and the reason it was deferred. Never leave a finding only in this document.

---

## Stop conditions

Stop, record the exact command, the versions, and the observed output, and report to the integration owner when any of these happens. Do not choose an alternative silently.

- An install fails on a peer range, and the only way forward relaxes `strictPeerDependencies` or changes another dependency's major.
- `@nx/storybook` cannot own the serve or build target, so the repository would need hand-written executors.
- Two owners claim one target name and the plugin options cannot separate them.
- The accessibility addon reports nothing while a real violation is present.
- A component test needs a database, an identity provider, or a deployment environment variable.
- An import boundary must change to make a story run.
- The MCP endpoint cannot bind to loopback only.
- Any required addon would have to be omitted.

A G1 failure keeps S0-04 blocked. That is the correct outcome, not a reason to weaken a check.

## Self-review of this plan

- **Spec coverage.** R-41a is Tasks 2, 3, 5, 7. R-41b is partly Task 3 Step 6 and Task 7 Step 9, with the remainder named as S0-10's in the evidence record. R-41c is Tasks 3 and 4. R-41d is Tasks 5, 6, 7. R-41e is Task 8. AC-27's verification list maps to Tasks 2, 4, 5, 6, 7, 8. The generator discovery half of AC-27 belongs to S0-08 and S0-10, because no generator exists yet, and Task 9 records that.
- **Type consistency.** `sharedStorybookConfig` takes `SharedStorybookInput` and returns `SharedStorybookConfig` in Task 2, and Task 8 extends the same names. `componentTestPreset` and `unitTestPreset` are both `ViteUserConfig`. `Disclosure` keeps the same three props in Tasks 5 and 7. `PlaceholderRecordView` is defined in Task 7 Step 3 and consumed in Steps 4 and 6.
- **Known soft spots.** Three details were read from documentation rather than from an installed package: the `defineMain` alternative to the `StorybookConfig` type import, the exact shape of the viewport global, and the MCP transport handshake. Each step that touches one of them tells the implementer to check the installed version first and to record what it actually used.
