import { Button } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

import type {
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";
import { BUBBLE_SESSION_KEY, ChatBubble } from "./chat-bubble.tsx";

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
  { label: "Documents", href: "/m/example" },
];

// From 1280 px the chat docks as a column; below it opens as a sheet.
const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * Stands in for the conversation: it shows the id it was opened with, the welcome, and a Send of
 * its own, so a story can tell one chat from the next without a model.
 */
function StubConversation(props: {
  readonly sessionId: string;
  readonly empty: ReactNode;
  readonly onSend?: () => void;
}) {
  const [sent, setSent] = useState(false);

  return (
    <div className="grid gap-2 p-4">
      {sent ? <p>Message sent</p> : props.empty}
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
      timeZone="UTC"
      conversation={(sessionId, empty) => (
        <StubConversation
          sessionId={sessionId}
          empty={empty}
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

/** The open panel, as a docked column or a sheet. */
const panel = () => screen.getByRole("region", { name: "Ask" });

async function openBubble(
  canvas: Parameters<NonNullable<StoryObj["play"]>>[0]["canvas"]
) {
  await userEvent.click(canvas.getByRole("button", { name: "Open Ask" }));

  // The Sheet enters at opacity 0, and the matcher reads the ancestors' opacity too.
  await waitFor(() => expect(panel()).toBeVisible());
}

async function closeBubble() {
  await userEvent.click(screen.getByRole("button", { name: "Close the chat" }));
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Ask" })).toBeNull()
  );
}

/**
 * The general chat of every signed-in page (R-42, Section 7 redesign P7): a round "Open Ask"
 * button and the "Ask" panel, docked from 1280 px and a sheet below. A reopen continues the tab's
 * last chat, and only New chat starts a new one (`czjw.60`); the history is shared with Ask.
 */
const meta = {
  title: "Core/Agent/Chat bubble",
  component: ChatBubble,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The chat bubble: a round button at the bottom right that opens the Ask panel, a docked column from 1280 px and a sheet below. Its header holds New chat and Open Ask, the person's chats wait in a closed fold, and a new chat shows a welcome with the Documents inbox link. A reopen continues the last chat of this browser tab, also after a page load, and only New chat starts a new session. The stub conversation shows the id; it calls no model.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    askHref: "/ask",
    sessionHref: (id: string) => `/ask/${id}`,
    inbox: INBOX,
    sessions: SESSIONS,
    timeZone: "UTC",
    conversation: (sessionId: string, empty: ReactNode) => (
      <StubConversation sessionId={sessionId} empty={empty} />
    ),
  },
} satisfies Meta<typeof ChatBubble>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ReopenKeepsTheChat: Story = {
  name: "Reopen keeps the chat",
  render: () => <NewChatHarness />,
  globals: desktop,
  play: async ({ canvas }) => {
    await openBubble(canvas);

    const first = await screen.findByText(/^New session /);
    const firstId = first.textContent;

    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await expect(screen.getByText("Message sent")).toBeVisible();

    await closeBubble();
    await openBubble(canvas);

    // The reopen continues the same session, and the tab keeps its id for a page load.
    const second = await screen.findByText(/^New session /);
    await expect(second.textContent).toBe(firstId);
    await expect(firstId).toContain(
      sessionStorage.getItem(BUBBLE_SESSION_KEY) ?? "no stored id"
    );

    // Only New chat starts another session.
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    const third = await screen.findByText(/^New session /);
    await expect(third.textContent).not.toBe(firstId);

    // The history still holds the session the first send created.
    await userEvent.click(screen.getByRole("button", { name: "Chats" }));
    await expect(
      screen.getByRole("link", { name: /Records after the first send/ })
    ).toBeVisible();
  },
};

export const ClosedDesktop: Story = {
  globals: { ...desktop, theme: "light" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Open Ask" })
    ).toBeVisible();
    await expect(screen.queryByRole("region", { name: "Ask" })).toBeNull();
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

    const open = within(panel());

    await expect(open.getByRole("heading", { name: /^Ask/ })).toBeVisible();
    await expect(open.getByRole("button", { name: "New chat" })).toBeVisible();
    await expect(open.getByRole("link", { name: "Open Ask" })).toHaveAttribute(
      "href",
      "/ask"
    );
    // A new chat welcomes the person and links the Documents inbox (R-42).
    await expect(open.getByRole("link", { name: "Documents" })).toHaveAttribute(
      "href",
      "/m/example"
    );

    // The chats wait in a closed fold, each with its day.
    const chats = open.getByRole("button", { name: "Chats" });

    await expect(chats).toHaveAttribute("aria-expanded", "false");
    await expect(
      open.queryByRole("link", { name: /What can you do/ })
    ).toBeNull();
    await userEvent.click(chats);
    await expect(
      open.getByRole("link", { name: /How many example records/ })
    ).toHaveAttribute("href", `/ask/${FIRST_SESSION.id}`);
    await expect(
      open.getByRole("link", { name: /How many example records/ })
    ).toHaveTextContent("30 Oct 2026");
  },
};

export const OpenPhone: Story = {
  globals: { ...phone, theme: "light" },
  play: async ({ canvas }) => {
    await openBubble(canvas);

    await expect(screen.getByRole("dialog", { name: "Ask" })).toBeVisible();
    await expect(
      within(panel()).getByRole("button", { name: "New chat" })
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
