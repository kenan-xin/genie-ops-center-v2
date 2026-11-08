import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import type { AgentMessage } from "../../services/agent/index.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
import { AgentChat } from "./agent-chat.tsx";

const SAVED: readonly AgentMessage[] = [
  {
    id: "question",
    role: "user",
    parts: [{ type: "text", text: "How many records are there?" }],
  },
  {
    id: "answer",
    role: "assistant",
    parts: [{ type: "text", text: "There are three records." }],
  },
];

const loadSaved = fn(async () => SAVED);

/**
 * The one wiring of an agent chat, which both frames render. Without `initialMessages` it reads the
 * chat's saved messages, so a chat the panel reopens continues (`czjw.60`).
 */
const meta = {
  title: "Core/Agent/AgentChat",
  component: AgentChat,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "An agent chat wired to the app: the route's transport, which reads the page's `context` when a message goes, the chart gate and the saved messages through the `agent` client, and the `Conversation`. Ask passes the server's `initialMessages`; the agent panel leaves them out and the chat loads them. The frame gives what an artifact card does, New chat and the empty state's heading level.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <AgentClientStub messages={loadSaved}>
        <Story />
      </AgentClientStub>
    ),
  ],
  args: {
    sessionId: "00000000-0000-4000-8000-000000000009",
    models: null,
    labels: { steps: {}, datasets: {}, fields: {} },
    suggestions: [],
    inbox: [],
    timeZone: "UTC",
    artifacts: { kind: "link", href: () => "/ask" },
    headingLevel: 3,
    onNewChat: fn(),
  },
} satisfies Meta<typeof AgentChat>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ContinuesASavedChat: Story = {
  name: "Continues a saved chat",
  play: async ({ args, canvas }) => {
    await expect(
      await canvas.findByText("There are three records.")
    ).toBeVisible();
    await expect(loadSaved).toHaveBeenCalledWith({ id: args.sessionId });
  },
};
