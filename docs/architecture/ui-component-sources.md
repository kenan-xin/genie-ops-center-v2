# UI component sources

Status: index of ready-made shadcn components and registries, read on 2026-10-22. Ops Center reuses a maintained component before it writes one from scratch. This page lists what exists, what primitive base each source uses, and how well it fits Ops Center.

The entries were read on 2026-10-22 from these pages: [shadcn.io registries](https://www.shadcn.io/awesome/registries), [shadcn.io components](https://www.shadcn.io/awesome/components), [shadcn-admin](https://www.shadcn.io/awesome/item/shadcn-admin), [AI Elements](https://www.shadcn.io/awesome/item/ai-elements), the official registry index at `https://ui.shadcn.com/r/registries.json`, the [shadcn CLI](https://ui.shadcn.com/docs/cli), [MCP](https://ui.shadcn.com/docs/mcp) and [changelog](https://ui.shadcn.com/docs/changelog) pages, and the `registry.json`, item JSON, `package.json` and license file of each source. An entry marked "unconfirmed" was not readable on that day. Registries change fast, so read the source again before you install from it.

## Primitive base

Ops Center uses shadcn on Base UI (`@base-ui/react`), not Radix (`../core/tech-stack.md`, "Web application"). The base column in every table uses these values:

| Base | Meaning for Ops Center |
| --- | --- |
| Base UI | Direct install. The item depends on `@base-ui/react` and uses the `render` prop. |
| Base UI and Radix | Direct install. The registry serves one variant per shadcn style, through a `{style}` placeholder in its URL. A project on a `base-*` style gets the Base UI variant. |
| Radix | Pattern to port, not a direct install. The item depends on `radix-ui` or `@radix-ui/*`, or uses `asChild`, which Base UI does not have. |
| React Aria | Pattern to port. The item depends on `react-aria-components`. |
| None | No primitive library. The item uses plain JSX and the project's own shadcn parts, so it installs on Base UI. Read the code for `asChild` before you install it. |

The shadcn changelog of July 2026 states that Base UI is the default component library in shadcn/ui, and that Radix is not deprecated. A registry item without a `registry:base` configuration now installs as Base UI. That rule does not change the code of an item that was written for Radix.

## How to use this page

Before you write a new UI component, look for it in this order:

1. Our own primitives in `packages/ui`. Start Storybook and query the `genie-storybook` MCP server: `docs-list`, then `docs-show` (`AGENTS.md`, "Storybook MCP").
2. The official shadcn registry, in the Base UI style of `packages/ui/components.json`.
3. This page: the registries with a Base UI variant first, then the components by need.
4. If nothing fits, write the component, and record on this page which sources you read.

The shadcn CLI searches registries by namespace. The namespace resolves from `components.json` or from the official index. `packages/ui/components.json` does not exist until the setup spike of Spec 3 R-19b, so run these commands after that spike:

```bash
npx shadcn@latest search @diceui --query "file upload"
npx shadcn@latest search @diceui @reui @coss --query "data grid"
npx shadcn@latest view @diceui/file-upload
npx shadcn@latest add @diceui/file-upload --dry-run
```

The shadcn MCP server (`npx shadcn@latest mcp init --client claude`) searches every registry that `components.json` configures. Its tool names and its access to registries that are not configured are unconfirmed.

These rules apply to every component that you take from a source on this page:

- The license must permit use in a commercial product that is shipped to customers. MIT and Apache-2.0 are compatible. Do not take code under AGPL, a proprietary license, or a missing license. Ask the owner about MIT with the Commons Clause.
- A new npm dependency goes into `../core/tech-stack.md` with a one-line reason, in the same change that adds it.
- The component uses only the tokens of `../design/design-system/tokens.md`. Remove raw colors, arbitrary values and inline styles. `@shadcn/lint` refuses them.
- The component follows `ui-development.md`: a documented story, a failing behavior test first, then the code. Run the anti-slop scan and the axe check on its stories (Spec 3 R-63).
- A Radix component is a pattern. Port it to Base UI by hand, and replace `asChild` with `render`.
- A component that uploads files sends the bytes through the `FileStorage` interface. Do not take an upload component that writes to S3 or to a bucket by itself (`DEC-20`).
- The component lives in `packages/ui` and imports nothing internal (Spec 3 R-26). A module component that needs it imports it from `packages/ui`.

## Registries

The 30 registries of the shadcn.io list. Fit is for an enterprise admin application: tables, forms, settings, dialogs, file upload, approvals, notifications and audit logs. A decorative or animation-heavy library gets low fit.

| Registry | URL | Offers | Base | License | Install | Fit for Ops Center |
| --- | --- | --- | --- | --- | --- | --- |
| shadcn/ui | [ui.shadcn.com](https://ui.shadcn.com) | Official components, blocks, charts, AI Elements patterns | Base UI (default), Radix and React Aria | MIT | `npx shadcn@latest add <name>` | High. The base of `packages/ui`. |
| Dice UI | [diceui.com](https://www.diceui.com) | Data grid, data table, file upload, kanban, tags input, sortable | Base UI and Radix | MIT | `@diceui`, `/r/{style}/{name}.json` | High. Admin parts with a Base UI variant. Index health degraded. |
| ReUI | [reui.io](https://reui.io) | Components, data grid with reorderable and resizable columns, blocks | Base UI and Radix (data grid is Base UI in every style) | MIT | `@reui`, `/r/{style}/{name}.json` | High. Base UI data grid and many admin blocks. |
| Coss UI | [coss.com/ui](https://coss.com/ui) | Complete design system of the Cal.com team | Base UI | MIT for `apps/ui`, AGPL-3.0 for the rest of the repository | `@coss` | High. Base UI only. Take only from `apps/ui`. |
| HextaUI | [hextaui.com](https://hextaui.com) | Extended components and hooks | Base UI | MIT (a paid Pro tier also exists) | `@hextaui` | High. Base UI only. Index health degraded. |
| shadcn/studio | [shadcnstudio.com](https://shadcnstudio.com) | Components, blocks, themes | Base UI and Radix | MIT for the open items, Pro items paid | `@shadcn-studio`, `/r/{style}/{name}.json` | Medium. Base UI variants, but read the license of each item. |
| Cult UI | [cult-ui.com](https://www.cult-ui.com) | Design-engineer components | Mostly Radix or none, some Base UI items | MIT | `@cult-ui` | Medium. Few Base UI items, many decorative. |
| AI Elements | [elements.ai-sdk.dev](https://elements.ai-sdk.dev) | 49 AI chat and agent components | Radix (uses `asChild`) | Apache-2.0 | `@ai-elements` or `npx ai-elements@latest add <name>` | Low. Deprecated at the end of November 2026. Use the shadcn AI Elements patterns. |
| Kibo UI | [kibo-ui.com](https://www.kibo-ui.com) | Kanban, gantt, calendar, dropzone, combobox | Radix (some items none) | MIT | `@kibo-ui` | Medium. Kanban and dropzone have no primitive. Combobox is Radix. |
| Intent UI | [intentui.com](https://intentui.com) | Accessible component library | React Aria | MIT | `@intentui` | Medium. Good accessibility patterns to port. |
| JollyUI | [jollyui.dev](https://www.jollyui.dev) | shadcn-style React Aria components | React Aria (unconfirmed, inferred from names) | MIT | Copy from `jollyui.dev/default/<name>`, not in the official index | Low. Pattern only. |
| RetroUI | [neobrutalism.com](https://www.neobrutalism.com) (retroui.dev redirects there) | Neo-brutalist components | Base UI, Radix and React Aria | MIT, but the site says "All rights reserved" and sells Pro | `@retroui` | Low. Decorative style. |
| Animate UI | [animate-ui.com](https://animate-ui.com) | Animated components and icons | Base UI and Radix | MIT with the Commons Clause | `@animate-ui` | Low. Animation. The published Base UI items pin the old `@base-ui-components/react` scope. |
| WDS Shadcn Registry | [wds-shadcn-registry.netlify.app](https://wds-shadcn-registry.netlify.app) | Ten accessible extra components | Radix | MIT | `@wds` | Low. Small, Radix. |
| ABUI | [abui.io](https://abui.io) | Components, blocks, utilities | Radix | Unconfirmed, no license file | `@abui` | Low. No license. |
| ElevenLabs UI | [ui.elevenlabs.io](https://ui.elevenlabs.io) | Audio and voice agent UI | Radix | MIT | `@elevenlabs-ui` (index status unavailable) | Low. Voice UI only. |
| Algolia SiteSearch | [sitesearch.algolia.com](https://sitesearch.algolia.com) | Algolia search UI | None | MIT | `@algolia` | Low. Needs the Algolia service. |
| Aceternity UI | [ui.aceternity.com](https://ui.aceternity.com) | Motion effects and marketing blocks | Mostly none | Aceternity License (proprietary) | `@aceternity` | Low. Decorative, license not compatible. |
| Magic UI | [magicui.design](https://magicui.design) | Animated marketing components | None | MIT | `@magicui` | Low. Decorative. |
| Eldora UI | [eldoraui.site](https://www.eldoraui.site) | Animated landing components | Mostly none | MIT | `@eldoraui` | Low. Decorative. |
| kokonut/ui | [kokonutui.com](https://kokonutui.com) | Animated Next.js components | None | MIT | `@kokonutui` | Low. Decorative. |
| React Bits | [reactbits.dev](https://reactbits.dev) | Animated and interactive components | None | MIT with the Commons Clause | `@react-bits` | Low. Decorative. |
| Skiper UI | [skiper-ui.com](https://skiper-ui.com) | Uncommon animated components | None | Proprietary, free and paid | `@skiper-ui` | Low. Decorative, license not compatible. |
| Shadix UI | [shadix-ui.vercel.app](https://shadix-ui.vercel.app) | Animated components | Radix | MIT | Copy from `/r/{name}.json`, not in the official index | Low. Decorative. |
| 8bitcn | [8bitcn.com](https://www.8bitcn.com) | 8-bit retro components | Radix | MIT | `@8bitcn` | Low. Decorative. |
| pqoqubbw/icons | [lucide-animated.com](https://lucide-animated.com) | Animated Lucide icons | None | MIT | `@lucide-animated` (namespace match inferred) | Low. Animation. |
| Pure UI | [pure-ui.com](https://pure-ui.com) | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed | Low. The site did not load. |
| StyleGlide | [styleglide.ai](https://styleglide.ai) | AI color and type themes | None | Unconfirmed, no license file | Unconfirmed | Low. Themes. Ops Center has a fixed token layer. |
| Tweakcn | [tweakcn.com](https://tweakcn.com) | Visual theme editor | None | Apache-2.0 | Unconfirmed | Low. Themes. Ops Center has a fixed token layer. |
| registry.directory | [registry.directory](https://registry.directory) | Directory of 104 registries | None | MIT | No install | Low. A search aid, not a source. |

The official index lists 479 registries. Some of them that are not on the shadcn.io list are useful for Ops Center:

| Registry | Offers | Base | License | Fit for Ops Center |
| --- | --- | --- | --- | --- |
| `@tablecn` | Data table and filter builder, filters in the URL | Base UI and Radix | Unconfirmed | High. Admin tables. Which repository it belongs to is unconfirmed. |
| `@uploadcn` | File upload, queue, image cropper | Base UI and Radix (`{style}` URL) | MIT | Medium. Use the UI parts only. Its resumable S3 upload goes around `FileStorage`. |
| `@dashboardblocks` | KPI cards, charts, tables, dashboards | Base UI, Radix and React Aria | Unconfirmed | Medium. Dashboards for a module landing page. |
| `@basecn` | shadcn components on Base UI | Base UI | Unconfirmed | Medium. Base UI only. |

## Components by need

The shadcn.io components page holds 80 items. These are the ones that match an admin need, with official index items added where the page has a gap. Prefer the official shadcn item when one exists.

| Need | Component | Source | Base | License | Notes |
| --- | --- | --- | --- | --- | --- |
| Data table | Data grid | [Dice UI](https://www.diceui.com) | Base UI and Radix | MIT | Virtualized, editable. TanStack Table and TanStack Virtual. |
| Data table | Data grid | [ReUI](https://reui.io) | Base UI | MIT | Reorderable and resizable columns. dnd-kit. |
| Data table | tablecn | [github.com/sadmann7/tablecn](https://github.com/sadmann7/tablecn) | Base UI and Radix | MIT | Server-side sort, filter and paging, filter builder. |
| Data table | gridcn | [gridcn.vercel.app](https://gridcn.vercel.app) | Base UI | Unconfirmed | Spreadsheet grid. No repository found. |
| Data table | data-table-filters | [github.com/openstatusHQ/data-table-filters](https://github.com/openstatusHQ/data-table-filters) | Radix | MIT | Faceted filters, row detail sheet. Pattern only. |
| Forms and inputs | Tags input | [Dice UI](https://www.diceui.com) | Base UI and Radix | MIT | Tag input. |
| Forms and inputs | Combobox (official) | [shadcn/ui](https://ui.shadcn.com) | Base UI | MIT | Multi-select and search select. |
| Forms and inputs | AutoForm | [github.com/vantezzen/autoform](https://github.com/vantezzen/autoform) | Unconfirmed, likely Radix | MIT | Form from a zod schema. Pattern for `ConfigForm` (Spec 3 R-75). |
| Forms and inputs | shadcn-multi-select-component | [github.com/sersavan/shadcn-multi-select-component](https://github.com/sersavan/shadcn-multi-select-component) | Radix | MIT | Multi-select with badges. Pattern only. |
| Forms and inputs | emblor | [github.com/JaleelB/emblor](https://github.com/JaleelB/emblor) | Unconfirmed, likely Radix | MIT | Tag input. Pattern only. |
| File upload | File upload | [Dice UI](https://www.diceui.com) | Base UI and Radix | MIT | Dropzone, file list, progress. |
| File upload | Dropzone | [Kibo UI](https://www.kibo-ui.com) | None | MIT | Uses only the project's `button`. |
| File upload | uploadcn | [uploadcn.dev](https://uploadcn.dev) | Base UI and Radix | MIT | UI parts only. See the `FileStorage` rule. |
| File upload | better-upload | [better-upload.com](https://better-upload.com) | Unconfirmed | MIT | Uploads direct to S3. Not compatible with `FileStorage`. |
| Date and time | Calendar and date picker (official) | [shadcn/ui](https://ui.shadcn.com) | Base UI | MIT | react-day-picker. The baseline. |
| Date and time | date-range-picker-for-shadcn | [github.com/johnpolacek/date-range-picker-for-shadcn](https://github.com/johnpolacek/date-range-picker-for-shadcn) | Radix | MIT | Presets and comparison. Last change 2024-04. Pattern only. |
| Date and time | time-picker | [github.com/openstatusHQ/time-picker](https://github.com/openstatusHQ/time-picker) | Radix | MIT | Last change 2024-12. Pattern only. |
| Date and time | Gantt and calendar | [Kibo UI](https://www.kibo-ui.com) | None | MIT | dnd-kit, date-fns, jotai. |
| Command and search | Command (official) | [shadcn/ui](https://ui.shadcn.com) | cmdk, in every style | MIT | Command palette. |
| Command and search | fancy-box | [craft.mxkaske.dev](https://craft.mxkaske.dev) | cmdk and Radix (unconfirmed) | MIT | Label picker. Pattern only. |
| Command and search | downshift-shadcn-combobox | [downshift-shadcn-combobox.vercel.app](https://downshift-shadcn-combobox.vercel.app) | Downshift (unconfirmed) | Unconfirmed | Autocomplete. |
| Charts | Chart (official) | [shadcn/ui](https://ui.shadcn.com) | Recharts | MIT | The baseline. |
| Charts | Tremor | [github.com/tremorlabs/tremor](https://github.com/tremorlabs/tremor) | Radix and Recharts | Apache-2.0 | Dashboard charts. Last change 2025-10. Pattern only. |
| Charts | EvilCharts | [evilcharts.com](https://evilcharts.com) | Recharts, base unconfirmed | MIT | Styled charts. |
| Charts | number-flow | [github.com/barvian/number-flow](https://github.com/barvian/number-flow) | None | MIT | Animated numbers for KPI tiles. |
| Kanban and workflow | Kanban and sortable | [Dice UI](https://www.diceui.com) | Base UI and Radix | MIT | Accessible kanban, dnd-kit. |
| Kanban and workflow | Kanban | [Kibo UI](https://www.kibo-ui.com) | None | MIT | dnd-kit. |
| Kanban and workflow | shadcn-stepper | [github.com/damianricobelli/shadcn-stepper](https://github.com/damianricobelli/shadcn-stepper) | Radix | MIT | Multi-step form. Pattern for approval steps. |
| AI chat | AI Elements patterns (official) | [ui.shadcn.com/docs/ai-elements](https://ui.shadcn.com/docs/ai-elements) | Base UI, Radix and React Aria | MIT | 21 copy-paste patterns: chat, message, prompt input, reasoning, tool, plan. Replaces Vercel AI Elements. |
| AI chat | AI Elements (Vercel) | [github.com/vercel/ai-elements](https://github.com/vercel/ai-elements) | Radix | Apache-2.0 | Deprecated at the end of November 2026. |
| AI chat | assistant-ui | [github.com/assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) | Own primitives, `asChild` style | MIT | Chat runtime and thread UI. |
| AI chat | prompt-kit | [github.com/ibelick/prompt-kit](https://github.com/ibelick/prompt-kit) | Unconfirmed | MIT | Chat building blocks. |
| Notifications | Sonner (official) | [shadcn/ui](https://ui.shadcn.com) | None | MIT | The shadcn toast. The old `toast` item is deprecated. Check it against Spec 3 R-24. |

The shadcn.io components page has no toast entry. Sonner comes from the official registry.

## Templates for reference

These are complete applications. Read them as patterns for layout, navigation and table screens. Do not install them, and do not copy their routing or authentication, because Ops Center uses Next.js and its own access model.

| Template | Repository | Framework and router | Base | License |
| --- | --- | --- | --- | --- |
| shadcn-admin | [github.com/satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | Vite 8, TanStack Router, TanStack Query and Table, Clerk | Radix | MIT |
| next-shadcn-dashboard-starter | [github.com/Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | Next.js 16 App Router, TanStack Table | Base UI | MIT |
| tablecn | [github.com/sadmann7/tablecn](https://github.com/sadmann7/tablecn) | Next.js | Base UI and Radix | MIT |
| dnd-dashboard | [github.com/olliethedev/dnd-dashboard](https://github.com/olliethedev/dnd-dashboard) | Next.js | Radix | No license, do not copy |

The shadcn.io metadata says that shadcn-admin runs on Next.js. Its `package.json` shows Vite and TanStack Router. next-shadcn-dashboard-starter is the closest match to the Ops Center stack.

## Not confirmed on 2026-10-22

- Pure UI: the site and its index entry did not load.
- Licenses of ABUI, StyleGlide, `@tablecn`, `@dashboardblocks`, `@basecn` and gridcn.
- The install URLs of Tweakcn and StyleGlide, and the item count of ElevenLabs UI.
- The React Aria base of JollyUI, inferred from component names only.
- Whether AI Elements by Vercel and the Radix-style items of Kibo UI break on a Base UI project. This is inferred from `asChild` in their code, not tested.
- Whether `npx shadcn search` without a registry argument searches every configured registry, and the tool names of the shadcn MCP server.
