import { describe, expect, it } from "vitest";

import { readDemoFile } from "../../../testing/demo-pack.ts";
import { BROKEN_PDF, NO_TEXT_PDF } from "../../../testing/pdf-fixtures.ts";
import { extractTextLayer, markedText } from "./text-layer.ts";

function liveUpload(name: string): Buffer {
  return readDemoFile(`03_Live_Upload_Documents/${name}`);
}

describe("the text layer", () => {
  it("keeps one text string per page and marks each page directly before its text", async () => {
    const layer = await extractTextLayer(
      readDemoFile("04_Demo_Guide/Presenter_Guide.pdf")
    );

    const [first = "", second = "", third = ""] = layer.pages;

    expect(layer.pages).toHaveLength(3);

    const marked = markedText(layer.pages);

    expect(marked).toContain(`--- page 1 ---\n${first}`);
    expect(marked).toContain(`--- page 2 ---\n${second}`);
    expect(marked).toContain(`--- page 3 ---\n${third}`);
  });

  it("finds the invoice number and the total on the one page of a real invoice", async () => {
    const layer = await extractTextLayer(
      liveUpload("01_Invoice_Missing_Due_Date.pdf")
    );

    expect(layer.pages).toHaveLength(1);
    expect(layer.pages[0]).toContain("INV-LIVE-001");
    expect(layer.pages[0]).toContain("5,000.00");
    expect(layer.hasText).toBe(true);
  });

  it("leaves every byte of the caller's buffer in place", async () => {
    const bytes = new Uint8Array(liveUpload("01_Invoice_Missing_Due_Date.pdf"));

    const copyTakenBefore = Buffer.from(bytes);

    await extractTextLayer(bytes);

    expect(bytes).toHaveLength(copyTakenBefore.length);
    expect(Buffer.from(bytes).equals(copyTakenBefore)).toBe(true);
  });

  it("reports a PDF whose one page has no text as having no text layer", async () => {
    const layer = await extractTextLayer(NO_TEXT_PDF);

    expect(layer.hasText).toBe(false);
  });

  it("rejects bytes that only start like a PDF", async () => {
    await expect(extractTextLayer(BROKEN_PDF)).rejects.toThrow();
  });
});
