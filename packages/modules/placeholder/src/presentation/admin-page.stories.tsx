import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AdminPage } from "./admin-page.tsx";

/** One fixed count, so every run asserts on the same render. */
const FIXTURE = { recordCount: 3 };

const meta = {
  title: "Modules/Placeholder/Admin page",
  component: AdminPage,
  // The docs addon generates the Docs page from this tag, which is where the
  // component description below and the generated controls table render.
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The placeholder admin page, reached behind `placeholder:admin` (DEC-23). It renders the record count it is given, so the story proves presentation only from one deterministic fixture.",
      },
    },
    // The accessibility addon runs axe after each story in the Vitest run, and
    // `test: "error"` turns a violation into a test failure (the default
    // "todo" only warns). No exception is scoped for this page.
    a11y: { test: "error" },
  },
  args: FIXTURE,
} satisfies Meta<typeof AdminPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const heading = canvas.getByRole("heading", {
      name: "Placeholder settings",
    });

    await expect(heading).toBeInTheDocument();
    await expect(heading).toBeVisible();
    await expect(
      canvas.getByText("This deployment holds 3 placeholder records.")
    ).toBeInTheDocument();
  },
};
