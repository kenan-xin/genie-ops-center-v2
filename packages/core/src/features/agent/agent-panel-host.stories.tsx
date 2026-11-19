import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";

import type {
  AgentArtifact,
  AgentMessage,
} from "../../services/agent/index.ts";
import type { PanelConfig } from "../../services/charts/panel-config.ts";
import { ShellContext } from "../shell/shell-context.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
import { HANDOFF_CARD, handoffDetail } from "./__fixtures__/handoff.ts";
import { AgentButton } from "./agent-button.tsx";
import {
  AGENT_PANEL_SESSION_KEY,
  AGENT_PANEL_STORED_KEY,
  AgentPanelHost,
} from "./agent-panel-host.tsx";
import { resetAgentPanel, useAgentPage } from "./agent-panel-store.ts";

const PERSON = "person-1";

const SESSION_KEY = `${AGENT_PANEL_SESSION_KEY}:${PERSON}`;

const STORED_KEY = `${AGENT_PANEL_STORED_KEY}:${PERSON}`;

/** Ends the held answer of the last request. */
let release: () => void = () => undefined;

/** The agent route: each answer shows half a sentence, then waits for `release`. */
const agentRoute = fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    return createUIMessageStreamResponse({
      stream: new ReadableStream<UIMessageChunk>({
        async start(controller) {
          controller.enqueue({ type: "start" });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: 'root = Answer([p])\np = Paragraph("Half an',
          });
          await hold;
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: ' answer.")',
          });
          controller.enqueue({ type: "text-end", id: "answer" });
          controller.enqueue({ type: "finish" });
          controller.close();
        },
      }),
    });
  }
);

/** The body of the n-th request to the route. */
const routeBody = z.object({
  context: z.unknown().optional(),
  surface: z.unknown().optional(),
  message: z.object({
    parts: z.array(z.object({ type: z.string(), text: z.string() })),
  }),
});

function sentBody(index: number): z.infer<typeof routeBody> {
  const init = agentRoute.mock.calls[index]?.[1];

  return routeBody.parse(JSON.parse(String(init?.body)));
}

const onFinished = fn();

/** A page that talks to the panel through the seam, as a dashboard does. */
function TestPage(props: { readonly about?: string | undefined }) {
  const [recordId, setRecordId] = useState("d1");

  const { send } = useAgentPage({
    context: {
      page: "Dashboard",
      record: { type: "analytics-dashboard", id: recordId },
    },
    about: props.about ?? "Monthly review",
    onFinished,
  });

  const [renders, setRenders] = useState(0);

  return (
    <div className="flex gap-2 p-4">
      <button type="button" onClick={() => send("Add a chart")}>
        Add a chart
      </button>
      <button type="button" onClick={() => setRenders(renders + 1)}>
        Draw again ({renders})
      </button>
      <button type="button" onClick={() => setRecordId("d2")}>
        Open the next dashboard
      </button>
    </div>
  );
}

/** The surfaces the panel knows: the placeholder's test surface on `/placeholder/:id`. */
const SURFACES = [
  {
    id: "placeholder",
    name: "Placeholder agent",
    recordPage: "/placeholder/:id",
    acceptsHandoff: true,
  },
];

const navigate = fn();

/** The shell's row as the host sees it: the page, then the panel. */
function Frame(props: {
  readonly page: boolean;
  readonly person?: string;
  readonly about?: string;
  /** The page's path, which turns on Ask for a surface on its record page. */
  readonly path?: string;
  /** The address's `?chat=`, which the app passes to the panel (R14). */
  readonly chat?: string;
}) {
  const [page, setPage] = useState(props.page);

  // The app's router moves the path, as a link to another record does; `?chat=` goes apart.
  const [path, setPath] = useState(props.path ?? "/dashboards/d1");
  const [chat, setChat] = useState(props.chat);

  return (
    <ShellContext.Provider
      value={{
        chrome: "workspace",
        backTo: "Back to {page}",
        agentPanel: true,
      }}
    >
      <div className="flex h-dvh">
        <main className="min-w-0 flex-1 p-4">
          {/* The shell's header row: the title, then the Ask button at its end (P07-59). */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold">Example page</h1>
            <AgentButton />
          </div>
          {props.chat === undefined ? null : (
            <>
              <button type="button" onClick={() => setChat(undefined)}>
                Clear the chat parameter
              </button>
              <button type="button" onClick={() => setChat(props.chat)}>
                Set the chat parameter again
              </button>
            </>
          )}
          {page ? (
            <>
              <TestPage about={props.about} />
              <button type="button" onClick={() => setPage(false)}>
                Leave the page
              </button>
            </>
          ) : null}
        </main>
        <AgentPanelHost
          person={props.person ?? PERSON}
          models={null}
          labels={{ steps: {}, datasets: {}, fields: {} }}
          suggestions={[]}
          inbox={[]}
          timeZone="UTC"
          surfaces={SURFACES}
          path={path}
          initialSessionId={chat}
          navigate={(href) => {
            const url = new URL(href, "http://story");

            navigate(href);
            setPath(url.pathname);
            setChat(url.searchParams.get("chat") ?? undefined);
          }}
        />
      </div>
    </ShellContext.Provider>
  );
}

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

/**
 * The Ask panel of every signed-in page (R-42, `czjw.81`): from 1280 px a 400 px column beside
 * the page, below that a sheet. The Ask button opens it, and shows Ask's work while the
 * panel is closed. A page talks to it only through `useAgentPage`.
 */
const meta = {
  title: "Core/Agent/Agent panel host",
  component: AgentPanelHost,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The Ask panel: a full-height column from 1280 px that narrows the page, a 480 px sheet from 768 px, and a full-screen sheet below. Its header holds Ask, New chat, Open in Ask and Close, and the line under it names the page that Ask knows about. It keeps the tab's chat across page loads, and a page gives it a record context, suggestions and a refresh through `useAgentPage`. The stories stub the agent route; no model runs.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <AgentClientStub>
        <Story />
      </AgentClientStub>
    ),
  ],
  globals: desktop,
  beforeEach: () => {
    resetAgentPanel();
    sessionStorage.clear();
    agentRoute.mockClear();
    onFinished.mockClear();
    release = () => undefined;

    const original = globalThis.fetch;

    globalThis.fetch = agentRoute;

    return () => {
      release();
      globalThis.fetch = original;
    };
  },
  args: {
    person: PERSON,
    models: null,
    labels: { steps: {}, datasets: {}, fields: {} },
    suggestions: [],
    inbox: [],
    timeZone: "UTC",
  },
} satisfies Meta<typeof AgentPanelHost>;

export default meta;

type Story = StoryObj<typeof meta>;

const panel = () => screen.findByRole("region", { name: "Ask" });

// FR2: the agent keeps working with the panel closed, and the button says so (R-42).
export const WorksWithThePanelClosed: Story = {
  name: "Works with the panel closed",
  render: () => <Frame page={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await panel();

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "How many records are there?{Enter}"
    );
    await screen.findByText("Half an");

    await userEvent.click(screen.getByRole("button", { name: "Close Ask" }));
    await expect(
      await canvas.findByRole("button", { name: "Ask, working" })
    ).toHaveAttribute("aria-expanded", "false");

    release();
    await expect(
      await canvas.findByRole("button", { name: "Ask" })
    ).toBeVisible();
  },
};

/** Opens the panel's Chat actions menu and gives its Open in Ask item (czjw.198). */
async function openInAsk(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: "Chat actions" }));

  return screen.findByRole("menuitem", { name: /^Open in Ask/ });
}

const closeMenu = () => userEvent.keyboard("{Escape}");

const phone = { viewport: { value: "phone390", isRotated: false } };

// T6.2: on a surface's record page the panel is Ask for that surface, and a new chat binds to it.
export const SurfacePage: Story = {
  render: () => <Frame page={false} path="/placeholder/r1" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const region = await screen.findByRole("region", {
      name: "Ask",
    });

    // G3: the panel is Ask on a surface page too; no surface's name heads it (P05-21).
    await expect(
      within(region).getByRole("heading", { level: 2 })
    ).toHaveTextContent(/^Ask$/);
    await expect(
      within(region).getByRole("button", { name: "Chats" })
    ).toHaveAttribute("aria-pressed", "false");
    // czjw.198: a surface chat has no link to Ask, so no Chat actions menu.
    await expect(
      screen.queryByRole("button", { name: "Chat actions" })
    ).toBeNull();

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "Add a step{Enter}"
    );
    await waitFor(() => expect(agentRoute).toHaveBeenCalled());
    await expect(sentBody(0).surface).toEqual({
      id: "placeholder",
      recordId: "r1",
    });
    release();
  },
};

export const SurfacePageOnAPhone: Story = { ...SurfacePage, globals: phone };

// T6.3: a page with no surface keeps the panel as it was (AC-8).
export const OtherPage: Story = {
  render: () => <Frame page={false} path="/invoices" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await screen.findByRole("region", { name: "Ask" });
    const item = await openInAsk();

    // The menu fades in.
    await waitFor(() => expect(item).toBeVisible());
  },
};

const handedReads = fn();

// T6.4: after a handoff the record page opens on the chat that builds, which ends Saved.
export const AfterAHandoff: Story = {
  render: () => {
    const reads = [handoffDetail("building"), handoffDetail("saved")];

    return (
      <AgentClientStub
        sessions={async () => [handoffDetail("building").session]}
        session={async () => {
          handedReads();

          return reads.length > 1 ? reads.shift()! : reads[0]!;
        }}
      >
        <Frame page={false} path="/placeholder/r1" />
      </AgentClientStub>
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const region = await screen.findByRole("region", {
      name: "Ask",
    });

    const header = () => within(region.querySelector("header")!);

    await expect(await header().findByText("Working")).toBeVisible();
    // The title shows in full beside the chip, also at 390 px (Phase 11 capture).
    const name = region.querySelector("h2 .truncate")!;
    await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth);
    // One row: the shell's collapsed-panel offset (P11-65) assumes a header of about 62 px.
    await expect(
      region.querySelector("header")!.offsetHeight
    ).toBeLessThanOrEqual(64);
    await expect(await within(region).findByText("From Ask")).toBeVisible();
    await expect(
      await header().findByText("Saved", {}, { timeout: 4000 })
    ).toBeVisible();
  },
};

export const AfterAHandoffOnAPhone: Story = {
  ...AfterAHandoff,
  globals: phone,
};

const OLDER_R2 = "00000000-0000-4000-8000-0000000000b2";

const NEWER_R2 = "00000000-0000-4000-8000-0000000000b3";

function r2Chat(id: string, title: string, updatedAt: string) {
  return {
    ...handoffDetail(null).session,
    id,
    title,
    recordId: "r2",
    updatedAt,
  };
}

// Review fix: a chat of another record opens that record's page on that chat, not its newest.
export const PickAnotherRecordsChat: Story = {
  render: () => (
    <AgentClientStub
      sessions={async () => [
        r2Chat(NEWER_R2, "Newer chat", "2026-10-27T03:00:00.000Z"),
        r2Chat(OLDER_R2, "Older chat", "2026-10-27T01:00:00.000Z"),
      ]}
      session={async ({ id }) => ({
        session: r2Chat(id, "Chat", "2026-10-27T01:00:00.000Z"),
        messages: [
          {
            id: `answer-${id}`,
            role: "assistant",
            parts: [
              {
                type: "text",
                text: `root = Answer([p])\np = Paragraph("${id === OLDER_R2 ? "The older chat" : "The newer chat"}")`,
              },
            ],
          },
        ],
      })}
    >
      <Frame page={false} path="/placeholder/r1" />
    </AgentClientStub>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await userEvent.click(await screen.findByRole("button", { name: "Chats" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Older chat" })
    );
    await expect(navigate).toHaveBeenCalledWith(
      `/placeholder/r2?chat=${OLDER_R2}`
    );
    await expect(await screen.findByText("The older chat")).toBeVisible();
  },
};

// czjw.203: with the tabs gone, the Chats button shows the list, and a second press the chat.
export const ChatsButtonOpensTheList: Story = {
  render: () => <Frame page={false} path="/placeholder/r1" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const chats = await within(await panel()).findByRole("button", {
      name: "Chats",
    });

    await expect(chats).toHaveAttribute("aria-pressed", "false");
    await expect(
      await screen.findByRole("log", { name: "Conversation" })
    ).toBeVisible();

    await userEvent.click(chats);
    await expect(chats).toHaveAttribute("aria-pressed", "true");
    await expect(
      screen.getByRole("navigation", { name: "Chats" })
    ).toBeVisible();
    await expect(
      screen.queryByRole("log", { name: "Conversation" })
    ).toBeNull();

    await userEvent.click(chats);
    await expect(chats).toHaveAttribute("aria-pressed", "false");
    await expect(
      screen.getByRole("log", { name: "Conversation" })
    ).toBeVisible();
  },
};

const SHOWN_R1 = "00000000-0000-4000-8000-0000000000c1";

const removed = fn(async (_input: { readonly id: string }) => undefined);

// A delete of the shown chat from its row leaves the panel on an empty new chat, not the deleted one.
export const PanelRowMenuDeletesTheShownChat: Story = {
  render: () => (
    <AgentClientStub
      sessions={async () => [
        {
          ...r2Chat(SHOWN_R1, "Shown chat", "2026-10-27T03:00:00.000Z"),
          recordId: "r1",
        },
      ]}
      session={async ({ id }) =>
        id === SHOWN_R1
          ? {
              session: {
                ...r2Chat(id, "Shown chat", "2026-10-27T03:00:00.000Z"),
                recordId: "r1",
              },
              messages: [
                {
                  id: "answer-shown",
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: 'root = Answer([p])\np = Paragraph("The shown chat")',
                    },
                  ],
                },
              ],
            }
          : null
      }
      remove={removed}
    >
      <Frame page={false} path="/placeholder/r1" />
    </AgentClientStub>
  ),
  beforeEach: () => {
    removed.mockClear();
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await screen.findByText("The shown chat");

    await userEvent.click(screen.getByRole("button", { name: "Chats" }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Chat actions for Shown chat",
      })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete chat" })
    );

    await waitFor(() => expect(removed).toHaveBeenCalledWith({ id: SHOWN_R1 }));
    await expect(
      await screen.findByRole("heading", {
        name: "What would you like to know?",
      })
    ).toBeVisible();
    await expect(screen.queryByText("The shown chat")).toBeNull();
  },
};

/** Two chats of record r2, each answering its own line, on r2's page with `?chat=` the older. */
function GivenChatFrame() {
  return (
    <AgentClientStub
      sessions={async () => [
        r2Chat(NEWER_R2, "Newer chat", "2026-10-27T03:00:00.000Z"),
        r2Chat(OLDER_R2, "Older chat", "2026-10-27T01:00:00.000Z"),
      ]}
      session={async ({ id }) => ({
        session: r2Chat(id, "Chat", "2026-10-27T01:00:00.000Z"),
        messages: [
          {
            id: `answer-${id}`,
            role: "assistant",
            parts: [
              {
                type: "text",
                text: `root = Answer([p])\np = Paragraph("${id === OLDER_R2 ? "The older chat" : "The newer chat"}")`,
              },
            ],
          },
        ],
      })}
    >
      <Frame page={false} path="/placeholder/r2" chat={OLDER_R2} />
    </AgentClientStub>
  );
}

// R14: Ask's link to a surface chat opens its record page with the panel on that chat, not the newest.
export const PanelOpensOnTheGivenChat: Story = {
  name: "Panel opens on the given chat",
  render: () => <GivenChatFrame />,
  play: async () => {
    // The panel opens by itself; no click on Agent.
    await expect(await screen.findByText("The older chat")).toBeVisible();
    await expect(screen.queryByText("The newer chat")).toBeNull();
  },
};

// Review fix: leaving `?chat=` and coming back to the same value opens that chat again, over a pick.
export const TheSameChatParameterAgainBeatsAPick: Story = {
  name: "The same chat parameter again beats a pick",
  render: () => <GivenChatFrame />,
  play: async ({ canvas }) => {
    await screen.findByText("The older chat");
    await userEvent.click(screen.getByRole("button", { name: "Chats" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Newer chat" })
    );
    await expect(await screen.findByText("The newer chat")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear the chat parameter" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set the chat parameter again" })
    );
    await expect(await screen.findByText("The older chat")).toBeVisible();
    await expect(screen.queryByText("The newer chat")).toBeNull();
  },
};

const markSeen = fn(
  async (_input: { readonly sessionId: string }) => undefined
);

/** Whether the stubbed run has ended; each story sets it. */
let runEnded = false;

const runReads = fn();

/** The handed-over chat, building until `runEnded`, with `markSeen` watched (R12). */
function RunFrame() {
  return (
    <AgentClientStub
      sessions={async () => [handoffDetail("building").session]}
      session={async () => {
        const read = handoffDetail(runEnded ? "saved" : "building");

        runReads(read.session.run);

        return read;
      }}
      markSeen={markSeen}
    >
      <Frame page={false} path="/placeholder/r1" />
    </AgentClientStub>
  );
}

// Review Focus 5: the person watches the run end, so the chat gets no unseen dot afterwards.
export const ARunThatEndsWhileOpenMarksItSeen: Story = {
  name: "A run that ends while open marks it seen",
  beforeEach: () => {
    runEnded = false;
    markSeen.mockClear();
  },
  render: () => <RunFrame />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const region = await screen.findByRole("region", {
      name: "Ask",
    });

    await within(region.querySelector("header")!).findByText("Working");
    // A building run has no unseen mark to clear yet.
    await expect(markSeen).not.toHaveBeenCalled();

    runEnded = true;
    await within(region.querySelector("header")!).findByText(
      "Saved",
      {},
      { timeout: 4000 }
    );
    await waitFor(() =>
      expect(markSeen).toHaveBeenCalledWith({
        sessionId: HANDOFF_CARD.sessionId,
      })
    );
  },
};

// R12: a run that ends while the panel is closed was not watched, so its chat stays unseen.
export const ARunThatEndsWithThePanelClosedStaysUnseen: Story = {
  name: "A run that ends with the panel closed stays unseen",
  beforeEach: () => {
    runEnded = false;
    markSeen.mockClear();
    runReads.mockClear();
  },
  render: () => <RunFrame />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const region = await screen.findByRole("region", {
      name: "Ask",
    });

    await within(region.querySelector("header")!).findByText("Working");
    await userEvent.click(screen.getByRole("button", { name: "Close Ask" }));

    runEnded = true;
    // The closed panel keeps its chat, which still reads the run and sees it end.
    await waitFor(() => expect(runReads).toHaveBeenCalledWith("saved"), {
      timeout: 4000,
    });
    await expect(markSeen).not.toHaveBeenCalled();

    // Opening the chat is what marks it seen.
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1));
  },
};

// T6.5: on a phone Ask on a surface is a bottom panel that leaves the record in view.
export const PhoneSheet: Story = {
  globals: phone,
  render: () => <Frame page={false} path="/placeholder/r1" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await screen.findByRole("region", { name: "Ask" });
    await expect(
      document.querySelector('[data-slot="sheet-overlay"]')
    ).toBeNull();

    const less = screen.getByRole("button", { name: "Show less" });

    await expect(less).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(less);
    await expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();

    const more = screen.getByRole("button", { name: "Show more" });

    await expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    await expect(
      await screen.findByRole("textbox", { name: "Message" })
    ).toBeVisible();

    // czjw.151: Close and Escape both give focus back to Agent.
    const agent = canvas.getByRole("button", { name: "Ask" });

    await userEvent.click(screen.getByRole("button", { name: "Close Ask" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Ask" }),
        "after Close"
      ).toBeNull()
    );
    await expect(agent).toHaveFocus();

    await userEvent.click(agent);

    const newChat = await within(
      await screen.findByRole("region", { name: "Ask" })
    ).findByRole("button", { name: "New chat" });

    await userEvent.click(newChat);
    await expect(newChat).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Ask" }),
        "after Escape"
      ).toBeNull()
    );
    await expect(agent).toHaveFocus();
  },
};

/** C06-3: the header's buttons as "height px at top", so a mismatch names each one. */
async function headerRow() {
  const header = within(await panel());

  return [
    header.getByRole("button", { name: "New chat" }),
    header.getByRole("button", { name: "Chat actions" }),
    header.getByRole("button", { name: "Close Ask" }),
  ].map((control) => {
    const { height, top } = control.getBoundingClientRect();

    return `${Math.round(height * 10) / 10} px at ${Math.round(top * 10) / 10}`;
  });
}

// C06-3: the panel header is not a dense place, so New chat takes the md height of its icon buttons.
export const HeaderLinesUp: Story = {
  name: "On a desktop the header's buttons are 36 px on one top edge",
  render: () => <Frame page={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const [newChat, ...rest] = await headerRow();

    await expect(newChat).toMatch(/^36 px/);
    await expect(rest).toEqual([newChat, newChat]);
  },
};

export const HeaderLinesUpOnPhone: Story = {
  ...HeaderLinesUp,
  name: "On a phone the header's buttons are 40 px on one top edge",
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const [newChat, ...rest] = await headerRow();

    await expect(newChat).toMatch(/^40 px/);
    await expect(rest).toEqual([newChat, newChat]);
  },
};

const BAR = {
  type: "bar",
  title: "Quantity by record",
  series: [
    {
      name: "Quantity",
      dataset: "example.items",
      query: { limit: 10 },
      x: "label",
      y: "quantity",
    },
  ],
} as const satisfies PanelConfig;

const CHART_ID = "11111111-1111-4111-8111-111111111111";

const CHART_ARTIFACTS: readonly AgentArtifact[] = [
  {
    id: CHART_ID,
    number: 1,
    kind: "chart",
    title: BAR.title,
    latestVersion: 1,
    versions: [
      {
        version: 1,
        definition: BAR,
        request: "Chart the quantity",
        createdAt: "2026-11-05T08:00:00Z",
      },
    ],
  },
];

/** A saved surface chat whose answer made a chart. */
const CHART_CHAT: readonly AgentMessage[] = [
  {
    id: "question",
    role: "user",
    parts: [{ type: "text", text: "Chart the quantity" }],
  },
  {
    id: "answer",
    role: "assistant",
    parts: [
      {
        type: "tool-make-artifact",
        toolCallId: "call-chart",
        state: "output-available",
        input: { config: BAR },
        output: { artifact: 1, version: 1, title: BAR.title },
      },
      {
        type: "data-artifact",
        id: "call-chart",
        data: { artifactId: CHART_ID, version: 1 },
      },
      { type: "text", text: "Here is the chart." },
    ],
  },
];

const chartChat = handoffDetail(null, CHART_CHAT);

/** The chat's artifacts, read after a pause, as over a network. */
const slowArtifacts = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));

  return CHART_ARTIFACTS;
};

/** The surface page with that chat; the chart gate draws two bars. */
function ChartChatFrame(props: {
  readonly artifacts?: () => Promise<readonly AgentArtifact[]>;
}) {
  return (
    <AgentClientStub
      sessions={async () => [chartChat.session]}
      session={async () => chartChat}
      artifacts={props.artifacts ?? slowArtifacts}
      chart={async (config) => ({
        // SAFETY: the story's only chart is BAR.
        config: config as PanelConfig,
        data: {
          kind: "bar",
          title: BAR.title,
          x: { key: "label", label: "Record", type: "text" },
          columns: [{ key: "quantity", label: "Quantity", type: "number" }],
          rows: [
            { label: "Alpha", quantity: 3 },
            { label: "Beta", quantity: 5 },
          ],
          datasets: ["example.items"],
          readAt: "2026-11-05T08:05:00Z",
          truncated: false,
        },
      })}
    >
      <Frame page={false} path="/placeholder/r1" />
    </AgentClientStub>
  );
}

/** Opens the panel and the chart card's sheet; returns the card. */
async function openChartSheet(canvas: {
  getByRole: typeof screen.getByRole;
}): Promise<HTMLElement> {
  await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

  const region = await screen.findByRole("region", {
    name: "Ask",
  });

  // The chat's chunk and its saved messages load first.
  const card = await within(region).findByRole(
    "button",
    { name: /^Quantity by record/ },
    { timeout: 5000 }
  );

  await userEvent.click(card);

  const sheet = await screen.findByRole(
    "dialog",
    { name: "Chart or table" },
    { timeout: 5000 }
  );

  // The sheet opens on the artifact, never on an empty list while the read is under way.
  await expect(
    within(sheet).queryByText("This chart or table cannot be shown here yet.")
  ).toBeNull();
  await expect(
    await within(sheet).findByRole("heading", { name: BAR.title })
  ).toBeVisible();

  return card;
}

// G1 (czjw.162): on a record page the card opens the artifact in a sheet over the page; Escape
// closes only the sheet, so the panel stays, and focus goes back to the card.
export const SurfaceArtifactSheet: Story = {
  render: () => <ChartChatFrame />,
  play: async ({ canvas }) => {
    const card = await openChartSheet(canvas);

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Chart or table" })
      ).toBeNull()
    );
    await expect(screen.getByRole("region", { name: "Ask" })).toBeVisible();
    await waitFor(() => expect(card).toHaveFocus());
  },
};

/** The first read of the chat's artifacts and its one retry fail; the next read answers. */
let failedReads = 0;

// G1b (czjw.162): a failed read says so and offers Try again, instead of an empty sheet.
export const SurfaceArtifactReadFails: Story = {
  render: () => (
    <ChartChatFrame
      artifacts={async () => {
        if (failedReads < 2) {
          failedReads += 1;
          throw new Error("The read failed.");
        }

        return CHART_ARTIFACTS;
      }}
    />
  ),
  beforeEach: () => {
    failedReads = 0;
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

    const region = await screen.findByRole("region", {
      name: "Ask",
    });

    const card = await within(region).findByRole(
      "button",
      { name: /^Quantity by record/ },
      { timeout: 5000 }
    );

    await userEvent.click(card);

    // The query tries once more before it fails.
    const alert = await within(region).findByRole(
      "alert",
      {},
      { timeout: 5000 }
    );

    await expect(alert).toHaveTextContent("The chart or table could not load.");
    // SHELL-5: a card never says Showing beside a failed load.
    await expect(
      within(region).getByRole("button", { name: /^Quantity by record/ })
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      screen.queryByRole("dialog", { name: "Chart or table" })
    ).toBeNull();

    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" })
    );

    const sheet = await screen.findByRole(
      "dialog",
      { name: "Chart or table" },
      { timeout: 5000 }
    );

    await expect(
      await within(sheet).findByRole("heading", { name: BAR.title })
    ).toBeVisible();

    // Try again is gone by now, so focus goes back to the card.
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Chart or table" })
      ).toBeNull()
    );
    await waitFor(() => expect(card).toHaveFocus());
  },
};

// G2 (czjw.162): on a phone, Back to chat closes the sheet, the bottom panel stays, and the
// card has focus again.
export const SurfaceArtifactSheetOnAPhone: Story = {
  globals: phone,
  render: () => <ChartChatFrame />,
  play: async ({ canvas }) => {
    const card = await openChartSheet(canvas);

    await userEvent.click(screen.getByRole("button", { name: "Back to chat" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Chart or table" })
      ).toBeNull()
    );
    await expect(screen.getByRole("region", { name: "Ask" })).toBeVisible();
    await waitFor(() => expect(card).toHaveFocus());
  },
};

// AM3: Open in Ask starts Ask afresh before any answer, continues the chat after one, and waits
// while an answer streams, which Ask could not show yet (I1, Review Focus 3).
export const OpenInAsk: Story = {
  name: "Open in Ask",
  render: () => <Frame page={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await panel();

    await expect(await openInAsk()).toHaveAttribute("href", "/ask");
    await closeMenu();

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "How many records are there?{Enter}"
    );
    await screen.findByText("Half an");

    // A dead item says why it waits.
    const waiting = await openInAsk();

    await expect(waiting).toHaveAttribute("aria-disabled", "true");
    await expect(waiting).toHaveTextContent("Ready when the answer ends");
    await closeMenu();

    release();
    await screen.findByText("Half an answer.");

    const id = sessionStorage.getItem(SESSION_KEY);

    await waitFor(() => expect(sessionStorage.getItem(STORED_KEY)).toBe(id));
    await expect(await openInAsk()).toHaveAttribute("href", `/ask/${id}`);
    await closeMenu();

    // New chat has no stored answer yet.
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    await expect(await openInAsk()).toHaveAttribute("href", "/ask");
  },
};

const SAVED_ID = "00000000-0000-4000-8000-0000000000aa";

// A page load keeps the tab's chat, and Open in Ask still continues it (I1).
export const OpenInAskAfterAPageLoad: Story = {
  name: "Open in Ask after a page load",
  render: () => <Frame page={false} />,
  beforeEach: () => {
    sessionStorage.setItem(SESSION_KEY, SAVED_ID);
    sessionStorage.setItem(STORED_KEY, SAVED_ID);
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await panel();

    await expect(await openInAsk()).toHaveAttribute("href", `/ask/${SAVED_ID}`);
  },
};

/** Two people sign in on one tab, one after the other; a sign-in is a page load. */
function TwoSignIns() {
  const [person, setPerson] = useState("person-2");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetAgentPanel();
          setPerson(PERSON);
        }}
      >
        Sign in as another person
      </button>
      <Frame key={person} person={person} page={false} />
    </>
  );
}

const sentSession = (index: number) =>
  z
    .object({ sessionId: z.string() })
    .parse(JSON.parse(String(agentRoute.mock.calls[index]?.[1]?.body)))
    .sessionId;

// The route refuses another person's chat, so the second person's panel must start its own.
export const AnotherPersonOnTheSameTab: Story = {
  name: "Another person on the same tab",
  render: () => <TwoSignIns />,
  play: async ({ canvas }) => {
    const ask = async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

      await userEvent.type(
        await screen.findByRole("textbox", { name: "Message" }),
        "How many records are there?{Enter}"
      );
      await screen.findByText("Half an");
      release();
      await screen.findByText("Half an answer.");
    };

    await ask();
    await userEvent.click(
      canvas.getByRole("button", { name: "Sign in as another person" })
    );
    await ask();

    await expect(sentSession(1)).not.toBe(sentSession(0));
  },
};

// FR4 to FR6: the page's context goes with its message and is gone after it unmounts; a page's
// send opens the panel and sends once; `onFinished` runs once (Review Focus 4).
export const APageTalksToThePanel: Story = {
  name: "A page talks to the panel",
  render: () => <Frame page />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a chart" }));

    const region = await panel();

    await expect(region).toHaveTextContent("This page: Monthly review");
    await expect(
      screen.queryByRole("button", { name: "Leave this page out of the chat" })
    ).toBeNull();
    await waitFor(() => expect(agentRoute).toHaveBeenCalledTimes(1));
    await expect(sentBody(0)).toEqual({
      context: {
        page: "Dashboard",
        record: { type: "analytics-dashboard", id: "d1" },
      },
      message: { parts: [{ type: "text", text: "Add a chart" }] },
    });

    // A new render of the page sends nothing more.
    await userEvent.click(canvas.getByRole("button", { name: /Draw again/ }));
    await screen.findByText("Half an");
    await expect(agentRoute).toHaveBeenCalledTimes(1);

    release();
    await screen.findByText("Half an answer.");
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));

    // After the page goes, the next message names no record.
    await userEvent.click(
      canvas.getByRole("button", { name: "Leave the page" })
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Message" }),
      "And now?{Enter}"
    );
    await waitFor(() => expect(agentRoute).toHaveBeenCalledTimes(2));
    await expect(sentBody(1).context).toBeUndefined();
    await expect(region).not.toHaveTextContent("This page:");
    release();
    await expect(onFinished).toHaveBeenCalledTimes(1);
  },
};

const LONG_ABOUT = "Records, Overdue, Customer Example Trading Company";

/** M1: the page line shows its whole text on its own row, in at most two lines (czjw.111). */
async function expectWholePageLine(): Promise<void> {
  const region = await panel();

  const line = await within(region).findByText(`This page: ${LONG_ABOUT}`);

  await expect(line).toHaveAttribute("title", LONG_ABOUT);
  await expect(line.scrollWidth).toBe(line.clientWidth);
  await expect(line.scrollHeight).toBe(line.clientHeight);
}

export const ALongPageLine: Story = {
  name: "A long page line in the docked panel",
  render: () => <Frame page about={LONG_ABOUT} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a chart" }));
    await expectWholePageLine();
  },
};

export const ALongPageLineOnAPhone: Story = {
  name: "A long page line on a phone",
  render: () => <Frame page about={LONG_ABOUT} />,
  globals: { viewport: { value: "phone390", isRotated: false } },
  // czjw.200: on a phone the page line sits in the header, so the chrome is one row.
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a chart" }));

    const region = await panel();

    const line = await within(region.querySelector("header")!).findByText(
      `This page: ${LONG_ABOUT}`
    );

    await expect(line).toHaveAttribute("title", LONG_ABOUT);
    await expect(within(region).getAllByText(/^This page:/)).toHaveLength(1);
  },
};

// A page's message waits while an answer streams. It goes for the record it was sent for, and is
// dropped once the person opens another record, so it never changes the wrong one.
export const AQueuedMessageKeepsItsRecord: Story = {
  name: "A queued message keeps its record",
  render: () => <Frame page />,
  play: async ({ canvas }) => {
    const add = canvas.getByRole("button", { name: "Add a chart" });

    await userEvent.click(add);
    await screen.findByText("Half an");

    // Queued for d1 while the first answer streams; it goes once that answer ends.
    await userEvent.click(add);
    release();
    await waitFor(() => expect(agentRoute).toHaveBeenCalledTimes(2));
    await expect(sentBody(1).context).toEqual({
      page: "Dashboard",
      record: { type: "analytics-dashboard", id: "d1" },
    });

    // Queued for d1, then the person opens d2: nothing goes.
    await userEvent.click(add);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open the next dashboard" })
    );
    release();
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(agentRoute).toHaveBeenCalledTimes(2);
  },
};
