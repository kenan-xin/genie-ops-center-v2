import type { AgentSessionSummary } from "@genie/core";
import {
  AgentPanelHost,
  resetAgentPanel,
} from "@genie/core/features/agent/panel";
import { AppShell, PageTrailProvider } from "@genie/core/features/shell";
import { ModuleClientProvider } from "@genie/core/rpc/client";
import { Chart } from "@genie/ui/chart";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  expect,
  fn,
  mocked,
  screen,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

import {
  deckPage,
  draftedDeckPage,
  emptyDeckPage,
  noChatDeckPage,
  PROVISIONAL_TITLE,
  startedDeckPage,
  tableWithVisualSlide,
  textOnlySlide,
  titleOnlySlide,
  twentySlideDeckPage,
  unnamedDraftedDeckPage,
} from "./__fixtures__/decks.ts";
import { DeckView } from "./deck-view.tsx";
import { deckQueryKey } from "./use-deck.ts";
import type { DeckPageView } from "./views.ts";

const readDeck = fn();

const changeDeck = fn();

const undoDeck = fn();

const refreshDeck = fn();

const uploadDeckImage = fn();

// The stub answers for the server's export, so the story never loads the builder (D8).
const exportDeck = fn();

/** `agent.sessions`: the deck's chats, whose run the page follows (S7-48). */
const sessions = fn();

/** `agent.stop`: Stop on the page ends the deck's run. */
const stop = fn();

/** `agent.session`: the chat the phone panel opens. */
const session = fn();

/** The fixture deck's content hash, which every write names (R-53). */
const HASH = "0".repeat(64);

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * A fresh query cache per story, with no retries so a refusal reports at once. The deck's first run
 * read has landed with no chat, as on a page open for a while, so a story can edit at once; the
 * page still reads `agent.sessions` again on mount. A story with `parameters.runRead: "pending"`
 * starts before that read.
 */
function withQuery(
  Story: () => ReactNode,
  context: { readonly parameters: { readonly runRead?: "pending" } }
) {
  const [client] = useState(() => {
    const fresh = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    if (context.parameters.runRead !== "pending") {
      // Kept until the page subscribes; a gcTime of 0 would drop it first.
      fresh.setQueryDefaults(["agent", "sessions"], { gcTime: 60_000 });
      fresh.setQueryData(["agent", "sessions", "slides", "deck-1"], []);
    }

    return fresh;
  });

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider
        client={{
          slides: {
            readDeck,
            changeDeck,
            undoDeck,
            refreshDeck,
            uploadDeckImage,
            exportDeck,
          },
          agent: {
            sessions,
            stop,
            session,
            messages: async () => [],
            artifacts: async () => [],
            files: async () => [],
            markSeen: async () => undefined,
            activeRuns: async () => ({ count: 0 }),
            retry: async () => undefined,
          },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

/** Lets a story ask the deck query again, as the 10 s poll or a focus does. */
function withRefetch(Story: () => ReactNode) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = () => {
      void queryClient.refetchQueries({ queryKey: deckQueryKey("deck-1") });
    };

    window.addEventListener("refetch-deck", handler);

    return () => window.removeEventListener("refetch-deck", handler);
  }, [queryClient]);

  return <Story />;
}

const meta = {
  title: "Modules/Slides/Deck",
  component: DeckView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One deck at `/m/slides/decks/:id` (Spec 7 R-52, R-54). The header names the slide count and the figures date; Present is the main action, Export to PowerPoint sits beside it, and Add slide and Refresh data sit in More (7.2). The title renames in place: Enter saves at the hash the page showed, Escape cancels. Undo sits above the shown slide, also when no slide is left. A rail of numbered slide previews selects the shown slide (7.3): from 768 px a column on the left, below it a strip that scrolls sideways above the slide. The slide keeps its 16:9 shape at every width.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
} satisfies Meta<typeof DeckView>;

export default meta;

type Story = StoryObj<typeof meta>;

function serve(page: DeckPageView) {
  readDeck.mockReset().mockResolvedValue(page.deck);
  changeDeck.mockReset().mockResolvedValue(page.deck);
  undoDeck.mockReset().mockResolvedValue(page.deck);
  refreshDeck
    .mockReset()
    .mockResolvedValue({ deck: page.deck, changedSlides: [] });
  uploadDeckImage.mockReset().mockResolvedValue({ fileId: "image-2" });
  exportDeck.mockReset();
  resetAgentPanel();
  // A deck with no chat of the agent, as every deck made by hand.
  sessions.mockReset().mockResolvedValue([]);
  stop.mockReset().mockResolvedValue(undefined);
  session.mockReset().mockResolvedValue(null);
}

/** B6.7: the control at the centre of the viewport's hit test is the control itself. */
function isHittable(element: HTMLElement) {
  const box = element.getBoundingClientRect();

  return (
    document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    ) === element
  );
}

/** B4.3: the slide keeps 16:9 within 1 px, fits its container and never widens the page. */
async function slideFits(canvasElement: HTMLElement) {
  const slide = canvasElement.querySelector<HTMLElement>(
    "[data-shown-slide] [data-slide-canvas]"
  );

  expect(slide).not.toBeNull();

  const rect = slide!.getBoundingClientRect();
  const host = slide!.parentElement!.getBoundingClientRect();

  expect(Math.abs(rect.width * (540 / 960) - rect.height)).toBeLessThanOrEqual(
    1
  );
  expect(rect.width).toBeLessThanOrEqual(host.width + 1);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth
  );
}

export const Deck: Story = {
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Receivables at a glance"
    );
    await expect(
      canvasElement.querySelector("[data-figures-date]")
    ).toHaveTextContent("5 slides · Figures as of 27 Oct 2026");
    await slideFits(canvasElement);

    // 7.2: Present and Export are the page's actions; the rest sits in More.
    await expect(canvas.getByRole("button", { name: "Present" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Export to PowerPoint" })
    ).toBeVisible();

    for (const name of ["Add slide", "Refresh data"]) {
      expect(canvas.queryByRole("button", { name })).toBeNull();
    }

    // The title renames in place, so More holds no Rename deck.
    await expect(
      canvas.getByRole("button", {
        name: "Rename deck, Receivables at a glance",
      })
    ).toBeVisible();

    // Undo sits beside the slide, above it.
    const undo = canvas.getByRole("button", { name: "Undo" });

    const slide = canvasElement.querySelector(
      "[data-shown-slide] [data-slide-canvas]"
    );

    await expect(
      undo.getBoundingClientRect().bottom <= slide!.getBoundingClientRect().top
    ).toBe(true);

    await userEvent.click(canvas.getByRole("button", { name: "More" }));

    // The menu fades in, so its items show once the opening transition ends.
    await waitFor(() => {
      for (const name of ["Add slide", "Refresh data"]) {
        expect(screen.getByRole("menuitem", { name })).toBeVisible();
      }
    });
    await expect(
      screen.queryByRole("menuitem", { name: "Rename deck" })
    ).toBeNull();

    await userEvent.keyboard("{Escape}");
  },
};

/** Opens the deck's More menu and picks one action. */
async function pickFromMore(
  canvas: ReturnType<typeof within>,
  name: string
): Promise<void> {
  await userEvent.click(canvas.getByRole("button", { name: "More" }));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
  // The next step starts with no menu open.
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
}

/** The visible buttons of one name, so a hidden desktop copy does not count. */
function visibleButtons(canvas: ReturnType<typeof within>, name: string) {
  return canvas
    .queryAllByRole("button", { name })
    .filter((button: HTMLElement) => button.checkVisibility());
}

export const DeckOnPhone: Story = {
  name: "Deck on a phone",
  args: { view: deckPage },
  globals: phone,
  parameters: { layout: "fullscreen" },
  decorators: [withTrail, withShell],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("navigation", { name: "Slides" })
    ).toBeVisible();
    await slideFits(canvasElement);

    // P13-9: the top bar reads Back, the title, Undo, Ask and Present (deck-phone.prototype.html).
    const bar = within(
      canvasElement.querySelector<HTMLElement>("[data-page-top-bar]")!
    );

    const lefts = [
      bar.getByRole("link", { name: "Back to Slides" }),
      bar.getByText(deckPage.deck.title),
      bar.getByRole("button", { name: "Undo" }),
      bar.getByRole("button", { name: "Ask" }),
      bar.getByRole("button", { name: "Present" }),
    ].map((part) => part.getBoundingClientRect().left);

    await expect(lefts).toEqual(lefts.toSorted((a, b) => a - b));
    await expect(new Set(lefts).size).toBe(5);

    // Present is one button below 768 px; Export and the header's More move to the dock's More.
    await expect(visibleButtons(canvas, "Present")).toHaveLength(1);

    await expect(
      ["More ways to present", "Export to PowerPoint"].filter(
        (name) => visibleButtons(canvas, name).length > 0
      )
    ).toEqual([]);
    await expect(visibleButtons(canvas, "More")).toEqual([
      within(canvas.getByRole("toolbar", { name: "Slide tools" })).getByRole(
        "button",
        { name: "More" }
      ),
    ]);

    // The top bar shows the title for the eye; the page keeps its h1 for a screen reader.
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      deckPage.deck.title
    );

    // Round 1: below lg the header date is sr-only, so the page shows a readable line outside
    // the canvas; the scaled slide footer alone is about 4.5 px at 390 px.
    const date = canvasElement.querySelector<HTMLElement>(
      "[data-figures-date]"
    );

    await expect(date).not.toBeNull();
    await expect(date).toBeVisible();
    await expect(date).toHaveTextContent(
      "5 slides · Figures as of 27 Oct 2026"
    );
    await expect(getComputedStyle(date!).fontSize).toBe("12px");
  },
};

// P13-10: from 768 px the header keeps Export, More and Present, in that order.
export const HeaderActionsOnADesktop: Story = {
  name: "On a desktop the header reads Export, More and Present",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const lefts = ["Export to PowerPoint", "More", "Present"].map((name) => {
      const [button] = visibleButtons(canvas, name);

      expect(button).toBeDefined();

      return button!.getBoundingClientRect().left;
    });

    await expect(lefts).toEqual(lefts.toSorted((a, b) => a - b));
  },
};

/** C06-3: Add element and Background as "height px at top", so a mismatch names both. */
function editorBar(canvas: ReturnType<typeof within>) {
  return ["Add element", "Background"].map((name) => {
    const { height, top } = canvas
      .getByRole("button", { name })
      .getBoundingClientRect();

    return `${Math.round(height * 10) / 10} px at ${Math.round(top * 10) / 10}`;
  });
}

// C06-3: the editor bar is not a dense place, so Background takes the md height of Add element.
export const EditorBarLinesUp: Story = {
  name: "On a desktop Add element and Background are 36 px on one top edge",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const [add, background] = editorBar(canvas);

    await expect(add).toMatch(/^36 px/);
    await expect(background).toBe(add);
  },
};

/** The dock's three tools with nothing selected (deck-phone.prototype.html?state=idle). */
const DOCK_TOOLS = ["Add element", "Background", "Edit slide"];

// czjw.176: below 768 px the dock's tools are one row of 52 px targets.
export const EditorBarLinesUpOnPhone: Story = {
  name: "On a phone the dock's tools share one row",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const dock = within(canvas.getByRole("toolbar", { name: "Slide tools" }));

    const boxes = DOCK_TOOLS.map((name) =>
      dock.getByRole("button", { name }).getBoundingClientRect()
    );

    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(52);
      expect(Math.abs(box.top - boxes[0]!.top)).toBeLessThanOrEqual(1);
    }
  },
};

// czjw.176: with nothing selected the dock at the screen's bottom edge replaces the editor row
// and the Edit slide button; its tools reach Add element, Background and the sheet.
export const DockOnPhone: Story = {
  name: "On a phone the dock holds the slide's tools",
  args: { view: deckPage },
  globals: phone,
  beforeEach: serveRecolor,
  play: async ({ canvas }) => {
    const toolbar = canvas.getByRole("toolbar", { name: "Slide tools" });
    const dock = within(toolbar);

    await expect(
      dock.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["Add", "Background", "Edit slide", "More"]);
    await expect(
      Math.abs(
        toolbar.parentElement!.getBoundingClientRect().bottom -
          window.innerHeight
      )
    ).toBeLessThanOrEqual(1);

    // The old rows are gone: each tool shows once on the page.
    for (const name of DOCK_TOOLS) {
      expect(visibleButtons(canvas, name)).toHaveLength(1);
    }

    await userEvent.click(dock.getByRole("button", { name: "Add element" }));
    await expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent)
    ).toEqual(["Text", "Bullets", "Figure", "Chart", "Table", "Image"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    await userEvent.click(dock.getByRole("button", { name: "Background" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Light gray #F3F4F6" })
    );
    await waitFor(() =>
      expect(changeDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
        changes: [
          backgroundStep("#F3F4F6"),
          {
            op: "change-element",
            slideId: "s1",
            index: 0,
            style: { color: "#111827" },
          },
        ],
      })
    );
    await findRecolorNote(canvas);

    await userEvent.click(dock.getByRole("button", { name: "Edit slide" }));
    await expect(
      await screen.findByRole("dialog", { name: "Edit slide 1" })
    ).toBeInTheDocument();
  },
};

const IDLE_HINT = "Tap an element on the slide to style it.";

// P13-26: with nothing selected the phone hint says what a tap does; a selection says how to move.
export const IdleHintOnPhone: Story = {
  name: "On a phone the hint says tap with nothing selected",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(IDLE_HINT)).toBeVisible();

    await selectTitle(canvas);

    await expect(
      canvas.getByText(
        "Drag to move. Drag a corner to resize, or tap Position."
      )
    ).toBeVisible();
    await expect(canvas.queryByText(IDLE_HINT)).toBeNull();
  },
};

// czjw.176: from 768 px the editor bar stays above the slide, and no dock shows.
export const NoDockOnADesktop: Story = {
  name: "On a desktop the editor bar stays and no dock shows",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("toolbar", { name: "Slide tools" })
    ).toBeNull();
    await expect(
      canvas
        .getByRole("button", { name: "Add element" })
        .getBoundingClientRect().bottom
    ).toBeLessThanOrEqual(
      canvas
        .getByRole("group", { name: "Slide editing" })
        .getBoundingClientRect().top
    );
  },
};

export const EmptyDeck: Story = {
  name: "Empty deck",
  args: { view: emptyDeckPage },
  globals: desktop,
  beforeEach: () => serve(emptyDeckPage),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No slides yet")).toBeVisible();
    await expect(
      canvas.getByText(
        "Add a slide, or create a deck by chat from the Slides list."
      )
    ).toBeVisible();

    // No slide to present or export, so both are off and say why (P13-15, C13-5).
    const present = canvas.getByRole("button", { name: "Present" });

    const exporting = canvas.getByRole("button", {
      name: "Export to PowerPoint",
    });

    await expect(present).toHaveAttribute("aria-disabled", "true");
    await expect(present).toHaveAccessibleDescription("Add a slide first.");
    await expect(exporting).toHaveAttribute("aria-disabled", "true");
    await expect(exporting).toHaveAccessibleDescription("Add a slide first.");
    // The last removal stays undoable (R-49), with no slide to stand beside.
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeVisible();
  },
};

export const EmptyDeckOnPhone: Story = {
  name: "Empty deck on a phone",
  args: { view: emptyDeckPage },
  globals: phone,
  beforeEach: () => serve(emptyDeckPage),
  // P13-16: with no strip and no header More, the empty state is the phone's way to a first slide.
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No slides yet")).toBeVisible();
    // C13-5: the top bar's Present says why it is off.
    await expect(
      canvas.getByRole("button", { name: "Present" })
    ).toHaveAccessibleDescription("Add a slide first.");

    await userEvent.click(canvas.getByRole("button", { name: "Add slide" }));
    await expect(
      await screen.findByRole("dialog", { name: "Add slide" })
    ).toBeInTheDocument();
  },
};

const railPlay: Story["play"] = async ({ canvas, canvasElement }) => {
  // 7.3: each rail item shows a small preview of its slide, out of the tab order and the tree.
  const previews = canvasElement.querySelectorAll(
    'nav[aria-label="Slides"] [data-slide-preview] [data-slide-canvas]'
  );

  await expect(previews).toHaveLength(5);

  for (const preview of previews) {
    expect(preview.closest("[inert]")).not.toBeNull();
  }

  const second = canvas.getByRole("button", {
    name: "Slide 2: Collections narrowed the gap to the plan line",
  });

  await expect(
    canvas.getByRole("button", {
      name: "Slide 1: Cash in moved ahead of the plan this quarter",
    })
  ).toHaveAttribute("aria-current", "true");

  await userEvent.click(second);

  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(
    canvas.getByRole("group", {
      name: "Collections narrowed the gap to the plan line",
    })
  ).toBeVisible();
};

export const Rail: Story = {
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: railPlay,
};

/** Waits until no `Chart` rendered for 200 ms (the spy of `preview.tsx`). */
async function chartsSettle(): Promise<void> {
  let last = -1;

  await waitFor(
    () => {
      const count = mocked(Chart).mock.calls.length;
      const settled = count === last;

      last = count;
      expect(settled).toBe(true);
    },
    { interval: 200, timeout: 10_000 }
  );
}

// czjw.185: a select draws the shown slide's charts only; the strip's previews draw nothing again.
export const SelectRendersOnlyTheShownSlide: Story = {
  args: { view: twentySlideDeckPage },
  globals: desktop,
  beforeEach: () => serve(twentySlideDeckPage),
  play: async ({ canvas }) => {
    await chartsSettle();
    mocked(Chart).mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /^Slide 11: / }));
    await chartsSettle();

    const titles = mocked(Chart).mock.calls.map(([chart]) => chart.title);

    await expect(titles.length).toBeGreaterThan(0);
    await expect(
      titles.filter((title) => !title.endsWith(" · slide 11"))
    ).toEqual([]);
  },
};

const RENAMED_SLIDE_4 = "The finance team now reviews every chart monthly";

// czjw.185: a poll's changed slide reaches its strip preview; a memo never keeps the older one.
export const StripFollowsARefetch: Story = {
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const strip = within(canvas.getByRole("navigation", { name: "Slides" }));

    await expect(
      strip.getByRole("button", { name: /^Slide 4: / })
    ).toBeVisible();

    readDeck.mockResolvedValue({
      ...deckPage.deck,
      slides: deckPage.deck.slides.map((slide, i) =>
        i === 3
          ? {
              ...slide,
              elements: slide.elements.map((element) =>
                element.kind === "title"
                  ? { kind: "title" as const, text: RENAMED_SLIDE_4 }
                  : element
              ),
            }
          : slide
      ),
    });
    window.dispatchEvent(new Event("refetch-deck"));

    await expect(
      await strip.findByRole("button", { name: `Slide 4: ${RENAMED_SLIDE_4}` })
    ).toBeVisible();
    await expect(strip.getByText(RENAMED_SLIDE_4)).toBeInTheDocument();
  },
};

/** The color a CSS color variable resolves to, in the form the browser reports a computed color. */
function resolvedColor(variable: string): string {
  const probe = document.createElement("span");

  probe.style.color = `var(${variable})`;
  document.body.append(probe);

  const color = getComputedStyle(probe).color;

  probe.remove();

  return color;
}

export const RailOnPhone: Story = {
  name: "Rail on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async (context) => {
    await railPlay(context);

    const { canvas } = context;

    const numbers = canvas
      .getAllByRole("button", { name: /^Slide \d+: / })
      .map((number) => {
        const tile = number.parentElement!;

        const preview = tile.querySelector<HTMLElement>(
          "[data-slide-preview]"
        )!;

        return { number, tile, preview };
      });

    // czjw.176: small 16:9 previews 76 px wide, each with its number under it.
    for (const { number, tile, preview } of numbers) {
      const box = preview.getBoundingClientRect();

      expect(
        Math.abs(tile.getBoundingClientRect().width - 76)
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - 76)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width * (9 / 16) - box.height)).toBeLessThanOrEqual(
        1
      );
      expect(number.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        preview.getBoundingClientRect().bottom
      );
    }

    // E5: railPlay leaves slide 2 shown. Its number looks like the others; only its preview
    // carries the primary ring.
    const shown = numbers[1]!;
    const other = getComputedStyle(numbers[0]!.number);

    await expect(shown.number).toHaveAttribute("aria-current", "true");
    await expect(getComputedStyle(shown.number).color).toBe(other.color);
    await expect(getComputedStyle(shown.number).fontWeight).toBe(
      other.fontWeight
    );
    await expect(getComputedStyle(shown.preview).boxShadow).toContain(
      resolvedColor("--primary")
    );
  },
};

/** czjw.176: the strip's Add tile adds a slide after the shown one, as Add slide in More does. */
export const StripAddTileOnPhone: Story = {
  name: "Strip Add tile on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const strip = within(
      await canvas.findByRole("navigation", { name: "Slides" })
    );

    await userEvent.click(strip.getByRole("button", { name: /^Slide 2: / }));
    await userEvent.click(strip.getByRole("button", { name: "Add slide" }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add slide" })
    );

    await waitFor(() =>
      expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible()
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: "Title" }),
      "A new claim"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
      changes: [
        {
          op: "add-slide",
          slide: { elements: [{ kind: "title", text: "A new claim" }] },
          toIndex: 2,
        },
      ],
    });
  },
};

/** A vertical mouse wheel over the rail, answered with whether the rail took it. */
function wheelOver(rail: HTMLElement): boolean {
  const wheel = new WheelEvent("wheel", { deltaY: 100, cancelable: true });

  rail.dispatchEvent(wheel);

  return wheel.defaultPrevented;
}

/** X-6: below 768 px the rail is a strip that keeps a swipe and takes a vertical wheel. */
export const RailStripTakesTheWheel: Story = {
  name: "Rail strip on a phone takes the swipe and the wheel",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const rail = await canvas.findByRole("navigation", { name: "Slides" });
    const style = getComputedStyle(rail);

    await expect(style.overscrollBehaviorX).toBe("contain");
    await expect(style.touchAction).toBe("pan-x pan-y");
    await expect(rail.scrollWidth).toBeGreaterThan(rail.clientWidth);
    await expect(wheelOver(rail)).toBe(true);
    await expect(rail.scrollLeft).toBe(100);
  },
};

/** X-6: from 768 px the rail is a column; the wheel scrolls the page, and pinch zoom stays. */
export const RailColumnLeavesTheWheel: Story = {
  name: "Rail column on a desktop leaves the wheel to the page",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const rail = await canvas.findByRole("navigation", { name: "Slides" });

    await expect(getComputedStyle(rail).touchAction).toBe("auto");
    await expect(wheelOver(rail)).toBe(false);
    // czjw.176: the column shows every slide, so its end never fades.
    await expect(rail).not.toHaveAttribute("data-strip-more");
    await expect(getComputedStyle(rail).maskImage).toBe("none");
  },
};

// B5.1: Present opens at the slide the page shows, and Escape returns to it.
export const Present: Story = {
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Slide 2: Collections narrowed the gap to the plan line",
      })
    );
    await userEvent.click(canvas.getByRole("button", { name: "Present" }));

    const dialog = within(
      await screen.findByRole("dialog", {
        name: "Present Receivables at a glance",
      })
    );

    await waitFor(() => expect(dialog.getByText("2 / 5")).toBeVisible());

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

/** Answers `window.open` with `answer` while `run` goes, and gives back the spy. */
async function withWindowOpen(
  answer: Window | null,
  run: (open: ReturnType<typeof fn>) => Promise<void>
) {
  const original = window.open;
  const open = fn(() => answer);

  window.open = open;

  try {
    await run(open);
  } finally {
    window.open = original;
  }
}

async function presentWithNotes(canvas: ReturnType<typeof within>) {
  await userEvent.click(
    canvas.getByRole("button", { name: "More ways to present" })
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /^Present with notes/ })
  );
}

// S7-45: Present with notes opens the presenter window first, then present mode at the shown slide.
export const PresentWithNotes: Story = {
  name: "Present with notes opens the presenter",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: ({ canvas }) =>
    // SAFETY: the page only checks the answer for null; nothing reads the window.
    withWindowOpen({} as Window, async (open) => {
      await presentWithNotes(canvas);

      await expect(open).toHaveBeenCalledWith(
        "/m/slides/decks/deck-1/presenter",
        "slides-presenter-deck-1",
        "popup"
      );
      await screen.findByRole("dialog", {
        name: "Present Receivables at a glance",
      });
    }),
};

// Review Focus 5: a blocked pop-up starts no audience-only show and says why.
export const BlockedPopUp: Story = {
  name: "Blocked pop-up",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: ({ canvas }) =>
    withWindowOpen(null, async (open) => {
      await presentWithNotes(canvas);

      await expect(open).toHaveBeenCalledTimes(1);
      await expect(
        await canvas.findByText(
          "Your browser blocked the presenter window. Allow pop-ups for this site, then choose Present with notes again."
        )
      ).toBeVisible();
      await expect(
        canvas.getByText(/Your browser blocked/).closest("[role=status]")
      ).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await expect(screen.queryByRole("dialog")).toBeNull();
    }),
};

// B6.2: each slide action sends the change it names, through the shown deck's hash.
const slideActionsPlay: Story["play"] = async ({ canvas }) => {
  // Slide 1 has no earlier place, so Move earlier is off.
  await userEvent.click(
    canvas.getByRole("button", { name: "Actions for slide 1" })
  );
  await expect(
    await screen.findByRole("menuitem", { name: "Move earlier" })
  ).toHaveAttribute("data-disabled");
  await userEvent.click(screen.getByRole("menuitem", { name: "Move later" }));

  await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
  await expect(changeDeck).toHaveBeenCalledWith({
    id: "deck-1",
    expectedHash: HASH,
    changes: [{ op: "move-slide", slideId: "s1", toIndex: 1 }],
  });
  changeDeck.mockClear();

  await userEvent.click(
    canvas.getByRole("button", { name: "Actions for slide 1" })
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Delete slide" })
  );

  await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
  await expect(changeDeck).toHaveBeenCalledWith({
    id: "deck-1",
    // czjw.185: the strip's memoized item sends the hash of the first save's answer.
    expectedHash: NEW_HASH,
    changes: [{ op: "remove-slide", slideId: "s1" }],
  });
  changeDeck.mockClear();

  await pickFromMore(canvas, "Add slide");

  const dialog = within(
    await screen.findByRole("dialog", { name: "Add slide" })
  );

  await waitFor(() =>
    expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible()
  );
  await userEvent.type(
    dialog.getByRole("textbox", { name: "Title" }),
    "A new claim"
  );
  await expect(
    dialog.getByRole("textbox", { name: "Title" })
  ).toHaveAccessibleDescription(
    "State the finding of this slide in one sentence."
  );
  await userEvent.click(dialog.getByRole("button", { name: "Add" }));

  await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
  await expect(changeDeck).toHaveBeenCalledWith({
    id: "deck-1",
    expectedHash: HASH,
    changes: [
      {
        op: "add-slide",
        slide: { elements: [{ kind: "title", text: "A new claim" }] },
        toIndex: 1,
      },
    ],
  });
};

export const SlideActions: Story = {
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockResolvedValueOnce({
      ...deckPage.deck,
      contentHash: NEW_HASH,
    });
  },
  play: slideActionsPlay,
};

/** Opens the phone dock's More sheet. */
async function openMore(canvas: ReturnType<typeof within>) {
  await userEvent.click(
    within(canvas.getByRole("toolbar", { name: "Slide tools" })).getByRole(
      "button",
      { name: "More" }
    )
  );

  return within(
    await screen.findByRole("dialog", { name: "Deck and slide actions" })
  );
}

/** Picks one row of the More sheet, and waits for the sheet to leave. */
async function pickFromMoreSheet(
  canvas: ReturnType<typeof within>,
  name: string
): Promise<void> {
  await userEvent.click((await openMore(canvas)).getByRole("button", { name }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Deck and slide actions" })
    ).toBeNull()
  );
}

// C09-14, P13-7, P13-15: below 768 px no tile has a menu; the More sheet moves and deletes the
// shown slide, says why an end move is off, and the strip's Add tile adds a slide.
export const SlideActionsOnPhone: Story = {
  name: "Slide actions on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Actions for slide 1" })
    ).toBeNull();

    const first = await openMore(canvas);
    const earlier = first.getByRole("button", { name: "Move earlier" });

    await expect(earlier).toHaveAttribute("aria-disabled", "true");
    await expect(earlier).toHaveAccessibleDescription(
      "This is the first slide."
    );
    await userEvent.click(earlier);
    await expect(changeDeck).not.toHaveBeenCalled();
    await userEvent.click(first.getByRole("button", { name: "Move later" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
      changes: [{ op: "move-slide", slideId: "s1", toIndex: 1 }],
    });
    changeDeck.mockClear();

    // The step names the shown slide, not the first one.
    await userEvent.click(canvas.getByRole("button", { name: /^Slide 2: / }));
    await pickFromMoreSheet(canvas, "Delete slide");

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
      changes: [{ op: "remove-slide", slideId: "s2" }],
    });
    changeDeck.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /^Slide 5: / }));

    const last = await openMore(canvas);

    await expect(
      last.getByRole("button", { name: "Move later" })
    ).toHaveAccessibleDescription("This is the last slide.");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(canvas.getByRole("button", { name: "Add slide" }));
    await expect(
      await screen.findByRole("dialog", { name: "Add slide" })
    ).toBeInTheDocument();
  },
};

const MORE_ROWS = [
  "Present with notes",
  "Export to PowerPoint",
  "Refresh data",
  "Rename deck",
  "Move earlier",
  "Move later",
  "Delete slide",
];

/** The phone page in the app's shell, with Ask on (deck-phone.prototype.html?state=slide-more). */
const inShellOnPhone = {
  globals: phone,
  parameters: { layout: "fullscreen" },
  decorators: [withTrail, withShell],
} satisfies Pick<Story, "globals" | "parameters" | "decorators">;

// czjw.176: More holds what the phone header dropped, in three sections (slide-more-390.png).
export const MoreSheetOnPhone: Story = {
  name: "More sheet on a phone",
  args: { view: deckPage },
  ...inShellOnPhone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const sheet = await openMore(canvas);

    await expect(
      sheet
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Present", "Deck", "This slide"]);
    await expect(sheet.getAllByRole("button")).toEqual(
      MORE_ROWS.map((name) => sheet.getByRole("button", { name }))
    );
    await expect(
      sheet.getByRole("button", { name: "Present with notes" })
    ).toHaveAccessibleDescription("Opens the presenter window");
    await expect(
      sheet.getByRole("button", { name: "Refresh data" })
    ).toHaveAccessibleDescription("Figures as of 27 Oct 2026");
  },
};

// Review Focus 3: the pop-up opens inside the tap, before the sheet closes; then present mode.
export const PresentWithNotesFromMore: Story = {
  name: "Present with notes from More",
  args: { view: deckPage },
  ...inShellOnPhone,
  beforeEach: () => serve(deckPage),
  play: ({ canvas }) =>
    // SAFETY: the page only checks the answer for null; nothing reads the window.
    withWindowOpen({} as Window, async (open) => {
      let sheetOpen = false;

      // Inside the tap the sheet is still open; an open after it closed is a blocked pop-up.
      open.mockImplementation(() => {
        sheetOpen =
          screen
            .queryByRole("dialog", { name: "Deck and slide actions" })
            ?.hasAttribute("data-open") === true;

        // SAFETY: the page only checks the answer for null; nothing reads the window.
        return {} as Window;
      });

      await pickFromMoreSheet(canvas, "Present with notes");

      await expect(open).toHaveBeenCalledOnce();
      await expect(sheetOpen).toBe(true);
      await expect(open).toHaveBeenCalledWith(
        "/m/slides/decks/deck-1/presenter",
        "slides-presenter-deck-1",
        "popup"
      );
      await screen.findByRole("dialog", {
        name: "Present Receivables at a glance",
      });
    }),
};

export const BlockedPopUpFromMore: Story = {
  name: "Blocked pop-up from More",
  args: { view: deckPage },
  ...inShellOnPhone,
  beforeEach: () => serve(deckPage),
  play: ({ canvas }) =>
    withWindowOpen(null, async (open) => {
      await pickFromMoreSheet(canvas, "Present with notes");

      await expect(open).toHaveBeenCalledOnce();
      await expect(
        await canvas.findByText(
          "Your browser blocked the presenter window. Allow pop-ups for this site, then choose Present with notes again."
        )
      ).toBeVisible();
      await pause(200);
      await expect(
        screen.queryByRole("dialog", {
          name: "Present Receivables at a glance",
        })
      ).toBeNull();
    }),
};

// Review Focus 1: a More action inside a notes pause saves the typed notes first, then its step.
export const NotesSaveBeforeMoreAction: Story = {
  name: "Notes save before a More action",
  args: { view: deckPage },
  ...inShellOnPhone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Speaker notes" }),
      "Say hello."
    );
    await pickFromMoreSheet(canvas, "Delete slide");

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck.mock.calls.map(([call]) => call.changes)).toEqual([
      [{ op: "change-slide-fields", slideId: "s1", notes: "Say hello." }],
      [{ op: "remove-slide", slideId: "s1" }],
    ]);
  },
};

// R13-3: the exported file holds the notes typed inside the save pause.
export const NotesSaveBeforeExport: Story = {
  name: "Notes save before Export to PowerPoint",
  args: { view: deckPage },
  ...inShellOnPhone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    // Never answers, so the page never leaves for the file.
    exportDeck.mockReturnValue(new Promise(() => undefined));

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Speaker notes" }),
      "Say hello."
    );
    await pickFromMoreSheet(canvas, "Export to PowerPoint");

    await waitFor(() => expect(exportDeck).toHaveBeenCalledOnce());
    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce());
    await expect(changeDeck.mock.calls[0]?.[0].changes).toEqual([
      { op: "change-slide-fields", slideId: "s1", notes: "Say hello." },
    ]);
    await expect(changeDeck.mock.invocationCallOrder[0]).toBeLessThan(
      exportDeck.mock.invocationCallOrder[0]!
    );
  },
};

// R13-1: the shell focuses the h1 after a navigation, and the title closes a rename onto it. After
// a tap that focus is not a keyboard focus, so the title row stays hidden and the strip stays. A
// keyboard focus still shows the row (P13-8). A story's click is not a trusted tap, so Chromium
// would still treat a plain `focus()` as keyboard focus; `focusVisible` sets the mode instead.
export const TitleRowStaysHiddenOnScriptFocus: Story = {
  name: "Title row stays hidden when code focuses the title on a phone",
  args: { view: deckPage },
  ...inShellOnPhone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("navigation", { name: "Slides" });
    const top = strip.getBoundingClientRect().top;
    const h1 = canvas.getByRole("heading", { level: 1 });

    // As RouteFocus does it, after a tap.
    h1.tabIndex = -1;
    h1.focus({ focusVisible: false });

    await pause(100);
    await expect(strip.getBoundingClientRect().top).toBe(top);

    within(h1)
      .getByRole("button", { name: RENAME })
      .focus({ focusVisible: true });

    await waitFor(() =>
      expect(strip.getBoundingClientRect().top).toBeGreaterThan(top)
    );
  },
};

const NO_FIGURES = "This deck has no figures, charts or tables.";

const noFiguresPage: DeckPageView = {
  ...deckPage,
  deck: { ...deckPage.deck, slides: [titleOnlySlide, textOnlySlide] },
};

// P13-15: Refresh data on a deck with nothing to refresh is off and says why.
export const RefreshNoFiguresSaysWhy: Story = {
  name: "Refresh data with no figures says why on a phone",
  args: { view: noFiguresPage },
  ...inShellOnPhone,
  beforeEach: () => serve(noFiguresPage),
  play: async ({ canvas }) => {
    const row = (await openMore(canvas)).getByRole("button", {
      name: "Refresh data",
    });

    await expect(row).toHaveAttribute("aria-disabled", "true");
    await expect(row).toHaveAccessibleDescription(NO_FIGURES);
    await userEvent.click(row);
    await pause(100);
    await expect(refreshDeck).not.toHaveBeenCalled();
  },
};

export const RefreshNoFiguresSaysWhyOnADesktop: Story = {
  name: "Refresh data with no figures says why on a desktop",
  args: { view: noFiguresPage },
  globals: desktop,
  beforeEach: () => serve(noFiguresPage),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More" }));

    const item = await screen.findByRole("menuitem", { name: "Refresh data" });

    await expect(item).toHaveAttribute("data-disabled");
    await expect(item).toHaveAccessibleDescription(NO_FIGURES);
    await userEvent.keyboard("{Escape}");
  },
};

// A person without `slides:write` still presents with notes and exports from a phone.
export const ReaderOnPhone: Story = {
  name: "Reader on a phone",
  args: { view: { ...deckPage, canWrite: false } },
  ...inShellOnPhone,
  beforeEach: () => serve({ ...deckPage, canWrite: false }),
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("toolbar", { name: "Slide tools" }))
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["More"]);

    const sheet = await openMore(canvas);

    await expect(sheet.getAllByRole("button")).toEqual([
      sheet.getByRole("button", { name: "Present with notes" }),
      sheet.getByRole("button", { name: "Export to PowerPoint" }),
    ]);
  },
};

const DECK_CHANGED =
  "This deck changed since you opened it. Reload it to see the latest version.";

// B6.3: a conflict shows its message with Reload, and Reload asks for the deck again.
export const DeckChanged: Story = {
  name: "Deck changed",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockRejectedValue(
      Object.assign(new Error(DECK_CHANGED), {
        data: { appCode: "slides:deck-changed", requestId: "req-1" },
      })
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 1" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move later" })
    );

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent(DECK_CHANGED);

    readDeck.mockClear();
    await userEvent.click(
      within(alert).getByRole("button", { name: "Reload" })
    );

    await waitFor(() =>
      expect(readDeck).toHaveBeenCalledWith({ id: "deck-1" })
    );
    await waitFor(() => expect(canvas.queryByRole("alert")).toBeNull());
  },
};

const CHANGE_INVALID = "That change does not fit this deck.";

// B6.3 (ruling F10): a refused change names the slide, and the slide keeps its content.
export const RefusedSlideChange: Story = {
  name: "Refused slide change",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockRejectedValue(
      Object.assign(new Error(CHANGE_INVALID), {
        data: {
          appCode: "slides:change-invalid",
          requestId: "req-2",
          issues: [
            {
              path: "changes.0.slide.elements.3.fileId",
              message: "Upload this image to the deck first.",
            },
          ],
        },
      })
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    const title = sheet.getByRole("textbox", { name: "Title" });

    await waitFor(() => expect(title).toBeVisible());
    await userEvent.clear(title);
    await userEvent.type(title, "Collections beat the plan line");
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    const alert = await sheet.findByRole("alert");

    await expect(alert).toHaveTextContent(
      `Slide 2 was not changed. ${CHANGE_INVALID}`
    );
    await expect(alert).toHaveTextContent(
      "Upload this image to the deck first."
    );

    await userEvent.click(sheet.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      canvas.getByRole("button", {
        name: "Slide 2: Collections narrowed the gap to the plan line",
      })
    ).toBeVisible();
  },
};

const TABLE_BOX = { x: 384, y: 136, w: 536, h: 348 };

const [claim, kpi, table] = tableWithVisualSlide.elements;

/** A figure with a fill before a placed table, so a Remove of the figure shows what the table sends. */
const placedVisualsPage: DeckPageView = {
  ...deckPage,
  deck: {
    ...deckPage.deck,
    slides: [
      titleOnlySlide,
      {
        ...tableWithVisualSlide,
        elements: [
          claim!,
          { ...kpi!, style: { fill: "#EFF6FF" } },
          { ...table!, box: TABLE_BOX },
        ],
      },
    ],
  },
};

// czjw.157: the server keeps a left-out box of the element at that place, so the hand save states
// every element's box and style, and the table never takes the removed figure's fill.
export const RemoveStatesEveryPlacement: Story = {
  name: "Remove states every placement",
  args: { view: placedVisualsPage },
  globals: desktop,
  beforeEach: () => serve(placedVisualsPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    const removeFigure = await sheet.findByRole("button", {
      name: "Remove Invoiced sales",
    });

    await waitFor(() => expect(removeFigure).toBeVisible());
    await userEvent.click(removeFigure);
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));

    const [{ changes }] = changeDeck.mock.calls[0] ?? [{}];

    await expect(changes).toHaveLength(1);
    await expect(changes[0]?.op).toBe("change-slide");
    await expect(
      changes[0]?.slide.elements.map(
        (element: { kind: string; box?: unknown; style?: unknown }) => ({
          kind: element.kind,
          box: "box" in element ? element.box : "absent",
          style: "style" in element ? element.style : "absent",
        })
      )
    ).toEqual([
      { kind: "title", box: null, style: null },
      { kind: "table", box: TABLE_BOX, style: null },
    ]);
  },
};

/** Selects slide 2's figure on a phone and presses More, then Delete element. */
async function deleteFigureOnPhone(canvas: ReturnType<typeof within>) {
  await userEvent.click(
    canvas.getByRole("button", {
      name: "Slide 2: Three customers hold most of the open balance",
    })
  );
  await userEvent.click(
    within(canvas.getByRole("group", { name: "Slide editing" })).getByRole(
      "button",
      { name: "The figure" }
    )
  );
  await userEvent.click(
    within(canvas.getByRole("toolbar", { name: "Figure style" })).getByRole(
      "button",
      { name: "More" }
    )
  );
  await userEvent.click(
    within(
      await screen.findByRole("dialog", { name: "Figure actions" })
    ).getByRole("button", { name: "Delete element" })
  );
}

/** Waits for the slide's own dock, with focus on its first tool. */
async function expectSlideToolsFocused(canvas: ReturnType<typeof within>) {
  await waitFor(() =>
    expect(
      within(canvas.getByRole("toolbar", { name: "Slide tools" })).getByRole(
        "button",
        { name: "Add element" }
      )
    ).toBe(document.activeElement)
  );
}

// czjw.156 and Review Focus 1: a phone Delete states every placement, so the table keeps its own
// box and never takes the removed figure's fill, and the selection goes with the element.
export const DeleteElementOnPhone: Story = {
  name: "Delete on a phone states every placement and clears the selection",
  args: { view: placedVisualsPage },
  globals: phone,
  beforeEach: () => serve(placedVisualsPage),
  play: async ({ canvas }) => {
    await deleteFigureOnPhone(canvas);
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));

    const [{ changes }] = changeDeck.mock.calls[0] ?? [{}];

    await expect(changes).toHaveLength(1);
    await expect(changes[0]?.op).toBe("change-slide");
    await expect(changes[0]?.slideId).toBe("s9");
    await expect(
      changes[0]?.slide.elements.map(
        (element: { kind: string; box?: unknown; style?: unknown }) => ({
          kind: element.kind,
          box: "box" in element ? element.box : "absent",
          style: "style" in element ? element.style : "absent",
        })
      )
    ).toEqual([
      { kind: "title", box: null, style: null },
      { kind: "table", box: TABLE_BOX, style: null },
    ]);
    // The answer still shows the figure here, so only a cleared selection hides the dock.
    await waitFor(() =>
      expect(canvas.queryByRole("toolbar", { name: /style$/ })).toBeNull()
    );
    // The removed element's dock took focus with it, so the slide's dock takes it back.
    await expectSlideToolsFocused(canvas);
  },
};

// A refused Delete keeps the element selected and focus on More, so the person sees the refusal
// beside its dock.
export const RefusedDeleteOnPhone: Story = {
  name: "A refused Delete on a phone keeps the selection",
  args: { view: placedVisualsPage },
  globals: phone,
  beforeEach: () => {
    serve(placedVisualsPage);
    changeDeck.mockRejectedValue(
      Object.assign(new Error(CHANGE_INVALID), {
        data: { appCode: "slides:change-invalid", requestId: "req-3" },
      })
    );
  },
  play: async ({ canvas }) => {
    await deleteFigureOnPhone(canvas);

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      `Slide 2 was not changed. ${CHANGE_INVALID}`
    );
    const dock = canvas.getByRole("toolbar", { name: "Figure style" });

    // The sheet hands focus back to More, beside the refusal, not to the page body.
    await waitFor(() =>
      expect(within(dock).getByRole("button", { name: "More" })).toHaveFocus()
    );
  },
};

// Review Focus 4: an open card leaves the selected element in view, also a body text low on the
// slide: its centre never hits the Text or the Position card.
export const CardLeavesSelectionInViewOnPhone: Story = {
  name: "On a phone an open card leaves a low selection in view",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Slide 2: Collections narrowed the gap to the plan line",
      })
    );

    const body = within(
      canvas.getByRole("group", { name: "Slide editing" })
    ).getByRole("button", { name: /^Text "Cash in grew/ });

    await userEvent.click(body);

    const keepsInView = async (tool: string) => {
      await userEvent.click(
        within(canvas.getByRole("toolbar", { name: "Text style" })).getByRole(
          "button",
          { name: tool }
        )
      );

      const card = await screen.findByRole("dialog", { name: tool });

      await waitFor(() => {
        const box = body.getBoundingClientRect();

        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2
        );

        expect(card.contains(hit)).toBe(false);
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    };

    await keepsInView("Text");
    await keepsInView("Position");
  },
};

// P13-17: Done leaves the element and hands focus to the slide's first tool, not the page body.
export const DoneReturnsToSlideTools: Story = {
  name: "On a phone Done returns to the slide tools",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await selectTitle(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));

    await expect(
      canvas.queryByRole("toolbar", { name: "Title style" })
    ).toBeNull();
    await expectSlideToolsFocused(canvas);
  },
};

// P13-18: Edit text waits for the More sheet to leave, then opens the editor; the selection stays.
export const EditTextFromElementMore: Story = {
  name: "On a phone Edit text from More opens the editor",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Slide 2: Collections narrowed the gap to the plan line",
      })
    );
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Slide editing" })).getByRole(
        "button",
        { name: /^Text "Cash in grew/ }
      )
    );
    await userEvent.click(
      within(canvas.getByRole("toolbar", { name: "Text style" })).getByRole(
        "button",
        { name: "More" }
      )
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Text box actions",
    });

    // The editor opens only once the sheet has gone, never under it: no moment shows both.
    let stacked = false;

    const watch = new MutationObserver(() => {
      if (document.querySelectorAll('[role="dialog"]').length > 1) {
        stacked = true;
      }
    });

    watch.observe(document.body, { childList: true, subtree: true });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Edit text" })
    );

    const editor = await screen.findByRole("dialog", { name: "Edit slide 2" });

    watch.disconnect();
    await expect(stacked).toBe(false);
    await userEvent.click(
      within(editor).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      canvas.getByRole("toolbar", { name: "Text style" })
    ).toBeInTheDocument();
  },
};

const undoPlay: Story["play"] = async ({ canvas }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Undo" }));

  await waitFor(() =>
    expect(undoDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
    })
  );
};

// B6.4: Undo is in the toolbar with no edit sheet open, and sends the shown hash.
export const Undo: Story = {
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: undoPlay,
};

// B6.4 and B6.7: Undo shows and is hittable at 390 x 844.
export const UndoOnPhone: Story = {
  name: "Undo on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async (context) => {
    const button = context.canvas.getByRole("button", { name: "Undo" });

    await expect(button).toBeVisible();
    expect(isHittable(button)).toBe(true);
    await undoPlay(context);
  },
};

export const UndoUnavailable: Story = {
  name: "Undo unavailable",
  args: { view: { ...deckPage, deck: { ...deckPage.deck, canUndo: false } } },
  globals: desktop,
  beforeEach: () =>
    serve({ ...deckPage, deck: { ...deckPage.deck, canUndo: false } }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
  },
};

// B6.5: Refresh data sends the hash and names each slide whose figures moved.
export const RefreshData: Story = {
  name: "Refresh data",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    refreshDeck.mockResolvedValue({
      deck: deckPage.deck,
      changedSlides: ["s2", "s3"],
    });
  },
  play: async ({ canvas }) => {
    await pickFromMore(canvas, "Refresh data");

    await waitFor(() =>
      expect(refreshDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
      })
    );
    await expect(
      await canvas.findByText(
        "Figures changed on slides 2 and 3. Check that their titles still state the finding."
      )
    ).toBeVisible();
  },
};

export const RefreshDataNoChange: Story = {
  name: "Refresh data changed nothing",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await pickFromMore(canvas, "Refresh data");

    await expect(await canvas.findByText("No figure changed.")).toBeVisible();
  },
};

const NEW_HASH = "1".repeat(64);

const NEWER_HASH = "2".repeat(64);

/** The same deck after another writer changed it, with a newer figures date. */
function changedDeck(
  page: DeckPageView,
  slides: DeckPageView["deck"]["slides"],
  options?: {
    readonly hash?: string;
    readonly figuresAsOf?: string;
  }
): DeckPageView {
  return {
    ...page,
    deck: {
      ...page.deck,
      contentHash: options?.hash ?? NEW_HASH,
      figuresAsOf: options?.figuresAsOf ?? "2026-10-28",
      slides,
    },
  };
}

function retitledSlide(
  slide: DeckPageView["deck"]["slides"][number]
): DeckPageView["deck"]["slides"][number] {
  return {
    ...slide,
    elements: slide.elements.map((element, index) =>
      index === 0 && element.kind === "title"
        ? { ...element, text: "The other writer changed this slide" }
        : element
    ),
  };
}

/** Lets the page ask again with `page`, then waits until its figures date shows it. */
async function refetchWith(
  page: DeckPageView,
  canvasElement: HTMLElement,
  label = "28 Oct 2026"
): Promise<void> {
  readDeck.mockResolvedValue(page.deck);

  const before = readDeck.mock.calls.length;

  window.dispatchEvent(new Event("refetch-deck"));
  await waitFor(() =>
    expect(readDeck.mock.calls.length).toBeGreaterThan(before)
  );
  await waitFor(() =>
    expect(
      canvasElement.querySelector("[data-figures-date]")?.textContent
    ).toContain(label)
  );
}

/** The hash the notes save answers; the sheet's Save slide must send it next. */
const NOTES_HASH = "1".repeat(64);

/** The fixture deck as the server answers it after a notes save on one slide. */
function notesDeck(slideId: string, notes: string, contentHash: string) {
  return {
    ...deckPage.deck,
    contentHash,
    slides: deckPage.deck.slides.map((slide) =>
      slide.id === slideId ? { ...slide, notes } : slide
    ),
  };
}

/** Holds the next answer of a client call until the story releases it. */
function holdNext(
  call: typeof changeDeck,
  answer: DeckPageView["deck"]
): () => void {
  let release: (() => void) | undefined;

  call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(answer);
      })
  );

  return () => release?.();
}

const pause = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Review Focus 2: a poll that left before a notes save and answers after it must not put the older
// notes back in the field, nor the older hash into the next save.
export const NotesSurviveStalePoll: Story = {
  name: "Notes survive a stale poll",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockResolvedValueOnce(notesDeck("s1", "Say hello.", NEW_HASH));
  },
  play: async ({ canvas }) => {
    const answerPoll = holdNext(readDeck, deckPage.deck);

    window.dispatchEvent(new Event("refetch-deck"));
    await waitFor(() => expect(readDeck).toHaveBeenCalled());

    const notes = canvas.getByRole("textbox", { name: "Speaker notes" });

    await userEvent.type(notes, "Say hello.");
    await expect(
      await canvas.findByText("Saved", {}, { timeout: 3000 })
    ).toBeVisible();

    answerPoll();
    await pause(200);
    await expect(notes).toHaveValue("Say hello.");

    await userEvent.type(notes, " Bye.");
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHash: NEW_HASH })
    );
  },
};

// Review Focus 2: a poll that leaves while a notes save runs reads the deck before the save, and
// answers after it; its older deck must not replace the save's answer.
export const NotesSurvivePollDuringSave: Story = {
  name: "Notes survive a poll during the save",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const answerSave = holdNext(
      changeDeck,
      notesDeck("s1", "Say hello.", NEW_HASH)
    );

    const notes = canvas.getByRole("textbox", { name: "Speaker notes" });

    await userEvent.type(notes, "Say hello.");
    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce(), {
      timeout: 3000,
    });

    const answerPoll = holdNext(readDeck, deckPage.deck);

    window.dispatchEvent(new Event("refetch-deck"));
    await waitFor(() => expect(readDeck).toHaveBeenCalled());

    answerSave();
    await expect(await canvas.findByText("Saved")).toBeVisible();

    answerPoll();
    await pause(200);
    await expect(notes).toHaveValue("Say hello.");

    await userEvent.type(notes, " Bye.");
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHash: NEW_HASH })
    );
  },
};

// Review Focus 1: a pause queued behind a running save sends the hash that save answered, before
// the page has rendered it.
export const TwoNotesPausesSendTheNewerHash: Story = {
  name: "Two notes pauses send the newer hash",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const answerFirst = holdNext(changeDeck, notesDeck("s1", "One.", NEW_HASH));

    changeDeck.mockResolvedValueOnce(notesDeck("s1", "One. Two.", NEWER_HASH));

    const notes = canvas.getByRole("textbox", { name: "Speaker notes" });

    await userEvent.type(notes, "One.");
    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce(), {
      timeout: 3000,
    });
    await userEvent.type(notes, " Two.");
    await pause(1200);
    await expect(changeDeck).toHaveBeenCalledOnce();

    answerFirst();
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck).toHaveBeenNthCalledWith(1, {
      id: "deck-1",
      expectedHash: HASH,
      changes: [{ op: "change-slide-fields", slideId: "s1", notes: "One." }],
    });
    await expect(changeDeck).toHaveBeenNthCalledWith(2, {
      id: "deck-1",
      expectedHash: NEW_HASH,
      changes: [
        { op: "change-slide-fields", slideId: "s1", notes: "One. Two." },
      ],
    });
  },
};

// Final review 1: Undo inside a notes pause saves the typed notes first, then names their hash.
export const UndoInsideNotesPause: Story = {
  name: "Undo inside a notes pause takes its turn",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    undoDeck.mockResolvedValue({ ...deckPage.deck, contentHash: NEWER_HASH });
  },
  play: async ({ canvas }) => {
    const answerNotes = holdNext(
      changeDeck,
      notesDeck("s1", "Say hello.", NEW_HASH)
    );

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Speaker notes" }),
      "Say hello."
    );
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(changeDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
        changes: [
          { op: "change-slide-fields", slideId: "s1", notes: "Say hello." },
        ],
      })
    );
    await expect(undoDeck).not.toHaveBeenCalled();

    answerNotes();
    await waitFor(() =>
      expect(undoDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: NEW_HASH,
      })
    );
    await expect(changeDeck).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

/** The title of slide 1 as drawn: the title-only title slide stacks its title from 67, 67 to the frame foot, y 454 (P14-54). */
const TITLE_BOX = { x: 67, y: 67, w: 578, h: 387 };

/** Selects the title of the shown slide 1 on the stage, which also focuses it for the arrow keys. */
async function selectTitle(canvas: ReturnType<typeof within>) {
  await userEvent.click(
    within(canvas.getByRole("group", { name: "Slide editing" })).getByRole(
      "button",
      { name: /^Title "/ }
    )
  );
}

// czjw.141: Undo within 800 ms of an arrow press saves the waiting run first, then names its hash.
export const UndoInsideNudgeRun: Story = {
  name: "Undo inside an arrow run takes its turn",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    undoDeck.mockResolvedValue({ ...deckPage.deck, contentHash: NEWER_HASH });
  },
  play: async ({ canvas }) => {
    const answerRun = holdNext(changeDeck, {
      ...deckPage.deck,
      contentHash: NEW_HASH,
    });

    await selectTitle(canvas);
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(changeDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
        changes: [
          {
            op: "change-element",
            slideId: "s1",
            index: 0,
            box: { ...TITLE_BOX, x: 75 },
          },
        ],
      })
    );
    await expect(undoDeck).not.toHaveBeenCalled();

    answerRun();
    await waitFor(() =>
      expect(undoDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: NEW_HASH,
      })
    );
    await expect(changeDeck).toHaveBeenCalledOnce();
  },
};

// czjw.141: Move right after a run saves the run first and starts from its box: x + 24, then x + 32.
export const PositionAfterNudgeRun: Story = {
  name: "Position after an arrow run starts from the run's box",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    // The run's answer holds its box, so a run that saved on its own timer still gives x + 24.
    changeDeck.mockResolvedValueOnce({
      ...deckPage.deck,
      contentHash: NEW_HASH,
      slides: deckPage.deck.slides.map((slide) =>
        slide.id === "s1"
          ? {
              ...slide,
              elements: slide.elements.map((element, at) =>
                at === 0
                  ? { ...element, box: { ...TITLE_BOX, x: 91 } }
                  : element
              ),
            }
          : slide
      ),
    });
  },
  play: async ({ canvas, canvasElement }) => {
    await selectTitle(canvas);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    await userEvent.click(canvas.getByRole("button", { name: /Position/ }));

    const popover = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Position and size",
      })
    );

    const moveRight = popover.getByRole("button", { name: "Move right" });

    await waitFor(() => expect(moveRight).toBeEnabled());
    // Nothing saved yet, so the press lands inside the run.
    await expect(changeDeck).not.toHaveBeenCalled();
    await userEvent.click(moveRight);

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        changes: [
          {
            op: "change-element",
            slideId: "s1",
            index: 0,
            box: { ...TITLE_BOX, x: 91 },
          },
        ],
      })
    );
    await expect(changeDeck).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        changes: [
          {
            op: "change-element",
            slideId: "s1",
            index: 0,
            box: { ...TITLE_BOX, x: 99 },
          },
        ],
      })
    );
  },
};

// czjw.141, P16e-33: Add text inside a run saves after it, so its change-slide states the run's box;
// the title has no stored box, so the stored slide would state null and clear the run's save.
export const AddTextAfterNudgeRun: Story = {
  name: "Add text after an arrow run keeps the run's box",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await selectTitle(canvas);
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(canvas.getByRole("button", { name: "Add element" }));

    const text = await screen.findByRole("menuitem", { name: "Text" });

    // Nothing saved yet, so the add lands inside the run.
    await expect(changeDeck).not.toHaveBeenCalled();
    await userEvent.click(text);

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));

    const [{ changes }] = changeDeck.mock.calls[1] ?? [{}];

    await expect(changes[0]?.op).toBe("change-slide");
    await expect(changes[0]?.slide.elements[0]?.box).toEqual({
      ...TITLE_BOX,
      x: 75,
    });
  },
};

const RECOLOR_NOTE = "Text colors changed to stay readable.";

/** The deck after a background pick saved, at a hash of its own. */
const recoloredDeck = { ...deckPage.deck, contentHash: NEW_HASH };

/** Serves the deck page; the background pick answers `NEW_HASH`, and from then on so does a read. */
function serveRecolor() {
  serve(deckPage);
  changeDeck.mockImplementationOnce(async () => {
    readDeck.mockResolvedValue(recoloredDeck);

    return recoloredDeck;
  });
}

/** Picks one Background swatch on the shown slide 1, whose title has no fill. */
async function pickBackground(canvas: ReturnType<typeof within>, name: string) {
  await userEvent.click(canvas.getByRole("button", { name: "Background" }));
  await userEvent.click(await screen.findByRole("button", { name }));
}

const backgroundStep = (background: string) => ({
  op: "change-slide-fields",
  slideId: "s1",
  background,
});

/** The status note that holds the recolor sentence; the page's own Undo has the same name. */
async function findRecolorNote(canvas: ReturnType<typeof within>) {
  const sentence = await canvas.findByText(RECOLOR_NOTE);

  const note = sentence.closest('[role="status"]');

  if (!(note instanceof HTMLElement)) throw new Error("no status note");

  return within(note);
}

// czjw.161: a pick that recolors a text says so, and the note's Undo undoes that save only.
export const RecolorNote: Story = {
  name: "A background pick that recolors text says so, with Undo",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: serveRecolor,
  play: async ({ canvas }) => {
    await pickBackground(canvas, "Light gray #F3F4F6");

    await waitFor(() =>
      expect(changeDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
        changes: [
          backgroundStep("#F3F4F6"),
          {
            op: "change-element",
            slideId: "s1",
            index: 0,
            style: { color: "#111827" },
          },
        ],
      })
    );

    const note = await findRecolorNote(canvas);

    await userEvent.click(note.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(undoDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: NEW_HASH,
      })
    );
    await waitFor(() => expect(canvas.queryByText(RECOLOR_NOTE)).toBeNull());
  },
};

// E5 (6wz1.113): the recolor note stays open, so the icon check measures it.
export const RecolorNoteShown: Story = {
  name: "The recolor note keeps its Undo inside the note",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: serveRecolor,
  play: async ({ canvas }) => {
    await pickBackground(canvas, "Light gray #F3F4F6");

    const note = await findRecolorNote(canvas);

    await expect(note.getByRole("button", { name: "Undo" })).toBeVisible();
  },
};

// P16e-11: a pick whose texts all stay readable sends one step and shows no note.
export const NoRecolorNoNote: Story = {
  name: "A background pick that recolors nothing shows no note",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: serveRecolor,
  play: async ({ canvas }) => {
    await pickBackground(canvas, "Dark blue #1E3A8A");

    await waitFor(() =>
      expect(changeDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
        changes: [backgroundStep("#1E3A8A")],
      })
    );
    // The answer renders within a frame; the note would show by then.
    await pause(300);
    await expect(canvas.queryByText(RECOLOR_NOTE)).toBeNull();
  },
};

// Review Focus 3: any later save moves the hash, so the note goes and never comes back, even when
// a further save brings the deck back to the recolor's content (the hash is of content only).
export const RecolorNoteLeavesAfterTheNextSave: Story = {
  name: "The recolor note leaves after the next save",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: serveRecolor,
  play: async ({ canvas }) => {
    await pickBackground(canvas, "Light gray #F3F4F6");
    await findRecolorNote(canvas);

    changeDeck.mockResolvedValueOnce(notesDeck("s1", "Say hello.", NEWER_HASH));
    changeDeck.mockResolvedValueOnce(recoloredDeck);

    const notes = canvas.getByRole("textbox", { name: "Speaker notes" });

    await userEvent.type(notes, "Say hello.");
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await waitFor(() => expect(canvas.queryByText(RECOLOR_NOTE)).toBeNull());

    // Clearing the notes saves the recolor's content again, at its hash: the note stays gone.
    await userEvent.clear(notes);
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(3), {
      timeout: 3000,
    });
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHash: NEWER_HASH })
    );
    await pause(300);
    await expect(canvas.queryByText(RECOLOR_NOTE)).toBeNull();
  },
};

// Review Focus 3: the note's Undo inside a notes pause saves the notes first, which moves the hash,
// so it undoes nothing: the person's notes stay, and the note goes.
export const RecolorUndoInsideNotesPause: Story = {
  name: "The recolor note's Undo inside a notes pause undoes nothing",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: serveRecolor,
  play: async ({ canvas }) => {
    await pickBackground(canvas, "Light gray #F3F4F6");

    const note = await findRecolorNote(canvas);

    changeDeck.mockResolvedValueOnce(notesDeck("s1", "Say hello.", NEWER_HASH));

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Speaker notes" }),
      "Say hello."
    );
    await userEvent.click(note.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(changeDeck).toHaveBeenLastCalledWith({
        id: "deck-1",
        expectedHash: NEW_HASH,
        changes: [
          { op: "change-slide-fields", slideId: "s1", notes: "Say hello." },
        ],
      })
    );
    await waitFor(() => expect(canvas.queryByText(RECOLOR_NOTE)).toBeNull());
    await pause(300);
    await expect(undoDeck).not.toHaveBeenCalled();
  },
};

// A notes pause still waiting when Save slide is pressed saves first; the slide save waits for its
// answer and names the hash it answered, not the one the sheet opened with.
export const SaveSlideAndNotesTakeTurns: Story = {
  name: "Save slide and a notes pause take turns",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const answerNotes = holdNext(
      changeDeck,
      notesDeck("s1", "Point at it.", NOTES_HASH)
    );

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Speaker notes" }),
      "Point at it."
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    await userEvent.type(sheet.getByRole("textbox", { name: "Title" }), "!");
    // The pause has not ended yet, so only the press can send the notes first.
    await expect(changeDeck).not.toHaveBeenCalled();
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce());
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
      changes: [
        { op: "change-slide-fields", slideId: "s1", notes: "Point at it." },
      ],
    });
    await pause(300);
    await expect(changeDeck).toHaveBeenCalledOnce();

    answerNotes();
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedHash: NOTES_HASH,
        changes: [
          expect.objectContaining({ op: "change-slide", slideId: "s2" }),
        ],
      })
    );
  },
};

// Notes pick C (czjw.156): at 390 px the slide, then the notes pane; a pause saves one
// notes step and says Saved, and the Edit slide sheet holds no notes field.
export const NotesPaneOnPhone: Story = {
  name: "Notes in a pane under the slide on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockResolvedValueOnce(
      notesDeck("s2", "Point at the September bar.", NOTES_HASH)
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Slide 2: Collections narrowed the gap to the plan line",
      })
    );

    const slide = canvas.getByRole("group", { name: "Slide editing" });
    const edit = canvas.getByRole("button", { name: "Edit slide" });
    const notes = canvas.getByRole("textbox", { name: "Speaker notes" });

    await expect(notes).toBeVisible();
    // czjw.176: Edit slide moved from between the two into the dock.
    await expect(slide.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      notes.getBoundingClientRect().top
    );

    // czjw.176 (P13-12): below 768 px the field sits in a card, the box has no resize grip, and
    // the help line and the count share one row.
    const card = getComputedStyle(
      notes.closest<HTMLElement>('[data-slot="field"]')!.parentElement!
    );

    await expect(card.borderTopStyle).toBe("solid");
    await expect(card.borderTopWidth).toBe("1px");
    await expect(card.borderTopLeftRadius).toBe("12px");
    await expect(getComputedStyle(notes).resize).toBe("none");

    const [help, count] = notes
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)!);

    await expect(help).toHaveTextContent(
      "Only you see notes. They go to PowerPoint."
    );
    await expect(
      Math.abs(
        help!.getBoundingClientRect().top - count!.getBoundingClientRect().top
      )
    ).toBeLessThanOrEqual(2);

    await userEvent.type(notes, "Point at the September bar.");
    await waitFor(
      () =>
        expect(changeDeck).toHaveBeenCalledWith({
          id: "deck-1",
          expectedHash: HASH,
          changes: [
            {
              op: "change-slide-fields",
              slideId: "s2",
              notes: "Point at the September bar.",
            },
          ],
        }),
      { timeout: 3000 }
    );
    await expect(await canvas.findByText("Saved")).toBeVisible();
    await expect(changeDeck).toHaveBeenCalledOnce();

    await userEvent.click(edit);

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    await expect(sheet.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Collections narrowed the gap to the plan line"
    );
    await expect(
      sheet.queryByRole("textbox", { name: "Speaker notes" })
    ).toBeNull();
  },
};

// C1(a): the editor sends the hash and content the person saw, so a newer refetch answers
// deck-changed and the typed title stays.
export const StaleEditorKeepsSeenHash: Story = {
  name: "Stale editor keeps the hash it saw",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockRejectedValue(
      Object.assign(new Error(DECK_CHANGED), {
        data: { appCode: "slides:deck-changed", requestId: "req-4" },
      })
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    const title = sheet.getByRole("textbox", { name: "Title" });

    await waitFor(() => expect(title).toBeVisible());

    await refetchWith(
      changedDeck(
        deckPage,
        deckPage.deck.slides.map((slide, index) =>
          index === 1 ? retitledSlide(slide) : slide
        )
      ),
      canvasElement
    );

    await userEvent.clear(title);
    await userEvent.type(title, "My edit of the claim");
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
    await expect(changeDeck).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHash: HASH })
    );

    const alert = await sheet.findByRole("alert");

    await expect(alert).toHaveTextContent(DECK_CHANGED);
    await expect(title).toHaveValue("My edit of the claim");
  },
};

// C1(b): the editor names the slide by id, so a reorder never moves the edit to another slide.
export const StaleEditorTargetsSlideId: Story = {
  name: "Stale editor targets the slide id",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    const title = sheet.getByRole("textbox", { name: "Title" });

    await waitFor(() => expect(title).toBeVisible());

    // Slide 2 moves to place 1, so place 2 now holds slide 1.
    await refetchWith(
      changedDeck(deckPage, [
        deckPage.deck.slides[1]!,
        deckPage.deck.slides[0]!,
        ...deckPage.deck.slides.slice(2),
      ]),
      canvasElement
    );

    await userEvent.clear(title);
    await userEvent.type(title, "My edit of the claim");
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
    await expect(changeDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedHash: HASH,
        changes: [
          expect.objectContaining({ op: "change-slide", slideId: "s2" }),
        ],
      })
    );
  },
};

// I1: while one deck write runs, every other write control is off.
export const BusyWhileRefreshing: Story = {
  name: "Busy while refreshing",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    refreshDeck.mockImplementation(() => new Promise(() => undefined));
  },
  play: async ({ canvas }) => {
    await pickFromMore(canvas, "Refresh data");

    await waitFor(() => expect(refreshDeck).toHaveBeenCalledTimes(1));
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Actions for slide 1" })
    ).toBeDisabled();
  },
};

// I4: Reload renews the open editor's hash, keeps the typed title, and the next Save succeeds.
export const ReloadRenewsTheHash: Story = {
  name: "Reload renews the hash",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockRejectedValue(
      Object.assign(new Error(DECK_CHANGED), {
        data: { appCode: "slides:deck-changed", requestId: "req-5" },
      })
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    const title = sheet.getByRole("textbox", { name: "Title" });

    await waitFor(() => expect(title).toBeVisible());
    await userEvent.clear(title);
    await userEvent.type(title, "My edit of the claim");

    const retitled = changedDeck(
      deckPage,
      deckPage.deck.slides.map((slide, index) =>
        index === 1 ? retitledSlide(slide) : slide
      )
    );

    await refetchWith(retitled, canvasElement);

    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    const alert = await sheet.findByRole("alert");

    await expect(alert).toHaveTextContent(DECK_CHANGED);
    await expect(title).toHaveValue("My edit of the claim");

    const reloaded = changedDeck(
      deckPage,
      deckPage.deck.slides.map((slide, index) =>
        index === 1 ? retitledSlide(slide) : slide
      ),
      { hash: NEWER_HASH, figuresAsOf: "2026-10-29" }
    );

    readDeck.mockResolvedValue(reloaded.deck);
    changeDeck.mockResolvedValue(reloaded.deck);

    await userEvent.click(
      within(alert).getByRole("button", { name: "Reload" })
    );

    await waitFor(() =>
      expect(
        canvasElement.querySelector("[data-figures-date]")?.textContent
      ).toContain("29 Oct 2026")
    );
    await waitFor(() => expect(sheet.queryByRole("alert")).toBeNull());
    await expect(title).toHaveValue("My edit of the claim");

    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHash: NEWER_HASH })
    );
  },
};

const RENAME = "Rename deck, Receivables at a glance";

// Bug caught: the rename is not one `rename` change, or it is sent at a hash the person never saw.
export const RenameInPlace: Story = {
  name: "Rename in place",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockResolvedValue({
      ...deckPage.deck,
      title: "Collections review",
      contentHash: NEW_HASH,
    });
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: RENAME });
    const buttonWidth = button.getBoundingClientRect().width;

    await userEvent.click(button);

    // Bug caught: the header's column shrink-wraps the input to a few characters of the title.
    await expect(
      canvas
        .getByRole("textbox", { name: "Deck title" })
        .getBoundingClientRect().width
    ).toBeGreaterThanOrEqual(buttonWidth);

    await userEvent.keyboard("Collections review{Enter}");

    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce());
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      changes: [{ op: "rename", title: "Collections review" }],
      expectedHash: HASH,
    });

    // The saved title shows, and focus returns to it.
    const renamed = await canvas.findByRole("button", {
      name: "Rename deck, Collections review",
    });

    await expect(renamed).toHaveFocus();
    await expect(
      canvas.queryByRole("textbox", { name: "Deck title" })
    ).toBeNull();
  },
};

// R-53: a rename keeps the hash it opened at; a refusal keeps the typed title, and Reload renews it.
export const RenameRefusedKeepsTheInput: Story = {
  name: "Rename refused keeps the input",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => {
    serve(deckPage);
    changeDeck.mockRejectedValue(
      Object.assign(new Error(DECK_CHANGED), {
        data: { appCode: "slides:deck-changed", requestId: "req-6" },
      })
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: RENAME }));

    const input = canvas.getByRole("textbox", { name: "Deck title" });

    await userEvent.keyboard("Collections review");

    // Another writer moves the deck while the input is open.
    await refetchWith(
      changedDeck(deckPage, deckPage.deck.slides),
      canvasElement
    );
    await userEvent.keyboard("{Enter}");

    // Bug caught: the save takes the newer hash it never showed, and overwrites the other writer.
    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce());
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHash: HASH })
    );

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent(DECK_CHANGED);
    await expect(input).toHaveValue("Collections review");

    const reloaded = changedDeck(deckPage, deckPage.deck.slides, {
      hash: NEWER_HASH,
      figuresAsOf: "2026-10-29",
    });

    readDeck.mockResolvedValue(reloaded.deck);
    changeDeck.mockResolvedValue({
      ...reloaded.deck,
      title: "Collections review",
    });

    await userEvent.click(
      within(alert).getByRole("button", { name: "Reload" })
    );

    await waitFor(() => expect(canvas.queryByRole("alert")).toBeNull());
    await expect(input).toHaveValue("Collections review");

    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHash: NEWER_HASH })
    );
  },
};

// C1 (M-c): a refetch that removes the open slide shows the deck-changed line, not an empty sheet.
export const VanishedSlide: Story = {
  name: "Vanished slide",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRefetch],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: /^Edit slide \d+$/ })
    );

    const title = sheet.getByRole("textbox", { name: "Title" });

    await waitFor(() => expect(title).toBeVisible());

    await refetchWith(
      changedDeck(
        deckPage,
        deckPage.deck.slides.filter((slide) => slide.id !== "s2")
      ),
      canvasElement
    );

    const alert = await sheet.findByRole("alert");

    await expect(alert).toHaveTextContent(DECK_CHANGED);
    await expect(
      within(alert).getByRole("button", { name: "Reload" })
    ).toBeVisible();
    await expect(title).toBeVisible();
  },
};

const EXPORT_FAILED = "The file could not be saved.";

// B7.7: Export is off and reads "Exporting…" while it runs, with every other write off too, and a
// refusal is one alert line. The success path navigates away, so B9.1 proves it end to end.
const exportPlay: Story["play"] = async ({ canvas }) => {
  const pending = Promise.withResolvers<never>();

  exportDeck.mockReturnValue(pending.promise);

  await userEvent.click(
    canvas.getByRole("button", { name: "Export to PowerPoint" })
  );

  await waitFor(() =>
    expect(canvas.getByRole("button", { name: "Exporting…" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
  );
  await expect(canvas.getByRole("button", { name: "More" })).toBeDisabled();
  await expect(exportDeck).toHaveBeenCalledWith({ id: "deck-1" });

  pending.reject(new Error(EXPORT_FAILED));

  await expect(await canvas.findByRole("alert")).toHaveTextContent(
    `The deck was not exported. ${EXPORT_FAILED}`
  );
  await expect(
    canvas.getByRole("button", { name: "Export to PowerPoint" })
  ).toBeEnabled();
};

export const ExportRefused: Story = {
  name: "Export refused",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: exportPlay,
};

// The phone reaches Export through the dock's More sheet: one export, a refusal as one alert line,
// and the row usable again after it.
export const ExportRefusedOnPhone: Story = {
  name: "Export refused on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const pending = Promise.withResolvers<never>();

    exportDeck.mockReturnValue(pending.promise);

    await pickFromMoreSheet(canvas, "Export to PowerPoint");
    await waitFor(() => expect(exportDeck).toHaveBeenCalledOnce());
    await expect(exportDeck).toHaveBeenCalledWith({ id: "deck-1" });

    pending.reject(new Error(EXPORT_FAILED));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      `The deck was not exported. ${EXPORT_FAILED}`
    );
    await expect(
      (await openMore(canvas)).getByRole("button", {
        name: "Export to PowerPoint",
      })
    ).not.toHaveAttribute("aria-disabled");
  },
};

// S7-48: the deck page while the agent drafts it. The run is read at the `agent` client, as the
// page reads it in the app, with no panel open unless the story says so (Review Focus 3).

const SESSION = "session-1";

/** The deck's chat with its run in the given state, as `agent.sessions` answers it. */
function chatOf(
  run: AgentSessionSummary["run"],
  title = PROVISIONAL_TITLE
): AgentSessionSummary {
  return {
    id: SESSION,
    title,
    modelId: "openai/gpt-6.1-terra",
    surface: "slides",
    recordId: "deck-1",
    runState:
      run === "building" ? "running" : run === "stopping" ? "stopping" : null,
    run,
    updatedAt: "2026-11-15T09:00:00.000Z",
    handedFromSessionId: null,
  };
}

/** The deck and its run: building on the first read, then `end` on every later read. */
function serveRun(page: DeckPageView, end?: AgentSessionSummary["run"]) {
  serve(page);
  sessions.mockResolvedValue([chatOf(end ?? "building")]);

  if (end !== undefined) sessions.mockResolvedValueOnce([chatOf("building")]);
}

/** The run's poll ends a run within about a second; the end shows once the page reads it. */
const RUN_END = { timeout: 4000 };

/** The draft pill, once the run's read reached the page. */
const pill = (canvas: ReturnType<typeof within>, text: string, wait = {}) =>
  waitFor(() => {
    const found = canvas.getByText(text);

    expect(found.closest("[role=status]")).not.toBeNull();

    return found;
  }, wait);

/** Every control that edits the deck by hand: none may be enabled while the run builds. */
const HAND_EDITS =
  /^(Undo|Add slide|Add element|Background|Edit slide|Refresh data|Rename deck(, .+)?|More|Actions for slide \d+)$/;

function enabledHandEdits(canvas: ReturnType<typeof within>) {
  return canvas
    .queryAllByRole("button", { name: HAND_EDITS })
    .filter((button: HTMLElement) => !button.hasAttribute("disabled"));
}

export const DraftingUnnamed: Story = {
  name: "Drafting, not named yet",
  args: { view: startedDeckPage },
  globals: desktop,
  beforeEach: () => serveRun(startedDeckPage),
  play: async ({ canvas, canvasElement }) => {
    await pill(canvas, "Drafting slide 1");

    // Review Focus 5 start: the provisional title is not shown as the deck's name.
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Naming the deck" })
    ).toHaveClass("sr-only");
    await expect(
      canvasElement.querySelector(
        "[data-shell-page-header] [data-slot=skeleton]"
      )
    ).toBeVisible();
    await expect(canvas.queryByText(PROVISIONAL_TITLE)).toBeNull();

    await expect(
      canvas.getByText(/Reading your records/).closest("[role=status]")
    ).not.toBeNull();
    await expect(canvas.queryByText("No slides yet")).toBeNull();

    await expect(canvas.getByRole("button", { name: "Stop" })).toBeVisible();

    for (const name of ["Export to PowerPoint", "More", "Present"]) {
      expect(canvas.queryByRole("button", { name })).toBeNull();
    }
  },
};

export const DraftingHandedOver: Story = {
  name: "Drafting, handed over from Ask",
  args: { view: startedDeckPage },
  globals: desktop,
  beforeEach: () => {
    serve(startedDeckPage);
    // Ask's hand-over gives the deck and its chat the brief's title, and the build never renames.
    sessions.mockResolvedValue([
      { ...chatOf("building"), handedFromSessionId: "ask-session-1" },
    ]);
  },
  play: async ({ canvas, canvasElement }) => {
    await pill(canvas, "Drafting slide 1");

    // Bug caught: a handed-over deck showed "Naming the deck" for its whole build.
    await expect(
      canvas.getByRole("heading", { level: 1, name: PROVISIONAL_TITLE })
    ).toBeVisible();
    await expect(
      canvasElement.querySelector(
        "[data-shell-page-header] [data-slot=skeleton]"
      )
    ).toBeNull();
  },
};

export const DraftingNamed: Story = {
  name: "Drafting, named",
  args: { view: draftedDeckPage },
  globals: desktop,
  beforeEach: () => serveRun(draftedDeckPage),
  play: async ({ canvas }) => {
    await pill(canvas, "Drafting slide 3");

    const rail = within(canvas.getByRole("navigation", { name: "Slides" }));

    // Bug caught: the rail hides the slide in work, or shows the planned count it cannot know.
    await expect(
      rail.getAllByRole("button", { name: /^Slide \d: / })
    ).toHaveLength(2);
    await expect(
      rail.getByText("Slide 3, not drafted yet")
    ).toBeInTheDocument();

    // The newest slide shows, so the person watches the draft grow.
    await expect(
      rail.getByRole("button", {
        name: "Slide 2: Collections narrowed the gap to the plan line",
      })
    ).toHaveAttribute("aria-current", "true");

    // Plain text: renaming opens only when the run ends.
    await expect(
      canvas.getByRole("heading", {
        level: 1,
        name: "October collections update",
      })
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /Rename/ })).toBeNull();

    // Review Focus 4: a hand edit moves the hash and the agent's next change is refused.
    await expect(enabledHandEdits(canvas)).toEqual([]);
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};

export const StopEndsTheRun: Story = {
  name: "Stop ends the run",
  args: { view: draftedDeckPage },
  globals: desktop,
  beforeEach: () => {
    serveRun(draftedDeckPage);
    // The stop is still on its way while the story looks.
    stop.mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvas }) => {
    await pill(canvas, "Drafting slide 3");

    const button = canvas.getByRole("button", { name: "Stop" });

    // Bug caught: a double click sends two stops.
    await userEvent.dblClick(button);

    await expect(stop).toHaveBeenCalledTimes(1);
    await expect(stop).toHaveBeenCalledWith({ id: SESSION });

    // Bug caught: the spinner hides the label (DESIGN.md: a loading button keeps its label).
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    await expect(within(button).getByText("Stop")).toBeVisible();
  },
};

export const StopFails: Story = {
  name: "Stop fails",
  args: { view: draftedDeckPage },
  globals: desktop,
  beforeEach: () => {
    serveRun(draftedDeckPage);
    stop.mockRejectedValue(new Error("The connection dropped."));
  },
  play: async ({ canvas }) => {
    await pill(canvas, "Drafting slide 3");
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));

    // Bug caught: a failed stop leaves Stop spinning and silent until a reload.
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Ask was not stopped. The connection dropped."
    );
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Stop" })).not.toHaveAttribute(
        "aria-busy"
      )
    );
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(stop).toHaveBeenCalledTimes(2);
  },
};

export const LockedUntilTheRunIsRead: Story = {
  name: "Locked until the run is read",
  args: { view: draftedDeckPage },
  globals: desktop,
  parameters: { runRead: "pending" },
  beforeEach: () => {
    serve(draftedDeckPage);
    // A reload mid-build: the first read of the deck's chats has not landed.
    sessions.mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", {
        level: 1,
        name: "October collections update",
      })
    ).toBeVisible();
    await expect(sessions).toHaveBeenCalled();

    // Bug caught (Review Focus 4): the page is editable for one request after a reload mid-build.
    await expect(enabledHandEdits(canvas)).toEqual([]);
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};

export const Stopped: Story = {
  args: { view: draftedDeckPage },
  globals: desktop,
  beforeEach: () => serveRun(draftedDeckPage, "stopped"),
  play: async ({ canvas }) => {
    const found = await pill(canvas, "Stopped, 2 slides kept", RUN_END);

    // The gray draft style of DESIGN.md, not the success green.
    await expect(found.closest("[data-slot=badge]")).toHaveClass("bg-gray-100");

    const rail = within(canvas.getByRole("navigation", { name: "Slides" }));

    await expect(
      rail.getAllByRole("button", { name: /^Slide \d: / })
    ).toHaveLength(2);
    await expect(rail.queryByText(/not drafted yet/)).toBeNull();

    await expect(canvas.getByRole("button", { name: "Undo" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "More" })).toBeEnabled();
  },
};

const readyPlay: Story["play"] = async ({ canvas }) => {
  await pill(canvas, "2 slides drafted", RUN_END);

  for (const name of ["Export to PowerPoint", "More", "Present"]) {
    expect(canvas.getByRole("button", { name })).toBeEnabled();
  }

  await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
};

export const Ready: Story = {
  args: { view: draftedDeckPage },
  globals: desktop,
  beforeEach: () => serveRun(draftedDeckPage, "saved"),
  play: async (context) => {
    await readyPlay(context);

    const { canvas } = context;

    // The deck opens at its first slide, as a deck made by hand does.
    await expect(canvas.getByText("Slide 1 of 2")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeEnabled();
  },
};

export const ReadyEmpty: Story = {
  name: "Ready with no slide",
  args: { view: startedDeckPage },
  globals: desktop,
  beforeEach: () => serveRun(startedDeckPage, "saved"),
  play: async ({ canvas }) => {
    await pill(canvas, "0 slides drafted", RUN_END);
    await expect(canvas.getByText("No slides yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Present" })
    ).toHaveAttribute("aria-disabled", "true");
    // Review Focus 5: the run ended without a rename, so the title shows at last.
    await expect(
      canvas.getByRole("heading", { level: 1, name: PROVISIONAL_TITLE })
    ).toBeVisible();
  },
};

export const FailedHalfWay: Story = {
  name: "Failed half way",
  args: { view: unnamedDraftedDeckPage },
  globals: desktop,
  beforeEach: () => serveRun(unnamedDraftedDeckPage, "failed"),
  play: async ({ canvas }) => {
    await pill(canvas, "Drafting did not finish. 2 slides drafted", RUN_END);

    // Review Focus 5: no loading title for ever after a failure.
    await expect(
      canvas.getByRole("heading", { level: 1, name: PROVISIONAL_TITLE })
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "More" })).toBeEnabled();
  },
};

/** Lets a story read the deck's run again at once, as the 10 s idle poll does. */
function withRunRefetch(Story: () => ReactNode) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = () => {
      void queryClient.refetchQueries({ queryKey: ["agent", "sessions"] });
    };

    window.addEventListener("refetch-run", handler);

    return () => window.removeEventListener("refetch-run", handler);
  }, [queryClient]);

  return <Story />;
}

export const PanelRunKeepsTheShownSlide: Story = {
  name: "A run from the panel keeps the shown slide",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRunRefetch],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const third = canvas.getByRole("button", { name: /^Slide 3: / });

    await userEvent.click(third);

    // The person asks the agent for a change in the panel; the page sees the run, then its end.
    sessions
      .mockResolvedValueOnce([chatOf("building", deckPage.deck.title)])
      .mockResolvedValue([chatOf("saved", deckPage.deck.title)]);
    window.dispatchEvent(new Event("refetch-run"));

    await pill(canvas, "Drafting slide 6");
    await pill(canvas, "5 slides drafted", RUN_END);

    // Bug caught: the end of a run sends the person back to slide 1.
    await expect(
      canvas.getByRole("button", { name: /^Slide 3: / })
    ).toHaveAttribute("aria-current", "true");
  },
};

// Bug caught: a title left open across a run reopens after it, takes focus and sends the pre-run hash.
export const RunClosesTheTitle: Story = {
  name: "A run closes the open title",
  args: { view: deckPage },
  globals: desktop,
  decorators: [withRunRefetch],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Rename deck, Receivables at a glance",
      })
    );
    await userEvent.keyboard("Half typed");

    // The person asks the agent in the panel while the title is open.
    sessions
      .mockResolvedValueOnce([chatOf("building", deckPage.deck.title)])
      .mockResolvedValue([chatOf("saved", deckPage.deck.title)]);
    window.dispatchEvent(new Event("refetch-run"));

    await pill(canvas, "Drafting slide 6");
    await pill(canvas, "5 slides drafted", RUN_END);

    await expect(
      canvas.queryByRole("textbox", { name: "Deck title" })
    ).toBeNull();
    await expect(
      canvas.getByRole("button", {
        name: "Rename deck, Receivables at a glance",
      })
    ).toBeVisible();
  },
};

export const NoAgent: Story = {
  name: "No agent for this person",
  args: { view: noChatDeckPage },
  globals: desktop,
  beforeEach: () => serve(noChatDeckPage),
  play: async ({ canvas, canvasElement }) => {
    // Bug caught: a deck page that breaks, or asks the refused `agent` area, for a person without Ask.
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Receivables at a glance" })
    ).toBeVisible();
    await expect(
      canvasElement.querySelector("[data-figures-date]")
    ).toHaveTextContent("5 slides · Figures as of 27 Oct 2026");
    await expect(canvas.getByRole("button", { name: "Present" })).toBeEnabled();
    await expect(sessions).not.toHaveBeenCalled();
  },
};

const DECK_PATH = "/m/slides/decks/deck-1";

/** The app's shell with the agent panel, so the phone panel is a bottom sheet over the page. */
function withShell(Story: () => ReactNode) {
  return (
    <AppShell
      chrome="workspace"
      currentPath={DECK_PATH}
      navigation={{
        workspace: [
          { id: "slides-decks", label: "Slides", href: "/m/slides/decks" },
        ],
        pinned: [],
        categories: [],
        admin: [],
      }}
      identity={{
        companyName: "Genie Ops",
        productName: "Ops Center",
        logoLightUrl: null,
        logoDarkUrl: null,
        markUrl: null,
      }}
      user={{ name: "Alex Morgan", email: "alex.morgan@example.test" }}
      menu={{
        accountHref: "/account",
        changePasswordHref: null,
        switchTarget: null,
        supportHref: null,
        signOutAction: "/api/auth/sign-out",
      }}
      strings={{
        workspace: "Workspace",
        adminPortal: "Admin portal",
        pinned: "Pinned",
        categories: "Categories",
        navigation: "Navigation",
        openNavigation: "Open navigation",
        closeNavigation: "Close navigation",
        collapseMenu: "Collapse menu",
        expandMenu: "Expand menu",
        menuShortcut: "Ctrl B",
        backTo: "Back to {page}",
        offline: "You are offline.",
        pageContent: "Page content",
        account: "Account",
        ask: "Ask",
        entryWorking: "{label}, {count} working",
        openNavigationOneWorking: "Open navigation, 1 chat working",
        openNavigationWorking: "Open navigation, {count} chats working",
        changePassword: "Change password",
        opensInNewTab: "Opens in a new tab",
        helpAndSupport: "Help and support",
        signOut: "Sign out",
      }}
      agentPanel={
        <AgentPanelHost
          person="person-1"
          models={null}
          labels={{ steps: {}, datasets: {}, fields: {} }}
          suggestions={[]}
          inbox={[]}
          timeZone="UTC"
          surfaces={[
            {
              id: "slides",
              name: "Slides agent",
              recordPage: "/m/slides/decks/:id",
              acceptsHandoff: false,
            },
          ]}
          path={DECK_PATH}
        />
      }
    >
      <Story />
    </AppShell>
  );
}

/** P11-52: with the bottom panel open, the end of the page scrolls into view above it. */
async function pageEndAbovePanel(
  canvas: ReturnType<typeof within>,
  canvasElement: HTMLElement
) {
  await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

  const panel = await canvas.findByRole("complementary", {
    name: "Ask",
  });

  const content = canvasElement.querySelector<HTMLElement>(
    "[data-shell-content]"
  )!;

  const rail = canvas.getByRole("navigation", { name: "Slides" });
  const slide = canvasElement.querySelector<HTMLElement>("[data-shown-slide]")!;

  await waitFor(() => {
    content.scrollTo({ top: content.scrollHeight });

    for (const part of [rail, slide]) {
      expect(part.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        panel.getBoundingClientRect().top
      );
    }
  });
}

export const DraftingOnPhone: Story = {
  name: "Drafting on a phone",
  args: { view: draftedDeckPage },
  globals: phone,
  parameters: { layout: "fullscreen" },
  decorators: [withShell],
  beforeEach: () => serveRun(draftedDeckPage),
  play: async ({ canvas, canvasElement }) => {
    await pill(canvas, "Drafting slide 3");
    await expect(canvas.getByRole("button", { name: "Stop" })).toBeVisible();
    await pageEndAbovePanel(canvas, canvasElement);
  },
};

// P15-47 (C15-2): one progress line and one Stop. While the panel shows the run, its live row and
// its Stop are the only ones; with the panel closed, the page's pill and Stop are.
export const DraftingBesideThePanel: Story = {
  name: "Drafting beside the open panel",
  args: { view: draftedDeckPage },
  globals: desktop,
  parameters: { layout: "fullscreen" },
  decorators: [withShell],
  beforeEach: () => serveRun(draftedDeckPage),
  play: async ({ canvas }) => {
    await pill(canvas, "Drafting slide 3");
    await expect(canvas.getByRole("button", { name: "Stop" })).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const panel = await canvas.findByRole("complementary", { name: "Ask" });

    await waitFor(() =>
      expect(canvas.queryByText("Drafting slide 3")).toBeNull()
    );
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();

    await userEvent.click(
      within(panel).getByRole("button", { name: "Close Ask" })
    );
    await pill(canvas, "Drafting slide 3");
    await expect(canvas.getByRole("button", { name: "Stop" })).toBeVisible();
  },
};

/** The deck page's route trail, as core gives it to a module page (R-1a). */
function withTrail(Story: () => ReactNode) {
  return (
    <PageTrailProvider
      value={{
        parent: { label: "Slides", href: "/m/slides/decks" },
        current: deckPage.deck.title,
      }}
    >
      <Story />
    </PageTrailProvider>
  );
}

/** Rename deck from the More sheet; the title input opens once the sheet has gone, with focus. */
async function renameFromMore(
  canvas: ReturnType<typeof within>
): Promise<HTMLElement> {
  await userEvent.click(
    (await openMore(canvas)).getByRole("button", { name: "Rename deck" })
  );

  return waitFor(() => {
    const input = canvas.getByRole("textbox", { name: "Deck title" });

    expect(input).toBeVisible();
    expect(input).toBe(document.activeElement);

    return input;
  });
}

// P13-8, Review Focus 2: the sheet's focus return must not blur, save and close the input at once.
export const RenameFromMoreOnPhone: Story = {
  name: "Rename from More on a phone",
  args: { view: deckPage },
  globals: phone,
  parameters: { layout: "fullscreen" },
  decorators: [withTrail, withShell],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas, canvasElement }) => {
    const input = await renameFromMore(canvas);

    // Bug caught: the input sits under the top bar, out of sight or out of reach of a tap.
    await expect(isHittable(input)).toBe(true);
    await expect(input.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      canvasElement
        .querySelector<HTMLElement>("[data-page-top-bar]")!
        .getBoundingClientRect().bottom
    );
    await expect(changeDeck).not.toHaveBeenCalled();

    await userEvent.keyboard("Collections review{Enter}");

    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce());
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
      changes: [{ op: "rename", title: "Collections review" }],
    });
    await waitFor(() =>
      expect(canvas.queryByRole("textbox", { name: "Deck title" })).toBeNull()
    );

    await renameFromMore(canvas);
    await userEvent.keyboard("Another title{Escape}");

    await waitFor(() =>
      expect(canvas.queryByRole("textbox", { name: "Deck title" })).toBeNull()
    );
    await expect(changeDeck).toHaveBeenCalledOnce();
  },
};

export const ReadyOnPhone: Story = {
  name: "Ready on a phone",
  args: { view: draftedDeckPage },
  globals: phone,
  parameters: { layout: "fullscreen" },
  decorators: [withShell],
  beforeEach: () => serveRun(draftedDeckPage, "saved"),
  play: async ({ canvas, canvasElement }) => {
    await pill(canvas, "2 slides drafted", RUN_END);
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
    await pageEndAbovePanel(canvas, canvasElement);
  },
};

/** Opens the Edit slide sheet of slide 2 from its actions menu. */
async function openEditor(canvas: ReturnType<typeof within>) {
  await userEvent.click(
    canvas.getByRole("button", { name: "Actions for slide 2" })
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Edit slide" })
  );

  return screen.findByRole("dialog", { name: "Edit slide 2" });
}

// czjw.180: open Ask closes the sheet, then opens the panel; a later Cancel opens nothing.
export const OpenAskFromTheSheet: Story = {
  name: "open Ask in the sheet opens the Ask panel",
  args: { view: deckPage },
  globals: desktop,
  parameters: { layout: "fullscreen" },
  decorators: [withShell],
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const sheet = await openEditor(canvas);

    await userEvent.click(
      within(sheet).getByRole("button", { name: "open Ask" })
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit slide 2" })).toBeNull()
    );
    const panel = await canvas.findByRole("complementary", { name: "Ask" });

    await expect(panel).toBeVisible();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Close Ask" })
    );
    await waitFor(() =>
      expect(canvas.queryByRole("complementary", { name: "Ask" })).toBeNull()
    );

    await userEvent.click(
      within(await openEditor(canvas)).getByRole("button", { name: "Cancel" })
    );
    // The sheet leaves the tree when its exit animation ends, the moment onClosed runs.
    await waitFor(() =>
      expect(document.querySelector("[data-slot=sheet-content]")).toBeNull()
    );
    await expect(canvas.getByRole("button", { name: "Ask" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  },
};

/** The chat's request, held open, so a story sees what the page sent without a model. */
const agentFetch = fn(
  (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Promise<Response>(() => {})
);

function holdAgentRequests() {
  const original = globalThis.fetch;

  agentFetch.mockClear();
  globalThis.fetch = agentFetch;

  return () => {
    globalThis.fetch = original;
  };
}

// czjw.189: Chart in Add element asks Ask for the shown slide, with that slide as the part.
export const AddChartAsksAsk: Story = {
  name: "Chart in Add element asks Ask for the shown slide",
  args: { view: deckPage },
  globals: desktop,
  parameters: { layout: "fullscreen" },
  decorators: [withShell],
  beforeEach: () => {
    serve(deckPage);

    return holdAgentRequests();
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add element" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Chart" })
    );

    const chat = within(await screen.findByRole("region", { name: "Ask" }));

    const sent = await within(await chat.findByRole("log")).findByText(
      "Which chart can I add to slide 1?"
    );

    await waitFor(() => expect(sent).toBeVisible());
    await waitFor(() => expect(agentFetch).toHaveBeenCalledTimes(1));

    const body = String(agentFetch.mock.calls[0]?.[1]?.body);

    await expect(body).toContain("Which chart can I add to slide 1?");
    await expect(body).toContain(
      `{"type":"slide","id":"${deckPage.deck.slides[0]!.id}"}`
    );
  },
};
