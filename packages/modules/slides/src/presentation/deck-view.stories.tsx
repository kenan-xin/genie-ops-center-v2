import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  deckPage,
  emptyDeckPage,
  tableWithVisualSlide,
  titleOnlySlide,
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

/** The fixture deck's content hash, which every write names (R-53). */
const HASH = "0".repeat(64);

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** A fresh query cache per story, with no retries so a refusal reports at once. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

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
          "One deck at `/m/slides/decks/:id` (Spec 7 R-52, R-54). The header names the slide count and the figures date; Present is the main action, Export to PowerPoint sits beside it, and Add slide, Refresh data and Rename deck sit in More (7.2). Undo sits above the shown slide, also when no slide is left. A rail of numbered slide previews selects the shown slide (7.3): from 768 px a column on the left, below it a strip that scrolls sideways above the slide. The slide keeps its 16:9 shape at every width.",
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
    await expect(
      canvas.getByText("Receivables at a glance", { selector: "h1" })
    ).toBeVisible();
    await expect(
      canvasElement.querySelector("[data-figures-date]")
    ).toHaveTextContent("5 slides · Figures as of 27 Oct 2026");
    await slideFits(canvasElement);

    // 7.2: Present and Export are the page's actions; the rest sits in More.
    await expect(canvas.getByRole("button", { name: "Present" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Export to PowerPoint" })
    ).toBeVisible();

    for (const name of ["Rename deck", "Add slide", "Refresh data"]) {
      expect(canvas.queryByRole("button", { name })).toBeNull();
    }

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
      for (const name of ["Add slide", "Refresh data", "Rename deck"]) {
        expect(screen.getByRole("menuitem", { name })).toBeVisible();
      }
    });

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

export const DeckOnPhone: Story = {
  name: "Deck on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("navigation", { name: "Slides" })
    ).toBeVisible();
    await slideFits(canvasElement);

    // Round 1: below lg the header date is sr-only, so the page shows a readable line outside
    // the canvas; the scaled slide footer alone is about 4.5 px at 390 px.
    const date = canvasElement.querySelector<HTMLElement>(
      "[data-figures-date]"
    );

    await expect(date).not.toBeNull();
    await expect(date).toBeVisible();
    await expect(date).toHaveTextContent("Figures as of 27 Oct 2026");
    await expect(
      Number.parseFloat(getComputedStyle(date!).fontSize)
    ).toBeGreaterThanOrEqual(12);
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
    // No slide to present, so Present is off.
    await expect(
      canvas.getByRole("button", { name: "Present" })
    ).toBeDisabled();
    // The last removal stays undoable (R-49), with no slide to stand beside.
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeVisible();
  },
};

export const EmptyDeckOnPhone: Story = {
  name: "Empty deck on a phone",
  args: { view: emptyDeckPage },
  globals: phone,
  beforeEach: () => serve(emptyDeckPage),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No slides yet")).toBeVisible();
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

export const RailOnPhone: Story = {
  name: "Rail on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: railPlay,
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
    await screen.findByRole("menuitem", { name: "Remove slide" })
  );

  await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
  await expect(changeDeck).toHaveBeenCalledWith({
    id: "deck-1",
    expectedHash: HASH,
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
  beforeEach: () => serve(deckPage),
  play: slideActionsPlay,
};

export const SlideActionsOnPhone: Story = {
  name: "Slide actions on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: slideActionsPlay,
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
      await screen.findByRole("dialog", { name: "Edit slide" })
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
      await screen.findByRole("dialog", { name: "Edit slide" })
    );

    const [removeFigure] = await sheet.findAllByRole("button", {
      name: "Remove",
    });

    await waitFor(() => expect(removeFigure).toBeVisible());
    await userEvent.click(removeFigure!);
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
    await screen.findByRole("button", { name: "Delete element" })
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
  },
};

// A refused Delete keeps the element selected, so the person sees the refusal beside its dock.
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
    await expect(
      canvas.getByRole("toolbar", { name: "Figure style" })
    ).toBeInTheDocument();
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

/** The title of slide 1 as drawn: the computed title box, x 40, y 32. */
const TITLE_BOX = { x: 40, y: 32, w: 880, h: 88 };

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
            box: { ...TITLE_BOX, x: 48 },
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
                  ? { ...element, box: { ...TITLE_BOX, x: 64 } }
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
            box: { ...TITLE_BOX, x: 64 },
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
            box: { ...TITLE_BOX, x: 72 },
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
      x: 48,
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
    await pickBackground(canvas, "Dark blue #1E3A8A");

    await waitFor(() =>
      expect(changeDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
        changes: [
          backgroundStep("#1E3A8A"),
          {
            op: "change-element",
            slideId: "s1",
            index: 0,
            style: { color: "#FFFFFF" },
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

// P16e-11: a pick whose texts all stay readable sends one step and shows no note.
export const NoRecolorNoNote: Story = {
  name: "A background pick that recolors nothing shows no note",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: serveRecolor,
  play: async ({ canvas }) => {
    await pickBackground(canvas, "Light gray #F3F4F6");

    await waitFor(() =>
      expect(changeDeck).toHaveBeenCalledWith({
        id: "deck-1",
        expectedHash: HASH,
        changes: [backgroundStep("#F3F4F6")],
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
    await pickBackground(canvas, "Dark blue #1E3A8A");
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
    await pickBackground(canvas, "Dark blue #1E3A8A");

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

// A notes pause that ends while the sheet's Save slide runs waits for it and names its hash.
export const SaveSlideAndNotesTakeTurns: Story = {
  name: "Save slide and a notes pause take turns",
  args: { view: deckPage },
  globals: desktop,
  beforeEach: () => serve(deckPage),
  play: async ({ canvas }) => {
    const answerSlide = holdNext(changeDeck, {
      ...deckPage.deck,
      contentHash: NEW_HASH,
    });

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: "Edit slide" })
    );

    const notes = sheet.getByRole("textbox", { name: "Speaker notes" });

    await waitFor(() => expect(notes).toBeVisible());
    await userEvent.type(notes, "Point at it.");
    await userEvent.type(sheet.getByRole("textbox", { name: "Title" }), "!");
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));
    await waitFor(() => expect(changeDeck).toHaveBeenCalledOnce());
    await expect(changeDeck).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHash: HASH })
    );

    // The notes pause ends while Save slide is still waiting for its answer.
    await pause(1200);
    await expect(changeDeck).toHaveBeenCalledOnce();

    answerSlide();
    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck).toHaveBeenLastCalledWith({
      id: "deck-1",
      expectedHash: NEW_HASH,
      changes: [
        { op: "change-slide-fields", slideId: "s2", notes: "Point at it." },
      ],
    });
  },
};

// S7-45: the notes field sits under Title in the sheet at 390 px; a pause saves one notes step,
// and Save slide afterwards names the hash that save answered, not the one the sheet opened with.
export const NotesInSheetOnPhone: Story = {
  name: "Notes in the Edit slide sheet on a phone",
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
      canvas.getByRole("button", { name: "Actions for slide 2" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit slide" })
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: "Edit slide" })
    );

    const title = sheet.getByRole("textbox", { name: "Title" });
    const notes = sheet.getByRole("textbox", { name: "Speaker notes" });

    await waitFor(() => expect(notes).toBeVisible());
    await expect(
      title.getBoundingClientRect().bottom <= notes.getBoundingClientRect().top
    ).toBe(true);
    // The sheet slides in from the right, so its place settles after the opening transition.
    await waitFor(() =>
      expect(notes.getBoundingClientRect().right).toBeLessThanOrEqual(390)
    );

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
    await expect(await sheet.findByText("Saved")).toBeVisible();

    await userEvent.type(title, " again");
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(2));
    await expect(changeDeck).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHash: NOTES_HASH })
    );
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
      await screen.findByRole("dialog", { name: "Edit slide" })
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
      await screen.findByRole("dialog", { name: "Edit slide" })
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
      await screen.findByRole("dialog", { name: "Edit slide" })
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
      await screen.findByRole("dialog", { name: "Edit slide" })
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
    expect(canvas.getByRole("button", { name: "Exporting…" })).toBeDisabled()
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

export const ExportRefusedOnPhone: Story = {
  name: "Export refused on a phone",
  args: { view: deckPage },
  globals: phone,
  beforeEach: () => serve(deckPage),
  play: exportPlay,
};
