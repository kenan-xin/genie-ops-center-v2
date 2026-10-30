import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ChatTransport, UIMessageChunk } from "ai";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import type { AgentMessage } from "../../services/agent/index.ts";
import type { CheckChart } from "./chart-check.tsx";
import { Conversation } from "./conversation.tsx";
import { refusalFromResponse } from "./transport.ts";

const CHAT_DEFAULT = "openai/gpt-6.1-terra";

const OTHER_MODEL = "anthropic/claude-opus-5.5";

const REFUSAL = "This model is no longer allowed.";

const MODELS = {
  allowed: [CHAT_DEFAULT, OTHER_MODEL],
  chatDefault: CHAT_DEFAULT,
};

const NO_MESSAGES: readonly AgentMessage[] = [];

const checkChart: CheckChart = async () => {
  throw new Error("This conversation fixture draws no chart.");
};

/** The streaming answer: a complete heading, then the rest after the hold resolves. */
const ANSWER_HEAD = [
  "root = Answer([heading, summary])",
  'heading = Heading("Example totals", 2)',
  "summary = Para",
].join("\n");

const ANSWER_TAIL = 'graph("Three example records.")';

/** The stream stays open until the play releases it, so the second send happens mid-answer. */
let releaseHeld: () => void = () => undefined;

function chunks(
  ...messages: readonly UIMessageChunk[]
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const message of messages) controller.enqueue(message);

      controller.close();
    },
  });
}

const sendHeld = fn(async () => {
  const hold = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: "start" });
      controller.enqueue({ type: "text-start", id: "answer" });
      controller.enqueue({
        type: "text-delta",
        id: "answer",
        delta: ANSWER_HEAD,
      });
      await hold;
      controller.enqueue({
        type: "text-delta",
        id: "answer",
        delta: ANSWER_TAIL,
      });
      controller.enqueue({ type: "text-end", id: "answer" });
      controller.enqueue({ type: "finish" });
      controller.close();
    },
  });
});

const sendPicked = fn(async () =>
  chunks(
    { type: "start" },
    { type: "text-start", id: "answer" },
    {
      type: "text-delta",
      id: "answer",
      delta: 'root = Answer([heading])\nheading = Heading("Picked", 2)',
    },
    { type: "text-end", id: "answer" },
    { type: "finish" }
  )
);

/** The route's own 400 body, so the story proves the refusal mapping it ships with. */
const sendRefused = fn(async () => {
  throw await refusalFromResponse(
    new Response(
      JSON.stringify({ code: "model-not-allowed", message: REFUSAL }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    )
  );
});

function transportOf(
  sendMessages: ChatTransport<AgentMessage>["sendMessages"]
): ChatTransport<AgentMessage> {
  return { sendMessages, reconnectToStream: async () => null };
}

/**
 * One agent chat: the messages of the session, the model picker of a new chat, the composer and
 * the refusal a send can answer. The stories use a fake transport, so no model is called.
 */
const meta = {
  title: "Core/Agent/Conversation",
  component: Conversation,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One agent chat (R-40, R-18): the stored messages and the streamed answer, the composer, and the model picker of a new chat. A refused send shows the server's reason; a model the administrator removed offers a new chat. The stories stream fixture chunks through a fake transport and never call a model.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    sessionId: "00000000-0000-4000-8000-000000000001",
    initialMessages: NO_MESSAGES,
    transport: transportOf(sendPicked),
    models: MODELS,
    checkChart,
    timeZone: "UTC",
    newChatHref: "/ask",
  },
  beforeEach: () => {
    releaseHeld = () => undefined;
  },
} satisfies Meta<typeof Conversation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Streaming: Story = {
  args: { transport: transportOf(sendHeld) },
  play: async ({ canvas }) => {
    const box = canvas.getByRole("textbox", { name: "Message Ask" });

    await userEvent.type(box, "How many records are there?");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(await canvas.findByText("Example totals")).toBeVisible();

    // A second Enter and a second press, while the answer streams, send nothing.
    await userEvent.type(box, "and again");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));

    await expect(sendHeld).toHaveBeenCalledTimes(1);

    const send = canvas.getByRole("button", { name: "Send" });

    await expect(send).toHaveAttribute("aria-busy", "true");

    releaseHeld();
    await waitFor(() => expect(send).not.toHaveAttribute("aria-busy"));
  },
};

export const PickAModel: Story = {
  name: "Pick a model",
  args: { transport: transportOf(sendPicked) },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Model" });

    // The new chat offers the allowed models, with the chat default selected.
    await expect(trigger).toHaveTextContent(CHAT_DEFAULT);

    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("option", { name: OTHER_MODEL })
    );

    const box = canvas.getByRole("textbox", { name: "Message Ask" });

    await userEvent.type(box, "What can you do?");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));

    // The first message carries the pick, and the picker is gone once the chat has a message.
    await waitFor(() => expect(sendPicked).toHaveBeenCalledTimes(1));
    await expect(sendPicked).toHaveBeenCalledWith(
      expect.objectContaining({ body: { modelId: OTHER_MODEL } })
    );
    await waitFor(() => expect(canvas.queryByRole("combobox")).toBeNull());
  },
};

export const Refused: Story = {
  args: { transport: transportOf(sendRefused) },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Model" });

    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("option", { name: OTHER_MODEL })
    );

    const box = canvas.getByRole("textbox", { name: "Message Ask" });

    await userEvent.type(box, "Continue the chat");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));

    // The server's reason replaces the answer, with the one recovery a removed model has.
    await expect(await canvas.findByText(REFUSAL)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Start a new chat" })
    ).toHaveAttribute("href", "/ask");
    await expect(
      canvas.getByRole("button", { name: "Send" })
    ).not.toHaveAttribute("aria-busy");

    // A refused first send stores no answer, so the chat is still new: the picker stays, and
    // the retry carries the same model instead of silently falling back to the default (R-18).
    await expect(
      canvas.getByRole("combobox", { name: "Model" })
    ).toHaveTextContent(OTHER_MODEL);

    await userEvent.type(box, "Try again");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sendRefused).toHaveBeenCalledTimes(2));
    await expect(sendRefused).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ body: { modelId: OTHER_MODEL } })
    );
  },
};
