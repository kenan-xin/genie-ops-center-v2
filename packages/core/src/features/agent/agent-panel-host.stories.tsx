import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";

import { ShellContext } from "../shell/shell-context.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
import { handoffDetail } from "./__fixtures__/handoff.ts";
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
  /** The page's path, which turns on a surface's agent on its record page. */
  readonly path?: string;
}) {
  const [page, setPage] = useState(props.page);

  // The app's router moves the path, as a link to another record does.
  const [path, setPath] = useState(props.path ?? "/dashboards/d1");

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
          <h1 className="text-xl font-bold">Example page</h1>
          <AgentButton />
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
          navigate={(href) => {
            navigate(href);
            setPath(href);
          }}
        />
      </div>
    </ShellContext.Provider>
  );
}

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

/**
 * The agent panel of every signed-in page (R-42, `czjw.81`): from 1280 px a 400 px column beside
 * the page, below that a sheet. The Agent button opens it, and shows the agent's work while the
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
          "The agent panel: a full-height column from 1280 px that narrows the page, a 480 px sheet from 768 px, and a full-screen sheet below. Its header holds Agent, the page's About line, New chat, Open in Ask and Close. It keeps the tab's chat across page loads, and a page gives it a record context, suggestions and a refresh through `useAgentPage`. The stories stub the agent route; no model runs.",
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

const panel = () => screen.findByRole("region", { name: "Agent" });

// FR2: the agent keeps working with the panel closed, and the button says so (R-42).
export const WorksWithThePanelClosed: Story = {
  name: "Works with the panel closed",
  render: () => <Frame page={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await panel();

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "How many records are there?{Enter}"
    );
    await screen.findByText("Half an");

    await userEvent.click(
      screen.getByRole("button", { name: "Close the agent panel" })
    );
    await expect(
      await canvas.findByRole("button", { name: "Agent, working" })
    ).toHaveAttribute("aria-expanded", "false");

    release();
    await expect(
      await canvas.findByRole("button", { name: "Agent" })
    ).toBeVisible();
  },
};

const openInAsk = () => screen.getByRole("link", { name: "Open in Ask" });

const phone = { viewport: { value: "phone390", isRotated: false } };

// T6.2: on a surface's record page the panel is that surface's agent, and a new chat binds to it.
export const SurfacePage: Story = {
  render: () => <Frame page={false} path="/placeholder/r1" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));

    const region = await screen.findByRole("region", {
      name: "Placeholder agent",
    });

    await expect(
      within(region).getByRole("tab", { name: "This chat" })
    ).toBeVisible();
    await expect(
      within(region).getByRole("tab", { name: "Chats" })
    ).toBeVisible();
    await expect(
      screen.queryByRole("link", { name: "Open in Ask" })
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
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await screen.findByRole("region", { name: "Agent" });
    await expect(openInAsk()).toBeVisible();
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
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));

    const region = await screen.findByRole("region", {
      name: "Placeholder agent",
    });

    const header = () => within(region.querySelector("header")!);

    await expect(await header().findByText("Building")).toBeVisible();
    // The agent's name shows in full beside the chip, also at 390 px (Phase 11 capture).
    const name = region.querySelector("h2 .truncate")!;
    await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth);
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
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await userEvent.click(await screen.findByRole("tab", { name: "Chats" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Older chat" })
    );
    await expect(navigate).toHaveBeenCalledWith("/placeholder/r2");
    await expect(await screen.findByText("The older chat")).toBeVisible();
  },
};

// T6.5: on a phone the surface's agent is a bottom panel that leaves the record in view.
export const PhoneSheet: Story = {
  globals: phone,
  render: () => <Frame page={false} path="/placeholder/r1" />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await screen.findByRole("region", { name: "Placeholder agent" });
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
  },
};

// AM3: Open in Ask starts Ask afresh before any answer, continues the chat after one, and waits
// while an answer streams, which Ask could not show yet (I1, Review Focus 3).
export const OpenInAsk: Story = {
  name: "Open in Ask",
  render: () => <Frame page={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await panel();

    await expect(openInAsk()).toHaveAttribute("href", "/ask");

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Message" }),
      "How many records are there?{Enter}"
    );
    await screen.findByText("Half an");
    await expect(
      screen.getByRole("button", { name: "Open in Ask" })
    ).toBeDisabled();

    release();
    await screen.findByText("Half an answer.");

    const id = sessionStorage.getItem(SESSION_KEY);

    await waitFor(() =>
      expect(openInAsk()).toHaveAttribute("href", `/ask/${id}`)
    );

    // New chat has no stored answer yet.
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    await expect(openInAsk()).toHaveAttribute("href", "/ask");
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
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await panel();

    await expect(openInAsk()).toHaveAttribute("href", `/ask/${SAVED_ID}`);
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
      await userEvent.click(canvas.getByRole("button", { name: "Agent" }));

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

    await expect(region).toHaveTextContent("About: Monthly review");
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
    await expect(region).not.toHaveTextContent("About:");
    release();
    await expect(onFinished).toHaveBeenCalledTimes(1);
  },
};

const LONG_ABOUT = "Records, Overdue, Customer Example Trading Company";

/** M1: the About line shows its whole text on its own row, in at most two lines (czjw.111). */
async function expectWholeAbout(): Promise<void> {
  const region = await panel();

  const line = await within(region).findByText(`About: ${LONG_ABOUT}`);

  await expect(line).toHaveAttribute("title", LONG_ABOUT);
  await expect(line.scrollWidth).toBe(line.clientWidth);
  await expect(line.scrollHeight).toBe(line.clientHeight);
}

export const ALongAboutLine: Story = {
  name: "A long About line in the docked panel",
  render: () => <Frame page about={LONG_ABOUT} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a chart" }));
    await expectWholeAbout();
  },
};

export const ALongAboutLineOnAPhone: Story = {
  name: "A long About line on a phone",
  render: () => <Frame page about={LONG_ABOUT} />,
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a chart" }));
    await expectWholeAbout();
  },
};

// PL1, PL2: the person leaves the page out of the chat. The line goes, and the next message sends
// no context; once the page shows another record, the line and the context come back.
export const ThePersonLeavesThePageOut: Story = {
  name: "The person leaves the page out",
  render: () => <Frame page />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a chart" }));

    const region = await panel();

    await expect(region).toHaveTextContent("About: Monthly review");
    await waitFor(() => expect(agentRoute).toHaveBeenCalledTimes(1));
    release();
    await screen.findByText("Half an answer.");

    await userEvent.click(
      screen.getByRole("button", { name: "Leave this page out of the chat" })
    );
    await expect(region).not.toHaveTextContent("About:");

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message" }),
      "And in general?{Enter}"
    );
    await waitFor(() => expect(agentRoute).toHaveBeenCalledTimes(2));
    await expect(sentBody(1).context).toBeUndefined();
    release();
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(2));

    await userEvent.click(
      canvas.getByRole("button", { name: "Open the next dashboard" })
    );
    await expect(region).toHaveTextContent("About: Monthly review");

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message" }),
      "And this one?{Enter}"
    );
    await waitFor(() => expect(agentRoute).toHaveBeenCalledTimes(3));
    await expect(sentBody(2).context).toEqual({
      page: "Dashboard",
      record: { type: "analytics-dashboard", id: "d2" },
    });
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
