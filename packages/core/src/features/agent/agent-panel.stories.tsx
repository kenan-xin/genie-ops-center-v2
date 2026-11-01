import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { omit } from "es-toolkit";

import { ModuleClientProvider } from "../../lib/rpc/module-client.tsx";
import { AgentPanel } from "./agent-panel.tsx";

const chart = async () => {
  throw new Error("This panel fixture draws no chart.");
};

/**
 * A new agent chat beside one record. Its behavior is the Conversation's, whose stories cover
 * sending, streaming and refusals; this story documents the panel's props and its look.
 */
const meta = {
  title: "Core/Agent/Agent panel",
  component: AgentPanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A new agent chat beside one record or one list (R-49): a record page passes the record's type and id as `context`, and every message sends it, so the prompt tells the model which record 'this' means. A list page, such as the Slides list, passes no `context`, and no message sends one. Each mount starts its own session. The chart gate goes through the app's module client, which holds the `agent` area. The story sends nothing.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <ModuleClientProvider client={{ agent: { chart } }}>
        <Story />
      </ModuleClientProvider>
    ),
  ],
  args: {
    context: { recordType: "dashboard", recordId: "d-1" },
    models: {
      allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
      chatDefault: "openai/gpt-6.1-terra",
    },
    timeZone: "UTC",
    newChatHref: "/ask",
  },
} satisfies Meta<typeof AgentPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
};

export const Phone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
};

// Beside a list, as the Slides list does: no record, so no message sends a `context` (D12).
export const WithoutContext: Story = {
  name: "Without a record context",
  render: (args) => <AgentPanel {...omit(args, ["context"])} />,
};

export const WithoutPicker: Story = {
  name: "Without the model picker",
  args: { models: null },
};
