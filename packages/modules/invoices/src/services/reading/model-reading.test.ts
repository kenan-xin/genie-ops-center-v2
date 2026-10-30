import { describe, expect, it } from "vitest";

import { readingMessages } from "./model-reading.ts";
import { markedText } from "./text-layer.ts";

const pages = ["Invoice number INV-LIVE-001", "TOTAL (SGD) 5,000.00"];

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

describe("the reading request", () => {
  it("sends the marked text and the PDF to a model that reads files", () => {
    expect(
      readingMessages({ pages, pdf, modelId: "anthropic/claude-opus-5.5" })
    ).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: markedText(pages) },
          { type: "file", data: pdf, mediaType: "application/pdf" },
        ],
      },
    ]);
  });

  it("sends only the marked text to a model that does not read files", () => {
    expect(
      readingMessages({
        pages,
        pdf,
        modelId: "deepseek/deepseek-v4.1-flash-1017",
      })
    ).toEqual([
      { role: "user", content: [{ type: "text", text: markedText(pages) }] },
    ]);
  });
});
