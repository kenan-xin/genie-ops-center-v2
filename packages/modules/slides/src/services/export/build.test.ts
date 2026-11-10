import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { frozenElement } from "../../../testing/factories.ts";
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

  it("draws a framed chart inside its frame's padding, as the screen", async () => {
    const bytes = await buildDeckPptx({
      title: "Framed",
      slides: [
        {
          id: "s1",
          elements: [
            { kind: "title", text: "Claim" },
            {
              ...frozenElement("chart"),
              box: { x: 384, y: 136, w: 536, h: 348 },
              style: { fill: "#EFF6FF" },
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

    // 384 + 12, 136 + 12 px.
    expect(xml).toMatch(/<p:graphicFrame>.*<a:off x="3771900" y="1409700"\/>/s);
  });

  it("writes the figures date of a styled slide without a background in the theme text", async () => {
    const bytes = await buildDeckPptx({
      title: "Dated",
      slides: [
        {
          id: "s1",
          elements: [
            { kind: "title", text: "Claim", style: { color: "#1E3A8A" } },
            frozenElement("figure"),
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

    expect(xml).toMatch(
      /<a:r>(?:(?!<\/a:r>).)*srgbClr val="111827"(?:(?!<\/a:r>).)*Figures as of/s
    );
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

describe("the speaker notes", () => {
  it("writes each slide's notes into its own notes slide, escaped, and none into a slide without notes", async () => {
    const bytes = await buildDeckPptx({
      title: "Noted",
      slides: [
        { ...slide("s1"), notes: "Line one.\nLine two & <three>" },
        slide("s2"),
      ],
      figuresAsOf: "2026-10-27",
      timeZone: "UTC",
      theme: THEME,
      logo: null,
      images: new Map(),
    });

    const zip = await JSZip.loadAsync(bytes);

    const notesOf = async (part: string) => {
      const xml = (await zip.file(part)?.async("string")) ?? "";

      return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(([, text]) => text);
    };

    // The slide number is the part's other text run.
    expect((await notesOf("ppt/notesSlides/notesSlide1.xml")).join("")).toBe(
      "Line one.\r\nLine two &amp; &lt;three&gt;1"
    );
    expect((await notesOf("ppt/notesSlides/notesSlide2.xml")).join("")).toBe(
      "2"
    );
  });
});
