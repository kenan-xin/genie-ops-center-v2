import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ChatTransport, UIMessageChunk } from "ai";
import { useState, type ComponentProps } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

import type {
  AgentArtifact,
  AgentMessage,
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";
import type { PanelConfig } from "../../services/charts/panel-config.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
import { latestRef, type ArtifactRef } from "./artifact-refs.ts";
import { AskScreen } from "./ask-screen.tsx";
import type { CheckChart } from "./chart-check.tsx";
import { Conversation } from "./conversation.tsx";

const OVERDUE = "Which customers currently have overdue invoices?";

const SESSIONS: readonly AgentSessionSummary[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: OVERDUE,
    modelId: "openai/gpt-6.1-terra",
    updatedAt: new Date().toISOString(),
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

const TABLE = {
  type: "table",
  title: "Balances",
  series: [
    {
      name: "Balances",
      dataset: "example.items",
      query: { select: ["name"] },
    },
  ],
} as const satisfies PanelConfig;

const TABLE_ID = "22222222-2222-4222-8222-222222222222";

const ARTIFACTS: readonly AgentArtifact[] = [
  {
    id: TABLE_ID,
    number: 1,
    kind: "table",
    title: "Balances",
    latestVersion: 2,
    versions: [
      {
        version: 1,
        definition: TABLE,
        request: "List the balances",
        createdAt: "2026-11-05T08:00:00Z",
      },
      {
        version: 2,
        definition: TABLE,
        request: "Only the open ones",
        createdAt: "2026-11-05T08:01:00Z",
      },
    ],
  },
];

/** The gate's rows for the table artifact. */
const draw: CheckChart = async (config) => {
  // SAFETY: the stories pass only the table config above.
  const panel = config as PanelConfig;

  return {
    config: panel,
    data: {
      kind: "table",
      title: panel.title,
      columns: [{ key: "name", label: "Name", type: "text" }],
      rows: [{ name: "Alpha" }, { name: "Beta" }],
      datasets: ["example.items"],
      readAt: "2026-11-05T08:05:00Z",
      truncated: false,
    },
  };
};

/** An answer that makes the table, then says so. */
const sendCard: ChatTransport<AgentMessage> = {
  sendMessages: async () => {
    const chunks: readonly UIMessageChunk[] = [
      { type: "start" },
      {
        type: "tool-input-available",
        toolCallId: "call-table",
        toolName: "make-artifact",
        input: { config: TABLE },
      },
      {
        type: "tool-output-available",
        toolCallId: "call-table",
        output: { artifact: 1, version: 2, title: "Balances" },
      },
      {
        type: "data-artifact",
        id: "call-table",
        data: { artifactId: TABLE_ID, version: 2 },
      },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "Here are the balances." },
      { type: "text-end", id: "answer" },
      { type: "finish" },
    ];

    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);

        controller.close();
      },
    });
  },
  reconnectToStream: async () => null,
};

type AskProps = ComponentProps<typeof AskScreen>;

/** Ask as the route composes it: the screen keeps no artifact state, the route does. */
function Framed(props: AskProps) {
  const [shown, setShown] = useState<ArtifactRef | null>(props.shown);

  return (
    <AgentClientStub chart={draw}>
      <div style={{ height: "100dvh" }} className="flex flex-col">
        <AskScreen {...props} shown={shown} onShow={setShown}>
          <Conversation
            sessionId="00000000-0000-4000-8000-000000000003"
            initialMessages={NO_MESSAGES}
            transport={sendCard}
            models={null}
            labels={{ steps: {}, datasets: {}, fields: {} }}
            suggestions={[]}
            checkChart={draw}
            timeZone="UTC"
            inbox={INBOX}
            artifacts={{ kind: "panel", shown, onOpen: setShown }}
            headingLevel={2}
            onNewChat={() => undefined}
          />
        </AskScreen>
      </div>
    </AgentClientStub>
  );
}

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * Ask (R-42, R-42a, R-45a): the chat history beside the shared chat, and the artifact panel that
 * opens only from a card.
 */
const meta = {
  title: "Core/Agent/Ask screen",
  component: AskScreen,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The Ask frame around the shared agent chat. From 1024 px the chat history is a 272 px gray column with Chats, New chat and Hide chats in its top row, then Search chats and the groups Today and Earlier; a long title ends with an ellipsis. Hide chats removes it fully, and the top bar then holds only Show chats and the title. Below 1024 px a bar under the shell's top bar holds Show chats, the title and New chat, and the history opens as a left sheet. An artifact opens only from its card: a 480 px column from 1280 px, a sheet below. With AI off the chat is replaced by the AI-off message.",
      },
    },
    a11y: { test: "error" },
  },
  render: (args) => <Framed {...args} />,
  globals: desktop,
  args: {
    sessions: SESSIONS,
    currentId: SESSIONS[0]?.id,
    title: OVERDUE,
    sessionHref: (id: string) => `/ask/${id}`,
    newChatHref: "/ask",
    aiOn: true,
    timeZone: "Asia/Singapore",
    datasetTitles: {},
    artifacts: ARTIFACTS,
    shown: null,
    onShow: () => undefined,
    children: null,
  },
} satisfies Meta<typeof AskScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

const history = () =>
  screen.queryByRole("complementary", { name: "Chat history" });

// AK1: the history hides fully, and the top bar then holds only its toggle (I18c, owner note).
export const HideTheChatHistory: Story = {
  name: "Hide the chat history",
  play: async ({ canvas }) => {
    const column = history();

    if (column === null) throw new Error("No chat history column.");

    await expect(
      within(column).getByRole("heading", { level: 2, name: "Chats" })
    ).toBeVisible();
    await expect(
      within(column).getByRole("link", { name: OVERDUE })
    ).toHaveAttribute("aria-current", "page");
    // The inbox line sits in the new chat, not in the rail (czjw.120 item 20).
    await expect(
      within(column).queryByRole("link", { name: "Documents" })
    ).toBeNull();
    await expect(
      within(canvas.getByRole("region", { name: "Conversation" })).getByRole(
        "link",
        { name: "Documents" }
      )
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Hide chats" }));

    await expect(history()).toBeNull();

    const show = canvas.getByRole("button", { name: "Show chats" });

    await expect(show).toHaveFocus();
    await expect(canvas.queryByRole("link", { name: "New chat" })).toBeNull();
    await expect(
      canvas.queryByRole("searchbox", { name: "Search chats" })
    ).toBeNull();

    await userEvent.click(show);

    await expect(history()).not.toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Hide chats" })
    ).toHaveFocus();
  },
};

// Variant B keeps the chat in a centered reading column on a wide screen, also with the history
// hidden; a composer that spans the whole width is the bug this catches.
export const ReadingColumnOnAWideScreen: Story = {
  name: "Reading column on a wide screen",
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Hide chats" }));

    const section = canvas
      .getByRole("region", { name: "Conversation" })
      .getBoundingClientRect();

    const composer = canvas
      .getByRole("textbox", { name: "Message" })
      .getBoundingClientRect();

    await expect(composer.width).toBeLessThanOrEqual(768);
    await expect(
      Math.abs(composer.left - section.left - (section.right - composer.right))
    ).toBeLessThanOrEqual(2);
  },
};

// AK3: the search ignores case and says when nothing matches.
export const SearchChats: Story = {
  name: "Search chats",
  play: async ({ canvas }) => {
    const search = canvas.getByRole("searchbox", { name: "Search chats" });

    const titles = () =>
      within(canvas.getByRole("navigation", { name: "Chats" }))
        .queryAllByRole("link")
        .map((link) => link.textContent);

    await userEvent.type(search, "overdue");
    await expect(titles()).toEqual([OVERDUE]);

    await userEvent.clear(search);
    await userEvent.type(search, "OVERDUE");
    await expect(titles()).toEqual([OVERDUE]);

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    await expect(titles()).toEqual([]);
    await expect(canvas.getByText("No chats match.")).toBeVisible();
  },
};

const artifactPanel = () => screen.queryByRole("region", { name: "Artifact" });

const LONG_TITLE =
  "Which customers with overdue items in the north region also paid late last quarter, and by how many days on average?";

const LONG_SESSIONS: readonly AgentSessionSummary[] = [
  {
    ...SESSIONS[1]!,
    id: "00000000-0000-4000-8000-000000000009",
    title: LONG_TITLE,
  },
  ...SESSIONS,
];

/** C1: the long title ends with an ellipsis, keeps its full text on hover, and nothing scrolls sideways. */
async function expectEllipsis(root: HTMLElement): Promise<void> {
  const nav = within(root).getByRole("navigation", { name: "Chats" });

  const link = within(nav).getByRole("link", { name: LONG_TITLE });

  const text = link.querySelector("span") ?? link;

  await expect(link).toHaveAttribute("title", LONG_TITLE);
  await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
  await expect(nav.scrollWidth).toBe(nav.clientWidth);
}

// C1 (czjw.107): a grid track sized to the widest title kept the rail scrolling sideways.
export const ALongChatTitle: Story = {
  name: "A long chat title",
  args: { sessions: LONG_SESSIONS },
  play: async () => {
    const column = history();

    if (column === null) throw new Error("No chat history column.");

    await expectEllipsis(column);
  },
};

export const ALongChatTitleOnAPhone: Story = {
  name: "A long chat title on a phone",
  args: { sessions: LONG_SESSIONS },
  globals: phone,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Show chats" }));

    const sheet = await screen.findByRole("dialog", { name: "Chats" });

    await waitFor(() =>
      expect(
        within(sheet).getByRole("link", { name: LONG_TITLE })
      ).toBeVisible()
    );
    await expectEllipsis(sheet);
  },
};

// C2 (czjw.120 item 19): the search box and the rows share both edges, Hide chats ends on that
// edge, and the row text starts under the heading.
export const RailEdges: Story = {
  name: "Rail edges",
  play: async () => {
    const column = history();

    if (column === null) throw new Error("No chat history column.");

    const rail = within(column);

    const search = rail
      .getByRole("searchbox", { name: "Search chats" })
      .closest('[data-slot="input-group"]')
      ?.getBoundingClientRect();

    const link = rail.getByRole("link", { name: OVERDUE });

    const row = link.getBoundingClientRect();

    const rowText = (
      link.querySelector("span") ?? link
    ).getBoundingClientRect();

    const hide = rail
      .getByRole("button", { name: "Hide chats" })
      .getBoundingClientRect();

    const heading = rail
      .getByRole("heading", { level: 2, name: "Chats" })
      .getBoundingClientRect();

    if (search === undefined) throw new Error("No search box.");

    await expect(
      Math.max(
        Math.abs(search.left - row.left),
        Math.abs(search.right - row.right),
        Math.abs(hide.right - search.right),
        Math.abs(rowText.left - heading.left)
      )
    ).toBeLessThan(1);
  },
};

// AK4: an answer's card does not open the panel by itself; pressing it does (R-45a).
export const AnArtifactOpensOnlyWhenAsked: Story = {
  name: "An artifact opens only when asked",
  play: async ({ canvas }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "List the balances{Enter}"
    );

    const card = await canvas.findByRole("button", { name: /^Balances/ });

    await waitFor(() => expect(card).toBeEnabled());
    await expect(artifactPanel()).toBeNull();

    await userEvent.click(card);

    const panel = await screen.findByRole("region", { name: "Artifact" });

    await expect(within(panel).getByText("Version 2 of 2")).toBeVisible();
    // Beside the chat, not over it.
    const chat = canvas.getByRole("region", { name: "Conversation" });

    await expect(panel.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      chat.getBoundingClientRect().right
    );
    await expect(card).toHaveAttribute("aria-pressed", "true");
  },
};

// AK5: Open in Ask names an artifact, and Ask opens on its latest version.
export const OpensOnTheArtifactItWasSentTo: Story = {
  name: "Opens on the artifact it was sent to",
  args: { shown: latestRef(ARTIFACTS, TABLE_ID) },
  play: async () => {
    const panel = await screen.findByRole("region", { name: "Artifact" });

    await expect(
      within(panel).getByRole("heading", { level: 2, name: "Balances" })
    ).toBeVisible();
    await expect(within(panel).getByText("Version 2 of 2")).toBeVisible();
  },
};

export const ChatHistoryOnAPhone: Story = {
  name: "Chat history on a phone",
  globals: phone,
  play: async ({ canvas }) => {
    await expect(history()).toBeNull();
    await expect(canvas.getByRole("link", { name: "New chat" })).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Show chats" }));

    const sheet = await screen.findByRole("dialog", { name: "Chats" });

    // The sheet fades in, so its content becomes visible a moment after it mounts.
    await waitFor(() =>
      expect(within(sheet).getByRole("link", { name: OVERDUE })).toBeVisible()
    );
    await expect(
      within(sheet).getByRole("searchbox", { name: "Search chats" })
    ).toBeVisible();
  },
};

export const AiOff: Story = {
  name: "AI off",
  args: { aiOn: false },
  render: (args) => (
    <AgentClientStub>
      <AskScreen {...args} />
    </AgentClientStub>
  ),
  play: async ({ canvas }) => {
    // A person who holds the key still finds the agent off, and no composer to type into.
    await expect(canvas.getByText("AI is off.")).toBeVisible();
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};
