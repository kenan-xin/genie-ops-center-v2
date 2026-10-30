import { Button } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import type {
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";
import { ChatBubble } from "./chat-bubble.tsx";

const FIRST_SESSION: AgentSessionSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "How many example records are there?",
  modelId: "openai/gpt-6.1-terra",
  updatedAt: "2026-10-30T09:00:00.000Z",
};

const SESSIONS: readonly AgentSessionSummary[] = [
  FIRST_SESSION,
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "What can you do?",
    modelId: "anthropic/claude-opus-5.5",
    updatedAt: "2026-10-29T16:30:00.000Z",
  },
];

const INBOX: readonly InboxLink[] = [
  { label: "Documents", href: "/m/placeholder" },
];

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * Stands in for the conversation: it shows the id it was opened with and a Send of its own, so a
 * story can tell one chat from the next without a model.
 */
function StubConversation(props: {
  readonly sessionId: string;
  readonly onSend?: () => void;
}) {
  const [sent, setSent] = useState(false);

  return (
    <div className="grid gap-2">
      <p>New session {props.sessionId}</p>
      <Button
        type="button"
        onClick={() => {
          setSent(true);
          props.onSend?.();
        }}
      >
        Send
      </Button>
      {sent ? <p>Message sent</p> : null}
    </div>
  );
}

/**
 * The bubble's own history comes from the query in the app. Here a send adds the session to the
 * list, the way a finished answer refreshes it, so the story can check the history survives a
 * close and reopen.
 */
function NewChatHarness() {
  const [sessions, setSessions] = useState(SESSIONS);

  return (
    <ChatBubble
      askHref="/ask"
      sessionHref={(id) => `/ask/${id}`}
      inbox={INBOX}
      sessions={sessions}
      conversation={(sessionId) => (
        <StubConversation
          sessionId={sessionId}
          onSend={() =>
            setSessions((current) =>
              current.some((session) => session.id === sessionId)
                ? current
                : [
                    {
                      id: sessionId,
                      title: "Records after the first send",
                      modelId: "openai/gpt-6.1-terra",
                      updatedAt: "2026-10-30T10:00:00.000Z",
                    },
                    ...current,
                  ]
            )
          }
        />
      )}
    />
  );
}

async function openBubble(
  canvas: Parameters<NonNullable<StoryObj["play"]>>[0]["canvas"]
) {
  await userEvent.click(canvas.getByRole("button", { name: "Open Ask" }));

  // The Sheet enters at opacity 0, and the matcher reads the ancestors' opacity too.
  await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
}

/**
 * The chat bubble at the bottom right of every signed-in page (R-42, P15): a round button that
 * opens a Sheet with a new chat, the person's history, the Documents inbox link and Open Ask.
 * Each open starts a new session (B11.1); the history is shared with Ask.
 */
const meta = {
  title: "Core/Agent/Chat bubble",
  component: ChatBubble,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The chat bubble: a fixed round button at the bottom right that opens a Sheet from the right. Every open starts a new session, while the history list is the person's shared sessions. The stub conversation proves the id changes; it calls no model.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    askHref: "/ask",
    sessionHref: (id: string) => `/ask/${id}`,
    inbox: INBOX,
    sessions: SESSIONS,
    conversation: (sessionId: string) => (
      <StubConversation sessionId={sessionId} />
    ),
  },
} satisfies Meta<typeof ChatBubble>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NewChatEachTime: Story = {
  name: "New chat each time",
  render: () => <NewChatHarness />,
  globals: desktop,
  play: async ({ canvas }) => {
    await openBubble(canvas);

    const first = await screen.findByText(/^New session /);
    const firstId = first.textContent;

    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await expect(screen.getByText("Message sent")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(canvas.getByRole("button", { name: "Open Ask" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());

    // A new session each open, with none of the last chat's content.
    const second = await screen.findByText(/^New session /);
    await expect(second.textContent).not.toBe(firstId);
    await expect(screen.queryByText("Message sent")).toBeNull();

    // The history still holds the session the first send created.
    await expect(
      screen.getByRole("link", { name: "Records after the first send" })
    ).toBeVisible();
  },
};

export const ClosedDesktop: Story = {
  globals: { ...desktop, theme: "light" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Open Ask" })
    ).toBeVisible();
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

export const ClosedPhone: Story = {
  globals: { ...phone, theme: "light" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Open Ask" })
    ).toBeVisible();
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

export const ClosedDesktopDark: Story = {
  globals: { ...desktop, theme: "dark" },
};

export const ClosedPhoneDark: Story = {
  globals: { ...phone, theme: "dark" },
};

export const OpenDesktop: Story = {
  globals: { ...desktop, theme: "light" },
  play: async ({ canvas }) => {
    await openBubble(canvas);

    await expect(screen.getByRole("heading", { name: "Ask" })).toBeVisible();
    await expect(
      screen.getByRole("button", { name: "New chat" })
    ).toBeVisible();
    await expect(
      screen.getByRole("link", { name: "Open Ask" })
    ).toHaveAttribute("href", "/ask");
    await expect(
      screen.getByRole("link", { name: FIRST_SESSION.title })
    ).toHaveAttribute("href", `/ask/${FIRST_SESSION.id}`);
    await expect(
      screen.getByRole("link", { name: "Documents" })
    ).toHaveAttribute("href", "/m/placeholder");
    await expect(screen.getByText(/^New session /)).toBeVisible();
  },
};

export const OpenPhone: Story = {
  globals: { ...phone, theme: "light" },
  play: async ({ canvas }) => {
    await openBubble(canvas);

    await expect(screen.getByRole("heading", { name: "Ask" })).toBeVisible();
    await expect(
      screen.getByRole("button", { name: "New chat" })
    ).toBeVisible();
    await expect(screen.getByText(/^New session /)).toBeVisible();
  },
};

export const OpenDesktopDark: Story = {
  globals: { ...desktop, theme: "dark" },
  play: async ({ canvas }) => {
    await openBubble(canvas);
  },
};

export const OpenPhoneDark: Story = {
  globals: { ...phone, theme: "dark" },
  play: async ({ canvas }) => {
    await openBubble(canvas);
  },
};
