import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button, ButtonGroup } from "../index.ts";

const meta = {
  title: "UI/ButtonGroup",
  component: ButtonGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The shadcn `button-group`, horizontal only: a `div` with `role="group"` that joins its direct children into one segmented control, with one outer border and square inner corners. Name it with `aria-label`.',
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
