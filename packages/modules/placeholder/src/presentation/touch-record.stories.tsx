import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, fn } from "storybook/test";

import { TouchRecord } from "./touch-record.tsx";

const touch = fn();

const meta = {
  title: "Modules/Placeholder/Touch record",
  component: TouchRecord,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The record page's button that calls the module's own `touch` procedure from the browser, through the typed client core provides (Spec 7 R-2). It says when the touch is queued, and says so when it is refused.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <ModuleClientProvider client={{ placeholder: { touch } }}>
          <Story />
        </ModuleClientProvider>
      </QueryClientProvider>
    ),
  ],
  args: { id: "11111111-1111-4111-8111-111111111111" },
} satisfies Meta<typeof TouchRecord>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Touches: Story = {
  beforeEach: () => {
    touch.mockReset().mockResolvedValue({ jobId: "job-1" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Touch record" }));

    await expect(touch).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
    });
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Touch queued."
    );
  },
};

export const TouchRefused: Story = {
  beforeEach: () => {
    touch.mockReset().mockRejectedValue(new Error("forbidden"));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Touch record" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The record could not be touched."
    );
    await expect(canvas.queryByText("Touch queued.")).toBeNull();
  },
};
