import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { storeIntegrationKey } from "../src/services/integrations/keys.ts";
import { insertUser } from "./access-fixtures.ts";

/** The recorded model's key: the replay transport answers it, so no live host ever sees it. */
const RECORDED_MODEL_KEY = "sk-or-v1-recorded-model-000000000000000000";

/**
 * Turns AI on for a test deployment: stores the model key, then writes the model settings and,
 * when given, the reporting date by SQL. Call it before the context's first settings read, because
 * the settings reader caches for 10 s and a later write is not seen (DEC-46).
 */
export async function writeModelConnection(
  context: TenantContext,
  input: {
    readonly allowed: readonly string[];
    readonly chat: string | null;
    readonly document: string | null;
    readonly reportingDate?: string;
  }
): Promise<void> {
  await storeIntegrationKey(context, {
    name: "model-provider",
    value: RECORDED_MODEL_KEY,
    actorUserId: await insertUser(context),
  });

  await context.db.$client.query(
    "update tenant_settings set allowed_models = $1::text[], chat_model = $2, document_model = $3, reporting_date = coalesce($4::date, reporting_date)",
    [input.allowed, input.chat, input.document, input.reportingDate ?? null]
  );
}
