import { describe, expect, it } from "vitest";

import { costMeter, liveTransport } from "./transport.ts";

const BODY = JSON.stringify({ provider: { data_collection: "deny" } });

describe("the evaluation transports", () => {
  it("refuses a key a header cannot carry, and names no part of the key", async () => {
    const key = "sk-or-secret\r\nx";

    const sent = liveTransport(key)(
      "https://openrouter.ai/api/v1/chat/completions",
      { method: "POST", body: BODY }
    );

    await expect(sent).rejects.toThrow("cannot carry");
    await expect(sent).rejects.not.toThrow("secret");
  });

  it("gives a case no cost when none of its answers named one, and the sum when they did", async () => {
    const answers = [
      '{"usage":{"cost":0.25}}',
      '{"usage":{"prompt_tokens":9}}',
      'data: {"usage":{"cost":0.5}}\n\ndata: [DONE]\n\n',
    ];

    const meter = costMeter(async () => new Response(answers.shift() ?? ""));

    const first = meter.mark();

    await meter.fetch("https://example.invalid");
    expect(meter.since(first)).toBe(0.25);

    const second = meter.mark();

    await meter.fetch("https://example.invalid");
    expect(meter.since(second)).toBeNull();

    const third = meter.mark();

    await meter.fetch("https://example.invalid");
    expect(meter.since(third)).toBe(0.5);
  });
});
