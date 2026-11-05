import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { callProcedure } from "../src/lib/rpc/call-procedure.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import { agentFile } from "../src/schema.ts";
import {
  appendMessage,
  createAgentFile,
  createAgentRouter,
  createOwnSession,
} from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import {
  type DisposableDeployment,
  insertPersonWith,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

/** The `agent` area behind `core:ask:use` (Spec 7 R-42), against a real Postgres. */
let deployment: DisposableDeployment;

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);
  await markSetupDone(deployment.context);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function personWith(permissions: readonly string[]) {
  const tenant = deployment.context;
  const { userId } = await insertPersonWith(tenant, permissions);

  const ctx = {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  };

  return {
    ctx,
    agent: callProcedure(createAgentRouter(), {
      ...ctx,
      requestId: "req-agent-area",
    }),
  };
}

describe("the agent area", () => {
  it("refuses a person without core:ask:use on every procedure, and lists a holder's own sessions", async () => {
    const outsider = await personWith([]);

    // A malformed config would fail the gate's parser; forbidden proves the key check runs first.
    await expect(outsider.agent.sessions()).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      outsider.agent.messages({ id: randomUUID() })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      outsider.agent.artifacts({ id: randomUUID() })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      outsider.agent.chart({ config: { kind: "not-a-chart" } })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      outsider.agent.files({ id: randomUUID() })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      outsider.agent.fileLink({ id: randomUUID() })
    ).rejects.toMatchObject({ code: "forbidden" });

    const holder = await personWith(["core:ask:use"]);
    const id = randomUUID();

    await createOwnSession(holder.ctx, {
      id,
      title: "Records this month",
      modelId: "openai/gpt-6.1-terra",
    });

    expect(
      (await holder.agent.sessions()).map((session) => session.id)
    ).toEqual([id]);
  });

  it("answers the caller's artifacts of a chat with every version, and none of another person's", async () => {
    const owner = await personWith(["core:ask:use"]);
    const other = await personWith(["core:ask:use"]);
    const id = randomUUID();
    const artifactId = randomUUID();

    const config = {
      type: "bar",
      title: "Quantity by record",
      series: [
        {
          name: "Quantity",
          dataset: "placeholder.records",
          query: { limit: 10 },
          x: "label",
          y: "quantity",
        },
      ],
    } as const;

    await createOwnSession(owner.ctx, {
      id,
      title: "Quantity",
      modelId: "openai/gpt-6.1-terra",
    });

    const answerWith = (version: number) =>
      appendMessage(
        owner.ctx,
        id,
        { role: "assistant", parts: [{ type: "text", text: "Here." }] },
        [
          {
            toolCallId: `call_${version}`,
            artifactId,
            number: 1,
            isNew: version === 1,
            kind: "chart",
            title: "Quantity by record",
            version,
            definition: config,
          },
        ]
      );

    await answerWith(1);
    await answerWith(2);

    expect(await owner.agent.artifacts({ id })).toMatchObject([
      {
        id: artifactId,
        number: 1,
        latestVersion: 2,
        versions: [{ version: 1 }, { version: 2 }],
      },
    ]);
    expect(await other.agent.artifacts({ id })).toEqual([]);
    expect(await owner.agent.artifacts({ id: "not-a-uuid" })).toEqual([]);
  });

  it("answers the caller's files of a chat, and a download link for the caller's own finished file only", async () => {
    const owner = await personWith(["core:ask:use"]);
    const other = await personWith(["core:ask:use"]);
    const id = randomUUID();
    const tenant = deployment.context;

    await createOwnSession(owner.ctx, {
      id,
      title: "Files",
      modelId: "openai/gpt-6.1-terra",
    });

    const queued = (toolCallId: string, title: string) =>
      createAgentFile(owner.ctx, {
        sessionId: id,
        toolCallId,
        title,
        format: "csv",
        dataset: "placeholder.records",
        query: { select: ["label"] },
      });

    const made = await queued("call_made", "Made");
    const making = await queued("call_making", "Making");

    // The job's end state, written here because this deployment has no dataset to read.
    await withTransaction(tenant, async (tx) => {
      const stored = await tenant.fileStorage.store(
        {
          fileName: "Made.csv",
          mimeType: "text/csv",
          bytes: Buffer.from("Label\nAlpha\n"),
          uploadedByUserId: owner.ctx.caller.userId,
        },
        tx
      );

      await tx
        .update(agentFile)
        .set({ state: "ready", fileId: stored.id, rowCount: 1 })
        .where(eq(agentFile.id, made));
    });

    expect(await owner.agent.files({ id })).toEqual([
      {
        id: made,
        toolCallId: "call_made",
        title: "Made",
        format: "csv",
        state: "ready",
        rowCount: 1,
      },
      {
        id: making,
        toolCallId: "call_making",
        title: "Making",
        format: "csv",
        state: "queued",
        rowCount: null,
      },
    ]);
    expect(await other.agent.files({ id })).toEqual([]);
    expect(await owner.agent.files({ id: "not-a-uuid" })).toEqual([]);

    const { url } = await owner.agent.fileLink({ id: made });
    const token = new URL(url).searchParams.get("token") ?? "";

    const fetched = await tenant.fileStorage.fetchLink({
      token,
      principal: owner.ctx.caller,
    });

    expect(fetched.bytes.toString()).toBe("Label\nAlpha\n");

    await expect(other.agent.fileLink({ id: made })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(owner.agent.fileLink({ id: making })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("refuses the break-glass account, which bypasses the key check (P7)", async () => {
    const tenant = deployment.context;

    const userId = await insertUser(tenant, {
      isBreakGlass: true,
      twoFactorEnabled: true,
    });

    const agent = callProcedure(createAgentRouter(), {
      tenant,
      caller: principalFor({
        tenant,
        modules: [],
        userId,
        authenticated: true,
      }),
      requestId: "req-agent-area",
    });

    await expect(agent.sessions()).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      agent.chart({ config: { kind: "not-a-chart" } })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
