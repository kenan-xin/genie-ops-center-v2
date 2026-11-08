import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ChatTransport, UIMessageChunk } from "ai";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { AgentMessage } from "../../services/agent/index.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
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

const FIRST_QUESTION = "How many records are there?";

const SUGGESTIONS = [FIRST_QUESTION, "Which records are new?"];

const suggestions = () => screen.queryByRole("group", { name: "Suggestions" });

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

/** The half sentence a held answer shows before the stream ends (I18). */
const PARTIAL = "Three example rec";

/** The abort signal of the last held send, so a play sees that Stop reached the transport. */
let heldSignal: AbortSignal | undefined;

/** An answer cut mid-word that stays open until the play releases it or Stop aborts it. */
const sendPartial = fn(
  async ({
    abortSignal,
  }: {
    readonly abortSignal: AbortSignal | undefined;
  }) => {
    heldSignal = abortSignal;

    const hold = new Promise<void>((resolve) => {
      releaseHeld = resolve;
      abortSignal?.addEventListener("abort", () => resolve());
    });

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "text-start", id: "answer" });
        controller.enqueue({
          type: "text-delta",
          id: "answer",
          delta: `root = Answer([p])\np = Paragraph("${PARTIAL}`,
        });
        await hold;

        if (abortSignal?.aborted) return;

        controller.enqueue({
          type: "text-delta",
          id: "answer",
          delta: 'ords.")',
        });
        controller.enqueue({ type: "text-end", id: "answer" });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });
  }
);

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

const CHART_ID = "11111111-1111-4111-8111-111111111111";

const TABLE_ID = "22222222-2222-4222-8222-222222222222";

const PROSE = "Here are both.";

function madeBy(id: string, type: string, title: string) {
  return {
    type: "tool-make-artifact" as const,
    toolCallId: id,
    state: "output-available" as const,
    input: { config: { type, title, series: [] } },
    output: { artifact: 1, version: 1, title },
  };
}

/** A stored answer that made a chart and a table. */
const ARTIFACT_CHAT: readonly AgentMessage[] = [
  {
    id: "question",
    role: "user",
    parts: [{ type: "text", text: "Chart the quantity and list the records" }],
  },
  {
    id: "answer",
    role: "assistant",
    parts: [
      madeBy("call-chart", "bar", "Quantity by record"),
      madeBy("call-table", "table", "Records"),
      {
        type: "data-artifact",
        id: "call-chart",
        data: { artifactId: CHART_ID, version: 1 },
      },
      {
        type: "data-artifact",
        id: "call-table",
        data: { artifactId: TABLE_ID, version: 1 },
      },
      { type: "text", text: PROSE },
    ],
  },
];

const openArtifact = fn();

const SUMMARY_LINE = "Earlier messages were summarized";

const STORED_SUMMARY = "The person asked about records 1 and 2.";

const LIVE_SUMMARY = "The person asked about records 1, 2 and 3.";

function paragraph(text: string): AgentMessage["parts"] {
  return [
    { type: "text", text: `root = Answer([p])\np = Paragraph("${text}")` },
  ];
}

/** Three turns; the route summarized through the second answer, message 4 (S7-34). */
const SUMMARIZED_CHAT: readonly AgentMessage[] = [1, 2, 3].flatMap((turn) => [
  {
    id: `q${turn}`,
    role: "user" as const,
    parts: [{ type: "text" as const, text: `Question ${turn}` }],
  },
  {
    id: `a${turn}`,
    role: "assistant" as const,
    parts: paragraph(`Answer ${turn}.`),
    metadata: turn === 2 ? { summary: STORED_SUMMARY } : undefined,
  },
]);

/** Whether `first` comes before `second` in the document. */
const before = (first: Node, second: Node) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

/** A turn that summarized through answer 3 before it answers, as the route streams it. */
const sendSummarized = fn(async () =>
  chunks(
    {
      type: "data-summary",
      data: { throughMessageId: "a3", summary: LIVE_SUMMARY },
      transient: true,
    },
    { type: "start" },
    { type: "text-start", id: "answer" },
    {
      type: "text-delta",
      id: "answer",
      delta: 'root = Answer([p])\np = Paragraph("Answer 4.")',
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
          "One agent chat (R-40, R-18): the stored messages and the streamed answer, the composer, and the model picker of a new chat. A refused send shows the server's reason; a model the administrator removed offers a new chat. The stories stream fixture chunks through a fake transport and never call a model. A `pending` message `{ text, onSent }` from the page, such as a starter chip outside the chat, sends once when nothing streams.",
      },
    },
    a11y: { test: "error" },
  },
  // A table card reads its first rows through TanStack Query, as in the app.
  decorators: [
    (Story) => (
      <AgentClientStub>
        <Story />
      </AgentClientStub>
    ),
  ],
  args: {
    sessionId: "00000000-0000-4000-8000-000000000001",
    initialMessages: NO_MESSAGES,
    transport: transportOf(sendPicked),
    models: MODELS,
    labels: { steps: {}, datasets: { "example.items": "Items" }, fields: {} },
    suggestions: SUGGESTIONS,
    checkChart,
    timeZone: "UTC",
    inbox: [{ label: "Documents", href: "/m/example" }],
    artifacts: { kind: "panel", shown: null, onOpen: fn(), onOpenRows: fn() },
    headingLevel: 2,
    onNewChat: fn(),
  },
  beforeEach: () => {
    releaseHeld = () => undefined;
    heldSignal = undefined;
  },
} satisfies Meta<typeof Conversation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Streaming: Story = {
  args: { transport: transportOf(sendHeld) },
  play: async ({ canvas }) => {
    const box = canvas.getByRole("textbox", { name: "Message" });

    // A suggestion chip sends its question.
    await userEvent.click(canvas.getByRole("button", { name: FIRST_QUESTION }));
    await expect(await canvas.findByText("Example totals")).toBeVisible();
    await expect(sendHeld).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            parts: [{ type: "text", text: FIRST_QUESTION }],
          }),
        ],
      })
    );

    // While the answer streams, no chip offers a second send.
    await expect(suggestions()).toBeNull();

    // A second Enter, while the answer streams, sends nothing: the button is Stop, not Send.
    await userEvent.type(box, "and again");
    await userEvent.keyboard("{Enter}");

    await expect(sendHeld).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole("button", { name: "Send" })).toBeNull();

    releaseHeld();
    await expect(
      await canvas.findByRole("button", { name: "Send" })
    ).toBeEnabled();

    // After an answer the dock offers no generic chips: Ask next follows the answer (czjw.120 item 8).
    await expect(suggestions()).toBeNull();
  },
};

const SAVED_NEXT = "Which records are old?";

const NEW_NEXT = [
  "Which records are overdue?",
  "Show the records by month",
] as const;

/** A finished turn whose answer proposed what to ask next. */
const ANSWERED_WITH_NEXT: readonly AgentMessage[] = [
  {
    id: "q1",
    role: "user",
    parts: [{ type: "text", text: "How many records are new?" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `root = Answer([p], next)\np = Paragraph("Two new records.")\nnext = ["${SAVED_NEXT}"]`,
      },
    ],
  },
];

/** An answer whose `next` arrives only after the play releases the hold. */
const sendHeldNext = fn(async () => {
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
        delta: `root = Answer([p], next)\np = Paragraph("Three example records.")\nnext = ["${NEW_NEXT[0]}"`,
      });
      await hold;
      controller.enqueue({
        type: "text-delta",
        id: "answer",
        delta: `, "${NEW_NEXT[1]}"]`,
      });
      controller.enqueue({ type: "text-end", id: "answer" });
      controller.enqueue({ type: "finish" });
      controller.close();
    },
  });
});

/**
 * Ask next (czjw.120 item 8): the questions the last finished answer proposed, under that answer
 * only. A streaming answer shows none, and an earlier answer loses its group.
 */
export const AskNext: Story = {
  args: {
    initialMessages: ANSWERED_WITH_NEXT,
    transport: transportOf(sendHeldNext),
  },
  play: async ({ canvas }) => {
    const askNext = () => canvas.queryAllByRole("group", { name: "Ask next" });

    // The saved chat's last answer offers its question.
    await expect(
      within(await canvas.findByRole("group", { name: "Ask next" })).getByRole(
        "button",
        { name: SAVED_NEXT }
      )
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: SAVED_NEXT }));
    await expect(
      await canvas.findByText("Three example records.")
    ).toBeVisible();
    await expect(sendHeldNext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            parts: [{ type: "text", text: SAVED_NEXT }],
          }),
        ]),
      })
    );

    // While the new answer streams, no answer offers a question.
    await expect(askNext()).toHaveLength(0);

    releaseHeld();

    // Once it ends, one group, under the new answer, with both of its questions.
    await waitFor(() => expect(askNext()).toHaveLength(1));
    const group = askNext()[0]!;
    const answers = canvas.getAllByText(/^Answer:$/);
    await expect(answers.at(-1)!.parentElement).toContainElement(group);
    await expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(NEW_NEXT);

    await userEvent.click(
      within(group).getByRole("button", { name: NEW_NEXT[1] })
    );
    await waitFor(() => expect(sendHeldNext).toHaveBeenCalledTimes(2));
    releaseHeld();
  },
};

export const StreamsWordsBeforeTheEnd: Story = {
  name: "Streams words before the answer ends",
  args: { transport: transportOf(sendPartial) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: FIRST_QUESTION }));

    // Half a paragraph shows while the stream is still open (I18).
    await expect(await canvas.findByText(PARTIAL)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Stop the answer" })
    ).toBeVisible();

    releaseHeld();
    await expect(await canvas.findByText(`${PARTIAL}ords.`)).toBeVisible();
  },
};

export const StopKeepsTheAnswer: Story = {
  name: "Stop keeps the answer so far",
  args: { transport: transportOf(sendPartial) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: FIRST_QUESTION }));
    await canvas.findByText(PARTIAL);

    await userEvent.click(
      canvas.getByRole("button", { name: "Stop the answer" })
    );

    // The words so far stay with a Stopped line, the request is aborted, and the composer sends again.
    await expect(
      await canvas.findByRole("button", { name: "Send" })
    ).toBeInTheDocument();
    await expect(heldSignal?.aborted).toBe(true);
    await expect(canvas.getByText(PARTIAL)).toBeVisible();
    await expect(
      await canvas.findByText("Stopped. Ask again when you are ready.")
    ).toBeVisible();
  },
};

/** An answer that the server's turn limit ends: its words, the stopped mark, then the abort. */
const sendServerStopped = fn(
  async () =>
    new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "text-start", id: "answer" });
        controller.enqueue({
          type: "text-delta",
          id: "answer",
          delta: `root = Answer([p])\np = Paragraph("${PARTIAL}`,
        });
        controller.enqueue({ type: "data-stopped", data: {} });
        controller.enqueue({ type: "abort" });
        controller.close();
      },
    })
);

export const ServerEndsTheAnswer: Story = {
  name: "The turn limit ends the answer",
  args: { transport: transportOf(sendServerStopped) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: FIRST_QUESTION }));

    // The words stay with the Stopped line, without a reload (czjw.110).
    await expect(await canvas.findByText(PARTIAL)).toBeVisible();
    await expect(
      await canvas.findByText("Stopped. Ask again when you are ready.")
    ).toBeVisible();
  },
};

export const ArtifactCardsInAsk: Story = {
  name: "Artifact cards in Ask",
  args: {
    initialMessages: ARTIFACT_CHAT,
    artifacts: {
      kind: "panel",
      shown: { artifactId: CHART_ID, version: 1 },
      onOpen: openArtifact,
      onOpenRows: fn(),
    },
  },
  play: async ({ canvas }) => {
    const cards = canvas.getByRole("list", { name: "Artifacts" });

    // The cards follow the prose of the answer.
    await expect(
      canvas.getByText(PROSE).compareDocumentPosition(cards) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    const shown = within(cards).getByRole("button", {
      name: /^Quantity by record/,
    });

    await expect(shown).toHaveAttribute("aria-pressed", "true");
    await expect(shown).toHaveTextContent("Showing");
    await expect(shown).toHaveTextContent("Chart · v1");

    await userEvent.click(
      within(cards).getByRole("button", { name: /^Records/ })
    );
    await expect(openArtifact).toHaveBeenCalledWith({
      artifactId: TABLE_ID,
      version: 1,
    });
  },
};

function rectOf(element: Element | null): DOMRect {
  if (element === null) throw new Error("A row of the chat is missing.");

  return element.getBoundingClientRect();
}

/** The largest distance of the edges from where they belong, in px. */
const drift = (pairs: readonly (readonly [number, number])[]) =>
  Math.max(...pairs.map(([edge, at]) => Math.abs(edge - at)));

/** The boxes of the rows of a finished answer, its question and the composer. */
function rowEdges(root: HTMLElement) {
  const canvas = within(root);

  return {
    steps: rectOf(canvas.getByRole("button", { name: /^Used \d+ steps?/ })),
    prose: rectOf(canvas.getByText(PROSE)),
    cards: rectOf(canvas.getByRole("list", { name: "Artifacts" })),
    question: rectOf(
      canvas
        .getByText("Chart the quantity and list the records")
        .closest('[data-slot="bubble-content"]')
    ),
    composer: rectOf(root.querySelector('[data-slot="input-group"]')),
  };
}

// A2: the steps line, the answer, its cards and the composer share one left edge (czjw.120 item 1).
export const OneEdgeOnADesktop: Story = {
  name: "One edge on a desktop",
  args: { initialMessages: ARTIFACT_CHAT, models: null },
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvasElement }) => {
    const { steps, prose, cards, question, composer } = rowEdges(canvasElement);

    await expect(
      drift([
        [steps.left, composer.left],
        [prose.left, composer.left],
        [cards.left, composer.left],
        [question.right, composer.right],
      ])
    ).toBeLessThan(1);
  },
};

// A1: on a phone every row sits between one 16 px gutter on each side (czjw.109).
export const OneEdgeOnAPhone: Story = {
  name: "One edge on a phone",
  args: { initialMessages: ARTIFACT_CHAT, models: null },
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const { steps, prose, cards, question, composer } = rowEdges(canvasElement);

    const end = canvasElement.ownerDocument.documentElement.clientWidth - 16;

    await expect(
      drift([
        ...[steps, prose, cards, composer].map(
          (row) => [row.left, 16] as const
        ),
        ...[prose, cards, composer, question].map(
          (row) => [row.right, end] as const
        ),
      ])
    ).toBeLessThan(1);
  },
};

export const ArtifactCardsInThePanel: Story = {
  name: "Artifact cards in the panel",
  args: {
    initialMessages: ARTIFACT_CHAT,
    artifacts: {
      kind: "link",
      href: (ref) => `/ask/chat-1?artifact=${ref.artifactId}`,
      rowsHref: (id) => `/ask/chat-1?rows=${id}`,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: /^Quantity by record.*Open in Ask$/ })
    ).toHaveAttribute("href", `/ask/chat-1?artifact=${CHART_ID}`);
  },
};

export const SummarizedChat: Story = {
  name: "Summarized chat",
  args: { initialMessages: SUMMARIZED_CHAT, models: null },
  play: async ({ canvas }) => {
    const lines = canvas.getAllByText(SUMMARY_LINE);

    // One quiet line, between the last summarized answer and the next question.
    await expect(lines).toHaveLength(1);

    const [line] = lines;

    if (line === undefined) throw new Error("no summary line");

    await expect(before(canvas.getByText("Answer 2."), line)).toBe(true);
    await expect(before(line, canvas.getByText("Question 3"))).toBe(true);
    await expect(canvas.getByText(STORED_SUMMARY)).not.toBeVisible();

    await userEvent.click(line);
    await expect(canvas.getByText(STORED_SUMMARY)).toBeVisible();
  },
};

export const SummarizedWhileYouChat: Story = {
  name: "Summarized while you chat",
  args: {
    initialMessages: SUMMARIZED_CHAT,
    models: null,
    transport: transportOf(sendSummarized),
  },
  play: async ({ canvas }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Question 4"
    );
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    await canvas.findByText("Answer 4.");

    // The line moves to the new boundary at once, and the old one is gone.
    const lines = canvas.getAllByText(SUMMARY_LINE);

    await expect(lines).toHaveLength(1);

    const [line] = lines;

    if (line === undefined) throw new Error("no summary line");

    await expect(before(canvas.getByText("Answer 3."), line)).toBe(true);
    await expect(before(line, canvas.getByText("Question 4"))).toBe(true);

    await userEvent.click(line);
    await expect(canvas.getByText(LIVE_SUMMARY)).toBeVisible();
    await expect(canvas.queryByText(STORED_SUMMARY)).toBeNull();
  },
};

export const PickAModel: Story = {
  name: "Pick a model",
  args: { transport: transportOf(sendPicked) },
  play: async ({ canvas }) => {
    // A new chat says what the agent answers from and where documents go in (R-42).
    await expect(
      canvas.getByRole("heading", { name: "What would you like to know?" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Documents" })
    ).toHaveAttribute("href", "/m/example");

    const trigger = canvas.getByRole("combobox", { name: "Model" });

    // The new chat offers the allowed models, with the chat default selected.
    await expect(trigger).toHaveTextContent(CHAT_DEFAULT);

    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("option", { name: OTHER_MODEL })
    );

    const box = canvas.getByRole("textbox", { name: "Message" });

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

// H4 (czjw.120 item 12): below 1024 px Ask's header menu holds the pick, so the composer shows no
// picker, and the first send still carries the frame's model.
export const PickAModelFromTheFrame: Story = {
  name: "Pick a model from the frame",
  globals: { viewport: { value: "phone390", isRotated: false } },
  args: {
    transport: transportOf(sendPicked),
    model: { value: OTHER_MODEL, onChange: fn() },
  },
  play: async ({ canvas }) => {
    sendPicked.mockClear();

    await expect(canvas.queryByRole("combobox", { name: "Model" })).toBeNull();

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "What can you do?"
    );
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sendPicked).toHaveBeenCalledTimes(1));
    await expect(sendPicked).toHaveBeenCalledWith(
      expect.objectContaining({ body: { modelId: OTHER_MODEL } })
    );
  },
};

export const Refused: Story = {
  args: { transport: transportOf(sendRefused) },
  play: async ({ args, canvas }) => {
    await expect(suggestions()).not.toBeNull();

    const trigger = canvas.getByRole("combobox", { name: "Model" });

    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("option", { name: OTHER_MODEL })
    );

    const box = canvas.getByRole("textbox", { name: "Message" });

    await userEvent.type(box, "Continue the chat");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));

    // The server's reason replaces the answer, with the one recovery a removed model has, and no
    // chip offers to send into the refused chat.
    await expect(await canvas.findByText(REFUSAL)).toBeVisible();
    await expect(suggestions()).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Start a new chat" })
    );
    await expect(args.onNewChat).toHaveBeenCalledTimes(1);

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
