import { eq } from "drizzle-orm";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantIntegration } from "../../schema.ts";

/**
 * A JSON value, the shape a `tenant_integration.config` holds. The column is `jsonb`, so this is
 * exactly what a JSON document can be and nothing richer (R-40).
 */
export type IntegrationConfig =
  | string
  | number
  | boolean
  | null
  | readonly IntegrationConfig[]
  | { readonly [key: string]: IntegrationConfig };

/**
 * One integration resolved for a call (R-41): its id, its status, its non-secret configuration,
 * and the live secret read from the environment by the name in `secret_ref` at this call. The
 * secret is `undefined` only when the row names no reference; it never comes from the database and
 * is never written back (DEC-20).
 */
export type ResolvedIntegration = {
  readonly id: string;
  readonly status: string;
  readonly config: IntegrationConfig;
  readonly secret: string | undefined;
};

/**
 * Reads the environment entry a `secret_ref` names, at call time. A reference with no entry fails
 * with a message that names the reference and never the value, so the error and its stack can be
 * logged without leaking a credential (R-41, R-45).
 */
function readSecret(secretRef: string): string {
  const secret = process.env[secretRef];

  if (secret === undefined) {
    throw new Error(
      `The integration secret reference "${secretRef}" has no value in the environment.`
    );
  }

  return secret;
}

/**
 * The one service that resolves an integration (R-41): it reads the row through the context's
 * database, returns its status and non-secret configuration, and reads the secret from the
 * environment by the name in `secret_ref` at each call. It writes nothing and logs nothing, so a
 * credential is never stored and never logged (R-40, R-42, DEC-20).
 *
 * The resolver does not refuse by status: a `disabled` or `error` row still resolves, and the
 * calling module decides whether to use it.
 */
export async function resolveIntegration(
  context: TenantContext,
  integrationId: string
): Promise<ResolvedIntegration> {
  const [row] = await context.db
    .select({
      id: tenantIntegration.id,
      status: tenantIntegration.status,
      config: tenantIntegration.config,
      secretRef: tenantIntegration.secretRef,
    })
    .from(tenantIntegration)
    .where(eq(tenantIntegration.id, integrationId));

  if (row === undefined) {
    throw new Error(
      `No integration is recorded with the id "${integrationId}".`
    );
  }

  // SAFETY: the column is jsonb and carries no `$type`, so drizzle types it `unknown`; the row's
  // own JSON document is exactly what `IntegrationConfig` describes.
  const config = row.config as IntegrationConfig;

  return {
    id: row.id,
    status: row.status,
    config,
    secret: row.secretRef === null ? undefined : readSecret(row.secretRef),
  };
}
