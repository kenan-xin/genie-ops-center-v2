import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  moduleAudit,
  principalFor,
  type RequestPrincipal,
  withTransaction,
} from "../src/index.ts";
import { auditEvent } from "../src/schema.ts";
import { insertUser, startDisposableDeployment } from "./index.ts";

/**
 * The module audit call against a real Postgres (R-10). The caller is a real principal read from
 * real assignments, and the row lands in the real `audit_event` table; no part of the write is
 * mocked. The module id is a local fixture, because core imports no module (R-39).
 */
const audit = moduleAudit("fixture");

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let callerId: string;

let caller: RequestPrincipal;

beforeAll(async () => {
  deployment = await startDisposableDeployment();
  callerId = await insertUser(deployment.context);
  caller = principalFor({
    tenant: deployment.context,
    modules: [],
    userId: callerId,
    authenticated: true,
  });
}, 120000);

afterAll(async () => {
  await deployment.stop();
});

describe("the module audit call against a real database", () => {
  it("writes one row naming the caller, the target and the metadata, and a null actor without a caller", async () => {
    await audit(
      { tenant: deployment.context, caller },
      "fixture:thing_done",
      { type: "fixture-thing", id: "t1" },
      "Did thing t1",
      { size: 3 }
    );

    const personRows = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, "fixture:thing_done"));

    expect(personRows).toHaveLength(1);
    expect(personRows[0]).toMatchObject({
      actorUserId: callerId,
      action: "fixture:thing_done",
      targetType: "fixture-thing",
      targetId: "t1",
      summary: "Did thing t1",
      metadata: { size: 3 },
    });

    await audit({ tenant: deployment.context }, "fixture:tick", null, "Ticked");

    const [systemRow] = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, "fixture:tick"));

    expect(systemRow).toMatchObject({
      actorUserId: null,
      targetType: null,
      targetId: null,
      summary: "Ticked",
      metadata: {},
    });
  });

  it("a row written inside a transaction rolls back with it", async () => {
    await expect(
      withTransaction(deployment.context, async (tx) => {
        await audit(
          { tenant: deployment.context, tx },
          "fixture:rolled_back",
          null,
          "Rolled back"
        );

        throw new Error("roll back the fixture write");
      })
    ).rejects.toThrow("roll back the fixture write");

    const rows = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, "fixture:rolled_back"));

    expect(rows).toHaveLength(0);
  });
});
