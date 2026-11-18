import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { frozenElement } from "../../../testing/factories.ts";
import { readPptx } from "../../../testing/pptx-reader.ts";
import {
  eightLayoutSlides,
  tableWithVisualSlide,
  textWithTableSlide,
} from "../../presentation/__fixtures__/decks.ts";
import {
  BLUE_THEME,
  DARK_THEME,
} from "../../presentation/__fixtures__/themes.ts";
import {
  type Box,
  figureBoxes,
  figureNumber,
  isPrioritiesList,
  listItemBoxes,
  placedBoxes,
  slideFrame,
  visualLook,
} from "../../presentation/slide-layout.ts";
import type { ShownSlide } from "../../presentation/views.ts";
import { buildDeckPptx } from "./build.ts";

const slide = (id: string) => ({
  id,
  elements: [{ kind: "title" as const, text: `Claim ${id}` }],
});

/** The exported deck's slide and chart parts, numbered from 1. */
async function exported(slides: readonly ShownSlide[], theme = BLUE_THEME) {
  const pptx = await readPptx(
    await buildDeckPptx({
      title: "Deck",
      slides,
      figuresAsOf: "2026-10-27",
      timeZone: "UTC",
      theme,
      logo: null,
      images: new Map(),
    })
  );

  // pptxgenjs numbers chart parts with one counter per process, so the deck's n-th part is chart n.
  const charts = pptx.chartParts.toSorted(
    (a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0])
  );

  return {
    slide: (n: number) => pptx.xmlOf(`ppt/slides/slide${n}.xml`),
    chart: (n: number) => pptx.xmlOf(charts[n - 1] ?? `chart ${n}`),
  };
}

/** A shape's place and size as pptxgenjs writes them, 9525 EMU per canvas pixel. */
const emu = (px: number) => Math.round(px * 9525);

function place(box: Box) {
  return `<a:off x="${emu(box.x)}" y="${emu(box.y)}"/><a:ext cx="${emu(box.w)}" cy="${emu(box.h)}"/>`;
}

/** The shape part from `box` to its end, or "" when no shape sits there. */
function partAt(xml: string, box: Box) {
  const at = xml.indexOf(place(box));

  return at < 0 ? "" : xml.slice(at, xml.indexOf("</p:sp>", at));
}

/** The color of the text run that holds `text`, matched without case. */
function runColorOf(xml: string, text: string) {
  return new RegExp(
    `<a:r>(?:(?!</a:r>).)*srgbClr val="([0-9a-f]{6})"(?:(?!</a:r>).)*${text}`,
    "is"
  )
    .exec(xml)?.[1]
    ?.toUpperCase();
}

/** The table cell that holds exactly `text`. */
const cellOf = (xml: string, text: string) =>
  new RegExp(
    `<a:tc>(?:(?!</a:tc>).)*<a:t>${text}</a:t>(?:(?!</a:tc>).)*</a:tc>`,
    "s"
  ).exec(xml)?.[0] ?? "";

/** Where the screen draws one element, so where the export must: its box, a chart's plot above its 20 px source row, a table's 24 px title row, a figure's number, a Priorities list's first circle. */
function drawnAt(
  shown: ShownSlide,
  first: boolean,
  index: number,
  box: Box
): Box {
  const element = shown.elements[index]!;
  const kinds = shown.elements.map(({ kind }) => kind);

  if (
    element.kind === "bullets" &&
    isPrioritiesList(kinds, index, box, slideFrame(kinds, first).name)
  ) {
    return listItemBoxes(element.items.length, box)[0]!.circle;
  }

  if (element.kind === "figure" && "data" in element) {
    const { paired } = visualLook(shown.elements, index);

    return figureBoxes(box, figureNumber(element.data, box, paired).px, paired)
      .number;
  }

  if (element.kind === "chart") return { ...box, h: box.h - 20 };

  if (element.kind === "table") return { ...box, h: 24 };

  return box;
}

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
  // Kept from before: a stored box, a fill and a border draw as on screen.
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
      theme: BLUE_THEME,
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
      theme: BLUE_THEME,
      logo: null,
      images: new Map(),
    });

    const zip = await JSZip.loadAsync(bytes);

    const xml =
      (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    // 384 + 12, 136 + 12 px.
    expect(xml).toMatch(/<p:graphicFrame>.*<a:off x="3771900" y="1409700"\/>/s);
  });

  // Bug 1: PowerPoint draws another slide than the screen.
  it.each(eightLayoutSlides.map((shown, at) => [shown.id, shown, at] as const))(
    "places the panel, the title and each element of %s at the screen's boxes",
    async (_, shown, at) => {
      const xml = await (await exported(eightLayoutSlides)).slide(at + 1);
      const first = at === 0;
      const boxes = placedBoxes(shown.elements, first);

      expect(xml).toContain(
        place(
          slideFrame(
            shown.elements.map(({ kind }) => kind),
            first
          ).panel
        )
      );
      expect(xml).toContain(place(boxes.title));

      for (const { index, box } of boxes.body) {
        expect(xml, `element ${index}`).toContain(
          place(drawnAt(shown, first, index, box))
        );
      }
    }
  );

  // Bug 2: a dark deck exports a filled panel.
  it("draws a light theme's split panel as a line at 384 px, with no panel rectangle", async () => {
    const xml = await (
      await exported([eightLayoutSlides[0]!, eightLayoutSlides[2]!], DARK_THEME)
    ).slide(2);

    expect(partAt(xml, { x: 384, y: 0, w: 0, h: 540 })).toMatch(
      /prst="line".*srgbClr val="3F424B"/s
    );
    expect(xml).not.toContain(place({ x: 0, y: 0, w: 384, h: 540 }));
  });

  // Bug 3: a dark deck exports white slides.
  it("draws a dark theme's background and text colors", async () => {
    const xml = await (
      await exported([eightLayoutSlides[0]!, eightLayoutSlides[2]!], DARK_THEME)
    ).slide(2);

    expect(xml).toMatch(/<p:bg>.*srgbClr val="030712"/s);
    expect(runColorOf(xml, "Collections narrowed")).toBe("F3F4F6");
  });

  // Bug 4: a white chart box on a dark slide.
  it("draws a dark theme's chart series in the accent on the theme background", async () => {
    const chart = await (
      await exported([eightLayoutSlides[2]!], DARK_THEME)
    ).chart(1);

    expect(chart).toContain('srgbClr val="60A5FA"');
    expect(chart.match(/srgbClr val="030712"/g)?.length).toBeGreaterThanOrEqual(
      2
    );
  });

  // Bug 5: a number and its code at one size (P14-16).
  it("raises a figure's currency code as a small run before its number", async () => {
    const xml = await (await exported(eightLayoutSlides)).slide(2);

    expect(xml).toMatch(
      /<a:rPr[^>]*baseline="30000"[^>]*>(?:(?!<\/a:r>).)*<a:t>SGD <\/a:t>/s
    );
    expect(xml).toContain("<a:t>2,500.00</a:t>");
  });

  // Bug 6: two scales in PowerPoint (P14-17, P14-45); 260,000 cents is SGD 2,600, the plotted unit.
  it("gives two comparison charts of one measure one value maximum, in the plotted unit", async () => {
    const deck = await exported(eightLayoutSlides);

    expect(await deck.chart(2)).toContain('<c:max val="2600"/>');
    expect(await deck.chart(3)).toContain('<c:max val="2600"/>');
  });

  // Bug 10: both comparison charts in the accent (P14-51).
  it("leads the second comparison chart with the neutral color", async () => {
    const deck = await exported(eightLayoutSlides);

    expect(await deck.chart(2)).toContain('srgbClr val="2563EB"');
    expect(await deck.chart(3)).toContain('srgbClr val="888C93"');
    expect(await deck.chart(3)).not.toContain('srgbClr val="2563EB"');
  });

  // Bug 7: a footer that differs from the screen (P14-14).
  it("writes '<company> · <n> / <count>' in each split slide's footer color, with no slide number field and no footer on the title slide", async () => {
    const deck = await exported([
      eightLayoutSlides[0]!,
      eightLayoutSlides[1]!,
      { ...eightLayoutSlides[1]!, id: "dark", background: "#1E3A8A" },
    ]);

    const [title, plain, dark] = await Promise.all([
      deck.slide(1),
      deck.slide(2),
      deck.slide(3),
    ]);

    expect(title).not.toContain("1 / 3");
    expect(runColorOf(plain, "Genie Ops · 2 / 3")).toBe("4B5563");
    expect(runColorOf(dark, "Genie Ops · 3 / 3")).toBe("FFFFFF");
    expect(runColorOf(dark, "Figures as of")).toBe("FFFFFF");
    expect(title + plain + dark).not.toContain('type="slidenum"');
  });

  // Bug 8 (czjw.182): the source line keeps its own row right under the chart, inside its box.
  it("writes a chart's source line in the 20 px row under its plot", async () => {
    const xml = await (await exported(eightLayoutSlides)).slide(3);

    expect(partAt(xml, { x: 432, y: 385, w: 480, h: 20 })).toContain(
      "Source: "
    );
  });

  // Bug 9 (P14-43, P14-51).
  it("moves a figure beside a table to the panel body slot, on a theme-background card", async () => {
    const xml = await (
      await exported([eightLayoutSlides[0]!, tableWithVisualSlide])
    ).slide(2);

    expect(partAt(xml, { x: 43, y: 265, w: 298, h: 217 })).toMatch(
      /prst="rect".*srgbClr val="FFFFFF"/s
    );
    expect(xml).toContain(place({ x: 432, y: 58, w: 480, h: 24 }));
  });

  // Bug 11 (P14-12, P14-46): 13 px bold header in the secondary text, 15 px rows; a stored box keeps 12 px.
  it("draws a frame table at the slide sizes, and a stored-box table at the compact 12 px", async () => {
    const stored: ShownSlide = {
      ...textWithTableSlide,
      elements: textWithTableSlide.elements.map((element) =>
        element.kind === "table"
          ? Object.assign({}, element, {
              box: { x: 384, y: 136, w: 536, h: 348 },
            })
          : element
      ),
    };

    const deck = await exported([
      eightLayoutSlides[0]!,
      eightLayoutSlides[5]!,
      stored,
    ]);

    const frame = await deck.slide(2);
    const header = cellOf(frame, "Customer");

    expect(header).toContain('sz="975"');
    expect(header).toContain('b="1"');
    expect(header).toContain('srgbClr val="4B5563"');
    expect(cellOf(frame, "ABC Trading")).toContain('sz="1125"');
    expect(cellOf(await deck.slide(3), "ABC Trading")).toContain('sz="900"');
  });

  // pptxgenjs 4.0.1 lists one slide master per slide (upstream #1444), and PowerPoint repairs that.
  it("lists in [Content_Types].xml only parts the zip holds", async () => {
    const { overrides, parts } = await contentTypesOf(
      await buildDeckPptx({
        title: "Three slides",
        slides: [slide("s1"), slide("s2"), slide("s3")],
        figuresAsOf: "2026-10-27",
        timeZone: "UTC",
        theme: BLUE_THEME,
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
      theme: BLUE_THEME,
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
