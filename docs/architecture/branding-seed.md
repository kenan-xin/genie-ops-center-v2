# Branding seed requirements

Approved requirements, 2026-09-21. This document governs authored initial branding; it is not evidence that the schemas, generator or setup already implement these rules. See [DEC-35](../core/decision-log.md#dec-35-configuration-holds-only-values-that-something-reads) and [Branding data](data-shape.md#branding).

## Required customer values

Require `company_name`, `product_name`, `default_locale` and `default_time_zone`. Locale and time zone must be explicit customer values, never inferred from the installation host. Keep branding values in `branding.seed.json`, not duplicated in `tenant.yaml`.

## Approved omission behavior

| Input | When omitted |
| --- | --- |
| `email_reply_to` | Initial setup may proceed. Configure it and validate email readiness when application email is configured. This does not change Keycloak credential-email configuration. |
| Logos, favicon and login background image | Use the standard product fallback. Exact assets and rendering still need specification. |
| Support, terms and privacy links, including the support email contact | Hide the absent item. |
| `login_notice_text` | Show no notice and require no acknowledgement. Reject `login_notice_requires_acknowledgement: true` without a notice. |
| Appearance settings | Use standard Genie Ops Center design defaults: `system` theme, documented default font (`plus-jakarta-sans`) and size (`default`), existing standard accessible colours and neutral login background. Allow customer overrides; do not invent a second palette. |

Exact default colour values must be traced to [canonical design tokens](../design/design-system/tokens.md). This decision does not introduce a config-to-UI dependency or authorize importing browser/runtime code into build-safe schemas.

Previously approved seed corrections remain applicable: exclude bookkeeping and derived `primary_foreground` from authored input; setup derives the foreground using the shared branding-save rule. The loader removes editor-only `$schema` before strict validation. Supplied email addresses must be valid emails and supplied support, terms and privacy URLs must use HTTP or HTTPS.

## Text and formatting defaults — approved 2026-09-21

- Omitted `login_welcome_text`: “Welcome to {product name}”, using the tenant's `product_name`.
- Omitted `email_sender_name`: use `company_name`.
- Omitted `email_footer_text`: no footer text.
- Omitted `date_format` and `number_format`: follow the required tenant locale; explicit customer overrides remain supported.

These defaults do not make application email ready to send or alter Keycloak email settings. Default materialization and whether later company/product-name changes update previously defaulted text remain implementation/design questions, not decisions made here.

## Open requirements

Also unresolved: explicit `null` versus omitted-key semantics, normalization/default-materialization ownership, exact fallback assets/rendering, and the complete application-email readiness contract. A list of database columns alone does not establish seed requiredness or defaults. Track these questions under the branding entry in [product vision](../core/vision.md#open-decisions).

## Implementation implications

S0-03 must reconcile its seed schema and tests with these approved decisions while preserving build safety. Generator and setup consumers must use the same approved contract. Section 1 setup and Section 3 branding must retain the distinction between initial seed values and subsequent administrator edits; rerunning setup must not overwrite live branding. Unresolved requirements remain explicit rather than being filled by implementation guesses.
