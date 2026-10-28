import { desc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { callProcedure } from "../src/lib/rpc/call-procedure.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { auditEvent, tenantIntegrationKey } from "../src/schema.ts";
import { principalFor } from "../src/services/authorization/index.ts";
import { readIntegrationKey } from "../src/services/integrations/keys.ts";
import { createSettingsRouter } from "../src/services/settings/router.ts";
import {
  type DisposableDeployment,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

/** The model provider key (R-17): write-only, stored under the one name core uses. */
const KEY = "sk-or-v1-s7-05-task-2-0000000000000000";

let deployment: DisposableDeployment;

let userId: string;

function settingsApi() {
  const caller = principalFor({
    tenant: deployment.context,
    modules: [],
    userId,
    authenticated: true,
  });

  return callProcedure(createSettingsRouter([]), {
    tenant: deployment.context,
    caller,
    requestId: "req-model-key-test",
  });
}

let api: ReturnType<typeof settingsApi>;

beforeAll(async () => {
  deployment = await startDisposableDeployment();

  await markSetupDone(deployment.context);

  ({ userId } = await insertPersonWith(deployment.context, [
    "core:settings:manage",
  ]));

  api = settingsApi();
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

beforeEach(async () => {
  await deployment.context.db.delete(tenantIntegrationKey);
});

async function auditCount(context: TenantContext): Promise<number> {
  return (await context.db.select({ id: auditEvent.id }).from(auditEvent))
    .length;
}

async function newestAuditRow(context: TenantContext) {
  const [row] = await context.db
    .select({
      action: auditEvent.action,
      summary: auditEvent.summary,
      metadata: auditEvent.metadata,
    })
    .from(auditEvent)
    .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.id))
    .limit(1);

  return row;
}

describe("the model provider key in Tenant settings", () => {
  it("stores the key write-only: the answer, the settings read and the audit row never hold it", async () => {
    const before = await auditCount(deployment.context);

    await expect(api.saveModelKey({ apiKey: `  ${KEY}  ` })).resolves.toEqual({
      changed: true,
    });

    const read = await api.read();

    expect(read.core.modelKeyStored).toBe(true);
    expect(JSON.stringify(read)).not.toContain(KEY);

    // The write-only proof only counts if this save wrote the row it reads.
    expect(await auditCount(deployment.context)).toBe(before + 1);

    const audit = await newestAuditRow(deployment.context);

    expect(audit).toMatchObject({
      action: "core:integration_key_stored",
      summary: "Stored the model provider key",
    });
    expect(JSON.stringify(audit)).not.toContain(KEY);

    const [stored] = await deployment.context.db
      .select()
      .from(tenantIntegrationKey);

    expect(stored?.value).toBe(KEY);
  }, 120000);

  it("refuses an empty key and keeps the stored key", async () => {
    await api.saveModelKey({ apiKey: KEY });

    const written = await auditCount(deployment.context);

    await expect(api.saveModelKey({ apiKey: "   " })).rejects.toMatchObject({
      code: "settings-invalid",
      issues: [
        {
          path: "apiKey",
          message:
            "Enter the key, or leave the field empty to keep the stored key.",
        },
      ],
    });

    expect(await readIntegrationKey(deployment.context, "model-provider")).toBe(
      KEY
    );
    expect(await auditCount(deployment.context)).toBe(written);
  }, 120000);
});
