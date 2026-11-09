import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { deckPage } from "./__fixtures__/decks.ts";
import type { DeckSyncMessage } from "./deck-sync.ts";
import { PresenterView } from "./presenter-view.tsx";
import type { DeckPageView } from "./views.ts";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const NOTES =
  "Cash collected rose 12 percent. The gain came from fewer late payers.\nSeptember is the best month so far.\nThe next slide shows the overdue invoices by customer.";

const LONG_NOTES = Array.from(
  { length: 30 },
  (_, line) =>
    `Point ${line + 1}: say what the chart shows before what it means, and stop for questions.`
).join("\n");

/** The fixture deck with notes on slide 2 (and long notes on slide 3 for one story). */
function withNotes(slide3Notes?: string): DeckPageView {
  const [first, second, third, ...rest] = deckPage.deck.slides;

  return {
    ...deckPage,
    deck: {
      ...deckPage.deck,
      slides: [
        first!,
        { ...second!, notes: NOTES },
        { ...third!, notes: slide3Notes },
        ...rest,
      ],
    },
  };
}

const readDeck = fn();

/** The audience window's end of the channel: what the presenter posts, and a way to post to it. */
let heard: DeckSyncMessage[] = [];

let audience: BroadcastChannel | undefined;

function fromAudience(index: number) {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel takes no target
  audience?.postMessage({ kind: "show", index, from: "audience" });
}

function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider client={{ slides: { readDeck } }}>
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Slides/Presenter view",
  component: PresenterView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The presenter window at `/m/slides/decks/:id/presenter` (S7-45, variant A). Present mode's black frame: the current slide takes about 62 percent on the left, the next slide and the speaker notes on the right, an elapsed timer with Pause, Resume and Reset in the top bar. It follows the audience window (present mode) over the `slides-present:<deckId>` channel and moves it: on open it asks for the shown slide, each move posts `show`, and a received `show` moves it without a post back. Arrow keys, PageUp, PageDown and Space move; Escape or ✕ leave. Below 768 px the panels stack (review only; a presenter needs a second screen).",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  beforeEach: () => {
    heard = [];
    audience = new BroadcastChannel("slides-present:deck-1");
    audience.addEventListener("message", (event: MessageEvent) =>
      // SAFETY: only the presenter under test posts on this channel.
      heard.push(event.data as DeckSyncMessage)
    );

    return () => {
      audience?.close();
      audience = undefined;
    };
  },
  args: { view: withNotes(), onExit: fn() },
  globals: desktop,
} satisfies Meta<typeof PresenterView>;

export default meta;

type Story = StoryObj<typeof meta>;

async function presenter() {
  return within(
    await screen.findByRole("dialog", {
      name: "Presenter view · Receivables at a glance",
    })
  );
}

/** The presenter asks on open, so the audience end has heard it before the story moves anything. */
async function shownByAudience(index: number) {
  await waitFor(() => expect(heard).toContainEqual({ kind: "ask" }));
  fromAudience(index);

  const dialog = await presenter();

  await waitFor(() =>
    expect(dialog.getByText(`${index + 1} / 5`)).toBeVisible()
  );

  return dialog;
}

export const Presenter: Story = {
  play: async () => {
    const dialog = await shownByAudience(1);

    await expect(dialog.getByRole("status")).toHaveTextContent(
      "Audience window follows"
    );
    await expect(
      dialog.getByRole("region", { name: "Next" })
    ).toHaveTextContent("Slide 3");

    const notes = dialog.getByRole("region", { name: "Notes for slide 2" });

    await expect(
      [...notes.querySelectorAll("p")].map((line) => line.textContent)
    ).toEqual(NOTES.split("\n"));
  },
};

export const LastSlide: Story = {
  name: "Last slide",
  play: async () => {
    const dialog = await shownByAudience(4);

    await expect(
      dialog.getByRole("region", { name: "Next" })
    ).toHaveTextContent("This is the last slide. Exit returns to the deck.");
  },
};

export const NoNotes: Story = {
  name: "No notes",
  play: async () => {
    const dialog = await shownByAudience(0);

    await expect(dialog.getByText("No notes for this slide.")).toBeVisible();
  },
};

export const LongNotes: Story = {
  name: "Long notes",
  args: { view: withNotes(LONG_NOTES) },
  play: async () => {
    const dialog = await shownByAudience(2);
    const notes = dialog.getByRole("region", { name: "Notes for slide 3" });

    // The panel scrolls inside the window, above the control row.
    expect(notes.scrollHeight).toBeGreaterThan(notes.clientHeight);
    expect(notes.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      dialog
        .getByRole("toolbar", { name: "Presentation" })
        .getBoundingClientRect().top
    );

    // The current slide keeps about 62 percent of the width, 16:9, whatever the notes hold.
    const slide = dialog
      .getByRole("region", { name: "Now showing" })
      .querySelector<HTMLElement>("[data-slide-canvas]")!;

    const rect = slide.getBoundingClientRect();

    expect(rect.width).toBeGreaterThan(window.innerWidth * 0.55);
    expect(
      Math.abs(rect.width * (540 / 960) - rect.height)
    ).toBeLessThanOrEqual(1);

    // The notes never squeeze the next slide either: its whole 16:9 box shows.
    const next = dialog
      .getByRole("region", { name: "Next" })
      .querySelector<HTMLElement>("[data-slide-canvas]")!
      .getBoundingClientRect();

    expect(next.bottom).toBeLessThanOrEqual(notes.getBoundingClientRect().top);
  },
};

export const Timer: Story = {
  play: async () => {
    const dialog = await presenter();
    const timer = dialog.getByRole("timer", { name: "Elapsed time" });

    await waitFor(() => expect(timer).toHaveTextContent("0:01"), {
      timeout: 2500,
    });
    await userEvent.click(dialog.getByRole("button", { name: "Pause timer" }));

    const paused = timer.textContent;

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await expect(timer).toHaveTextContent(paused ?? "");
    await expect(
      dialog.getByRole("button", { name: "Resume timer" })
    ).toBeVisible();

    await userEvent.click(dialog.getByRole("button", { name: "Reset timer" }));
    await expect(timer).toHaveTextContent("0:00");
  },
};

export const Keys: Story = {
  play: async ({ args }) => {
    const dialog = await shownByAudience(1);

    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(dialog.getByText("3 / 5")).toBeVisible());
    await waitFor(() =>
      expect(heard).toContainEqual({
        kind: "show",
        index: 2,
        from: "presenter",
      })
    );

    // A received show moves the presenter and posts nothing back.
    const before = heard.length;

    fromAudience(0);
    await waitFor(() => expect(dialog.getByText("1 / 5")).toBeVisible());
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(heard).toHaveLength(before);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(args.onExit).toHaveBeenCalledTimes(1));
  },
};
