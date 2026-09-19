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
