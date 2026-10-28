import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, it } from "vitest";

import { type ModelTransport, guardedModelFetch } from "./connection.ts";

const ORIGIN = "https://openrouter.ai";

const URL_OF_CHAT = `${ORIGIN}/api/v1/chat/completions`;

const DENY = JSON.stringify({ provider: { data_collection: "deny" } });

/** A guard over a transport that answers an empty object and records what reached it. */
function countingGuard(extra: { readonly apiKey?: string } = {}) {
  const calls: {
    readonly url: string;
    readonly init: RequestInit | undefined;
  }[] = [];

  const transport: ModelTransport = async (input, init) => {
    calls.push({ url: String(input), init });

    return Response.json({});
  };

  const guarded = guardedModelFetch(transport, {
    origin: ORIGIN,
    timeoutMs: 5000,
    ...extra,
  });

  return { guarded, calls };
}

it("refuses a request to any origin but the allowed one before the transport runs", async () => {
  const refused = [
    "https://evil.example/api/v1/chat/completions",
    "https://openrouter.ai.evil.example/api/v1/chat/completions",
    "http://openrouter.ai/api/v1/chat/completions",
    "https://openrouter.ai:8443/api/v1/chat/completions",
    "https://evil.example/?to=https://openrouter.ai/api/v1",
  ];

  const { guarded, calls } = countingGuard();

  await Promise.all(
    refused.map((url) =>
      expect(guarded(url, { method: "POST", body: DENY }), url).rejects.toThrow(
        `A model request may go only to ${ORIGIN}, not ${new URL(url).origin}.`
      )
    )
  );

  expect(calls).toHaveLength(0);

  await guarded(new URL(URL_OF_CHAT), { method: "POST", body: DENY });

  expect(calls).toHaveLength(1);
  expect(calls[0]?.init?.redirect).toBe("error");
  expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
});

it("refuses a request body that does not deny data collection", async () => {
  const refused: RequestInit[] = [
    { method: "POST" },
    { method: "POST", body: "not json" },
    { method: "POST", body: "{}" },
    { method: "POST", body: JSON.stringify({ provider: {} }) },
    {
      method: "POST",
      body: JSON.stringify({ provider: { data_collection: "allow" } }),
    },
  ];

  const { guarded, calls } = countingGuard();

  await Promise.all(
    refused.map((init) =>
      expect(guarded(URL_OF_CHAT, init), String(init.body)).rejects.toThrow(
        "A model request must deny data collection."
      )
    )
  );

  expect(calls).toHaveLength(0);

  await guarded(URL_OF_CHAT, {
    method: "POST",
    body: JSON.stringify({
      provider: { data_collection: "deny", order: ["openai"] },
    }),
  });

  expect(calls).toHaveLength(1);
});

it("refuses a stored key that a request header cannot carry, and names no key in the error", async () => {
  const secret = "sk-or-v1-secret-header-break";

  const { guarded, calls } = countingGuard({ apiKey: `${secret}\n x\u0000` });

  const error: unknown = await guarded(URL_OF_CHAT, {
    method: "POST",
    body: DENY,
  }).then(
    () => undefined,
    (cause: unknown) => cause
  );

  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toContain(
    "The stored model provider key holds a character that a request header cannot carry. Store the key again."
  );
  expect(
    [String(error), error instanceof Error ? error.stack : ""].join("\n")
  ).not.toContain(secret);
  expect(calls).toHaveLength(0);
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  // SAFETY: this server listens on a TCP port, so address() returns AddressInfo.
  const { port } = server.address() as AddressInfo;

  return `http://127.0.0.1:${port}`;
}

it("refuses a redirect instead of following it to another host", async () => {
  let reachedA = 0;

  let reachedB = 0;

  const b = createServer((_request, response) => {
    reachedB += 1;
    response.end("{}");
  });

  const bOrigin = await listen(b);

  const a = createServer((_request, response) => {
    reachedA += 1;
    response.writeHead(302, { location: `${bOrigin}/` });
    response.end();
  });

  try {
    const origin = await listen(a);

    const guarded = guardedModelFetch(globalThis.fetch, {
      origin,
      timeoutMs: 5000,
    });

    await expect(
      guarded(`${origin}/api/v1/chat/completions`, {
        method: "POST",
        body: DENY,
      })
    ).rejects.toThrow();

    // The request left the guard and met the redirect; it did not stop before sending.
    expect(reachedA).toBe(1);
    expect(reachedB).toBe(0);
  } finally {
    a.close();
    b.close();
  }
});
