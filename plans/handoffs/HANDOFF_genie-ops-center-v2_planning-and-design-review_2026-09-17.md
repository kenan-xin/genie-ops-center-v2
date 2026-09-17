# Genie Ops Center v2: planning docs written and reviewed, UI design finished and verified, 9 architecture defects found and unresolved

**Date:** 2026-09-17
**Status:** IN PROGRESS
**Bead(s):** none
**Epic:** Genie Ops Center v2 rewrite
**Chain:** `standalone-3ddb7366` seq `1`
**Parent:** `none — first in chain`
**Prior chain:** none — first in chain

---

## Reference Documents

- `/home/kenan/work/genie-ops-center-v2/CLAUDE.md` — project conventions, read-first list, architecture invariants. **Contains a known wrong line (see Contradictions).**
- `/home/kenan/work/genie-ops-center-v2/docs/README.md` — folder map and the five writing rules for this tree.
- `/home/kenan/work/genie-ops-center-v2/docs/review-2026-09-17.md` — the consolidated planning review written at the end of this session. **Read this first.**
- `/home/kenan/work/genie-ops-center-design/product/review-2026-09-16-final.md` — the design review, with a status header saying every item is applied and verified.
- `/home/kenan/.claude/CLAUDE.md` — user's global preferences (pushback, conciseness, context7 for library docs, rtk prefix for shell commands).

## The Goal

Rewrite `genie-ops-center` as an enterprise multi-tenant application platform. One Next.js image serves many customers; each customer (tenant) gets its own Postgres database and its own Keycloak realm that brokers the customer's identity provider. Business capabilities are modules in one monorepo owned entirely by Genie Ops Center, switched on per tenant by entitlement. This session produced the complete planning documentation, the complete UI design, and three independent reviews of both. The end state the user wants is a plan safe enough to start writing code against.

**Scope correction the user made mid-session and which must not be forgotten:** `genie-core`, `genie-kit`, and `genie-portal` belong to a *different product* (Genie Portal / genie-studio). They are not part of this work. Genie Ops Center v2 is Next.js full-stack. The external chat API that the chat solutions module proxies to is that other product's API, reached over HTTP only.

## Where We Are

**Repositories**

- `/home/kenan/work/genie-ops-center-v2` — the planning repo. **Not a git repository.** 30 markdown files under `docs/` plus `CLAUDE.md` and `README.md`. `docs/specs/`, `docs/tickets/`, `docs/runbooks/`, `docs/design/` are still empty placeholders.
- `/home/kenan/work/genie-ops-center-design` — the Design OS repo (Vite + React + Tailwind 4). Git repo, branch `main`, last commit `529dedb Configure Amp orb setup`. **All of this session's work is untracked**: `product/`, `src/sections/*` (7 sections), `src/shell/`, `scripts/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.claude/launch.json`, `graft/`. Ten harness files under `src/components/` are modified (lint fixes) plus `package.json` and `tsconfig.app.json`.
- `/home/kenan/work/genie-ops-center` — v1, read-only reference for behavior grounding.

**Design repo verification, run at the end of the session**

| Check | Result |
|---|---|
| `npx tsc -b` | No errors |
| `npx eslint src` | No issues (was 9 errors + 1 warning in the harness) |
| PNG count | 257 across 7 sections + shell |
| Sections with phone captures | 7 of 7 |
| Sections with dark captures | 7 of 7 |
| Preview screens fitting 390px | 25 of 25, zero horizontal overflow |
| Forbidden-string grep | empty |
| Token-violation grep (`text-[Npx]`, `h-7/9/12/13`) | empty |

**Screenshot counts per section (total / phone / dark)**

| Section | Total | Phone | Dark |
|---|---:|---:|---:|
| chat-solutions | 61 | 14 | 4 |
| people-groups-and-roles | 59 | 24 | 3 |
| sign-in-and-tenant-pages | 30 | 13 | 4 |
| branding | 26 | 9 | 4 |
| account-and-inbox | 23 | 8 | 5 |
| audit-and-tenant-settings | 22 | 10 | 2 |
| email-templates | 20 | 5 | 1 |
| shell | 16 | 6 | 2 |

**Decisions recorded this session:** DEC-28 through DEC-32 in `docs/core/decision-log.md`.

**New documents created this session:** `docs/architecture/environment-contract.md`, `docs/review-2026-09-17.md`, `product/review-2026-09-16-final.md`, `product/design-system/tokens.md` (earlier), `product/handover-2026-09-16-gaps.md` (earlier), `scripts/shots.mjs`.

**What is unresolved:** the nine architecture defects and three contradictions in `docs/review-2026-09-17.md`. None of them are fixed. The user has not yet said whether to fix them.

### What a new session must not redo

- **Do not re-survey form or generative-UI libraries.** Both surveys are in Evidence with versions and dates. Re-check only if more than a month has passed.
- **Do not re-audit v1 for gaps.** Six audits covered configuration and operations, authentication and user lifecycle, solutions and chat, authorization and audit, shell and testing, and v1 documentation. The conclusion was that v1 has no capability v2 lacks.
- **Do not re-review the design sections.** Five reviews plus a verification pass are complete and the result is recorded with a status header.
- **Do not regenerate screenshots wholesale.** 257 exist and all pass the overflow check. Regenerate only what a change touches.
- **Do not re-derive the chat proxy limits.** They came from v1's shipped behavior and the observed external API contract, both recorded under `docs/modules/chat-solutions/`.

## Since Last Handoff

Not applicable; first handoff in this chain.

## What We Tried (Chronological)

**0. Earlier in the session, before the context was compacted: the architecture itself.**
The thread began with a question about whether Better Auth and Keycloak do the same job, moved through how enterprise products actually implement single sign-on, and became the decision to use Keycloak as an identity broker with one realm per tenant while Better Auth keeps the application session. From there the whole platform was settled: database per tenant behind a connection router, authorization in the application through one seam, modules in one monorepo with entitlements, a branding layer the customer's administrator controls, file storage in Postgres because there is no object storage and no budget for one, pg-boss for jobs, and an operator command line. The docs tree was created, organised into `core/`, `modules/`, `architecture/`, `adr/`, and the placeholders, with five writing rules. Six architecture decision records and DEC-1 to DEC-27 came out of that phase. The user then had the UI designed in a separate Design OS repository and asked for it to be reviewed; that review, the gap audits against v1, and two handover files were the work immediately before the compaction.

**1. Schema-driven module configuration form: library survey, then rejection of all libraries.**
The Tenant Settings page must render one configuration card per entitled module without core knowing any module. The question was which library renders a form from a schema. Surveyed five candidates with live npm data (see Evidence). Outcome: no form engine. Each module declares `configSchema` as a zod object; the same schema validates the tRPC save procedure; core converts with zod 4's built-in `z.toJSONSchema()` and a small `ConfigForm` in `packages/ui` renders it on TanStack Form over Base UI controls, limited to five field kinds. Recorded as DEC-28. The user's reaction to the leading candidate was decisive: "i think react-jsonschema-form is overkill".

**2. Generative UI survey for future-readiness.**
The user wanted the platform ready for model-generated UI. Surveyed json-render, OpenUI, A2UI, CopilotKit, MCP Apps with live star counts and peer dependencies. Outcome: defer, reserve two seams (one message-part renderer; the module capabilities registry as the only action catalog, each behind `can()`). Recorded as DEC-29. Corrected one of my own claims mid-thread: I said CopilotKit drags in a GraphQL runtime; the user pushed back ("are gou sure copilot kit have so many dependencies like graphwl, can you check docs"), and context7 showed v1.50 removed GraphQL from the request path, though the published package still lists the dependencies for the legacy path.

**3. Chat endpoint ownership: reversed twice, settled by the user.**
I had designed a tenant-level approved origins list edited in Tenant Settings, with each chat solution picking an origin from it. The user rejected it: "i think we shouldnt have this setting at all it should be per chat solution setting, like in the old app". Removed the list everywhere and made `apiEndpoint` a per-solution full HTTPS URL. Then the user showed me v1's `.env.example`, which has `GENIE_CHAT_API_ALLOWED_ORIGINS` as a deployment variable. Final shape (DEC-30): the allow-list is an *operator* setting on the deployment, invisible to tenant administrators; empty disables chat streaming with a notice on the admin screens; the proxy checks the origin against that list *and* validates a public host on every call.

**4. Six parallel gap audits of v1.**
Areas: configuration/deployment/operations, authentication and user lifecycle, solutions and chat, authorization/groups/audit, shell/UI/testing, and v1 documentation decisions. Each classified findings COVERED / PARTIAL / MISSING / RETIRED-BY-DECISION. Result: v1 has no capability that v2 lacks in identity, authorization, solutions, or shell. The genuine gaps were operational rules v2 had never written down, plus capabilities weighed and dropped without a record. Folded into DEC-31, DEC-32, and the new environment contract. A lot of audit output was noise (v2 additions misreported as gaps) and was deliberately not acted on.

**5. Five parallel design reviews of the finished design.**
Scoped per section, each checking the section against the platform docs, the two earlier handover files, the design tokens, and v1 behavior. Totals below in Evidence. Consolidated into `product/review-2026-09-16-final.md`: 11 BLOCKING, 38 MAJOR, 10 token passes, ~60 MINOR.

**6. Six parallel fix agents, interrupted twice by usage limits.**
One per area, with shared token rules and shared sample-data conventions so the sections would agree afterwards. First round: all six terminated on a session limit. Resumed; four terminated again on the Fable model limit. The user switched the session to Opus 5 and all four resumed and completed. Resuming preserves the agent transcript, so partial edits were never lost. This worked; starting fresh agents would have duplicated work.

**7. Screenshot infrastructure built from scratch.**
The repo had no working screenshot path (`/screenshot-design` needs a Playwright MCP server that was not connected; `preview_start` pointed at the wrong port). Installed `playwright@1.63.0` as a dev dependency (Chromium was already in the cache) and wrote `scripts/shots.mjs`, a manifest-driven capture script. Every fix agent used it. It reports OVERFLOW when `scrollWidth > clientWidth` and FAIL on error, which is what made "no horizontal overflow" checkable rather than asserted.

**8. Three parallel platform-doc reviews.**
Internal consistency, architectural soundness and feasibility, and technology-stack verification against live npm data and vendor documentation. This is where the session's most valuable output came from: nine defects where the *design* is wrong rather than the document.

**9. Personally verified the two most consequential claims.**
The Keycloak email-theme limitation (confirmed: the FreeMarker email context is a fixed attribute map; realm attributes need a custom `EmailTemplateProvider` in a Java jar) and the Section 3 roadmap gap (confirmed: Section 3's ten work items contain no Tenant Settings item, yet DEC-28 claims it is designed and implemented there).

**10. Found and fixed two cross-section inconsistencies the fix agents missed.**
The shell preview labelled the administrator Priya Nair as "WORKSPACE MEMBER", and the user menu offered "Change password" on a brokered tenant where local accounts are off.

## Key Decisions

- **DEC-28, schema-driven module configuration, no form engine.** Five field kinds only: string, number, boolean switch, enum select, string list. A module needing more ships its own settings page through the pages slot. Rejected: react-jsonschema-form (would need a Base UI theme of ~10 widgets anyway, plus a second form state and ajv beside TanStack Form and zod), AutoForm (shadcn package last published 2024, no React 19), FormEngine (MobX, only rsuite components published, own JSON not JSON Schema, designer is commercial).
- **DEC-29, agent runtime is AI SDK; copilot layer and generative UI deferred.** Two seams reserved. Candidates recorded with the date they were checked so the next evaluation starts from facts, not memory.
- **DEC-30, chat endpoint is per-solution; the allow-list is an operator setting.** Rationale: the tenant administrator who registers a solution is the same person who would maintain a tenant-level list, so the list added a screen and a step without adding safety. Where the platform's servers may send traffic is the deployment operator's decision. Revisit path recorded: if one tenant needs its own origin, the list gains a per-tenant override on the control-plane `tenant` row, still operator-set.
- **DEC-31, platform hardening defaults.** pino JSON logs with redaction, safe error responses, security headers with a per-tenant `frame-src`, rate limits on add-person / resend set-password / break-glass sign-in, nightly backups with a quarterly restore drill, default recovery point 24 hours and recovery time 8 hours.
- **DEC-32, capabilities considered and not in the foundation.** One administrator tier, no member two-factor in Genie, no remembered devices, no step-up re-authentication, no avatar upload, no self-service email change, no chat attachments, no native solution type, no theme presets, no visible chat history. Written because these kept returning as questions.
- **ADR 0006 narrowed.** The Keycloak realm receives exactly six branding values: company name, logo URL, primary color, primary foreground, sender name, support email. No footer text, no Terms or Privacy links, no font; the realm theme uses a system font stack. Digests were removed from the ADR's email list because the roadmap catalogue never had them.
- **Approved font keys fixed in the data shape:** `plus-jakarta-sans` (default), `ibm-plex-sans`, `manrope`, `source-serif-4`.
- **Resume rather than respawn agents after a usage limit.** Preserves the transcript and the partial edits.

## Evidence & Data

### Form-library survey (npm, 2026-09-16)

| Package | Version | Published | React | Verdict |
|---|---|---|---|---|
| `@rjsf/core` / `@rjsf/shadcn` | 6.10.0 | 2026-09-09 | `>=18` | Works; rejected as overkill by the user |
| `@autoform/react` | 5.0.0 | 2026-07-08 | `^17 \|\| ^18 \|\| ^19` | Core fine |
| `@autoform/shadcn` | 1.0.1 | 2024-10-16 | `<=18` | Unmaintained, no React 19 |
| `@react-form-builder/core` | 10.3.0 | 2026-09-10 | `>=17 \|\| ^18 \|\| ^19` | MIT core, MobX peer, designer commercial |
| `@react-form-builder/components-shadcn` | — | — | — | **Does not exist on npm** despite the README |

### Generative-UI survey (GitHub + npm, 2026-09-16)

| Project | Stars | License | Last push | Key pin |
|---|---:|---|---|---|
| CopilotKit/CopilotKit | 37,379 | MIT | 2026-09-16 | runtime pins `ai ^6`, `zod ^3.23.3` |
| a2ui-project/a2ui | 16,403 | Apache-2.0 | 2026-09-16 | `@a2ui/react` pins `zod ^3.25.76` |
| vercel-labs/json-render | 16,178 | Apache-2.0 | 2026-09-14 | pins React 19, Tailwind 4, zod 4 |
| assistant-ui/assistant-ui | 12,163 | MIT | 2026-09-16 | — |
| tambo-ai/tambo | 11,184 | MIT | 2026-09-15 | — |
| thesysdev/openui | 9,426 | MIT | 2026-09-16 | `react-ui` pins `zustand ^4.5.5` |
| MCP-UI-Org/mcp-ui | 5,161 | Apache-2.0 | 2026-07-08 | — |
| modelcontextprotocol/ext-apps | 2,839 | — | 2026-09-09 | — |

Only json-render matches the stack's pins exactly. OpenUI's core (`lang-core`, `react-lang`) is usable; its `react-ui` is not.

### Design review findings by area (2026-09-16)

| Area | Blocking | Major | Minor |
|---|---:|---:|---:|
| sign-in, account, shell | 3 | 12 | 23 |
| branding, email templates | 3 | 10 | 24 |
| chat solutions | 2 | 10 | 15 |
| people, groups, roles, audit, settings | 2 | 8 | 20 |
| cross-section consistency | 3 | 11 | 11 |
| **Consolidated** | **11** | **38** | **~60** |

### The 11 blocking design items, and how each was fixed

| Id | Defect | Fix |
|---|---|---|
| B1 | Status tab said Maintenance still sends | Type-aware copy: "Members see your reason instead of the composer. Nothing is sent." |
| B2 | Admin preview banner only on Draft | `preview?: boolean` prop; banner on any status, Draft pill only when draft |
| B3 | Last-administrator rule missing on the paths that strip it | One `wouldRemoveLastTenantAdmin()` helper wired through every removal path |
| B4 | Destructive actions used inline strips; role delete had no confirm | One `ConfirmDialog` per tokens, used in 4 sections |
| B5 | Desktop offline bar rendered as a full-height red column | Bar moved above an inner `lg:flex-row` wrapper |
| B6 | Header bell contradicted the shell spec | Removed |
| B7 | Break-glass account page in workspace chrome as the wrong person | `?breakglass=1` renders admin chrome with the break-glass user |
| B8 | Branding Email tab rendered a hand-drawn mock | Now `MailClientFrame` + `EmailBody` with the real template |
| B9 | New-device sign-in email missing from the catalogue | Added; gallery header count now six |
| B10 | Per-tenant sender address invented | One deployment address `no-reply@genie.example` |
| B11 | Design roadmap said "as in v1" | Deleted |

### The 38 major design items, by theme

| Theme | Count | Examples |
|---|---:|---|
| Cross-section sample data disagreed | 9 | Two names for the placeholder module; two idle timeouts (15 and 20); two primary colors; a break-glass address on the vendor domain; viewer permissions no role assignment supported; a missing role grant the notification implied |
| Missing screenshots | 6 | No dark captures in three sections; 17 states with no phone version; a mislabelled phone sessions capture; no sessions tab capture at all |
| Layout defects at real widths | 5 | Admin solutions table overflowing at 1280; roles table clipping its header and row menu; audit action pills overrunning the target column; the embedded phone view clipping its URL; the phone chat header crowding out the solution name |
| Missing shared primitives | 4 | No toast anywhere in two sections; no mono chips; no confirm dialog; no tenant letter tile in the empty state |
| Types, data and components disagreeing | 5 | `Solution.type` optional but read everywhere; props smuggled through casts; fields in data with no model entry; `currentUserId` hard-coded |
| Platform rules not reflected | 5 | A resend control shown for a brokered person; a city in a sign-in notification; a per-tenant sender address; Keycloak templates rendering values the realm never receives; two different foreground rules |
| Interaction rules | 4 | Phone primary actions inline instead of in a bottom bar; touch targets under 44px; archive only inside a stale banner; password rule four evaluated client-side |

### Platform-doc review findings (2026-09-17)

| Review | Output |
|---|---|
| Internal consistency | 21 contradictions, 4 broken references, 7 unsupported claims, 6 rule violations, 8 terminology drifts, 11 gaps = 57 |
| Architecture and feasibility | 7 blocking, 16 major, ~20 minor, 21 "decide now" |
| Technology stack | ~40 packages verified, 4 incompatibilities, 6 false claims, 12 risks |

### The nine design defects (unresolved — the session's most important output)

| # | Defect | Threshold or trigger |
|---|---|---|
| 1 | Pool-per-tenant connection math | Two replicas × `pool_max` 10 exhausts a default Postgres at ~10 active tenants, not 50 |
| 2 | `can()` cannot filter a list | First list screen with record-scoped grants; `LIMIT` returns the wrong page |
| 3 | Migrator in the serving container suspends healthy tenants | Any deploy with >1 replica and a non-trivial migration |
| 4 | Nothing structurally prevents a cross-tenant query | First cached server component or memoised `can()` |
| 5 | 50 MB files in Postgres | 2–3 concurrent uploads OOM a 1 GB container; peak heap ≈ 4–5× file size |
| 6 | Keycloak email theme cannot read realm attributes | Needs a custom `EmailTemplateProvider` Java jar that no document mentions |
| 7 | Better Auth callback path wrong for the current release | `/api/auth/oauth2/callback/keycloak` → `/api/auth/callback/keycloak`; baked into the realm template at provisioning |
| 8 | Missing groups claim locks a tenant out | Microsoft Entra omits the claim above ~200 groups; every role held through a group disappears at next sign-in |
| 9 | Chat proxy lease TTL shorter than its own stream cap | Lease tens of seconds vs 120 s total cap → two streams for one user |

### Stack corrections (npm, 2026-09-17)

| Claim in `tech-stack.md` | Actual latest | Verdict |
|---|---|---|
| Base UI 1.x | `1.0.0-rc.0`, published 2026-07-15 | **No stable release has ever shipped** |
| Node 24 "current LTS" | Active LTS ends 2026-10-20 | Bump to 26 belongs in Section 0 |
| TypeScript 5.x | 7.0.2 | Two majors behind; TS 7 is the native port |
| TanStack Table 8.x | 9.2.4 (v8 frozen at 8.21.3) | Migration already owed |
| pino 9.x | 10.3.1 | One major behind |
| Vitest 4.x | 5.0.1 | One major behind |
| pnpm 11.x | 12.4.2 | One major behind |
| oxfmt 0.5x | 0.68.0 | Pre-1.0 in a pre-commit hook |
| Resend 1.x | 6.28.1 | Wrong by five majors |
| React Email 1.x | `react-email` 6.9.5 / `@react-email/components` 1.0.12 | Named by product, not package |
| Better Auth 1.6.x | 1.7.5 | Stale, and 1.7 moved the callback route |
| Next.js 16.x / React 19.x / Tailwind 4.x / zod 4.x / tRPC 11.x / pg-boss / Keycloak 26.x | current | OK |

Packages the docs rely on but never list: `undici` (chat proxy), `@trpc/tanstack-react-query`, the TanStack devtools packages.

### Claims verified TRUE by the stack review

- zod 4 implements Standard Schema; TanStack Form takes the schema with no adapter.
- Better Auth `freshAge: 0` disables the freshness check; `cookieCache.enabled` defaults false; database sessions slide via `expiresIn` + `updateAge`.
- pg-boss supports cron scheduling and per-job retry settings; it installs into its own schema.
- undici address pinning via `Agent` + `connect.lookup` closes the DNS-rebinding gap. **Detail the doc omits:** undici 8 calls the lookup with `{ all: true }` and expects `callback(null, LookupAddress[])`; returning a bare string silently fails.
- Next.js 16 route handlers stream server-sent events via `ReadableStream` and `request.signal`.
- Vitest browser mode is stable since 4.0.

### Claims verified FALSE

- "Nx's boundary rule requires ESLint" — Nx now ships `@nx/enforce-module-boundaries` as an experimental oxlint plugin. The decision may stand; the reason must change, and `no-restricted-imports` is weaker because it matches import strings rather than the project graph.
- "The no-op build replaces devtools in production" — that is a Vite plugin; on this stack it needs an environment guard plus a dynamic import. No `@tanstack/react-devtools-no-op` package exists.
- "Files live in object storage, never in a database" (`CLAUDE.md:37`) — contradicts DEC-20 and `data-shape.md:86`.

### The architecture in one page (so the next session need not re-read every document)

- **Tenancy.** One deployment hosts N tenants. Each tenant has its own Postgres database behind a connection router; a control-plane database holds `tenant`, `tenant_module`, `tenant_provisioning`, `tenant_api_key`. Routing is by hostname. There is **no `tenant_id` column in any tenant table** — the database is the tenant (ADR 0001). A dedicated deployment is the same image with one tenant.
- **Identity.** One Keycloak realm per tenant (ADR 0002), brokering the customer's OIDC or SAML provider or federating LDAP, with a normalized `groups` claim. Better Auth owns the application session, one instance per tenant, using the `genericOAuth` Keycloak provider (ADR 0006). Local accounts live in the realm for customers with no identity provider (DEC-10). Sessions are database-backed with a sliding idle window, default 15 minutes, `freshAge` disabled, no cookie cache.
- **Authorization.** Scoped role-based access in the application, never in the database (ADR 0004). `role` and `role_assignment` tables; a principal is a user or a group; scope is `<type>:<id>` or tenant-wide. One seam: `can(user, permission, resource?)`. The only bypass is the break-glass account. Core permission keys: `core:people:manage`, `core:groups:manage`, `core:roles:manage`, `core:branding:manage`, `core:settings:manage`, `core:audit:read`. System roles: Tenant administrator and Auditor. A module's admin key is appended to Tenant administrator when the module is entitled (DEC-23).
- **Modules.** One image contains every module; entitlements switch them on per tenant (ADR 0003). A module declares identity, schema, router, permission keys, record types, default roles, navigation, pages, configuration schema, events, capabilities, jobs, inbound endpoints, integration kinds, and tests. **Modules never import each other.** They talk through four channels: events, shared core records, the capabilities registry, and type-and-id references.
- **Monorepo.** pnpm workspaces plus Nx. `apps/genie`, `packages/core`, `packages/ui`, `packages/modules/<capability>`, `packages/config`, `tools/generators`, `customers/<slug>/{deploy,app}`, `deploy/{shared,keycloak}`. Import direction is enforced by an oxlint `no-restricted-imports` configuration per layer. New modules and tenants are scaffolded by Nx generators.
- **Files.** A `FileStorage` interface with a `postgres` adapter by default (bytes in `file_blob` in the tenant database) and an optional `s3` adapter per tenant. 50 MB limit, type allow-list, `scan_status` of pending, clean, infected, or skipped. Uploads go through Genie; downloads are app-issued tokenized links checked against `can()` (DEC-20).
- **Jobs and events.** pg-boss in the control-plane database, one worker in the same image, tenant id on every job (DEC-12). A typed event bus with in-process handlers for fast work and pg-boss for slow or retryable work.
- **Operations.** One base domain with a wildcard certificate; `<tenant>.<base>` (DEC-19). Three environments (DEC-18). A `genie-ops` command line is the only operator surface (DEC-14). Migrations run at deploy per tenant database under an advisory lock, suspending a tenant on failure (ADR 0005, DEC-9).

### Decision inventory

DEC-1 to DEC-11 are indexed in `docs/core/vision.md`; DEC-12 onward have full entries in `docs/core/decision-log.md`. The consistency review found DEC-1 to DEC-6 are cited nowhere outside that index, and DEC-26 to DEC-32 are missing from it.

| Id | Subject |
|---|---|
| DEC-2 | One Keycloak realm per tenant |
| DEC-7 | Tenant onboarding mode: `invite` or `jit` |
| DEC-8 | The other product is one deployment per tenant, sharing the realm |
| DEC-9 | Tenant migrations run at deploy; a failure suspends that tenant only |
| DEC-10 | Local accounts live in the tenant's realm |
| DEC-11 | Keycloak authenticates and supplies groups; the application authorizes and owns the session |
| DEC-12 | pg-boss in the control-plane database for jobs |
| DEC-13 | English only, with a `next-intl` catalogue from the first screen |
| DEC-14 | `genie-ops` command line, no operator console |
| DEC-15 | Break-glass account with an authenticator app; support impersonation deferred |
| DEC-16 | Audit kept for the tenant's lifetime; export and SIEM later |
| DEC-17 | Tenant retirement with a 90-day hold; personal erasure anonymizes |
| DEC-18 | Three environments; a UAT tenant is an ordinary tenant on staging |
| DEC-19 | One base domain with a wildcard certificate; custom domains later |
| DEC-20 | File bytes in the tenant database by default, `s3` adapter optional |
| DEC-21 | WCAG 2.1 AA with axe in Playwright; `notification` table from Section 3 |
| DEC-22 | Everything owned by Genie Ops Center; no customer repositories |
| DEC-23 | What an administrator is, and how the first one gets in |
| DEC-24 | Break-glass lifecycle and the shared password rule |
| DEC-25 | Mobile first for every screen, including the admin console |
| DEC-26 | Embedded (iframe) solutions are kept alongside chat |
| DEC-27 | Chat resumes on reopen; Draft, Maintenance and Down never stream |
| DEC-28 | Schema-driven module configuration, five field kinds, no form engine |
| DEC-29 | Agent runtime is AI SDK; copilot layer and generative UI deferred |
| DEC-30 | Chat endpoint per solution; allowed origins are an operator setting |
| DEC-31 | Platform hardening defaults |
| DEC-32 | Capabilities considered and not in the foundation |

Architecture decision records: 0001 database per tenant, 0002 Keycloak realm per tenant, 0003 one image all modules, 0004 authorization in the application, 0005 tenant migrations at deploy, 0006 Keycloak and Better Auth split.

### The 16 major architecture concerns (not blocking, but each has a named mitigation)

| Id | Concern | Mitigation |
|---|---|---|
| M1 | One `BETTER_AUTH_SECRET` signs every tenant's cookies, and the `Host` header is client-controlled | Derive a per-tenant key by HKDF; use the `__Host-` cookie prefix; resolve the host only from a trusted proxy |
| M2 | Two caches over one resource: pools and Better Auth instances, with independent lifetimes | One `TenantContext` owning pool, auth instance, settings and branding; one cache; one invalidation |
| M3 | A missing groups claim strips roles and can lock a tenant out | Absent claim means keep, not replace; alert on shrinkage; run the last-admin guard inside the sync |
| M4 | Deployment-wide Keycloak admin client undoes realm-per-tenant containment, and contradicts the data shape | Per-realm client for everything except realm creation; cache admin tokens per realm |
| M5 | Realm template drift is prevented at creation and unmanaged afterwards | Make the realm converged: `genie-ops tenant realm apply`, idempotent, drift report in CI |
| M6 | The job worker shares a process with the request path | Separate process from the same image, selected by an entrypoint flag |
| M7 | Events claim at-least-once delivery the design cannot provide, and assume ordering pg-boss does not give | State best-effort or add a transactional outbox; say events are unordered; use `singletonKey` where interleaving is unsafe |
| M8 | `MODULE_INCLUDE` versus one migration history is unresolved | Two lines: migrations are a checked-in source artefact identical in every image; the include list affects compiled code only |
| M9 | Cross-module event payload types have no legal home under the import rules | Add a dependency-free `packages/contracts` layer below `ui` |
| M10 | The capabilities registry is process-global while entitlement is per tenant | Resolve per tenant among entitled providers; two entitled providers is a startup error |
| M11 | The operator control plane is unaudited | A `control_audit` table written by every `genie-ops` command |
| M12 | Observability gives almost nothing when one tenant is slow | Per-tenant log level from the control plane; request duration and pool-wait gauges on the tenant-context seam |
| M13 | Chat proxy caps bound one stream, not the process | Per-replica concurrency limit; write the edge idle timeout into the deployment contract |
| M14 | No way in when a customer's identity provider is down | Let a brokered tenant designate local emergency administrators in its own realm |
| M15 | Entitlement mutates a role's permission array in a different database, non-transactionally | Do not mutate; compute the administrator's effective set at evaluation time |
| M16 | A single registry file importing every module ships every customer's code to every tenant | Registry entries carry plain data plus a dynamic import; routers stay server-only |

### Notable consistency contradictions with line references

| Id | Contradiction |
|---|---|
| C-1 | `CLAUDE.md:37` "Files live in object storage, never in a database" against `data-shape.md:18` and DEC-20 |
| C-2 | The design repo's data shape repeats the same wrong file rule |
| C-3 | The platform architecture diagram shows object storage as the default inside the shared-deployment boundary |
| C-4 | `roadmap.md:9` says `deploy/tenants/<slug>/`; the layout and DEC-23 say `customers/<slug>/deploy/` |
| C-5 | "Seven levels" of customer variation in the roadmap and `CLAUDE.md`; the layout lists eight |
| C-6 | `roadmap.md:60` refers to `deploy/dedicated-template`, absent from the layout |
| C-7 | The first customer's module is `agreements/` in the layout and `contracts/` in the module catalogue |
| C-8 | Idle timeout is fixed at 15 minutes in three documents and per-tenant in two |
| C-9 | `user.role` carrying `user,admin` contradicts the single-seam model in DEC-23 |
| C-10 | DEC-28 says designed and implemented in Section 3; Section 3 has no Tenant Settings item |
| C-11 | Section 2 writes a notification to a table Section 3 creates |
| C-12 | The control-plane schema list omits `tenant_api_key`, which the data shape defines |
| C-13 | Scope is two columns in the data shape and one string elsewhere |
| C-14 | The design shows a Disabled person status the data shape cannot store (it is `banned`) |
| C-16 | The branding publish model, realm-sync job and sync status exist only on the design side |
| C-17 | The design shows a malware-scan refusal the platform schedules for after the core sections |
| C-18 | One fixed product font in the tokens against a tenant-selectable font in the data shape |
| C-21 | `docs/README.md` calls `design/` empty while seven specs are delivered |

### Gap audit findings worth keeping (v1 versus v2)

- v1 has **no audit events at all**: no `audit_event` table, no writers. Every audit action in v2 is new, so there is no v1 action vocabulary to inherit.
- v1's password rule is 8 characters with three of four classes (`src/lib/password-strength.ts`). v2's DEC-24 rule is 14 characters, three of four classes, not the email, not the provisioning password.
- v1 has no roles or permissions tables; the admin check is a string test on `user.role` in `src/server/authz.ts`. v2's whole authorization model is new.
- v1 groups are local only, with no source, external id, last-seen or archived columns.
- v1 sends two emails from one React Email template with an invite and a reset variant. v2's catalogue has six from Genie plus three from Keycloak.
- v1's chat limits, lease, generation guard, stream caps and error mapping were ported into `chat-proxy.md` and are the source of the numbers there.
- v1 changes a solution's slug when the name is edited; v2 locks the slug at registration so links stay valid.
- v1 themes carry a `customCss` key; v2 drops it.
- v1 has no CI workflows, no Playwright, no Testcontainers, and no factories.

## Code Analysis

- `scripts/shots.mjs` — manifest entry shape: `{ name, url, out, viewport: phone|tablet|desktop, dark, fullPage, actions: [{click|hover|fill|press|focus|scroll|wait}] }`. Viewports: phone 390×844 (with `isMobile` and `hasTouch`), tablet 768×1024, desktop 1280×900. Always `reducedMotion: 'reduce'`, `deviceScaleFactor: 1`. Waits for `networkidle`, then until `Loading...` leaves the body, then 400 ms. Moves the mouse to (0,0) before capturing so no cursor appears. Prints `OVERFLOW` when `scrollWidth > clientWidth` and exits non-zero if any shot overflows or fails.
- Design OS routes: `/sections/:sectionId/screen-designs/:name/fullscreen` and `/shell/design/fullscreen` are the capture targets. `src/lib/router.tsx` holds the table.
- `src/shell/components/ShellWrapper.tsx` builds `AppShell` itself and exposes no `bottomBar` slot to a section page. Three sections therefore render their own sticky bottom bar under `md`. This is the documented fallback, not an oversight.
- Preview query parameters now in use: `?breakglass=1`, `?local=1`, `?member=1`, `?mode=admin`, `?offline=1`, `?loading=1`, `?s=<slug>`, `?preview=1`, `?streaming=1`, `?interrupted=1`, `?status=maintenance|down`, `?focus=1`, `?frame=loading|failed`, `?dialog=…`, `?tab=…`, `?lastadmin=1`, `?invalid=1`, `?dirty=1`, `?brokered=1`, `?upload=progress|infected`, `?accent=failing`, `?shot=1` (hides the preview switcher).
- Shared `focusRing` constant, defined per section in `components/helpers.ts`: `outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950`. 45 files reference it.
- Control heights are restricted to `h-8` / `h-10` / `h-11`. Type sizes must be Tailwind scale utilities; arbitrary pixel sizes are banned and the grep is part of verification.

## Files Changed

### Platform docs (`/home/kenan/work/genie-ops-center-v2/`)

- `docs/core/decision-log.md` — added DEC-28, DEC-29, DEC-30, DEC-31, DEC-32; amended DEC-24 earlier in the session.
- `docs/architecture/environment-contract.md` — **new.** Every variable the image reads, required and optional, with defaults; `MAIL_PROVIDER` (resend or smtp) got its first home here; the rule that a list value fails the boot rather than a request.
- `docs/architecture/module-contract.md` — `configSchema` row naming the five field kinds; content-security-policy contribution listed as foreseeable growth.
- `docs/architecture/data-shape.md` — email is never self-service and is audited for local accounts; `image` reserved for a token-supplied picture; the four approved font keys; `tenant_module.config` wording.
- `docs/core/roadmap.md` — Section 0 items 10 (logging and error responses) and 11 (security headers); Section 2 item 4a (rate limits); Section 5 item 3 (backups with targets); chat origins as an operator setting; realm attribute list narrowed.
- `docs/core/tech-stack.md` — pino row added; Forms row points at `ConfigForm`.
- `docs/adr/0006-keycloak-and-better-auth-split.md` — digests removed; the six realm attributes named; system font stack stated.
- `docs/modules/chat-solutions/README.md` — `apiEndpoint` replaces origin+path; module has no per-tenant configuration; operator origin list named.
- `docs/modules/chat-solutions/chat-proxy.md` — origin check against the operator list plus public-host validation; address pinning so DNS cannot change between check and connect; upstream carries only prompt, bot id, and session handle.
- `CLAUDE.md` — link to the environment contract.
- `docs/review-2026-09-17.md` — **new.** The consolidated planning review.

### Design repo (`/home/kenan/work/genie-ops-center-design/`)

- `product/review-2026-09-16-final.md` — **new**, then given a status header recording that everything was applied and verified.
- `product/review-2026-09-16.md` — item E3 withdrawn; Section 6 wording corrected.
- `product/handover-2026-09-16-gaps.md` — DEC-30 note, component list, section 9 on DEC-32 removals, Tenant Settings field kinds.
- `product/design-system/tokens.md` — confirm dialog anatomy, type-scale utilities with the pixel ban, `MonoChip`, `focusRing` exact string, dialog sizing rule, `ConfirmDialog` API line.
- `product/shell/spec.md` — offline bar fixed at top; no bell; search placeholder per mode; 44px targets under `lg`; new "User menu samples" section.
- `product/product-overview.md`, `product/product-roadmap.md`, `product/data-shape/data-shape.md` — "as in v1" removed, admin console wording, Email templates added to key features.
- All seven `product/sections/*/{spec.md,types.ts,data.json}` — rewritten or amended by the fix agents.
- All seven `src/sections/*/**` and `src/shell/**` — components fixed; `ConfirmDialog`, `Toast`, `MonoChip`, `PhoneBar`/`BottomBar` added where needed.
- `src/components/**` (harness) — 9 lint errors and 1 warning fixed without disabling rules.
- `scripts/shots.mjs` — **new.** Screenshot capture.
- `package.json` — `playwright@1.63.0` added as a dev dependency.
- `tsconfig.app.json` — deprecated `baseUrl` removed.

### Data and results

- `/tmp/claude-1000/shots/*.json` — the manifests each fix agent used (`shell.json`, `signin.json`, `account.json`, `chat.json`, `people.json`, `audit.json`, `branding.json`, `email.json`, `shell-menus.json`). **These live in a temp directory and will be lost.** Recreate from the file header if needed.

### What each fix agent changed

| Agent scope | Headline changes | Shots |
|---|---|---:|
| Shell, tokens, harness | Offline bar moved above an inner `lg:flex-row` wrapper; header bell removed; 9 harness lint errors fixed with no rule disabled; drawer rows to 44px under `lg`; `MonoChip` added; `baseUrl` removed from the TypeScript config; tokens gained the type scale, focus ring string, `MonoChip` and `ConfirmDialog` API | 16 |
| Sign-in and account | `?breakglass=1` renders admin chrome with the break-glass user; `ConfirmDialog` for both sign-out paths; `Toast` for preference saves and password change; THIS DEVICE mono chip; password rule four made neutral until save and excluded from the score; rule three reduced to "not equal to the email"; enrollment redirect note; city removed from the sign-in notification | 53 |
| Chat solutions | Type-aware status copy; `preview` prop with the banner on any status; `ConfirmDialog` for archive, theme delete, new chat and solution delete; phone header rebuilt so Focus is desktop-only and the name truncates; theme column hidden below `2xl`; "Used by" counts chat solutions only; `Solution.type` made required; timestamps always visible under the last bubble of each same-side run | 62 |
| People, groups, roles | `wouldRemoveLastTenantAdmin()` wired through every removal path; `ConfirmDialog` everywhere including role delete which had none; `Person.accountType`; `currentUserId` moved into the data; module renamed to `agreements` with a non-entitled `approvals` kept for one state; Archive moved to the directory-group header; roles table made to fit at 1280 | 60 |
| Audit and settings | Action column widened with wrapping pills; boolean validation case added; enum given an empty option so its message can show; JSON block recoloured; Load more made consistent with the footer; idle timeout aligned to 15; break-glass email corrected; repository path removed from a summary | 22 |
| Branding and email | Email tab now renders the real template; `new-device-sign-in` added; one deployment sender address; upload progress and infected refusal states; Keycloak templates limited to the six synced values with a system font stack; one shared foreground rule; passing accent seeded; inline SVG logo samples; Keycloak links use `{keycloakUrl}/realms/{realm}` | 46 |

### Design token rules now in force

- Type: Tailwind scale utilities only (`text-xs` through `text-2xl`). Arbitrary pixel sizes are banned and the grep is part of verification.
- Control heights: `h-8` (32px), `h-10` (40px), `h-11` (44px). Nothing else.
- Focus: one shared `focusRing` constant on every interactive element, including links, toggles and icon buttons.
- Radius: menus `rounded-lg`, controls `rounded-xl`, cards `rounded-2xl`, pills `rounded-full`.
- Icons: `size-4` in text and pills, `size-5` in buttons and navigation. No emoji as icons.
- Pills: Active and Clean green; Maintenance and Stale amber; Down, Disabled and Infected red; Draft, Pending, Scanning, unpublished and Not entitled gray.
- Overlays: dialog 480px on desktop and full width with a bottom action bar on phones; slide-over 480px for people and groups, 560px for configure solution; confirm dialog names the object in the title, gives one consequence sentence, focuses Cancel, and uses the danger tone for destructive actions.
- Toast: bottom centre on phones, bottom right on desktop, four seconds, manual close, at most three stacked, `role="status"`.
- Touch targets: 44px under `lg`.
- Motion: every transition and animation under `motion-safe:` or paired with `motion-reduce:`.

### Session infrastructure notes

- Shell commands in this environment are prefixed with `rtk` (a token-reducing proxy). A hook rewrites them, but the explicit prefix is safer.
- File reading and editing go through the woz `Search` and `Edit` tools rather than the built-in ones; a hook enforces this.
- The `archify` skill produced the two diagrams under `docs/architecture/diagrams/`. Both passed validate, deliver and visual-check earlier in the session. The sign-in sequence diagram has a defect the consistency review found: a participant named "Customer app" and a `/login` route that no document defines.
- The internal browser pane was used for the 390px overflow sweep; Claude in Chrome was never connected.
- The design repo's dev server runs with `pnpm dev --port 5173 --strictPort`. `.claude/launch.json` still points at port 3000 and is untracked.

## User Feedback & Preferences

- **"you need to understand thay geniecore and genit kit and genie portal all belong to another dofferent product called genie portal, we are working on genie-ops-center here and we are nextjs fullstack"** — the most important correction of the session. Do not treat the other repos as part of this product.
- **"i think react-jsonschema-form is overkill"** — ended the form-library thread. The user favours the smallest thing that works over the most capable.
- **"i dont get it, what does it mean ? why second tenant branding ?"** and **"why render from configuration schemas? what does it mean ? can you give me some contet?"** — when a design question is abstract, explain the mechanism before recommending an option.
- **"wait you said previoously signed URL via object storage? can our current database handle that ?"**, **"we dont have a s3 yet, and we dont intend to to save cost"** — cost matters; do not assume infrastructure exists.
- **"we shouldnt have this setting at all it should be per chat solution setting, like in the old app"** — the user checks designs against how v1 actually behaved.
- **"im wondering why the time only shows when i hover on it ?"** — caught a real defect from a screenshot. Hover-only affordances are wrong given mobile-first (DEC-25).
- **"is that a good design security wise and arthitecture wise"** — wants the reasoning, not just the choice.
- **"can you fix them all ?"** — after a review, the user usually wants the fixes applied, not just reported.
- **"launch multiple agents to review against documentation as well as the v1 repo"**, **"launch subagents to search for gaps"** — prefers parallel agents for breadth.
- **"why 1 failed ?"** — wants failures explained plainly, not hidden.
- **"in the docs, you dont have to mention v1"**, **"you dont ahve to mention customer name, those are confidential"** — two standing rules for every document in the v2 tree.
- **"add in claude.md do not hand roll if a well maintained library exist to do the job"** — a project rule, which sits in tension with DEC-28 and is why DEC-28 records its reasoning explicitly.
- **"everything is owned by Genie Ops Center"** — no customer repositories; `customers/<slug>/` holds configuration and at most a custom app, never a module.
- **"everything must be designed for mobile from ground up, take mobile first approach, this is important"** — DEC-25.
- **"we should be creating branch from latest develop, submit pr to develop then submit pr to main , main is production branch"** and **"commits to main should be squashed"** — git flow.
- **"for this question im not sure, please make the best sensible decision for me"** — the user delegates decisions but wants them recorded with the reasoning and a revisit condition.

## Where We're Going

1. **Decide the ten "decide now" items** in `docs/review-2026-09-17.md` section 3. These are cheap today and expensive after Section 0 ships: file adapter limit, migrator out of the serving container, PgBouncer as the design, `scopesFor()` beside `can()`, per-tenant Postgres role and cookie key derivation, a `packages/contracts` layer, `MODULE_INCLUDE` semantics, per-realm Keycloak admin client only, migration linter plus last-served version, worker as a separate process.
2. **Fix the three contradictions** (section 2 of the same file). The `CLAUDE.md` files line is the urgent one because an agent reads it first.
3. **Resolve the Keycloak credential-email question.** Either accept a Java provider jar and put it in the repository layout, roadmap, and tech stack, or drop per-tenant branding from the three credential emails.
4. **Commit the design repo.** Everything is untracked. Follow the user's git flow: branch from latest `develop`, pull request into `develop`.
5. **Correct the stack table** with the versions in this handoff, and decide Base UI (no stable release), Node 26, and TypeScript 7 deliberately.
6. **Write the Section 0 specification** in `docs/specs/` and its ticket breakdown in `docs/tickets/`, then scaffold the monorepo.
7. **Customer discovery D-1 to D-12** remains with the customer; the contracts and approvals modules stay deferred.

## Risks & Blockers

- **The design repo's entire output is untracked.** A `git clean -fd` would destroy 257 screenshots, seven sections, and the shell. Commit before anything else.
- **The screenshot manifests live in `/tmp`** and will not survive a reboot. The script's header documents the format well enough to rebuild them.
- **Usage limits interrupted work twice.** Long parallel agent runs on this session's model hit both a session limit and a model limit. Resuming preserved everything; plan for it rather than respawning.
- **`docs/specs/`, `docs/tickets/`, `docs/runbooks/`, `docs/design/` are empty.** No implementation plan exists yet at ticket granularity.
- **Base UI has no stable release.** The entire `packages/ui` layer is planned on a release candidate that has not moved in two months.
- **The planning repository is not under version control.** Thirty-two decisions and six architecture records have no history, no blame, and no recovery from an accidental overwrite. This is the cheapest risk on the list to remove.
- **The two architecture diagrams are stale in one detail.** The sign-in sequence names a participant "Customer app" and a `/login` route that no document defines; the platform diagram shows object storage as the default. Both need their JSON source edited and the HTML regenerated through the archify skill, not hand-edited.

## Open Questions

- Does the user want the nine design defects fixed now, or recorded and scheduled? They have not answered yet.
- Per-tenant branded credential emails: accept the Java provider jar, or accept unbranded Keycloak templates?
- Is 5–10 MB an acceptable file limit for the Postgres adapter, given the user rejected object storage on cost grounds? If not, the `s3` adapter has to come forward.
- Base UI: wait for stable, pin the release candidate, or reconsider the primitive layer?
- Should the platform docs live in a git repository? They are currently unversioned, so there is no history for any of the 32 decisions.
- Does the operator want a per-tenant override for the chat origin list now, or only when a customer asks (the DEC-30 revisit condition)?
- Who answers the customer discovery questions D-1 to D-12, and by when? The review found no owner recorded against any of them.

## Quick Start for Next Session

```bash
# Read first — the unresolved work
cat /home/kenan/work/genie-ops-center-v2/docs/review-2026-09-17.md

# Project conventions (contains one known-wrong line about file storage)
cat /home/kenan/work/genie-ops-center-v2/CLAUDE.md

# The decisions, most recent first
sed -n '/DEC-28/,$p' /home/kenan/work/genie-ops-center-v2/docs/core/decision-log.md

# Design repo state — everything is untracked, commit before touching it
cd /home/kenan/work/genie-ops-center-design && git status -s

# Verify the design still builds
cd /home/kenan/work/genie-ops-center-design && npx tsc -b && npx eslint src

# Regenerate screenshots (dev server must be running on 5173)
pnpm dev --port 5173 --strictPort &
node scripts/shots.mjs <manifest.json>

# Next action
# Answer section 3 of docs/review-2026-09-17.md: the ten decisions that are
# cheap now and expensive after Section 0 ships. Start with the file-size
# limit and the migrator's location, because both change the deployment shape.
```
