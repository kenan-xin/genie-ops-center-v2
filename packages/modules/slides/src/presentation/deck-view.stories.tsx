import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, userEvent } from "storybook/test";

import { deckPage, emptyDeckPage } from "./__fixtures__/decks.ts";
import { DeckView } from "./deck-view.tsx";
import type { DeckPageView } from "./views.ts";

const readDeck = fn();

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
      <ModuleClientProvider client={{ slides: { readDeck } }}>
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Slides/Deck",
  component: DeckView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One deck at `/m/slides/decks/:id` (Spec 7 R-52, R-54). The header names the figures date, a rail of slide buttons selects the shown slide, and the slide keeps its 16:9 shape at every width. From 768 px the rail is a column on the left; below it, a wrapping row of numbered buttons above the slide.",
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
}

/** B4.3: the slide keeps 16:9 within 1 px, fits its container and never widens the page. */
async function slideFits(canvasElement: HTMLElement) {
  const slide = canvasElement.querySelector<HTMLElement>("[data-slide-canvas]");

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
    await expect(canvas.getByText("Figures as of 27 Oct 2026")).toBeVisible();
    await slideFits(canvasElement);
  },
};

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

const railPlay: Story["play"] = async ({ canvas }) => {
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
