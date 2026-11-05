import {
  handleAgentChat,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import {
  agentRequest,
  enableModules,
  insertPersonWith,
  markSetupDone,
  readAgentReply,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { analyticsModule } from "@genie/module-analytics";
import { invoicesModule } from "@genie/module-invoices";
import { insertDocument } from "@genie/module-invoices/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DOCUMENT_REVIEW_CHAT_CONTEXT,
  DOCUMENT_REVIEW_CHAT_ID,
  DOCUMENT_REVIEW_CHAT_KEYS,
  DOCUMENT_REVIEW_CHAT_MESSAGE,
  DOCUMENT_REVIEW_CHAT_READING,
} from "./document-review-chat.ts";
import { APP_AGENT_RECORDINGS } from "./model-replay.ts";

/**
 * A question about the document on its review page, with the recorded model (S7-31, I20): the page
 * context names the document, and the agent reads it through `invoices-read-document` as the
 * person. The modules come in the order of the app's generated selection, as in the dev e2e.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const MODULES = [analyticsModule, invoicesModule, placeholderModule];

const errors: unknown[] = [];

let asker: ModuleRequestContext;

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds these values (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
    chat: "openai/gpt-6.1-terra",
    document: "anthropic/claude-opus-5.5",
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, [
    "analytics",
    "invoices",
    "placeholder",
  ]);
  registerModuleRuntime(deployment.context, MODULES);
  useRecordedModel(deployment.context, APP_AGENT_RECORDINGS);

  const { userId } = await insertPersonWith(deployment.context, [
    ...DOCUMENT_REVIEW_CHAT_KEYS,
  ]);

  asker = {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };

  await insertDocument(deployment.context, {
    id: DOCUMENT_REVIEW_CHAT_ID,
    kind: "invoice",
    reading: DOCUMENT_REVIEW_CHAT_READING,
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

const toolCalls = async () =>
  (
    await deployment.context.db.$client.query(
      "select metadata->>'tool' as tool, metadata->>'outcome' as outcome from audit_event where action = 'core:agent_tool_called'"
    )
  ).rows;

describe("the agent panel on a document review page", () => {
  it("answers 'what is wrong with this document?' from the document on its review page, with one audited read", async () => {
    const reply = await handleAgentChat(
      asker,
      agentRequest({
        sessionId: "3c7e1a9b-5d2f-4b8a-9c6e-0a0a0a0a0004",
        message: {
          id: "client-message",
          role: "user",
          parts: [{ type: "text", text: DOCUMENT_REVIEW_CHAT_MESSAGE }],
        },
        context: DOCUMENT_REVIEW_CHAT_CONTEXT,
      }),
      { logError: (cause: unknown) => errors.push(cause) }
    );

    // A miss ends the stream with an error chunk, which the reader throws; the logged error says why.
    await readAgentReply(reply).catch((error: Error) => errors.push(error));

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await toolCalls()).toEqual([
      { tool: "invoices-read-document", outcome: "answered" },
    ]);
  });
});
