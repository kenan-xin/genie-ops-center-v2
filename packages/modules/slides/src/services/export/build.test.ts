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

const THEME = {
  companyName: "Acme",
  primaryColor: "#0f766e",
  fontFace: "Arial",
  logoFileId: null,
};

describe("buildDeckPptx", () => {
  it("draws the slide background, each element's box, color, size, weight, alignment, fill and border", async () => {
    const bytes = await buildDeckPptx({
      title: "Styled",
      slides: [
        {
          id: "s1",
          background: "#1E3A8A",
          elements: [
            {
              kind: "title",
              text: "Dark claim",
              style: { color: "#FFFFFF", fontSize: 40, align: "center" },
            },
            {
              kind: "text",
              text: "Boxed text",
              box: { x: 96, y: 192, w: 480, h: 96 },
              style: {
                color: "#111827",
                weight: "semibold",
                fill: "#EFF6FF",
                border: { color: "#F59E0B", width: 4 },
              },
            },
          ],
        },
      ],
      figuresAsOf: "2026-10-27",
      timeZone: "UTC",
      theme: THEME,
      logo: null,
      images: new Map(),
    });

    const zip = await JSZip.loadAsync(bytes);

    const xml =
      (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    // The background, then the title: white, 40 px is 30 pt (sz 3000), centered.
    expect(xml).toMatch(/<p:bg>.*srgbClr val="1E3A8A"/s);
    expect(xml).toMatch(
      /algn="ctr".*sz="3000".*srgbClr val="FFFFFF".*Dark claim/s
    );
    // The text's box at 96, 192 px is 914400, 1828800 EMU; its fill and a 4 px (3 pt, 38100 EMU) border.
    expect(xml).toContain('<a:off x="914400" y="1828800"/>');
    expect(xml).toMatch(/srgbClr val="EFF6FF"/);
    expect(xml).toMatch(
      /<a:ln w="38100"[^>]*>\s*<a:solidFill>\s*<a:srgbClr val="F59E0B"/
    );
    expect(xml).toMatch(/b="1".*Boxed text/s);
  });

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
