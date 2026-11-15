import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button, ButtonGroup } from "../index.ts";

const meta = {
  title: "UI/ButtonGroup",
  component: ButtonGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The shadcn `button-group`, horizontal only: a `div` with `role="group"` that joins its direct children into one segmented control, with one outer border and square inner corners. Under `lg` the touch area of each child reaches 44 px up and down only, so a joined neighbor keeps its taps. Name it with `aria-label`.',
      },
    },
  },
} satisfies Meta<typeof ButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TwoButtonsJoined: Story = {
  name: "Two buttons joined",
  render: () => (
    <ButtonGroup aria-label="View and filters">
      <Button variant="secondary" size="filter">
        View
      </Button>
      <Button variant="secondary" size="filter">
        Filters (2)
      </Button>
    </ButtonGroup>
  ),
};

// 6wz1.114 (T3-d): a joined child's touch area reaches up and down, never into its neighbor. The
// 40 px icon child is narrower than 44 px, so a centered area would spill 2 px to each side.
export const JoinedOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: () => (
    // The padding keeps the taps above the buttons inside the viewport.
    <div className="p-4">
      <ButtonGroup aria-label="View and more">
        <Button variant="secondary" size="filter">
          View
        </Button>
        <Button variant="secondary" size="icon" aria-label="More">
          <svg aria-hidden="true" viewBox="0 0 16 16" />
        </Button>
        <Button variant="secondary" size="filter">
          Filters (2)
        </Button>
      </ButtonGroup>
    </div>
  ),
  play: async ({ canvas }) => {
    const misses = ["View", "More", "Filters (2)"].flatMap((name) => {
      const button = canvas.getByRole("button", { name });
      const { left, right, top, bottom } = button.getBoundingClientRect();
      const y = (top + bottom) / 2;

      const probes: [string, number, number][] = [
        ["above", (left + right) / 2, top - 1.5],
        ["left edge", left + 1, y],
        ["right edge", right - 1, y],
      ];

      return probes.flatMap(([side, px, py]) =>
        document.elementFromPoint(px, py) === button ? [] : [`${name} ${side}`]
      );
    });

    await expect(misses).toEqual([]);
  },
};
