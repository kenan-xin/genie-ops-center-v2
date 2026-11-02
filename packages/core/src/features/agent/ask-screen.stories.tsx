import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ChatTransport, UIMessageChunk } from "ai";
import { expect, within } from "storybook/test";

import type {
  AgentMessage,
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";
import { AskScreen } from "./ask-screen.tsx";
import type { CheckChart } from "./chart-check.tsx";
import { Conversation } from "./conversation.tsx";

const SESSIONS: readonly AgentSessionSummary[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "How many example records are there?",
    modelId: "openai/gpt-6.1-terra",
    updatedAt: "2026-10-30T09:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "What can you do?",
    modelId: "anthropic/claude-opus-5.5",
    updatedAt: "2026-10-29T16:30:00.000Z",
  },
];

const INBOX: readonly InboxLink[] = [
  { label: "Documents", href: "/m/example" },
];

const NO_MESSAGES: readonly AgentMessage[] = [];

const checkChart: CheckChart = async () => {
  throw new Error("This conversation fixture draws no chart.");
};

const idleTransport: ChatTransport<AgentMessage> = {
  sendMessages: async () =>
    new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.close();
      },
    }),
  reconnectToStream: async () => null,
};

/** The conversation column; the ask screen only decides whether it shows. */
const conversation = (
  <Conversation
    sessionId="00000000-0000-4000-8000-000000000003"
    initialMessages={NO_MESSAGES}
    transport={idleTransport}
    models={null}
    labels={{ steps: {}, datasets: {} }}
    suggestions={[]}
    checkChart={checkChart}
    timeZone="UTC"
    newChatHref="/ask"
  />
);

/**
 * The Ask page (R-42, P15): the person's sessions beside the conversation, a new chat, the
 * Documents inbox links, and the AI-off state that replaces the conversation.
 */
const meta = {
  title: "Core/Agent/Ask screen",
  component: AskScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Ask screen: the session list as a 280 px column from lg and a closed disclosure below it, New chat, one inbox link per readable provider, and beside it the conversation. With AI off the conversation is replaced by the AI-off message (R-20).",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    sessions: SESSIONS,
    currentId: SESSIONS[0]?.id,
    sessionHref: (id: string) => `/ask/${id}`,
    newChatHref: "/ask",
    inbox: INBOX,
    aiOn: true,
    // East of UTC, so a late-evening UTC instant falls on the next day (design review 5.6).
    timeZone: "Asia/Singapore",
    children: conversation,
  },
} satisfies Meta<typeof AskScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SessionsDesktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    const list = canvas
      .getAllByRole("navigation", { name: "Chats" })
      .find((nav) => nav.checkVisibility());

    if (list === undefined) throw new Error("No visible chat list.");

    // 16:30 UTC on 29 Oct is 00:30 on 30 Oct in the tenant's zone.
    const later = within(list).getByRole("link", { name: /What can you do\?/ });

    await expect(later).toHaveTextContent("30 Oct 2026");

    // A long title wraps to two lines before it is cut (design review 5.6).
    const title = within(later).getByText("What can you do?");

    await expect(getComputedStyle(title).webkitLineClamp).toBe("2");
  },
};

export const SessionsOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
};

export const AiOff: Story = {
  name: "AI off",
  args: { aiOn: false },
  play: async ({ canvas }) => {
    // A person who holds the key still finds the agent off, and no composer to type into.
    await expect(canvas.getByText("AI is off.")).toBeVisible();
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};
