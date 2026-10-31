import { Button } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { deckPage } from "./__fixtures__/decks.ts";
import { PresentMode } from "./present-mode.tsx";
import type { DeckPageView } from "./views.ts";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const desktop16x9 = { viewport: { value: "desktop1920", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const phoneRotated = { viewport: { value: "phone844x390", isRotated: false } };

const DIALOG_NAME = "Present Receivables at a glance";

/**
 * The dialog is controlled, so the story owns `open`. The fixed bar and the round trigger stand in
 * for the shell layers a present dialog must sit above (S7-12's covered control).
 */
function PresentHarness(props: {
  readonly view: DeckPageView;
  readonly startAt: number;
  readonly initialOpen: boolean;
}) {
  const [open, setOpen] = useState(props.initialOpen);

  return (
    <div className="min-h-dvh bg-background p-4">
      <Button onClick={() => setOpen(true)} disabled={open}>
        Present
      </Button>
      <div
        data-shell-bottom-bar=""
        className="fixed inset-x-0 bottom-0 z-10 h-16 bg-background"
      />
      <Button
        aria-label="Open Ask"
        className="fixed right-4 bottom-4 z-40 rounded-full"
      >
        Ask
      </Button>
      <PresentMode
        view={props.view}
        startAt={props.startAt}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}

const meta = {
  title: "Modules/Slides/Present mode",
  component: PresentMode,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The deck presented full screen (Spec 7 R-55, D11). The black popup fills the viewport above the shell and the Ask bubble, the slide is the largest 16:9 box above the control row, and Previous, Next, the counter and Exit stay reachable on a phone. Arrow keys, PageUp, PageDown and Space move; Escape leaves. Browser fullscreen is requested only where the browser allows it.",
      },
    },
    a11y: { test: "error" },
  },
  render: (args) => (
    <PresentHarness
      view={args.view}
      startAt={args.startAt}
      initialOpen={args.open}
    />
  ),
  args: { view: deckPage, startAt: 0, open: true, onOpenChange: fn() },
} satisfies Meta<typeof PresentMode>;

export default meta;

type Story = StoryObj<typeof meta>;

async function dialogBox() {
  return within(await screen.findByRole("dialog", { name: DIALOG_NAME }));
}

/** B5.2: the slide is the largest 16:9 box inside the viewport, and no fixed layer covers a control. */
async function assertFits() {
  const dialog = await dialogBox();

  const slide = await waitFor(() => {
    const element = document.querySelector<HTMLElement>("[data-slide-canvas]");

    expect(element).not.toBeNull();
    expect(element!.getBoundingClientRect().width).toBeGreaterThan(0);

    return element!;
  });

  const rect = slide.getBoundingClientRect();

  const controlTop = Math.min(
    ...["Previous slide", "Next slide", "Exit"].map(
      (name) => dialog.getByRole("button", { name }).getBoundingClientRect().top
    )
  );

  expect(Math.abs(rect.width * (540 / 960) - rect.height)).toBeLessThanOrEqual(
    1
  );
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.top).toBeGreaterThanOrEqual(15);
  expect(rect.right).toBeLessThanOrEqual(window.innerWidth + 0.5);
  expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight + 0.5);
  // The stage's padding is the margin above the control row, at every size.
  expect(controlTop - rect.bottom).toBeGreaterThanOrEqual(15);

  for (const name of ["Previous slide", "Next slide", "Exit"]) {
    const control = dialog.getByRole("button", { name });

    const box = control.getBoundingClientRect();

    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    );

    expect(hit).not.toBeNull();
    expect(hit).toBe(control);
  }
}

/** B5.1: every key moves one slide, the edges turn a control off, and Escape leaves. */
async function assertKeyboard() {
  const dialog = await dialogBox();

  await waitFor(() => expect(dialog.getByText("1 / 5")).toBeVisible());

  const previous = dialog.getByRole("button", { name: "Previous slide" });
  const next = dialog.getByRole("button", { name: "Next slide" });

  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await expect(next).not.toHaveAttribute("aria-disabled", "true");

  await userEvent.keyboard("{ArrowRight}");
  await waitFor(() => expect(dialog.getByText("2 / 5")).toBeVisible());
  await userEvent.keyboard(" ");
  await waitFor(() => expect(dialog.getByText("3 / 5")).toBeVisible());
  await userEvent.keyboard("{PageDown}");
  await waitFor(() => expect(dialog.getByText("4 / 5")).toBeVisible());
  await userEvent.keyboard("{ArrowRight}");
  await waitFor(() => expect(dialog.getByText("5 / 5")).toBeVisible());
  await expect(next).toHaveAttribute("aria-disabled", "true");

  await userEvent.keyboard("{ArrowLeft}");
  await waitFor(() => expect(dialog.getByText("4 / 5")).toBeVisible());
  await userEvent.keyboard("{PageUp}");
  await waitFor(() => expect(dialog.getByText("3 / 5")).toBeVisible());

  await userEvent.click(next);
  await waitFor(() => expect(dialog.getByText("4 / 5")).toBeVisible());
  await userEvent.click(previous);
  await waitFor(() => expect(dialog.getByText("3 / 5")).toBeVisible());

  // B5.1 edge focus: a control at an edge keeps focus, so the arrow keys still move.
  await userEvent.click(dialog.getByRole("button", { name: "Next slide" }));
  await userEvent.click(dialog.getByRole("button", { name: "Next slide" }));
  await waitFor(() => expect(dialog.getByText("5 / 5")).toBeVisible());
  await userEvent.keyboard("{ArrowLeft}");
  await waitFor(() => expect(dialog.getByText("4 / 5")).toBeVisible());

  await userEvent.click(previous);
  await userEvent.click(previous);
  await userEvent.click(previous);

  await waitFor(() => expect(dialog.getByText("1 / 5")).toBeVisible());
  await userEvent.keyboard("{ArrowRight}");
  await waitFor(() => expect(dialog.getByText("2 / 5")).toBeVisible());

  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

const fromFirstPlay: Story["play"] = async () => {
  await assertFits();
  await assertKeyboard();
};

export const FromFirstSlide: Story = {
  globals: desktop,
  play: fromFirstPlay,
};

export const FromFirstSlideOnPhone: Story = {
  name: "From the first slide on a phone",
  globals: phone,
  play: fromFirstPlay,
};

// B5.2: height is the limit on a rotated phone, so the slide must keep its margin.
export const HeightLimitedOnPhone: Story = {
  name: "A rotated phone",
  globals: phoneRotated,
  play: assertFits,
};

// B5.2: a 16:9 screen in fullscreen is height-limited too.
export const HeightLimitedDesktop: Story = {
  name: "A 16:9 desktop",
  globals: desktop16x9,
  play: assertFits,
};

const fromLastPlay: Story["play"] = async () => {
  const dialog = await dialogBox();

  await waitFor(() => expect(dialog.getByText("5 / 5")).toBeVisible());
  await expect(
    dialog.getByRole("button", { name: "Next slide" })
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    dialog.getByRole("button", { name: "Previous slide" })
  ).not.toHaveAttribute("aria-disabled", "true");

  await assertFits();
};

export const FromLastSlide: Story = {
  args: { startAt: 4 },
  globals: desktop,
  play: fromLastPlay,
};

export const FromLastSlideOnPhone: Story = {
  name: "From the last slide on a phone",
  args: { startAt: 4 },
  globals: phone,
  play: fromLastPlay,
};

/** B5.3: fullscreen is requested once where it is allowed, and never where it is not. */
const fullscreenPlay: Story["play"] = async ({ canvas }) => {
  const enabled = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenEnabled"
  );

  const request = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "requestFullscreen"
  );

  const requestFullscreen = fn(() => Promise.resolve());

  try {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    await userEvent.click(canvas.getByRole("button", { name: "Present" }));
    await screen.findByRole("dialog", { name: DIALOG_NAME });
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: false,
    });
    requestFullscreen.mockClear();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Present" }));

    const dialog = await dialogBox();

    await waitFor(() => expect(dialog.getByText("1 / 5")).toBeVisible());
    await expect(requestFullscreen).not.toHaveBeenCalled();
  } finally {
    if (enabled === undefined)
      Reflect.deleteProperty(document, "fullscreenEnabled");
    else Object.defineProperty(document, "fullscreenEnabled", enabled);

    if (request === undefined) {
      Reflect.deleteProperty(Element.prototype, "requestFullscreen");
    } else {
      Object.defineProperty(Element.prototype, "requestFullscreen", request);
    }
  }
};

export const Fullscreen: Story = {
  args: { open: false },
  globals: desktop,
  play: fullscreenPlay,
};
