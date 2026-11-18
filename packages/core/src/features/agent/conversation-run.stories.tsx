import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ChatTransport, UIMessageChunk } from "ai";
import { useEffect, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import {
  CONTINUE_TEXT,
  continueMessage,
  runEndMessage,
  TIME_LIMIT_TEXT,
} from "../../services/agent/continue.ts";
import type { AgentMessage } from "../../services/agent/index.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
import {
  BRIEF_MESSAGE,
  FULL_ANSWER,
  HANDOFF_LABELS,
  handoffDetail,
  PARTIAL_ANSWER,
  STEPS_ONLY_ANSWER,
} from "./__fixtures__/handoff.ts";
import { AgentChat } from "./agent-chat.tsx";
import { Conversation } from "./conversation.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const sendNothing = fn(async () => new ReadableStream<UIMessageChunk>());

const transport: ChatTransport<AgentMessage> = {
  sendMessages: sendNothing,
  reconnectToStream: async () => null,
};

const onStop = fn();

const onTryAgain = fn();

const FULL_TEXT = "The placeholder record has its first step.";

function RunChat(props: {
  readonly status: AgentRunStatus | null;
  readonly messages: readonly AgentMessage[];
  /** A later read that replaces the first one, as the next poll does. */
  readonly next?: {
    readonly status: AgentRunStatus | null;
    readonly messages: readonly AgentMessage[];
  };
}) {
  const [read, setRead] = useState({
    status: props.status,
    messages: props.messages,
  });

  useEffect(() => {
    if (props.next === undefined) return;

    const timer = setTimeout(() => setRead(props.next!), 400);

    return () => clearTimeout(timer);
  }, [props.next]);

  return (
    <AgentClientStub>
      <div style={{ height: "100dvh" }} className="flex flex-col">
        <Conversation
          sessionId="00000000-0000-4000-8000-0000000000a1"
          initialMessages={props.messages}
          transport={transport}
          models={null}
          checkChart={async () => {
            throw new Error("This story draws no chart.");
          }}
          timeZone="UTC"
          labels={HANDOFF_LABELS}
          suggestions={[]}
          inbox={[]}
          artifacts={{
            kind: "link",
            href: () => "/ask",
            rowsHref: () => "/ask",
          }}
          headingLevel={2}
          onNewChat={() => undefined}
          run={{
            ...read,
            askHref: "/ask/00000000-0000-4000-8000-0000000000a0",
            onStop,
            onTryAgain,
            failure: undefined,
            retrying: false,
          }}
        />
      </div>
    </AgentClientStub>
  );
}

/**
 * A background run in the shared chat (R-42b, S7-41): Building and Stop in place of Send, a notice
 * with Try again when the run ended early, and each read of the run replacing the chat's messages.
 */
const meta = {
  title: "Core/Agent/Conversation run",
  component: RunChat,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  globals: desktop,
  args: { status: "building", messages: [BRIEF_MESSAGE, PARTIAL_ANSWER] },
} satisfies Meta<typeof RunChat>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Building: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // SHELL-5: one square Stop; the status says Working to a screen reader only (C15-8).
    await expect(await canvas.findByText("Working")).toHaveAttribute(
      "role",
      "status"
    );
    await expect(canvas.queryByRole("button", { name: "Send" })).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Stop building" })
    ).toHaveTextContent(/^$/);

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "More{Enter}"
    );
    await expect(sendNothing).not.toHaveBeenCalled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Stop building" })
    );
    await expect(onStop).toHaveBeenCalledOnce();
  },
};

export const BuildingOnAPhone: Story = { ...Building, globals: phone };

// Review Focus 4: one Stop at a time.
export const Stopping: Story = {
  args: { status: "stopping" },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", {
        name: "Stop building",
      })
    ).toBeDisabled();
  },
};

export const StoppingOnAPhone: Story = { ...Stopping, globals: phone };

function endedEarly(status: AgentRunStatus, notice: string): Story {
  return {
    args: { status },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);

      await expect(await canvas.findByText(notice)).toBeVisible();
      await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
      await expect(onTryAgain).toHaveBeenCalledOnce();
    },
  };
}

export const Stopped: Story = endedEarly("stopped", "You stopped this work.");

export const StoppedOnAPhone: Story = { ...Stopped, globals: phone };

export const Interrupted: Story = endedEarly(
  "interrupted",
  "A restart interrupted this work."
);

export const InterruptedOnAPhone: Story = { ...Interrupted, globals: phone };

export const Failed: Story = endedEarly(
  "failed",
  "This work could not finish."
);

export const FailedOnAPhone: Story = { ...Failed, globals: phone };

// DEC-57: the time box, not the person, stopped the run, so the chat says only why.
export const EndedAtTheTimeLimit: Story = {
  args: {
    status: "stopped",
    messages: [
      BRIEF_MESSAGE,
      PARTIAL_ANSWER,
      { id: "time-limit-1", ...runEndMessage("time-limit", TIME_LIMIT_TEXT) },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText(TIME_LIMIT_TEXT)).toBeVisible();
    await expect(canvas.queryByText("You stopped this work.")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(onTryAgain).toHaveBeenCalledOnce();
  },
};

export const EndedAtTheTimeLimitOnAPhone: Story = {
  ...EndedAtTheTimeLimit,
  globals: phone,
};

// Review Focus 5: the read that saw the end replaces the last checkpoint.
export const EndsBetweenPolls: Story = {
  args: {
    next: { status: "saved", messages: [BRIEF_MESSAGE, FULL_ANSWER] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText(FULL_TEXT)).toBeVisible();
    await expect(canvas.queryByText("Working")).toBeNull();
  },
};

export const EndsBetweenPollsOnAPhone: Story = {
  ...EndsBetweenPolls,
  globals: phone,
};

// DEC-57: a run's second turn starts with a continue message that the person never sees.
export const ContinuedInASecondTurn: Story = {
  args: {
    status: "saved",
    messages: [
      BRIEF_MESSAGE,
      PARTIAL_ANSWER,
      { id: "continue-1", ...continueMessage() },
      FULL_ANSWER,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText(FULL_TEXT)).toBeVisible();
    await expect(canvas.queryByText(CONTINUE_TEXT)).toBeNull();
  },
};

export const ContinuedInASecondTurnOnAPhone: Story = {
  ...ContinuedInASecondTurn,
  globals: phone,
};

const onProgress = fn();

/** The reads a building run answers, one per poll, then the saved read for good. */
const READS = [
  handoffDetail("building", [BRIEF_MESSAGE]),
  handoffDetail("building", [BRIEF_MESSAGE, PARTIAL_ANSWER]),
  handoffDetail("saved", [BRIEF_MESSAGE, FULL_ANSWER]),
];

function PolledChat() {
  const [reads] = useState(() => [...READS]);

  return (
    <AgentClientStub
      session={async () => (reads.length > 1 ? reads.shift()! : reads[0]!)}
    >
      <div style={{ height: "100dvh" }} className="flex flex-col">
        <AgentChat
          sessionId="00000000-0000-4000-8000-0000000000a1"
          models={null}
          labels={HANDOFF_LABELS}
          suggestions={[]}
          inbox={[]}
          timeZone="UTC"
          artifacts={{
            kind: "link",
            href: () => "/ask",
            rowsHref: () => "/ask",
          }}
          headingLevel={3}
          onNewChat={() => undefined}
          onProgress={onProgress}
        />
      </div>
    </AgentClientStub>
  );
}

function ChatWithRun({
  status,
  messages = [BRIEF_MESSAGE, PARTIAL_ANSWER],
  ...client
}: {
  readonly status: AgentRunStatus;
  readonly messages?: readonly AgentMessage[];
  readonly stop?: () => Promise<void>;
  readonly retry?: () => Promise<void>;
}) {
  return (
    <AgentClientStub
      {...client}
      session={async () => handoffDetail(status, messages)}
    >
      <div style={{ height: "100dvh" }} className="flex flex-col">
        <AgentChat
          sessionId="00000000-0000-4000-8000-0000000000a1"
          models={null}
          labels={HANDOFF_LABELS}
          suggestions={[]}
          inbox={[]}
          timeZone="UTC"
          artifacts={{
            kind: "link",
            href: () => "/ask",
            rowsHref: () => "/ask",
          }}
          headingLevel={3}
          onNewChat={() => undefined}
        />
      </div>
    </AgentClientStub>
  );
}

export const StopFails: StoryObj<typeof ChatWithRun> = {
  render: () => (
    <ChatWithRun
      status="building"
      stop={async () => {
        throw new Error("The stop did not reach the server.");
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole("button", { name: "Stop building" })
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The work could not be stopped. Try again."
    );
  },
};

let rejectRetry: (error: Error) => void = () => undefined;

const retryPending = fn(
  () =>
    new Promise<void>((_, reject) => {
      rejectRetry = reject;
    })
);

// Review Focus 3: Try again pressed twice while its retry is pending sends one retry.
export const TryAgainFails: StoryObj<typeof ChatWithRun> = {
  render: () => <ChatWithRun status="failed" retry={retryPending} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const tryAgain = await canvas.findByRole("button", { name: "Try again" });

    // By keyboard: the pending button keeps focus, so Enter does not drop it on the page.
    tryAgain.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(tryAgain).toHaveAttribute("aria-disabled", "true")
    );
    await expect(tryAgain).toHaveFocus();

    await userEvent.click(tryAgain);
    await expect(retryPending).toHaveBeenCalledOnce();

    rejectRetry(new Error("The retry did not reach the server."));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The work could not start again. Try again."
    );
    await waitFor(() =>
      expect(tryAgain).not.toHaveAttribute("aria-disabled", "true")
    );
    await expect(tryAgain).toHaveFocus();
  },
};

// T5.6: the record page reads again after each change of the run, and once at its end.
export const ProgressWhileItBuilds: StoryObj<typeof PolledChat> = {
  render: () => <PolledChat />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(FULL_TEXT, {}, { timeout: 5000 })
    ).toBeVisible();
    await waitFor(() => expect(onProgress).toHaveBeenCalledTimes(2));
  },
};

/** The live last row of a building run, found by the Steps list it closes. */
async function liveRow(canvasElement: HTMLElement) {
  const list = await within(canvasElement).findByRole("list", {
    name: "Steps",
  });

  const row = within(list).getAllByRole("listitem").at(-1);

  if (row === undefined) throw new Error("The Steps list has no rows.");

  return { list, row };
}

// E1: a background build between steps still looks alive, never finished or stuck.
export const StepsWhileItBuilds: StoryObj<typeof ChatWithRun> = {
  render: () => (
    <ChatWithRun
      status="building"
      messages={[BRIEF_MESSAGE, STEPS_ONLY_ANSWER]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const { list, row } = await liveRow(canvasElement);

    await expect(within(list).getByText("Looked up the data")).toBeVisible();
    await expect(row).toHaveTextContent(/^Thinking/);
    await expect(row).toHaveAttribute("aria-current", "step");
    await expect(canvas.queryByText(/Worked for/)).toBeNull();
    await expect(canvas.queryByRole("button", { name: "1 step" })).toBeNull();
  },
};

// E1: before the run's first step, the chat already shows it thinking.
export const ThinkingBeforeTheFirstStep: StoryObj<typeof ChatWithRun> = {
  render: () => <ChatWithRun status="building" messages={[BRIEF_MESSAGE]} />,
  play: async ({ canvasElement }) => {
    const { list, row } = await liveRow(canvasElement);

    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await expect(row).toHaveTextContent(/^Thinking/);
    await expect(row).toHaveAttribute("aria-current", "step");
  },
};

/** A building run whose answer text started and whose messages carry stored times 38 s apart. */
const STARTED_WITH_TIMES: readonly AgentMessage[] = [
  { ...BRIEF_MESSAGE, metadata: { createdAt: "2026-10-27T02:00:00.000Z" } },
  {
    ...STEPS_ONLY_ANSWER,
    parts: [...STEPS_ONLY_ANSWER.parts, ...PARTIAL_ANSWER.parts],
    metadata: { createdAt: "2026-10-27T02:00:38.000Z" },
  },
];

// Review Focus 1: the chat never shows "Worked for" before the run ends.
export const StripWhileItBuilds: StoryObj<typeof ChatWithRun> = {
  render: () => <ChatWithRun status="building" messages={STARTED_WITH_TIMES} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole("button", { name: "1 step" })
    ).toBeVisible();
    await expect(canvas.queryByText(/Worked for/)).toBeNull();
  },
};
