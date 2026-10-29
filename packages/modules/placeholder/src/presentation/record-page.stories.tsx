import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fn } from "storybook/test";

import { RecordPage } from "./record-page.tsx";

const meta = {
  title: "Modules/Placeholder/Record page",
  component: RecordPage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One placeholder record's page at `/placeholder/:id` (Spec 7 AC-1). Its heading is the stored label; the trail and the document title come from the route, so the page passes no breadcrumb.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <ModuleClientProvider
          client={{
            placeholder: { touch: fn().mockResolvedValue({ jobId: null }) },
          }}
        >
          <Story />
        </ModuleClientProvider>
      </QueryClientProvider>
    ),
  ],
  args: {
    record: {
      id: "11111111-1111-4111-8111-111111111111",
      label: "First record",
    },
  },
} satisfies Meta<typeof RecordPage>;

export default meta;

type Story = StoryObj<typeof meta>;

// Documentation only: the e2e reads the real page.
export const Default: Story = {};
