import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { placeholderRecords } from "./__fixtures__/records.ts";
import { WorkspacePage } from "./workspace-page.tsx";

const meta = {
  title: "Modules/Placeholder/Workspace page",
  component: WorkspacePage,
  // The docs addon generates the Docs page from this tag, which is where the
  // component description below and the generated controls table render.
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The placeholder workspace page, rendered from fixtures. It proves presentation only. S0-04 adds the schema, the router, and the permission keys.",
      },
    },
  },
  args: { records: placeholderRecords },
} satisfies Meta<typeof WorkspacePage>;

export default meta;

type Story = StoryObj<typeof meta>;

// Storybook 10 takes the viewport as a global object, not as
// parameters.viewport.defaultViewport. "desktop" and "mobile1" are keys of the
// built-in MINIMAL_VIEWPORTS, which the preview falls back to when no story
// declares parameters.viewport.options, so no host configuration is needed.
export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("First record")).toBeInTheDocument();
    await expect(canvas.getByText("Second record")).toBeInTheDocument();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("First record")).toBeInTheDocument();
  },
};

// Renders on a dark surface this package owns, so the story asserts on what the
// module itself renders rather than on the theme toolbar in apps/storybook. A
// module story must not depend on one host's decorator.
export const Dark: Story = {
  decorators: [
    (Story) => (
      <div data-theme="dark">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const heading = canvas.getByRole("heading", { name: "Placeholder" });

    await expect(heading).toBeInTheDocument();
    await expect(heading.closest("[data-theme='dark']")).not.toBeNull();
  },
};

export const Empty: Story = {
  args: { records: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No records yet.")).toBeInTheDocument();
  },
};
