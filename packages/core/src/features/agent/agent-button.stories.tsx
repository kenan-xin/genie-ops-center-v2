import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { AgentButton } from "./agent-button.tsx";
import { agentPanelStore } from "./agent-panel-store.ts";

const phone = { viewport: { value: "phone390", isRotated: false } };

const meta = {
  title: "Core/Agent/AgentButton",
  component: AgentButton,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Opens and closes the agent panel. From 768 px it shows a dot and Ask; under 768 px the Sparkles icon, with the dot on the button's top-right corner (czjw.177).",
      },
    },
  },
  beforeEach: () => {
    agentPanelStore.setState({ open: false, working: false });
  },
} satisfies Meta<typeof AgentButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The button, its glyph and its dot. */
function parts(canvasElement: HTMLElement, name: string) {
  const button = within(canvasElement).getByRole("button", { name });

  return {
    button,
    glyph: button.querySelector("svg")!,
    dot: button.querySelector<HTMLElement>('span[aria-hidden="true"]')!,
  };
}

/** czjw.177: on a phone the button is the 17 px Sparkles glyph, centered, the dot outside it. */
export const PhoneIdle: Story = {
  globals: phone,
  play: async ({ canvasElement }) => {
    const { button, glyph, dot } = parts(canvasElement, "Ask");
    const box = button.getBoundingClientRect();
    const ink = glyph.getBoundingClientRect();
    const mark = dot.getBoundingClientRect();

    await expect(glyph).toBeVisible();
    await expect(ink.width).toBe(17);
    await expect(
      Math.abs(ink.left + ink.width / 2 - (box.left + box.width / 2))
    ).toBeLessThanOrEqual(0.5);
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(mark.left).toBeGreaterThanOrEqual(ink.right);
    await expect(mark.top).toBeLessThan(ink.top);
    await expect(within(button).getByText("Ask")).not.toBeVisible();
  },
};

/** Review Focus 5: the name says the agent works while the panel is closed, and only then. */
export const PhoneWorking: Story = {
  globals: phone,
  beforeEach: () => {
    agentPanelStore.setState({ open: false, working: true });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("button", { name: "Ask, working" })
    ).toBeVisible();
    agentPanelStore.setState({ open: true });
    await expect(
      await canvas.findByRole("button", { name: "Ask" })
    ).toBeVisible();
  },
};

/** From 768 px the button keeps the dot and the word, as the desktop design draws it. */
export const Desktop: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvasElement }) => {
    const { button, glyph, dot } = parts(canvasElement, "Ask");
    const word = within(button).getByText("Ask");

    await expect(word).toBeVisible();
    await expect(glyph).not.toBeVisible();
    await expect(dot.getBoundingClientRect().right).toBeLessThanOrEqual(
      word.getBoundingClientRect().left
    );
  },
};
