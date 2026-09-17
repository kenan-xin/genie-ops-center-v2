# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Decided before any code exists, authoritative in `docs/core/tech-stack.md`: Next.js (App Router) on React, Tailwind CSS with CSS variables carrying the fixed and tenant token layers, shadcn on Base UI primitives, tRPC + TanStack Query/Form/Table/Pacer, zustand, drizzle-orm on Postgres, pnpm workspaces with Nx. English only, `next-intl` catalog (`DEC-13`).

## Users

Four audiences, all served by the first release (confirmed):

- **Member** — a customer employee signing in with their company account; sees only the entitled modules and the records their roles permit.
- **Customer IT administrator** — decides entry in the customer's identity provider, and roles, groups, branding, locale, and onboarding in the admin portal; never sees another tenant.
- **Customer business user of a module** — each module names its own users in `docs/modules/<module>/README.md`.
- **Genie operator** — builds the customer's image, creates its database and realm, and runs the stack on Genie's servers or hands it over; works through the `genie-ops` CLI (`DEC-14`), and no operator screens exist.

## Product Purpose

Genie Ops Center is the enterprise application platform Genie builds once and runs separately for each customer: a shared core (identity, access, people, branding, audit, files, email, AI chat) plus business modules, where each customer runs its own deployment with its own image, database, identity realm, and only its own modules. It exists because regulated customers (government, healthcare, finance) reject shared-database multi-tenancy, need enterprise sign-in with same-day offboarding, and need permission models that vary per customer without a rewrite each time. The first release succeeds when the whole platform works for all four audiences — core, admin portal, and the solutions hub shipped before the first customer module (confirmed).

## Positioning

One codebase and one Dockerfile produce a fully isolated deployment per customer — own database, own identity realm, own infrastructure choice — and a module built for one customer reaches another by granting an entitlement alone: nothing moves, nothing forks. A neighboring multi-tenant SaaS could not truthfully claim "your own database and your own realm from the vendor's single codebase."

## Operating Context

- Customers are in regulated industries with security teams that must approve the deployment; hosting is Genie-hosted or customer-hosted (customer-managed or Genie-managed) from the same image (`DEC-33`).
- Sign-in comes from the customer's own identity provider brokered through a per-customer Keycloak realm (OIDC, SAML 2.0, LDAP/AD), or local realm accounts when the customer has no provider; offboarding in the provider locks the person out.
- Operators deploy with the `genie-ops` CLI and generated compose or Helm values; dev, staging, and production are Genie-hosted stacks of a demo customer (`DEC-18`); deployment today follows the manual runbook (`DEC-38`).
- Mobile-first web on evergreen browsers, no native apps (`DEC-25`).

## Capabilities and Constraints

The authoritative records are `docs/core/vision.md` (the DEC-1..51 table), `docs/core/decision-log.md`, and the ADRs in `docs/adr/`. The load-bearing constraints:

- The database is the tenant: no `tenant_id` column, no tenant registry, no hostname routing; every deployment is one customer.
- The application is hosting-agnostic: no code knows who hosts it; every read of database, settings, branding, entitlements, or files goes through one `TenantContext` (`DEC-34`).
- Authorization lives in one seam: `can(user, permission, resource?)` and `scopesFor(user, permission)` (`DEC-39`); no bypass except the break-glass account.
- A module uses only the extension points of `docs/architecture/module-contract.md`; modules never import each other; customer difference is never a branch in code.
- A tenant administrator administers compiled modules from the admin portal: switch a module on or off through the one core procedure the CLI shares, see which groups and people reach it, and place it in a core category (`DEC-50`, `DEC-51`).
- Files go through the `FileStorage` interface only (`DEC-20`); the AI chat calls the external Genie chat API; no model is built.
- Open decisions: `OPEN-7` (setup/upgrade automation, manual until decided). The first customer modules, contracts and approvals, are deferred on customer discovery (`D-n` in each module's `discovery.md`).

## Brand Commitments

- The product name is Genie Ops Center.
- The design system has two layers: a fixed token layer tenants cannot change, and a tenant-customizable layer configured in the admin portal's branding screens. Everything outside the branding list is fixed by the design system.
- Binding (confirmed): the fixed layer and the defaults of the customizable layer — what every tenant starts from — must look good, well polished, and well designed. Tenant overrides sit on top of good defaults and never excuse them.
- The design owner delivers the visual authority; `docs/design/` holds it (see Evidence on Hand).
- No other brand assets, logo files, or voice guide exist in the repository.

## Evidence on Hand

- The design tree `docs/design/` (delivered by the design owner) is a text-only handover: `design-system/tokens.md`, `shell/spec.md`, and one section design per core roadmap section (`spec.md`, `types.ts`, `data.json`) covering sign-in, people/groups/roles, branding, audit and tenant settings, account and inbox, email templates, and solutions. Captures stay in the design owner's tree (`/home/kenan/work/genie-ops-center-design`), referenced by path and never copied into this repository; `design/history/` holds past review records and `design/research/theming-2026-09-17.md` the evidence behind `DEC-47`.
- Core documentation: `docs/core/` (vision, roadmap, tech-stack, decision-log), ADRs 0001–0007, `docs/architecture/` references and diagrams, module folders with discovery questions, `docs/runbooks/deployment.md`.
- Absences future work must not fabricate: no running application, no real customer screenshots, quotes, metrics, or case studies; customers are never named in docs ("the first customer").

## Product Principles

1. Isolation by deployment, not by code: the database is the tenant, and nothing in code knows or branches on the customer.
2. One seam per concern: one `TenantContext` for tenant reads, one `can()`/`scopesFor()` seam for authorization, one `FileStorage` for bytes, one module contract for capabilities.
3. Reuse by entitlement: a module reaches a second customer by granting the entitlement; nothing moves, nothing forks.
4. Polished defaults under every override: each tenant starts from a designed default that must stand on its own.
5. Boring first, open to extension: a module ships its plain workflow before its AI features, and a deferred capability names the path that reopens it.

## Accessibility & Inclusion

- WCAG 2.1 AA, verified with axe in Playwright (`DEC-21`).
- Mobile first on every screen including the admin portal; evergreen browsers; no native apps (`DEC-25`).
- Branding enforces readability: one primary color with computed foreground and contrast rejection (`DEC-47`), font size presets (compact, default, large), per-person language and time-zone overrides.
