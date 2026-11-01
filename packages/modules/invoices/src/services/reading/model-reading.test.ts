import { asSchema, type JSONSchema7 } from "ai";
import { describe, expect, it } from "vitest";

import { modelReading } from "./model-output.ts";
import { readingMessages } from "./model-reading.ts";
import { markedText } from "./text-layer.ts";

const pages = ["Invoice number INV-LIVE-001", "TOTAL (SGD) 5,000.00"];

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

/** The schema nodes that Anthropic counts as union-typed parameters: a `type` array, `anyOf` or `oneOf`. */
function unionCount(schema: JSONSchema7 | boolean): number {
  if (schema === true || schema === false) return 0;

  const own =
    schema.anyOf !== undefined ||
    schema.oneOf !== undefined ||
    Array.isArray(schema.type)
      ? 1
      : 0;

  return [
    ...Object.values(schema.properties ?? {}),
    ...[schema.items ?? []].flat(),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
  ].reduce<number>((count, child) => count + unionCount(child), own);
}

describe("the reading request", () => {
  it("sends a schema with at most 16 union-typed parameters, the Anthropic limit", async () => {
    const schema = await asSchema(modelReading).jsonSchema;

    expect(unionCount(schema)).toBeLessThanOrEqual(16);
  });

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
