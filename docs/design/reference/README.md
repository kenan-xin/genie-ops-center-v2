# Reference implementation

The screen-design components, kept as a visual reference. Read them to see how a screen is put together. Do not build on them.

## Why they are here and not in `packages/ui`

They are plain React with Tailwind utility classes and Lucide icons. The platform builds on Next.js 16, React 19, and shadcn on Base UI (`../../core/tech-stack.md`). The markup, the class names, and the component boundaries are a sketch of the result, not the result.

They are also the only place several design decisions were implemented rather than described. That is their value: a specification says a slide-over is 480 pixels, and the component shows what goes inside it.

## Rules for reading them

1. `../design-system/tokens.md` wins. Where a component and the token file disagree, the token file is right and the component is stale.
2. The imports do not resolve. Every component reads its types and sample data from `@/../product/sections/...`, a path that existed only in the design tool. Both are here, under `../sections/<name>/`.
3. A component is one screen at one state. The states a screen must cover are in `../sections/<name>/spec.md`, not in the component.
4. Nothing here is a production contract. A prop name, file name and folder shape may change. `../sections/<name>/types.ts` describes the design's data inputs; new fields still require reconciliation with platform data-shape/module contracts and approved specs before implementation.
5. A capture is one state at the moment it was taken. Current source is the evidence for current preview behavior; it can itself contradict the approved specification. Neither screenshots nor reference code automatically override product decisions.

## Layout

- `sections/<name>/` One folder per design section. `components/` holds the screen parts; the file beside it is the preview wrapper the design tool rendered.
- `shell/` The application shell: `AppShell.tsx`, `MainNav.tsx`, `UserMenu.tsx`, and the preview wrappers. Its specification is `../shell/spec.md`.
- `index.css` Upstream stylesheet snapshot, including the product-scoped font overrides. It also contains Design OS tooling styles; do not install it as the production stylesheet.
- `scripts/` Upstream capture recipes and preview checks. Paths assume the original design repository, not this imported folder; run only in the design workspace when explicitly validating captures.
- `provenance/` Upstream package manifest and pnpm lockfile, retained to explain preview dependencies. These are not v2 dependency requirements and must not be installed into the product. In particular, preview Radix/Vite/React Router choices do not replace v2's Base UI/Next.js contracts.

See [current import provenance and review limitations](../imports/2026-09-19-latest.md). The imported snapshot is not a self-contained runnable app or a production implementation. The earlier import record remains historical only.
