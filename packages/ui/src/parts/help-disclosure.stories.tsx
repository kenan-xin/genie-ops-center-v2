import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import {
  Button,
  HelpDisclosure,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../index.ts";

const meta = {
  title: "UI/HelpDisclosure",
  component: HelpDisclosure,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Contextual help (tokens.md, "Help disclosure"). A labelled button opens one 320 px callout beside it, only on a press. Escape, a click outside and the Close link close it, and focus returns to the button. Under 640 px the callout pins to the viewport, 16 px from each side. In a toolbar, `iconOnly` drops the button to its icon, 44 px square under `sm` and 40 px from `sm`, with the label in `aria-label` and in a tooltip on hover and keyboard focus.',
      },
    },
  },
  args: {
    label: "How access works",
    children: (
      <>
        <p>Access adds up: each role grants its permissions.</p>
        <p>A group mapped to a role grants it to every member.</p>
      </>
    ),
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  // Room around the button, so the callout can line up with it rather than with a viewport gutter.
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HelpDisclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A story that ends with the callout open lets axe measure it. Base UI's focus guards are
 * `aria-hidden` on purpose (they hand focus on), so only they skip `aria-hidden-focus`.
 */
const OPEN_CALLOUT_A11Y = {
  a11y: {
    test: "error",
    config: {
      rules: [
        {
          id: "aria-hidden-focus",
          selector: '[aria-hidden="true"]:not([data-base-ui-focus-guard])',
        },
      ],
    },
  },
};

async function open(name: string): Promise<{
  trigger: HTMLElement;
  panel: HTMLElement;
}> {
  const trigger = screen.getByRole("button", { name });

  await userEvent.click(trigger);

  const panel = await screen.findByRole("group", { name });

  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));

  return { trigger, panel };
}

export const Default: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "How access works" });

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(screen.queryByRole("group")).toBeNull();

    const { panel } = await open("How access works");

    await expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    // From 640 px the 320 px callout hangs off the button's left edge.
    await waitFor(() =>
      expect(panel.getBoundingClientRect().left).toBeCloseTo(
        trigger.getBoundingClientRect().left,
        0
      )
    );
    await expect(panel.getBoundingClientRect().width).toBe(320);

    // The Close link at the foot is the one control, for touch.
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.keyboard("{Enter}");
    await screen.findByRole("group", { name: "How access works" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    await open("How access works");
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  parameters: OPEN_CALLOUT_A11Y,
  play: async () => {
    const { panel } = await open("How access works");

    // The callout fades in, so wait until it paints.
    await waitFor(() => expect(panel).toBeVisible());
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: OPEN_CALLOUT_A11Y,
  play: async () => {
    const { panel } = await open("How access works");

    // Under 640 px the callout leaves the button and keeps 16 px from each side.
    await waitFor(() =>
      expect(panel.getBoundingClientRect().left).toBeCloseTo(16, 0)
    );
    await expect(panel.getBoundingClientRect().right).toBeCloseTo(
      window.innerWidth - 16,
      0
    );
  },
};

export const IconOnly: Story = {
  args: { iconOnly: true },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "How access works" });

    await expect(trigger.textContent).toBe("");
    // A hover or a keyboard focus shows the topic; `title` alone never shows on focus.
    await userEvent.tab();
    await expect(trigger).toHaveFocus();

    const tip = await screen.findByText("How access works");

    await waitFor(() => expect(tip).toBeVisible());
    await expect(trigger.getBoundingClientRect().height).toBe(40);
    await expect(trigger.getBoundingClientRect().width).toBe(40);
  },
};

export const IconOnlyOnPhone: Story = {
  args: { iconOnly: true },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "How access works" });

    await expect(trigger.getBoundingClientRect().height).toBe(44);
    await expect(trigger.getBoundingClientRect().width).toBe(44);
  },
};

const keepsItsWidthAtTheStart: Story["play"] = async ({ canvas }) => {
  const column = canvas.getByTestId("column").getBoundingClientRect();

  const trigger = canvas
    .getByRole("button", { name: "How access works" })
    .getBoundingClientRect();

  await expect(trigger.left).toBe(column.left);
  await expect(trigger.width).toBeLessThan(column.width / 2);
};

/** A page puts the button in a grid column; it keeps its own width at the start of the row. */
export const InAGridColumn: Story = {
  render: (args) => (
    <div data-testid="column" className="grid gap-4">
      <HelpDisclosure {...args} />
      <p>The table follows.</p>
    </div>
  ),
  play: keepsItsWidthAtTheStart,
};

/** A form field stacks its parts in a flex column; the button does not stretch across it. */
export const InAFlexColumn: Story = {
  render: (args) => (
    <div data-testid="column" className="flex flex-col gap-1.5">
      <p>5 to 480 minutes. Default 15.</p>
      <HelpDisclosure {...args} />
    </div>
  ),
  play: keepsItsWidthAtTheStart,
};

export const InsideASheet: Story = {
  render: (args) => (
    <Sheet>
      <SheetTrigger render={<Button variant="secondary" />}>
        Open person
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Alex Morgan</SheetTitle>
        </SheetHeader>
        <HelpDisclosure {...args} />
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open person" }));

    const sheet = await screen.findByRole("dialog", { name: "Alex Morgan" });

    const { trigger } = await open("How access works");

    // One Escape closes only the callout, not the sheet around it (tokens.md, "Overlays").
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    await expect(sheet).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
