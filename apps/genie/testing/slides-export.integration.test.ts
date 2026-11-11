import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  withTransaction,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { insertAgentRecords } from "@genie/module-placeholder/testing";
import { slidesModule, slidesRouter } from "@genie/module-slides";
import {
  frozenElement,
  insertDeck,
  readPptx,
} from "@genie/module-slides/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The PowerPoint export (Spec 7 R-55, D7, D8, D15): native chart parts, the frozen figures with
 * their date and source, the tenant branding, one export file per deck owned by the caller, and
 * the refusal line in place of a dataset the person can no longer read. At app level because the
 * D15 check needs the placeholder's dataset; the decks are inserted frozen, so no query runs.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const MODULES = [slidesModule, placeholderModule];

const PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** A valid 1 x 1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

let owner: ModuleRequestContext;

function contextOf(userId: string): ModuleRequestContext {
  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra"],
    chat: "openai/gpt-6.1-terra",
    document: null,
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, ["slides", "placeholder"]);
  registerModuleRuntime(deployment.context, MODULES);
  await insertAgentRecords(deployment.context);

  owner = contextOf(
    (
      await insertPersonWith(deployment.context, [
        "slides:use",
        "slides:read",
        "slides:write",
        "placeholder:use",
        "placeholder:read",
      ])
    ).userId
  );
}, 120000);

afterAll(async () => {
  vi.useRealTimers();
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const query = async (text: string, values: unknown[] = []) =>
  (await deployment.context.db.$client.query(text, values)).rows;

const title = (text: string) => ({ kind: "title" as const, text });

/** A KPI frozen at 250000, so its text is one the deck holds nowhere else. */
const KPI = (() => {
  const figure = frozenElement("figure");

  return "data" in figure
    ? { ...figure, data: { ...figure.data, rows: [{ n: 250000 }] } }
    : figure;
})();

/** Exports and answers the stored bytes, read back through the answered link as the caller. */
async function exportAs(ctx: ModuleRequestContext, id: string) {
  const answer = await callProcedure(slidesRouter, ctx).exportDeck({ id });

  const fetched = await deployment.context.fileStorage.fetchLink({
    token: new URL(answer.url).searchParams.get("token") ?? "",
    principal: ctx.caller,
  });

  return { answer, fetched, pptx: await readPptx(fetched.bytes) };
}

const fileCount = async () =>
  (await query("select count(*)::int as n from file"))[0].n;

describe("the slides PowerPoint export", () => {
  it("writes a three-slide deck with one native bar chart, the KPI and table as text, and the date and source", async () => {
    const { fileId } = await callProcedure(slidesRouter, owner).uploadDeckImage(
      {
        id: await insertDeck(deployment.context, {
          ownerUserId: owner.caller.userId,
        }),
        file: new File([PNG], "dot.png", { type: "image/png" }),
      }
    );

    const [{ id: imageDeck }] = await query(
      "select id from deck where $1 = any(image_file_ids)",
      [fileId]
    );

    await query("update deck set content = $1, title = $2 where id = $3", [
      {
        slides: [
          {
            id: "s1",
            elements: [
              title("Records grow each month"),
              { kind: "text", text: "Three months of records." },
              frozenElement("chart"),
            ],
          },
          {
            id: "s2",
            elements: [title("The total"), KPI, frozenElement("table")],
          },
          {
            id: "s3",
            elements: [
              title("The office"),
              { kind: "image", fileId, alt: "A dot" },
            ],
          },
        ],
      },
      "Quarterly review",
      imageDeck,
    ]);

    const { answer, fetched, pptx } = await exportAs(owner, imageDeck);

    expect(answer.fileName).toBe("quarterly-review.pptx");
    expect(fetched.mimeType).toBe(PPTX);
    expect(pptx.slideCount).toBe(3);
    expect(pptx.chartParts).toHaveLength(1);
    expect(await pptx.xmlOf(pptx.chartParts[0] ?? "")).toContain(
      "<c:barChart>"
    );

    const slide1 = await pptx.xmlOf("ppt/slides/slide1.xml");

    expect(slide1).toContain("Records grow each month");
    expect(slide1).toContain("Figures as of 27 Oct 2026");
    expect(slide1).toContain("Source: placeholder.records");

    const slide2 = await pptx.xmlOf("ppt/slides/slide2.xml");

    expect(slide2).toContain("250,000");
    expect(slide2).toContain("<a:tbl>");
    expect(slide2).toContain("Column 1");
    expect(slide2).toContain("c1 of row 1");
    expect(await pptx.xmlOf("ppt/slides/slide3.xml")).toContain(
      'descr="A dot"'
    );
  });

  it("replaces the previous export, owned by the caller, with one audit row per export", async () => {
    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: { slides: [{ id: "s1", elements: [title("A claim")] }] },
    });

    await exportAs(owner, id);

    const [{ export_file_id: first }] = await query(
      "select export_file_id from deck where id = $1",
      [id]
    );

    await exportAs(owner, id);

    const [{ export_file_id: second }] = await query(
      "select export_file_id from deck where id = $1",
      [id]
    );

    expect(second).not.toBe(first);
    expect(await query("select id from file where id = $1", [first])).toEqual(
      []
    );
    expect(
      await query("select uploaded_by_user_id from file where id = $1", [
        second,
      ])
    ).toEqual([{ uploaded_by_user_id: owner.caller.userId }]);
    expect(
      await query(
        "select actor_user_id, metadata from audit_event where action = 'slides:deck-exported' and target_id = $1",
        [id]
      )
    ).toEqual([
      { actor_user_id: owner.caller.userId, metadata: { slides: 1 } },
      { actor_user_id: owner.caller.userId, metadata: { slides: 1 } },
    ]);
  });

  it("answers not-found for another person's deck and stores no file, and refuses a person without slides:read", async () => {
    const { userId: other } = await insertPersonWith(deployment.context, [
      "slides:use",
      "slides:read",
    ]);

    const id = await insertDeck(deployment.context, { ownerUserId: other });
    const before = await fileCount();

    await expect(
      callProcedure(slidesRouter, owner).exportDeck({ id })
    ).rejects.toMatchObject({ code: "not-found" });
    expect(await fileCount()).toBe(before);

    const { userId: user } = await insertPersonWith(deployment.context, [
      "slides:use",
    ]);

    await expect(
      callProcedure(slidesRouter, contextOf(user)).exportDeck({
        id: await insertDeck(deployment.context, { ownerUserId: user }),
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await fileCount()).toBe(before);
  });

  it("writes the refusal line in place of a KPI whose dataset the person can no longer read", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "slides:use",
      "slides:read",
    ]);

    const id = await insertDeck(deployment.context, {
      ownerUserId: userId,
      content: { slides: [{ id: "s1", elements: [title("Total"), KPI] }] },
    });

    const slide = await (
      await exportAs(contextOf(userId), id)
    ).pptx.xmlOf("ppt/slides/slide1.xml");

    expect(slide).toContain("You can no longer read the data of this chart.");
    expect(slide).not.toContain("250,000");
    expect(slide).not.toContain("Source: placeholder.records");
  });

  it("writes saved speaker notes into the export, and none after Undo clears them", async () => {
    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: { slides: [{ id: "s1", elements: [title("A claim")] }] },
    });

    const slides = callProcedure(slidesRouter, owner);
    const plain = await slides.readDeck({ id });
    const notes = "Say it warmly.\nThen pause.";

    const noted = await slides.changeDeck({
      id,
      expectedHash: plain.contentHash,
      changes: [{ op: "change-slide-fields", slideId: "s1", notes }],
    });

    expect((await slides.readDeck({ id })).slides[0]).toMatchObject({ notes });

    const notesSlide = () =>
      exportAs(owner, id).then(({ pptx }) =>
        pptx.xmlOf("ppt/notesSlides/notesSlide1.xml")
      );

    expect(await notesSlide()).toContain("Say it warmly.");
    expect(await notesSlide()).toContain("Then pause.");

    await slides.undoDeck({ id, expectedHash: noted.contentHash });

    expect((await slides.readDeck({ id })).slides[0]?.notes).toBeUndefined();
    expect(await notesSlide()).not.toContain("Say it warmly.");
  });

  // Last: it moves the clock past the 10 s branding cache (DEC-46).
  it("uses the tenant color, logo and company name, and writes no media part without a logo", async () => {
    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: { slides: [{ id: "s1", elements: [title("A claim")] }] },
    });

    expect((await exportAs(owner, id)).pptx.mediaParts).toEqual([]);

    const { id: logo } = await withTransaction(deployment.context, (tx) =>
      deployment.context.fileStorage.store(
        {
          fileName: "logo.png",
          mimeType: "image/png",
          bytes: PNG,
          uploadedByUserId: null,
        },
        tx
      )
    );

    // A save stores the pair: core's foregroundFor('#0f766e') is white, and primaryPair needs both.
    await query(
      "update tenant_branding set primary_color = '#0f766e', primary_foreground = '#ffffff', logo_light_file_id = $1, company_name = 'Acme Export'",
      [logo]
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10_001);

    const { pptx } = await exportAs(owner, id);
    // The company name is drawn on each slide, in that slide's footer color (czjw.137).
    const slide = await pptx.xmlOf("ppt/slides/slide1.xml");

    expect(slide).toMatch(/srgbClr val="0f766e"/i);
    expect(pptx.mediaParts).toHaveLength(1);
    expect(slide).toContain("Acme Export");
  });

  it("saves a dark blue slide with white text and a moved chart, reads and exports it the same, and Undo restores the deck", async () => {
    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: {
        slides: [
          {
            id: "s1",
            elements: [
              title("Records grow each month"),
              { kind: "text", text: "Three months of records." },
              frozenElement("chart"),
            ],
          },
        ],
      },
    });

    const slides = callProcedure(slidesRouter, owner);
    const plain = await slides.readDeck({ id });
    const box = { x: 480, y: 136, w: 440, h: 336 };

    const styled = await slides.changeDeck({
      id,
      expectedHash: plain.contentHash,
      changes: [
        { op: "change-slide-fields", slideId: "s1", background: "#1E3A8A" },
        {
          op: "change-element",
          slideId: "s1",
          index: 0,
          style: { color: "#FFFFFF" },
        },
        {
          op: "change-element",
          slideId: "s1",
          index: 1,
          style: { color: "#FFFFFF" },
        },
        { op: "change-element", slideId: "s1", index: 2, box },
      ],
    });

    const read = await slides.readDeck({ id });

    expect(read.contentHash).toBe(styled.contentHash);
    expect(read.slides[0]).toMatchObject({
      background: "#1E3A8A",
      elements: [
        { kind: "title", style: { color: "#FFFFFF" } },
        { kind: "text", style: { color: "#FFFFFF" } },
        { kind: "chart", box },
      ],
    });

    const { pptx } = await exportAs(owner, id);
    const slide1 = await pptx.xmlOf("ppt/slides/slide1.xml");

    expect(slide1).toMatch(/<p:bg>.*srgbClr val="1E3A8A"/s);
    expect(slide1).toMatch(/srgbClr val="FFFFFF".*Records grow each month/s);
    // The chart frame at 480, 136 px is 4572000, 1295400 EMU.
    expect(slide1).toContain('<a:off x="4572000" y="1295400"/>');

    const undone = await slides.undoDeck({
      id,
      expectedHash: styled.contentHash,
    });

    expect(undone.contentHash).toBe(plain.contentHash);
    expect(undone.slides).toEqual(plain.slides);
  });

  it("keeps a slide's background and a chart's box and style through Refresh data", async () => {
    const box = { x: 480, y: 136, w: 440, h: 336 };
    const style = { fill: "#EFF6FF" };

    const id = await insertDeck(deployment.context, {
      ownerUserId: owner.caller.userId,
      content: {
        slides: [
          {
            id: "s1",
            background: "#F8FAFC",
            elements: [
              title("Records grow each month"),
              { ...frozenElement("chart"), box, style },
            ],
          },
        ],
      },
    });

    const slides = callProcedure(slidesRouter, owner);
    const read = await slides.readDeck({ id });

    const { deck } = await slides.refreshDeck({
      id,
      expectedHash: read.contentHash,
    });

    expect(deck.slides[0]).toMatchObject({
      background: "#F8FAFC",
      elements: [{ kind: "title" }, { kind: "chart", box, style }],
    });
  });
});
