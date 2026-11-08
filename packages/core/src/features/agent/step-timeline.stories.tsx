import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { MessagePart } from "./step-model.ts";
import { StepTimeline } from "./step-timeline.tsx";

const LABELS = {
  steps: {},
  datasets: {
    "ledger.invoices": "Invoices",
    "ledger.payments": "Payments",
    "ledger.customers": "Customers",
  },
  fields: {},
};

function read(id: string, dataset: string): MessagePart {
  return {
    type: "tool-query-dataset",
    toolCallId: id,
    state: "output-available",
    input: { dataset, query: { limit: 20 } },
    output: { rows: [] },
  };
}

function chart(id: string, state: "done" | "refused" | "running"): MessagePart {
  const input = { config: { type: "bar", title: "Quantity by record" } };

  if (state === "done") {
    return {
      type: "tool-make-artifact",
      toolCallId: id,
      state: "output-available",
      input,
      output: { artifact: 1, version: 1 },
    };
  }

  return state === "refused"
    ? {
        type: "tool-make-artifact",
        toolCallId: id,
        state: "output-error",
        input,
        errorText: 'Field "qty" is not in the dataset.',
      }
    : {
        type: "tool-make-artifact",
        toolCallId: id,
        state: "input-available",
        input,
      };
}

const listed: MessagePart = {
  type: "tool-list-datasets",
  toolCallId: "list",
  state: "output-available",
  input: {},
  output: { datasets: [] },
};

const answer: MessagePart = {
  type: "text",
  text: "Here is the chart.",
};

/** Four finished rows, then a running chart. */
const WORKING = [
  listed,
  read("r1", "ledger.invoices"),
  read("r2", "ledger.payments"),
  read("r3", "ledger.invoices"),
  read("r4", "ledger.customers"),
  chart("c1", "running"),
];

/** Five finished rows. */
const DONE = [
  listed,
  read("r1", "ledger.invoices"),
  read("r2", "ledger.payments"),
  read("r4", "ledger.customers"),
  chart("c1", "done"),
  answer,
];

/** The frame's width: 400 px for the panel, unless a story sets the Ask width. */
const frame: Decorator = (Story, { parameters }) => (
  <div style={{ width: parameters["frameWidth"] ?? 400 }}>
    <Story />
  </div>
);

const ASK = { frameWidth: 720 };

/**
 * An answer's steps as a timeline (czjw.81, variant B): Thinking, the working list with older steps
 * folded, the finished strip, a fixed step, and a final refusal with its box under the answer.
 */
const meta = {
  title: "Core/Agent/StepTimeline",
  component: StepTimeline,
  tags: ["autodocs"],
  decorators: [frame],
  parameters: {
    docs: {
      description: {
        component:
          'The step timeline of an answer (AG16). Reads of one dataset share a row with a count; a refused call and its fix share a row; while the agent works, more than two finished rows fold behind "+n earlier steps"; a finished answer shows one strip that opens the list. A final refusal shows a box under the answer with Try again and See the steps. The answer is the `children`. Stories show the 400 px panel width and the 720 px Ask width.',
      },
    },
    a11y: { test: "error" },
  },
  args: {
    parts: DONE,
    labels: LABELS,
    streaming: false,
    children: <p className="text-sm">Here is the chart.</p>,
  },
} satisfies Meta<typeof StepTimeline>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Thinking: Story = {
  args: { parts: [], streaming: true, children: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Thinking")).toBeVisible();
  },
};

export const Working: Story = {
  args: { parts: WORKING, streaming: true, children: undefined },
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "Steps" });

    // Two finished rows and the running one show; the other two fold away.
    await expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await expect(within(list).getByText("Making a chart")).toBeVisible();
    await expect(within(list).getByText("Step 5")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "+2 earlier steps" })
    );
    await expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    await expect(within(list).getByText("×2")).toBeVisible();

    // A read keeps its query behind Details.
    const [details] = within(list).getAllByText("Details");

    if (details === undefined) throw new Error("No read row has Details.");

    const opened = details.closest("details");

    if (opened === null) throw new Error("Details is not a disclosure.");

    await expect(within(opened).getByText("Query used")).not.toBeVisible();
    await userEvent.click(details);
    await expect(within(opened).getByText("Query used")).toBeVisible();
  },
};

export const Done: Story = {
  args: { durationMs: 38_000 },
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("button", { name: "Used 5 steps · 38s" });

    await expect(strip).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("list", { name: "Steps" })).toBeNull();

    await userEvent.click(strip);
    await expect(strip).toHaveAttribute("aria-expanded", "true");
    await expect(
      within(canvas.getByRole("list", { name: "Steps" })).getAllByRole(
        "listitem"
      )
    ).toHaveLength(5);
  },
};

export const Fixed: Story = {
  args: {
    parts: [
      read("r1", "ledger.invoices"),
      chart("c1", "refused"),
      chart("c2", "done"),
      answer,
    ],
    durationMs: 12_000,
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Used 2 steps · 12s" })
    );
    await expect(
      canvas.getByText("Made a chart, fixed 1 problem")
    ).toBeVisible();
  },
};

const tryAgain = fn();

export const Failed: Story = {
  args: {
    parts: [
      read("r1", "ledger.invoices"),
      chart("c1", "refused"),
      chart("c2", "refused"),
      chart("c3", "refused"),
      { type: "text", text: "The chart tool refused the chart." },
    ],
    durationMs: 31_000,
    onTryAgain: tryAgain,
    children: <p className="text-sm">The chart tool refused the chart.</p>,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("It was refused 3 times, so nothing changed.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", {
        name: "Could not make a chart · 2 steps · 31s",
      })
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(tryAgain).toHaveBeenCalledTimes(1);

    await userEvent.click(
      canvas.getByRole("button", { name: "See the steps" })
    );
    await expect(
      within(canvas.getByRole("list", { name: "Steps" })).getAllByRole(
        "listitem"
      )
    ).toHaveLength(2);
  },
};

const fileCall: MessagePart = {
  type: "tool-make-file",
  toolCallId: "f1",
  state: "output-available",
  input: { title: "All invoices", format: "xlsx", dataset: "ledger.invoices" },
  output: { title: "All invoices", format: "xlsx", state: "making" },
};

/** The answer ended, and its file job still runs: the strip, then the running row with its step. */
export const FileStillMaking: Story = {
  name: "File still being made",
  args: {
    parts: [listed, read("r1", "ledger.invoices"), fileCall, answer],
    files: { f1: "running" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Used 3 steps/)).toBeVisible();

    const list = canvas.getByRole("list", { name: "Steps" });

    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await expect(within(list).getByText("Making an Excel file")).toBeVisible();
    await expect(within(list).getByText(/^Step 3/)).toBeVisible();
  },
};

export const ThinkingInAsk: Story = {
  ...Thinking,
  name: "Thinking in Ask",
  parameters: ASK,
};

export const WorkingInAsk: Story = {
  ...Working,
  name: "Working in Ask",
  parameters: ASK,
};

export const DoneInAsk: Story = {
  ...Done,
  name: "Done in Ask",
  parameters: ASK,
};

export const FixedInAsk: Story = {
  ...Fixed,
  name: "Fixed in Ask",
  parameters: ASK,
};

export const FailedInAsk: Story = {
  ...Failed,
  name: "Failed in Ask",
  parameters: ASK,
};
