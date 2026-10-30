import type { ChatTransport } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AgentMessage } from "../../services/agent/index.ts";
import { AgentRefusal, agentTransport } from "./transport.ts";

const API = "/api/agent";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";

const MESSAGE: AgentMessage = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "How many example records are there?" }],
};

type SendBody = { readonly modelId?: string } | undefined;

const sentBodySchema = z.object({
  sessionId: z.string(),
  message: z.object({
    id: z.string(),
    role: z.string(),
    parts: z.array(z.object({ type: z.string(), text: z.string() })),
  }),
  modelId: z.string().optional(),
});

/** One send of the route's transport, with the body a picker would add. */
async function send(
  transport: ChatTransport<AgentMessage>,
  body: SendBody
): Promise<void> {
  const request = {
    trigger: "submit-message" as const,
    chatId: SESSION_ID,
    messageId: undefined,
    messages: [MESSAGE],
    abortSignal: undefined,
  };

  await transport.sendMessages(
    body === undefined ? request : { ...request, body }
  );
}

function fetchStub(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async () => new Response("", { status: 200 }));
}

/** The JSON the transport posted, parsed at this test's boundary. */
function sentBody(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
): z.infer<typeof sentBodySchema> {
  const call = fetchMock.mock.calls[0];

  if (call === undefined) throw new Error("The transport sent no request.");

  return sentBodySchema.parse(JSON.parse(String(call[1]?.body)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the agent route's transport", () => {
  it("sends the session, the last message and the picked model", async () => {
    const fetchMock = fetchStub();

    vi.stubGlobal("fetch", fetchMock);

    await send(agentTransport(API), { modelId: "anthropic/claude-opus-5.5" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchMock)).toEqual({
      sessionId: SESSION_ID,
      message: MESSAGE,
      modelId: "anthropic/claude-opus-5.5",
    });
  });

  it("sends no model when the chat picked none", async () => {
    const fetchMock = fetchStub();

    vi.stubGlobal("fetch", fetchMock);

    await send(agentTransport(API), undefined);

    expect(sentBody(fetchMock)).toEqual({
      sessionId: SESSION_ID,
      message: MESSAGE,
    });
  });

  it("maps the route's refusal body to the reason the chat shows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              code: "model-not-allowed",
              message: "This model is no longer allowed.",
            }),
            { status: 400 }
          )
      )
    );

    const refusal = await send(agentTransport(API), undefined).catch(
      (cause: unknown) => cause
    );

    if (!(refusal instanceof AgentRefusal)) {
      throw new Error(`Expected an AgentRefusal, got ${String(refusal)}`);
    }

    expect(refusal.code).toBe("model-not-allowed");
    expect(refusal.message).toBe("This model is no longer allowed.");
  });

  it("answers a fixed sentence when the refusal body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("<html>", { status: 502 }))
    );

    const refusal = await send(agentTransport(API), undefined).catch(
      (cause: unknown) => cause
    );

    if (!(refusal instanceof AgentRefusal)) {
      throw new Error(`Expected an AgentRefusal, got ${String(refusal)}`);
    }

    expect(refusal.code).toBe("internal-error");
    expect(refusal.message).toBe(
      "The answer could not be completed. Try again."
    );
  });
});
