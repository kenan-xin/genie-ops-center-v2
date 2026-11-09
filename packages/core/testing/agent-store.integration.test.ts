import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import {
  type AgentMessage,
  appendMessage,
  createOwnSession,
  deleteOwnSession,
  findOwnSession,
  listOwnArtifacts,
  listOwnSessions,
  type PendingVersion,
  readOwnHistory,
  readOwnSession,
  saveSummary,
  storedArtifact,
  storedArtifactCount,
} from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import type { PanelConfig } from "../src/services/charts/panel-config.ts";
import {
  type DisposableDeployment,
  insertAgentSession,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

const MODEL = "openai/gpt-6.1-terra";

let deployment: DisposableDeployment;

let personA: ModuleRequestContext;

let personB: ModuleRequestContext;

async function person(): Promise<ModuleRequestContext> {
  const tenant = deployment.context;
  const { userId } = await insertPersonWith(tenant, []);

  return {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  };
}

function text(value: string): AgentMessage["parts"] {
  return [{ type: "text", text: value }];
}

async function session(ctx: ModuleRequestContext, title: string) {
  return createOwnSession(ctx, { id: randomUUID(), title, modelId: MODEL });
}

const barConfig: PanelConfig = {
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
};

function pending(
  artifactId: string,
  number: number,
  version: number,
  title = "Quantity by record"
): PendingVersion {
  return {
    toolCallId: `call_${number}_${version}`,
    artifactId,
    number,
    isNew: version === 1,
    kind: "chart",
    title,
    version,
    definition: barConfig,
  };
}

function answer(value: string) {
  return { role: "assistant", parts: text(value) } as const;
}

async function rowCount(table: string, sessionId: string): Promise<number> {
  const where =
    table === "agent_artifact"
      ? sql`session_id = ${sessionId}`
      : sql`artifact_id in (select id from agent_artifact where session_id = ${sessionId})`;

  const { rows } = await deployment.context.db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${where}`
  );

  return rows[0]?.n ?? -1;
}

beforeAll(async () => {
  deployment = await startDisposableDeployment();

  await markSetupDone(deployment.context);

  personA = await person();
  personB = await person();
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

describe("the owner-only agent store against a real database", () => {
  it("a person lists only their own sessions, latest message first", async () => {
    const own = await person();
    const other = await person();

    const s1 = await session(own, "First");
    const s2 = await session(own, "Second");
    const s3 = await session(other, "Other");

    await appendMessage(own, s1.id, { role: "user", parts: text("Hello") });

    expect((await listOwnSessions(own)).map(({ id }) => id)).toEqual([
      s1.id,
      s2.id,
    ]);
    expect((await listOwnSessions(other)).map(({ id }) => id)).toEqual([s3.id]);
  });

  it("Ask lists only Ask chats, and a surface lists its record's chats first", async () => {
    const own = await person();
    const other = await person();

    const ask = await session(own, "Ask chat");
    const older = new Date(Date.now() - 60_000);

    const forR2 = await insertAgentSession(deployment.context, {
      userId: own.caller.userId,
      surface: "slides",
      recordId: "r2",
      updatedAt: older,
    });

    const forR1 = await insertAgentSession(deployment.context, {
      userId: own.caller.userId,
      surface: "slides",
      recordId: "r1",
    });

    await insertAgentSession(deployment.context, {
      userId: other.caller.userId,
      surface: "slides",
      recordId: "r2",
    });

    expect({
      ask: (await listOwnSessions(own)).map(({ id }) => id),
      slides: (
        await listOwnSessions(own, { surface: "slides", recordId: "r2" })
      ).map(({ id }) => id),
    }).toEqual({ ask: [ask.id], slides: [forR2.id, forR1.id] });
  });

  it("another person's session answers not-found and stays unchanged", async () => {
    const s1 = await session(personA, "A's chat");

    await appendMessage(personA, s1.id, {
      role: "user",
      parts: text("A's question"),
    });

    const attempts = [
      ["B reads A's session", () => readOwnSession(personB, s1.id)],
      [
        "B appends to A's session",
        () =>
          appendMessage(personB, s1.id, {
            role: "user",
            parts: text("B's words"),
          }),
      ],
      [
        "B creates a session with A's id",
        () =>
          createOwnSession(personB, {
            id: s1.id,
            title: "Taken over",
            modelId: MODEL,
          }),
      ],
      ["A reads a malformed id", () => readOwnSession(personA, "not-a-uuid")],
    ] as const;

    await Promise.all(
      attempts.map(([label, attempt]) =>
        expect(attempt(), label).rejects.toMatchObject({
          name: "AppError",
          code: "not-found",
        })
      )
    );

    // A well-formed id with no row is a new chat, not a refusal: the route creates it.
    expect(await findOwnSession(personA, randomUUID())).toBeUndefined();

    const { session: kept, messages } = await readOwnSession(personA, s1.id);

    expect(kept.title).toBe("A's chat");
    expect(messages.map(({ parts }) => parts)).toEqual([text("A's question")]);
  });

  it("messages keep their order and their parts", async () => {
    const s1 = await session(personA, "Ordered");

    const toolCall: AgentMessage["parts"] = [
      { type: "step-start" },
      {
        type: "tool-query-dataset",
        toolCallId: "call_1",
        state: "output-available",
        input: { dataset: "placeholder.items", query: { limit: 2 } },
        output: {
          rows: [
            { name: "Alpha", amount: 10 },
            { name: "Beta", amount: null },
          ],
          truncated: false,
        },
      },
      { type: "text", text: "Two items." },
    ];

    // The highest uuid on the middle message, so an order by id puts it last on every run.
    const assistantId = "ffffffff-ffff-4fff-bfff-ffffffffffff";

    const sent = [
      { role: "user", parts: text("How many items?") },
      { role: "assistant", parts: toolCall },
      { role: "user", parts: text("Thanks") },
    ] as const;

    for (const message of sent) {
      // oxlint-disable-next-line no-await-in-loop -- the append order is what the test reads back
      await appendMessage(personA, s1.id, { ...message, id: assistantId });
    }

    const { messages } = await readOwnSession(personA, s1.id);

    expect(messages.map(({ role, parts }) => ({ role, parts }))).toEqual(sent);
    expect(messages[1]?.id).toBe(assistantId);

    // Each message carries its time, so a reload can still say how long an answer took.
    const times = messages.map(({ metadata }) =>
      z.object({ createdAt: z.iso.datetime({ offset: true }) }).parse(metadata)
    );

    expect(Date.parse(times[1]?.createdAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(times[0]?.createdAt ?? "")
    );
  });

  it("writes an answer's versions with the answer, and nothing when the write fails", async () => {
    const s1 = await session(personA, "Two charts");
    const first = randomUUID();
    const second = randomUUID();

    const answerId = await appendMessage(
      personA,
      s1.id,
      answer("Two charts."),
      [pending(first, 1, 1), pending(second, 2, 1)]
    );

    const { rows } = await deployment.context.db.execute<{
      artifact_id: string;
      message_id: string;
    }>(
      sql`select artifact_id, message_id from agent_artifact_version where artifact_id in (${first}, ${second}) order by artifact_id`
    );

    expect(rows).toHaveLength(2);
    expect(rows.every(({ message_id }) => message_id === answerId)).toBe(true);

    await expect(
      // A second new artifact with a stored id fails after the first new one was written.
      appendMessage(personA, s1.id, answer("Again."), [
        pending(randomUUID(), 3, 1),
        pending(first, 4, 1),
      ])
    ).rejects.toThrow();

    const { messages } = await readOwnSession(personA, s1.id);

    expect(messages).toHaveLength(1);
    expect(await rowCount("agent_artifact", s1.id)).toBe(2);
  });

  it("lists only the owner's artifacts, each version with the question that asked for it", async () => {
    const s1 = await session(personA, "Quantity");
    const artifactId = randomUUID();

    await appendMessage(personA, s1.id, {
      role: "user",
      parts: text("Chart the quantity"),
    });
    await appendMessage(personA, s1.id, answer("Here it is."), [
      pending(artifactId, 1, 1),
    ]);
    await appendMessage(personA, s1.id, {
      role: "user",
      parts: text("Show it as a line"),
    });
    await appendMessage(personA, s1.id, answer("Changed."), [
      pending(artifactId, 1, 2, "Quantity by day"),
    ]);

    expect(await listOwnArtifacts(personA, s1.id)).toMatchObject([
      {
        id: artifactId,
        number: 1,
        kind: "chart",
        title: "Quantity by day",
        latestVersion: 2,
        versions: [
          { version: 1, request: "Chart the quantity", definition: barConfig },
          { version: 2, request: "Show it as a line" },
        ],
      },
    ]);
    expect(await listOwnArtifacts(personB, s1.id)).toEqual([]);
  });

  it("deletes a chat's artifacts and versions with the chat", async () => {
    const s1 = await session(personA, "Deleted");

    await appendMessage(personA, s1.id, answer("A chart."), [
      pending(randomUUID(), 1, 1),
    ]);
    expect(await rowCount("agent_artifact_version", s1.id)).toBe(1);

    const { rows } = await deployment.context.db.execute<{ id: string }>(
      sql`select a.id from agent_artifact a where a.session_id = ${s1.id}`
    );

    await deployment.context.db.execute(
      sql`delete from agent_session where id = ${s1.id}`
    );

    expect(await rowCount("agent_artifact", s1.id)).toBe(0);

    const left = await deployment.context.db.execute<{ n: number }>(
      sql`select count(*)::int as n from agent_artifact_version where artifact_id = ${rows[0]?.id ?? ""}`
    );

    expect(left.rows[0]?.n).toBe(0);
  });

  it("starts a deleted chat's id again as a new, empty chat", async () => {
    // An agent panel in another tab still holds the id and sends to it (czjw.120 item 13).
    const s1 = await session(personA, "Deleted in Ask");

    await appendMessage(personA, s1.id, {
      role: "user",
      parts: text("Hello"),
    });
    await deleteOwnSession(personA, s1.id);

    await createOwnSession(personA, {
      id: s1.id,
      title: "Again",
      modelId: MODEL,
    });

    const again = await readOwnSession(personA, s1.id);

    expect(again.session.title).toBe("Again");
    expect(again.messages).toEqual([]);
  });

  it("keeps each artifact's number in its chat", async () => {
    const s1 = await session(personA, "Numbered");
    // The highest uuid gets number 1, so a lookup ordered by id answers the wrong row.
    const high = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    const low = "00000000-0000-4000-8000-000000000002";

    await appendMessage(personA, s1.id, answer("Two."), [
      pending(high, 1, 1),
      pending(low, 2, 1),
    ]);

    expect(await storedArtifact(personA, s1.id, 1)).toEqual({
      id: high,
      kind: "chart",
      latestVersion: 1,
    });
    expect((await storedArtifact(personA, s1.id, 2))?.id).toBe(low);
    expect(await storedArtifact(personA, s1.id, 3)).toBeUndefined();
    expect(await storedArtifactCount(personA, s1.id)).toBe(2);
  });

  it("keeps an overlapping turn's answer and moves its artifacts after the stored ones", async () => {
    const s1 = await session(personA, "Overlap");
    const chart = randomUUID();
    const other = randomUUID();

    // Turn A stores artifact 1 and its version 2.
    await appendMessage(personA, s1.id, answer("A."), [
      pending(chart, 1, 1),
      pending(chart, 1, 2),
    ]);

    // Turn B read the same empty chat: it also made number 1, and version 2 of the chart.
    const parts: AgentMessage["parts"] = [
      {
        type: "tool-make-artifact",
        toolCallId: "call_b_new",
        state: "output-available",
        input: {},
        output: { artifact: 1, version: 1, title: "Quantity by record" },
      },
      {
        type: "data-artifact",
        id: "call_b_new",
        data: { artifactId: other, version: 1 },
      },
      {
        type: "tool-make-artifact",
        toolCallId: "call_b_change",
        state: "output-available",
        input: {},
        output: { artifact: 1, version: 2, title: "Quantity by record" },
      },
      {
        type: "data-artifact",
        id: "call_b_change",
        data: { artifactId: chart, version: 2 },
      },
      { type: "text", text: "B." },
    ];

    await appendMessage(personA, s1.id, { role: "assistant", parts }, [
      { ...pending(other, 1, 1), toolCallId: "call_b_new" },
      { ...pending(chart, 1, 2), toolCallId: "call_b_change" },
    ]);

    const { messages } = await readOwnSession(personA, s1.id);

    expect(messages).toHaveLength(2);
    expect(messages[1]?.parts).toMatchObject([
      { output: { artifact: 2, version: 1 } },
      { data: { artifactId: other, version: 1 } },
      { output: { artifact: 1, version: 3 } },
      { data: { artifactId: chart, version: 3 } },
      { type: "text", text: "B." },
    ]);
    expect(
      (await listOwnArtifacts(personA, s1.id)).map(
        ({ id, number, latestVersion }) => ({ id, number, latestVersion })
      )
    ).toEqual([
      { id: chart, number: 1, latestVersion: 3 },
      { id: other, number: 2, latestVersion: 1 },
    ]);
  });

  it("marks only the last summarized message with the summary, and moves the mark with a later summary", async () => {
    const s1 = await session(personA, "Summarized");

    for (const i of [1, 2, 3, 4, 5, 6]) {
      // oxlint-disable-next-line no-await-in-loop -- the order is the point
      await appendMessage(personA, s1.id, {
        role: i % 2 === 1 ? "user" : "assistant",
        parts: text(`Message ${i}`),
      });
    }

    const { messages: seeded } = await readOwnHistory(personA, s1.id);
    const seqOf = (i: number) => seeded[i - 1]?.seq ?? -1;

    const marked = async () =>
      (await readOwnSession(personA, s1.id)).messages.flatMap((message, i) => {
        const { summary } = z
          .object({ summary: z.string().optional() })
          .parse(message.metadata);

        return summary === undefined ? [] : [{ message: i + 1, summary }];
      });

    await saveSummary(personA, s1.id, {
      summary: "First",
      throughSeq: seqOf(4),
    });

    expect(await marked()).toEqual([{ message: 4, summary: "First" }]);

    await saveSummary(personA, s1.id, {
      summary: "Second",
      throughSeq: seqOf(6),
    });

    expect(await marked()).toEqual([{ message: 6, summary: "Second" }]);
  });

  it("keeps a later summary when an older one is saved after it", async () => {
    const s1 = await session(personA, "Overlapping summaries");

    for (const i of [1, 2, 3, 4, 5, 6]) {
      // oxlint-disable-next-line no-await-in-loop -- the order is the point
      await appendMessage(personA, s1.id, {
        role: i % 2 === 1 ? "user" : "assistant",
        parts: text(`Message ${i}`),
      });
    }

    const { messages: seeded } = await readOwnHistory(personA, s1.id);
    const sixth = seeded[5]?.seq ?? -1;

    expect(
      await saveSummary(personA, s1.id, { summary: "Later", throughSeq: sixth })
    ).toBe(true);
    expect(
      await saveSummary(personA, s1.id, {
        summary: "Older",
        throughSeq: seeded[3]?.seq ?? -1,
      })
    ).toBe(false);

    const history = await readOwnHistory(personA, s1.id);

    expect({
      summary: history.summary,
      through: history.summaryThroughSeq,
      messages: history.messages,
    }).toEqual({ summary: "Later", through: sixth, messages: [] });
  });

  it("deleting the chat a handoff came from keeps the handed-over chat", async () => {
    const { userId } = personA.caller;
    const ask = await insertAgentSession(deployment.context, { userId });

    const handed = await insertAgentSession(deployment.context, {
      userId,
      surface: "placeholder",
      recordId: "record-1",
      handedFromSessionId: ask.id,
    });

    await deleteOwnSession(personA, ask.id);

    const { rows } = await deployment.context.db.execute<{
      surface: string;
      handed_from_session_id: string | null;
    }>(
      sql`select surface, handed_from_session_id from agent_session where id = ${handed.id}`
    );

    expect(rows).toEqual([
      { surface: "placeholder", handed_from_session_id: null },
    ]);
  });

  it("refuses a kind outside the four", async () => {
    const s1 = await session(personA, "Kinds");

    await expect(
      deployment.context.db.execute(
        sql`insert into agent_artifact (id, session_id, number, kind, title, latest_version) values (${randomUUID()}, ${s1.id}, 1, 'deck', 'A deck', 1)`
      )
    ).rejects.toMatchObject({
      cause: { constraint: "agent_artifact_kind_check" },
    });
  });
});
