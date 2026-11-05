import {
  appendMessage,
  createOwnSession,
  createTenantContext,
  principalFor,
  readOwnHistory,
  saveSummary,
} from "@genie/core";
import { silentLogger } from "@genie/core/logging";

import { selectedModuleIds } from "../../src/modules.ts";
import { DATABASE_URL, PUBLIC_URL } from "./dev-support.ts";

/** The chat model of the seeded model connection, so the route keeps the session's model. */
const CHAT_MODEL = "openai/gpt-6.1-terra";

export type SeededTurn = { readonly question: string; readonly answer: string };

/** One stored answer as the route stores one: openui-lang with one paragraph. */
const answerText = (answer: string) =>
  `root = Answer([p])\np = Paragraph(${JSON.stringify(answer)})`;

/**
 * Writes a person's chat straight into the dev e2e database through the agent store, so a spec
 * opens a long chat without asking 20 questions. With `summary`, the summary covers the stored
 * messages through the answer of turn `throughTurn` (counted from 1).
 */
export async function seedChat(input: {
  readonly email: string;
  readonly sessionId: string;
  readonly turns: readonly SeededTurn[];
  readonly summary?: { readonly text: string; readonly throughTurn: number };
}): Promise<{ readonly userId: string }> {
  const tenant = createTenantContext(
    { DATABASE_URL, PUBLIC_URL },
    silentLogger(),
    selectedModuleIds,
    undefined,
    "core"
  );

  try {
    const { rows } = await tenant.db.$client.query<{ id: string }>(
      'select id from "user" where email = $1',
      [input.email]
    );

    const userId = rows[0]?.id;

    if (userId === undefined) throw new Error(`No person ${input.email}.`);

    const ctx = {
      tenant,
      caller: principalFor({
        tenant,
        modules: [],
        userId,
        authenticated: true,
      }),
    };

    await createOwnSession(ctx, {
      id: input.sessionId,
      title: input.turns[0]?.question ?? "Chat",
      modelId: CHAT_MODEL,
    });

    for (const turn of input.turns) {
      // oxlint-disable-next-line no-await-in-loop -- the messages keep the turns' order
      await appendMessage(ctx, input.sessionId, {
        role: "user",
        parts: [{ type: "text", text: turn.question }],
      });
      // oxlint-disable-next-line no-await-in-loop -- as above
      await appendMessage(ctx, input.sessionId, {
        role: "assistant",
        parts: [{ type: "text", text: answerText(turn.answer) }],
      });
    }

    if (input.summary !== undefined) {
      // Read before the save: after it, the history holds only the messages past the cut.
      const { messages } = await readOwnHistory(ctx, input.sessionId);
      const through = messages[input.summary.throughTurn * 2 - 1];

      if (through === undefined)
        throw new Error("The summary passes the chat.");

      await saveSummary(ctx, input.sessionId, {
        summary: input.summary.text,
        throughSeq: through.seq,
      });
    }

    return { userId };
  } finally {
    await tenant.db.$client.end();
  }
}
