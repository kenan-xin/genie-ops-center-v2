import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { auditEvent, tenantIntegrationKey } from "../src/schema.ts";
import {
  integrationKeyStored,
  readIntegrationKey,
  removeIntegrationKey,
  storeIntegrationKey,
} from "../src/services/integrations/keys.ts";
import { createLogger } from "../src/services/logging/index.ts";
import {
  type DisposableDeployment,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";
import { captureLoggerStream } from "./log-capture.ts";

/** The one key name core stores today; the store is generic but its label is the model provider's. */
const NAME = "model-provider";

const KEY_A = "sk-or-v1-s7-05-store-a-0000000000000000";

const KEY_B = "sk-or-v1-s7-05-store-b-0000000000000000";

// fatal is absent: it drops a logger.error line, so the check would pass on empty output.
const LOG_LEVELS = ["error", "warn", "info", "debug", "trace"] as const;

let deployment: DisposableDeployment;

let actorUserId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment();

  await markSetupDone(deployment.context);

  actorUserId = await insertUser(deployment.context);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

beforeEach(async () => {
  await deployment.context.db.delete(tenantIntegrationKey);
});

/** The audit row ids present now, so a case counts only the rows its own writes added. */
async function auditIds(context: TenantContext): Promise<Set<string>> {
  const rows = await context.db.select({ id: auditEvent.id }).from(auditEvent);

  return new Set(rows.map((row) => row.id));
}

describe("the integration key store against a real database", () => {
  it("stores, replaces and removes a key with one audit row each that names the key and never its value", async () => {
    const before = await auditIds(deployment.context);

    await storeIntegrationKey(deployment.context, {
      name: NAME,
      value: KEY_A,
      actorUserId,
    });

    expect(await readIntegrationKey(deployment.context, NAME)).toBe(KEY_A);
    expect(await integrationKeyStored(deployment.context, NAME)).toBe(true);

    await storeIntegrationKey(deployment.context, {
      name: NAME,
      value: KEY_B,
      actorUserId,
    });

    expect(await readIntegrationKey(deployment.context, NAME)).toBe(KEY_B);

    expect(
      await removeIntegrationKey(deployment.context, {
        name: NAME,
        actorUserId,
      })
    ).toEqual({ changed: true });

    expect(await readIntegrationKey(deployment.context, NAME)).toBeUndefined();
    expect(await integrationKeyStored(deployment.context, NAME)).toBe(false);

    expect(
      await removeIntegrationKey(deployment.context, {
        name: NAME,
        actorUserId,
      })
    ).toEqual({ changed: false });

    const rows = (await deployment.context.db.select().from(auditEvent))
      .filter((row) => !before.has(row.id))
      .toSorted((left, right) => {
        const at = left.occurredAt.getTime() - right.occurredAt.getTime();

        return at === 0 ? left.id.localeCompare(right.id) : at;
      });

    expect(
      rows.map((row) => ({
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        summary: row.summary,
        metadata: row.metadata,
      }))
    ).toEqual([
      {
        action: "core:integration_key_stored",
        targetType: "integration_key",
        targetId: NAME,
        summary: "Stored the model provider key",
        metadata: { name: NAME, replaced: false },
      },
      {
        action: "core:integration_key_stored",
        targetType: "integration_key",
        targetId: NAME,
        summary: "Replaced the model provider key",
        metadata: { name: NAME, replaced: true },
      },
      {
        action: "core:integration_key_removed",
        targetType: "integration_key",
        targetId: NAME,
        summary: "Removed the model provider key",
        metadata: { name: NAME },
      },
    ]);

    expect(JSON.stringify(rows)).not.toContain(KEY_A);
    expect(JSON.stringify(rows)).not.toContain(KEY_B);

    expect(
      await deployment.context.db.select().from(tenantIntegrationKey)
    ).toEqual([]);
  }, 120000);

  it("a failed write throws an error that, logged at every level, carries no key", async () => {
    const before = await auditIds(deployment.context);

    let caught: unknown;

    try {
      await storeIntegrationKey(deployment.context, {
        name: NAME,
        value: KEY_A,
        // The foreign key refuses this insert, so the failure happens after the key is in the query.
        actorUserId: "no-such-person",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);

    if (!(caught instanceof Error)) return;

    expect(caught.message).toContain("could not be stored");
    expect(caught.message).not.toContain(KEY_A);
    expect(caught.stack ?? "").not.toContain(KEY_A);
    expect(JSON.stringify(caught)).not.toContain(KEY_A);
    // DEC-53: a cause would carry the key in the drizzle wrapper's message and params.
    expect(caught.cause).toBeUndefined();

    for (
      let current: Error | undefined = caught;
      current !== undefined;
      current = current.cause instanceof Error ? current.cause : undefined
    ) {
      expect(current.message).not.toContain(KEY_A);
      expect(current.stack ?? "").not.toContain(KEY_A);
    }

    for (const logLevel of LOG_LEVELS) {
      const capture = captureLoggerStream();

      const logger = createLogger({ logLevel }, capture.destination);

      capture.proveCapture(logger);
      capture.clear();

      // The RPC handler logs the raw error before it maps it.
      logger.error({ err: caught }, "store failed");

      // A level that drops the line proves nothing: assert it was written before reading it.
      const output = capture.output();

      expect(output).not.toBe("");
      expect(output).not.toContain(KEY_A);
    }

    expect(
      await deployment.context.db.select().from(tenantIntegrationKey)
    ).toEqual([]);

    expect(await auditIds(deployment.context)).toEqual(before);
  }, 120000);
});
