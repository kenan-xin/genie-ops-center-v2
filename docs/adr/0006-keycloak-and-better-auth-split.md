---
status: accepted
date: 2026-09-16
---

# Keycloak authenticates, Better Auth owns the application session

Genie Ops Center uses both Keycloak and Better Auth, and both can do sessions, passwords, and email, so the split must be explicit. We decided that Keycloak answers who the person is and Better Auth answers what their session in this application is.

Keycloak, one realm per tenant: brokers the customer's identity provider or holds local accounts for a tenant without one, normalizes groups into one claim, enforces realm-level security policy (password rules, second factor, brute force), provides single sign-on across Genie Ops Center and genie-studio, and issues the OIDC token. It sends the three credential emails for local-account tenants (set password, reset password, verify email) because they carry its single-use action tokens.

Better Auth, one instance per tenant: exchanges the OIDC code, creates or links `user` and `account` rows, runs the onboarding hook (`invite` or `jit`), owns the 15-minute sliding session and its revocation, and keeps the break-glass administrator's password. It never holds an employee password.

The core mailer with React Email sends every email Genie Ops Center initiates: invitations, role changes, new-device sign-in, module notifications, with tenant branding. Digests are a later capability and not in the template catalogue (`core/roadmap.md`, Section 1, item 8).

## Considered options

1. Keycloak only, with a backend-for-frontend session in Genie Ops Center. Rejected because Better Auth gives database-backed sessions, revocation, hooks, and the break-glass path with far less code, and its Next.js integration is proven.
2. Better Auth only, with email and password in Genie Ops Center. Rejected because Genie Ops Center would become the password store and the identity-provider broker, which is the job Keycloak exists for.
3. Route password setting through Genie Ops Center so every email can be a React Email template. Rejected because employee passwords would transit Genie Ops Center and the reset machinery would be rebuilt in the application.
4. The split above. Chosen.

## Consequences

- Sign-out ends both sessions: Genie's, then Keycloak's through the realm's logout endpoint. Otherwise the next sign-in is silent.
- Credential emails for local-account tenants use Keycloak's built-in email templates, unchanged. The only branding they carry is the realm display name, which provisioning sets to the company name, and the sender name and reply-to in the realm's SMTP settings. Nothing else from branding reaches the realm. Brokered tenants never receive these emails (amended 2026-09-17, `DEC-40`).
- One template system exists in Genie Ops Center, React Email. No Keycloak theme is built or deployed. The Keycloak email context is a fixed attribute map, so a branded theme needs either realm localization overrides written through the admin API or a custom Java `EmailTemplateProvider`. Both stay possible later without changing this split.
- The realm's SMTP settings are part of the local-accounts realm template variant and use the tenant's sender name and reply-to.
