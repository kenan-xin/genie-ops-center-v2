import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { buildDeckPptx } from "./build.ts";

const slide = (id: string) => ({
  id,
  elements: [{ kind: "title" as const, text: `Claim ${id}` }],
});

/** Each `Override PartName` of `[Content_Types].xml`, and the parts the zip holds. */
async function contentTypesOf(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";

  return {
    overrides: [...xml.matchAll(/<Override PartName="\/([^"]+)"/g)].map(
      ([, part]) => part ?? ""
    ),
    parts: new Set(Object.keys(zip.files)),
  };
}

describe("buildDeckPptx", () => {
  // pptxgenjs 4.0.1 lists one slide master per slide (upstream #1444), and PowerPoint repairs that.
  it("lists in [Content_Types].xml only parts the zip holds", async () => {
    const { overrides, parts } = await contentTypesOf(
      await buildDeckPptx({
        title: "Three slides",
        slides: [slide("s1"), slide("s2"), slide("s3")],
        figuresAsOf: "2026-10-27",
        timeZone: "UTC",
        theme: {
          companyName: "Acme",
          primaryColor: "#0f766e",
          fontFace: "Arial",
          logoFileId: null,
        },
        logo: null,
        images: new Map(),
      })
    );

    expect(overrides).toContain("ppt/slides/slide3.xml");
    expect(overrides.filter((part) => !parts.has(part))).toEqual([]);
  });
});
