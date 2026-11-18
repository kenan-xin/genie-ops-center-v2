import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { type ComponentProps, useState } from "react";
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

    // The running row is the one current step, with its time from 0 s.
    const running = within(list).getByText("Making a chart").closest("li");

    if (running === null) throw new Error("The running row is no list item.");

    await expect(running).toHaveAttribute("aria-current", "step");
    await expect(within(running).getByText(/^\d+s$/)).toBeVisible();

    // C07-7: the running node is a spinning ring, a finished one a 16 px icon, never a radio dot.
    const ring = running.querySelector("[data-slot=live-node]");

    if (ring === null) throw new Error("The running row has no live node.");

    await expect(getComputedStyle(ring).animationName).toBe("spin");

    await userEvent.click(
      canvas.getByRole("button", { name: "+2 earlier steps" })
    );
    await expect(within(list).getAllByRole("listitem")).toHaveLength(5);

    // C07-6: two reads of one dataset say so in words, with no ×n chip.
    const invoices = within(list)
      .getByText(/^Read Invoices/)
      .closest("li");

    if (invoices === null) throw new Error("The Invoices row is no list item.");

    await expect(invoices).toHaveTextContent(/^Read Invoices · 2 reads/);
    await expect(canvas.queryByText(/×/)).toBeNull();
    await expect(
      invoices.querySelector("svg")?.getBoundingClientRect().width
    ).toBe(16);

    // C15-6: while it works, a finished row is one plain line, as the prototype draws it.
    await expect(within(list).queryByText("Details")).toBeNull();
    await expect(invoices.querySelector("b")).toBeNull();
  },
};

/** A second read of Invoices runs: the row says Reading, with the count of reads under it (C07-6). */
export const ReadingAgain: Story = {
  args: {
    parts: [
      read("r1", "ledger.invoices"),
      {
        type: "tool-query-dataset",
        toolCallId: "r2",
        state: "input-available",
        input: { dataset: "ledger.invoices", query: { limit: 20 } },
      },
    ],
    streaming: true,
    children: undefined,
  },
  play: async ({ canvas }) => {
    const row = canvas.getByText(/^Reading Invoices/).closest("li");

    if (row === null) throw new Error("The Invoices row is no list item.");

    await expect(row).toHaveTextContent(/^Reading Invoices/);
    await expect(within(row).getByText("2 reads")).toBeVisible();
  },
};

/** The run works between steps: the finished rows, then a live Thinking row that ticks from 0 s. */
export const ThinkingBetweenSteps: Story = {
  args: { parts: DONE.slice(0, -1), streaming: true, children: undefined },
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "Steps" });

    await userEvent.click(
      canvas.getByRole("button", { name: "+3 earlier steps" })
    );
    await expect(within(list).getAllByRole("listitem")).toHaveLength(6);

    const thinking = within(list).getAllByRole("listitem").at(-1);

    if (thinking === undefined) throw new Error("The list has no rows.");

    await expect(thinking).toHaveTextContent(/^Thinking/);
    await expect(thinking).toHaveAttribute("aria-current", "step");
    // The time starts from 0 s; the play may begin just after the first tick.
    const first = within(thinking).getByText(/^[01]s$/);

    const later = `${Number.parseInt(first.textContent ?? "0") + 1}s`;

    await expect(
      await within(thinking).findByText(later, {}, { timeout: 2000 })
    ).toBeVisible();
  },
};

function runningRead(id: string): MessagePart {
  return {
    type: "tool-query-dataset",
    toolCallId: id,
    state: "input-available",
    input: { dataset: "ledger.invoices", query: { limit: 20 } },
  };
}

/** A read runs, the run thinks, the same read runs again, and the run thinks again. */
const READ_AGAIN_FRAMES: readonly (readonly MessagePart[])[] = [
  [runningRead("r1")],
  [read("r1", "ledger.invoices")],
  [read("r1", "ledger.invoices"), runningRead("r2")],
  [read("r1", "ledger.invoices"), read("r2", "ledger.invoices")],
];

/** Shows one frame of the run at a time; Next step moves to the next one, as a stream does. */
function NextStepHost(props: ComponentProps<typeof StepTimeline>) {
  const [at, setAt] = useState(0);

  return (
    <div className="grid gap-2">
      <StepTimeline {...props} parts={READ_AGAIN_FRAMES[at] ?? []} />
      <button type="button" onClick={() => setAt(at + 1)}>
        Next step
      </button>
    </div>
  );
}

/** Each wait starts from 0 s: a read that runs again, and the Thinking after it (P15-39). */
export const EachWaitFromZero: Story = {
  args: { streaming: true, children: undefined },
  render: (args) => <NextStepHost {...args} />,
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "Steps" });

    const next = canvas.getByRole("button", { name: "Next step" });

    await within(list).findByText("1s", {}, { timeout: 3000 });
    await userEvent.click(next);
    await within(list).findByText("2s", {}, { timeout: 4000 });

    // The read runs again: its time restarts, and so does the Thinking after it.
    await userEvent.click(next);
    await expect(within(list).getByText(/^\d+s$/)).toHaveTextContent(/^[01]s$/);
    await userEvent.click(next);
    await expect(within(list).getByText(/^\d+s$/)).toHaveTextContent(/^[01]s$/);
  },
};

/** A fake module tool that adds one slide of a planned deck per call (czjw.181). */
const DECK_LABELS = {
  ...LABELS,
  steps: {
    "deck-add": {
      active: "Changing the deck",
      done: "Changed the deck",
      failed: "Could not change the deck",
      progress: {
        active: "Writing slide {n} of {m}",
        doneOne: "Wrote slide {n}",
        done: "Wrote slides {first} to {last}",
      },
    },
  },
};

function slide(n: number, running = false): MessagePart {
  const input = { progress: { n, m: 5 }, title: `Slide ${n}` };

  return running
    ? {
        type: "tool-deck-add",
        toolCallId: `s${n}`,
        state: "input-available",
        input,
      }
    : {
        type: "tool-deck-add",
        toolCallId: `s${n}`,
        state: "output-available",
        input,
        output: { added: true },
      };
}

/** A deck build: one live row names the running slide, with a bar of the planned slides. */
export const WritingSlides: Story = {
  args: {
    parts: [slide(1), slide(2), slide(3, true)],
    labels: DECK_LABELS,
    streaming: true,
    children: undefined,
  },
  play: async ({ canvas }) => {
    const row = canvas.getByText("Writing slide 3 of 5").closest("li");

    if (row === null) throw new Error("The build row is no list item.");

    const bar = row.querySelector('[data-slot="progress"]');

    await expect(bar?.children).toHaveLength(5);
    await expect(bar?.querySelectorAll(".bg-primary")).toHaveLength(3);
  },
};

/** The answer's text started: the steps fold into the strip, and no row is current. */
export const AnswerStartedFolds: Story = {
  args: { streaming: true, answering: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("button", { name: "5 steps" })).toBeVisible();
    await expect(canvasElement.querySelector("[aria-current]")).toBeNull();
  },
};

export const Done: Story = {
  args: { durationMs: 38_000 },
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("button", {
      name: "Worked for 38 seconds · 5 steps",
    });

    await expect(strip).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("list", { name: "Steps" })).toBeNull();
    // The answer sits one conversation gap below the steps (C07-11).
    await expect(
      Math.round(
        canvas.getByText("Here is the chart.").getBoundingClientRect().top -
          strip.getBoundingClientRect().bottom
      )
    ).toBe(16);

    await userEvent.click(strip);
    await expect(strip).toHaveAttribute("aria-expanded", "true");
    await expect(
      within(canvas.getByRole("list", { name: "Steps" })).getAllByRole(
        "listitem"
      )
    ).toHaveLength(5);
  },
};

/** The opened fold on a phone: a read keeps its query behind a 44 px Details row (C15-6). */
export const DoneOnAPhone: Story = {
  args: { durationMs: 38_000 },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Worked for 38 seconds · 5 steps" })
    );

    const list = canvas.getByRole("list", { name: "Steps" });

    const [details] = within(list).getAllByText("Details");

    if (details === undefined) throw new Error("No read row has Details.");

    const opened = details.closest("details");

    if (opened === null) throw new Error("Details is not a disclosure.");

    await expect(details.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44
    );
    await expect(within(opened).getByText("Query used")).not.toBeVisible();
    await userEvent.click(details);
    await expect(within(opened).getByText("Query used")).toBeVisible();
  },
};

// G1: one second is singular.
export const DoneInOneSecond: Story = {
  name: "Done in one second",
  args: { durationMs: 1000 },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Worked for 1 second · 5 steps" })
    ).toBeVisible();
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
      canvas.getByRole("button", { name: "Worked for 12 seconds · 2 steps" })
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
        name: "Could not make a chart · Worked for 31 seconds · 2 steps",
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

/** The answer ended, and its file job still runs: the strip, then the running row with its time. */
export const FileStillMaking: Story = {
  name: "File still being made",
  args: {
    parts: [listed, read("r1", "ledger.invoices"), fileCall, answer],
    files: { f1: "running" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 steps")).toBeVisible();

    const list = canvas.getByRole("list", { name: "Steps" });

    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await expect(within(list).getByText("Making an Excel file")).toBeVisible();
    await expect(within(list).getByText(/^\d+s$/)).toBeVisible();

    // T6-a (E1): the fold's words and the running row's words share one edge.
    const foldWords = canvas.getByText("3 steps");
    const rowWords = within(list).getByText("Making an Excel file");

    await expect(
      Math.abs(
        foldWords.getBoundingClientRect().left -
          rowWords.getBoundingClientRect().left
      )
    ).toBeLessThanOrEqual(1);
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
