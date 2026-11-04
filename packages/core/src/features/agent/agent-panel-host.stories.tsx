import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import { z } from "zod";

import { ShellContext } from "../shell/shell-context.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
import { AgentButton } from "./agent-button.tsx";
import {
  AGENT_PANEL_SESSION_KEY,
  AGENT_PANEL_STORED_KEY,
  AgentPanelHost,
} from "./agent-panel-host.tsx";
import { resetAgentPanel, useAgentPage } from "./agent-panel-store.ts";

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
  context: z
    .object({ recordType: z.string(), recordId: z.string() })
    .optional(),
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
function TestPage() {
  const [recordId, setRecordId] = useState("d1");

  const { send } = useAgentPage({
    context: { recordType: "analytics-dashboard", recordId },
    about: "Monthly review",
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

/** The shell's row as the host sees it: the page, then the panel. */
function Frame(props: { readonly page: boolean }) {
  const [page, setPage] = useState(props.page);

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
              <TestPage />
              <button type="button" onClick={() => setPage(false)}>
                Leave the page
              </button>
            </>
          ) : null}
        </main>
        <AgentPanelHost
          models={null}
          labels={{ steps: {}, datasets: {} }}
          suggestions={[]}
          inbox={[]}
          timeZone="UTC"
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
    models: null,
    labels: { steps: {}, datasets: {} },
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

    const id = sessionStorage.getItem(AGENT_PANEL_SESSION_KEY);

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
    sessionStorage.setItem(AGENT_PANEL_SESSION_KEY, SAVED_ID);
    sessionStorage.setItem(AGENT_PANEL_STORED_KEY, SAVED_ID);
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await panel();

    await expect(openInAsk()).toHaveAttribute("href", `/ask/${SAVED_ID}`);
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
      context: { recordType: "analytics-dashboard", recordId: "d1" },
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
      recordType: "analytics-dashboard",
      recordId: "d1",
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
