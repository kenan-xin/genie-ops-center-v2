import type { ChartData } from "@genie/ui/chart-data";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { AgentFile, AgentMessage } from "../../services/agent/index.ts";
import { checkPanelConfig } from "../../services/charts/panel-config.ts";
import {
  BROKEN_ANSWER,
  CHART_ANSWER,
  KPI_CONFIG,
  KPI_DATA,
  PROSE_ANSWER,
  REFUSED_ANSWER,
  RICH_ANSWER,
  STREAMING_ANSWER,
  TABLE_CONFIG,
  TABLE_DATA,
  TOOL_PARTS,
} from "./__fixtures__/answers.ts";
import { ChartCheckProvider, type CheckChart } from "./chart-check.tsx";
import { MessageParts } from "./message-parts.tsx";

const answer = (text: string): AgentMessage => ({
  id: "answer",
  role: "assistant",
  parts: [{ type: "text", text }],
});

const missingIssue = {
  path: "series.0.dataset",
  message: 'Dataset "example.missing" does not exist, or you cannot read it.',
};

const resolveKpi: CheckChart = async () => ({
  config: KPI_CONFIG,
  data: KPI_DATA,
});

const refuseMissing: CheckChart = async () => {
  throw new AppError(CORE_ERRORS["chart-invalid"], {
    issues: [missingIssue],
  });
};

const forbiddenIssue = {
  path: "series.0.dataset",
  message: 'You may not read the "example.missing" dataset.',
};

/** The refusal shape the app's RPC client throws: `appErrorData` under `data`. */
const refuseForbidden: CheckChart = async () => {
  throw {
    data: {
      appCode: "forbidden",
      requestId: "r",
      issues: [forbiddenIssue],
    },
  };
};

/** Resolves the fixture data of whichever chart type the config names. */
const resolveAny: CheckChart = async (config) => {
  const { config: parsed } = checkPanelConfig(config);

  return parsed?.type === "table"
    ? { config: TABLE_CONFIG, data: TABLE_DATA }
    : { config: parsed ?? KPI_CONFIG, data: KPI_DATA };
};

/** The text of the first committed frame, before any passive effect (the server-render shape). */
let firstFrame = "";

const checkChart = fn(resolveKpi);

const checkStreaming = fn(resolveKpi);

const checkRefused = fn(refuseMissing);

const checkForbidden = fn(refuseForbidden);

const checkRich = fn(resolveAny);

const LONG_TABLE_DATA: ChartData = {
  ...TABLE_DATA,
  rows: Array.from({ length: 13 }, (_, index) => ({
    name: `Record ${index + 1}`,
  })),
};

/** The rich answer, with a table of 13 rows from the gate. */
const resolveLongTable: CheckChart = async (config) => {
  const { config: parsed } = checkPanelConfig(config);

  return parsed?.type === "table"
    ? { config: TABLE_CONFIG, data: LONG_TABLE_DATA }
    : { config: parsed ?? KPI_CONFIG, data: KPI_DATA };
};

function FirstFrame(props: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    firstFrame = ref.current?.textContent ?? "";
  }, []);

  return <div ref={ref}>{props.children}</div>;
}

const TITLES = { "example.items": "Items" };

function Providers(props: {
  readonly check: CheckChart;
  readonly timeZone: string;
  readonly children: ReactNode;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

  return (
    <QueryClientProvider client={client}>
      <ChartCheckProvider
        check={props.check}
        timeZone={props.timeZone}
        datasetTitles={TITLES}
      >
        <FirstFrame>{props.children}</FirstFrame>
      </ChartCheckProvider>
    </QueryClientProvider>
  );
}

/** A fresh query client and the gate stub for one story, so no answer shares a cache. */
function withChartCheck(check: CheckChart): Decorator {
  return (Story) => (
    <Providers check={check} timeZone="UTC">
      <Story />
    </Providers>
  );
}

/**
 * The one message-part renderer (R-45, DEC-29). An assistant answer is OpenUI Lang drawn through
 * the catalog; a chart in it holds only a panel config, and the view asks the S7-04 gate for its
 * data once the answer finished streaming. Text the parser cannot read shows as a paragraph, and
 * a part that fails shows what it could draw beside one repair line.
 */
const meta = {
  title: "Core/Agent/Message parts",
  component: MessageParts,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One message of an agent chat. User text renders as text. An answer renders its tool calls as the step timeline above it, and each text part through the OpenUI catalog. The Chart view draws nothing until the answer finished streaming, then asks the chart gate as the viewer.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    message: answer(CHART_ANSWER),
    streaming: false,
  },
  beforeEach: () => {
    firstFrame = "";
  },
} satisfies Meta<typeof MessageParts>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Chart: Story = {
  args: { message: answer(CHART_ANSWER) },
  decorators: [withChartCheck(checkChart)],
  play: async ({ canvas }) => {
    // A finished stored answer must never show its raw program in the first frame (the SSR HTML).
    await expect(firstFrame).not.toContain("root = Answer");
    // The gate answered 42, and the answer text holds no figure: the chart drew it.
    await expect(await canvas.findByText("42")).toBeVisible();
    await waitFor(() => expect(checkChart).toHaveBeenCalledTimes(1));
    await expect(checkChart).toHaveBeenCalledWith(KPI_CONFIG);
    await expect(CHART_ANSWER).not.toContain("42");
  },
};

export const RefusedChart: Story = {
  name: "Refused chart",
  args: { message: answer(REFUSED_ANSWER) },
  decorators: [withChartCheck(checkRefused)],
  play: async ({ canvas }) => {
    // The paragraph stays, and the chart's place carries the refusal and its fix hint.
    await expect(
      await canvas.findByText(
        "The missing dataset is not readable by this viewer."
      )
    ).toBeVisible();
    await expect(
      await canvas.findByText("This chart could not be drawn.")
    ).toBeVisible();
    await expect(await canvas.findByText(missingIssue.message)).toBeVisible();
  },
};

export const ForbiddenChart: Story = {
  name: "Forbidden chart (RPC)",
  args: { message: answer(REFUSED_ANSWER) },
  decorators: [withChartCheck(checkForbidden)],
  play: async ({ canvas }) => {
    // A refusal thrown by the RPC client keeps the paragraph and names the first issue.
    await expect(
      await canvas.findByText(
        "The missing dataset is not readable by this viewer."
      )
    ).toBeVisible();
    await expect(
      await canvas.findByText("This chart could not be drawn.")
    ).toBeVisible();
    await expect(await canvas.findByText(forbiddenIssue.message)).toBeVisible();
  },
};

export const PlainProse: Story = {
  name: "Plain prose",
  args: { message: answer(PROSE_ANSWER) },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    const text = await canvas.findByText(PROSE_ANSWER);

    // A reply the parser cannot read shows its text, as one paragraph.
    await expect(text.tagName).toBe("P");
  },
};

export const Streaming: Story = {
  args: { message: answer(STREAMING_ANSWER), streaming: true },
  decorators: [withChartCheck(checkStreaming)],
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText("Example totals")).toBeVisible();
    await expect(
      canvasElement.querySelector('[data-slot="skeleton"]')
    ).not.toBeNull();
    // No raw program text, no refusal, and no gate call until the answer finishes.
    await expect(canvas.queryByText(/root = Answer/)).toBeNull();
    await expect(canvas.queryByText(/could not be drawn/)).toBeNull();
    await expect(checkStreaming).not.toHaveBeenCalled();
  },
};

export const BrokenCall: Story = {
  name: "Broken call",
  args: { message: answer(BROKEN_ANSWER) },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    // The paragraph still draws, with one line saying part of the answer is missing.
    await expect(
      await canvas.findByText("Totals come from the example items dataset.")
    ).toBeVisible();
    await expect(
      await canvas.findAllByText("Part of this answer could not be drawn.")
    ).toHaveLength(1);
  },
};

export const HeadingsListsTableChart: Story = {
  name: "Headings, lists, a table and a chart",
  args: { message: answer(RICH_ANSWER) },
  decorators: [withChartCheck(checkRich)],
  play: async ({ canvas }) => {
    // Typeset styles the prose of an answer, and a chart in it opts out (tokens.md, Rendered prose).
    const heading = await canvas.findByRole("heading", {
      name: "Example overview",
      level: 2,
    });

    const figure = await canvas.findByRole("figure", { name: "Records" });

    await expect(getComputedStyle(heading).fontWeight).toBe("600");
    await expect(getComputedStyle(heading).marginBlockStart).not.toBe("0px");
    // Typeset would give a figure in prose a flow margin; the chart keeps its own layout.
    await expect(getComputedStyle(figure).marginBlockStart).toBe("0px");
  },
};

export const LongInlineTable: Story = {
  name: "Long inline table",
  args: { message: answer(RICH_ANSWER) },
  decorators: [withChartCheck(resolveLongTable)],
  play: async ({ canvas }) => {
    // A large row count never renders in the chat (R-44a): 5 rows, then how many more.
    const figure = await canvas.findByRole("figure", { name: "Records" });

    // The table draws a desktop table and phone cards, so each row shows twice in the DOM.
    await expect(within(figure).getAllByText("Record 5")).toHaveLength(2);
    await expect(within(figure).queryAllByText("Record 6")).toHaveLength(0);
    await expect(
      canvas.getByText("8 more. Ask for the full list.")
    ).toBeVisible();
    // The KPI chart of the same answer draws as before.
    await expect(await canvas.findByText("42")).toBeVisible();
  },
};

export const StreamingToolCall: Story = {
  name: "Streaming tool call",
  args: {
    message: {
      id: "streaming-tool",
      role: "assistant",
      parts: [
        {
          type: "tool-query-dataset",
          toolCallId: "call-streaming",
          state: "input-streaming",
          input: undefined,
        },
      ],
    },
    streaming: true,
  },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    // A live model streams a tool's input after its name, so the call first shows without input.
    await expect(await canvas.findByText("Reading the data")).toBeVisible();
  },
};

const checkSourced = fn(resolveKpi);

/**
 * A finished answer names its source by the dataset's title, beside Copy, and says how it counted
 * in a closed fold (design review 5.1, 5.2). The chart's caption names the title too.
 */
export const SourcesAndMethod: Story = {
  name: "Sources and method",
  args: {
    message: {
      id: "sourced",
      role: "assistant",
      parts: [
        {
          type: "tool-query-dataset",
          toolCallId: "call-items",
          state: "output-available",
          input: { dataset: "example.items", query: {} },
          output: {
            dataset: "example.items",
            asOf: "2026-10-27",
            columns: [],
            rows: [{}, {}],
            truncated: false,
          },
        },
        { type: "text", text: CHART_ANSWER },
      ],
    },
    labels: { steps: {}, datasets: TITLES },
  },
  decorators: [withChartCheck(checkSourced)],
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("42")).toBeVisible();
    await expect(canvas.getByText(/^Source: Items · Read /)).toBeVisible();

    const sources = canvas.getByRole("list", { name: "Sources" });

    await expect(sources).toHaveTextContent("Source: Items");
    await expect(canvas.getByRole("button", { name: "Copy" })).toBeVisible();

    const method = canvas.getByText("Items: 2 rows, as of 27 Oct 2026");

    // The method waits in a closed fold, so the result reads first.
    await expect(method).not.toBeVisible();
    await userEvent.click(canvas.getByText("How this was counted"));
    await expect(method).toBeVisible();
  },
};

const STEP_NOTE = "Check the records.";

const COUNT_ANSWER =
  'root = Answer([result])\nresult = Paragraph("There are 12 example records.")';

const READ_STEP: AgentMessage["parts"][number] = {
  type: "tool-list-datasets",
  toolCallId: "call-read",
  state: "output-available",
  input: {},
  output: { datasets: [] },
};

const LEAD = "12 open items, SGD 4,200.00 in all.";

const LINE = "All of them are in SGD.";

/**
 * The result first (czjw.120 items 3 and 4): the finished steps pill with the mark and the check,
 * the lead sentence in a larger weight, and one quiet supporting line. A look, so no play test.
 */
export const ResultFirst: Story = {
  name: "Result first",
  args: {
    message: {
      id: "result-first",
      role: "assistant",
      parts: [
        READ_STEP,
        { ...READ_STEP, toolCallId: "call-read-2" },
        { ...READ_STEP, toolCallId: "call-read-3" },
        {
          type: "text",
          text: `root = Answer([result, line])\nresult = Paragraph("${LEAD}")\nline = Paragraph("${LINE}")`,
        },
      ],
    },
    durationMs: 12_000,
  },
  decorators: [withChartCheck(resolveKpi)],
};

/** A model wrote a note about its next step before a tool call (czjw.105, dry run H2). */
export const StepNoteBeforeATool: Story = {
  name: "Step note before a tool",
  args: {
    message: {
      id: "step-note",
      role: "assistant",
      parts: [
        { type: "text", text: STEP_NOTE },
        READ_STEP,
        { type: "text", text: COUNT_ANSWER },
      ],
    },
  },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("There are 12 example records.")
    ).toBeVisible();
    // The note is no part of the answer, so the person never reads it.
    await expect(canvas.queryByText(STEP_NOTE)).toBeNull();
  },
};

/** An answer written before a tool call of the same step is the answer, not a note. */
export const AnswerBeforeAToolCall: Story = {
  name: "Answer before a tool call",
  args: {
    message: {
      id: "answer-first",
      role: "assistant",
      parts: [
        { type: "text", text: COUNT_ANSWER },
        {
          type: "tool-make-artifact",
          toolCallId: "call-table",
          state: "output-available",
          input: { config: TABLE_CONFIG },
          output: { artifact: 1 },
        },
      ],
    },
  },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("There are 12 example records.")
    ).toBeVisible();
  },
};

/** Stop came after a step note, and Stop dropped the tool call that followed it. */
export const StoppedAfterAStepNote: Story = {
  name: "Stopped after a step note",
  args: {
    message: {
      id: "stopped-note",
      role: "assistant",
      parts: [
        { type: "text", text: STEP_NOTE },
        { type: "data-stopped", data: {} },
      ],
    },
  },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Stopped. Ask again when you are ready.")
    ).toBeVisible();
    await expect(canvas.queryByText(STEP_NOTE)).toBeNull();
  },
};

/** A stored answer that Stop ended after one finished read (czjw.110). */
export const StoppedAnswer: Story = {
  name: "Stopped answer",
  args: {
    message: {
      id: "stopped",
      role: "assistant",
      parts: [
        {
          type: "tool-query-dataset",
          toolCallId: "call-items",
          state: "output-available",
          input: { dataset: "example.items", query: {} },
          output: {
            dataset: "example.items",
            asOf: "2026-10-27",
            columns: [],
            rows: [{}, {}],
            truncated: false,
          },
        },
        {
          type: "text",
          text: 'root = Answer([p1])\np1 = Paragraph("Example records are fictional")',
        },
        { type: "data-stopped", data: {} },
      ],
    },
    labels: { steps: {}, datasets: TITLES },
  },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    // After a reload the kept words, the finished step and the Stopped line all show.
    await expect(
      await canvas.findByText("Example records are fictional")
    ).toBeVisible();
    await expect(
      canvas.getByText("Stopped. Ask again when you are ready.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /^Used 1 step/ })
    ).toBeVisible();
  },
};

const FILE_CALL: AgentMessage = {
  id: "file-answer",
  role: "assistant",
  parts: [
    {
      type: "tool-make-file",
      toolCallId: "call-file",
      state: "output-available",
      input: {
        title: "All invoices",
        format: "xlsx",
        dataset: "ledger.invoices",
        query: { select: ["number"] },
      },
      output: { title: "All invoices", format: "xlsx", state: "making" },
    },
    { type: "text", text: PROSE_ANSWER },
  ],
};

const agentFile = (
  state: "queued" | "running" | "ready" | "failed"
): AgentFile => ({
  id: "00000000-0000-4000-8000-0000000000f1",
  toolCallId: "call-file",
  title: "All invoices",
  format: "xlsx",
  state,
  rowCount: state === "ready" ? 42 : null,
});

const FILE_URL = "https://example.invalid/api/files/download?token=t";

const fileLink = fn(async () => FILE_URL);

/** A file the agent queued (R-44a): its card shows the job's state, and Download only when made. */
export const FileBeingMade: Story = {
  name: "File being made",
  args: {
    message: FILE_CALL,
    files: [agentFile("running")],
    onDownload: fileLink,
  },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    const card = await canvas.findByRole("group", { name: "All invoices" });

    await expect(within(card).getByText("Excel file")).toBeVisible();
    await expect(within(card).getByText("Making")).toBeVisible();
    await expect(
      within(card).queryByRole("button", { name: /Download/ })
    ).toBeNull();
  },
};

export const FileReady: Story = {
  name: "File ready",
  args: {
    message: FILE_CALL,
    files: [agentFile("ready")],
    onDownload: fileLink,
  },
  decorators: [withChartCheck(resolveKpi)],
  beforeEach: () => {
    fileLink.mockClear();
  },
  play: async ({ canvas }) => {
    const card = await canvas.findByRole("group", { name: "All invoices" });

    await expect(within(card).getByText("Excel file · 42 rows")).toBeVisible();

    // The browser would leave the story to download; the click is caught and read instead.
    const followed: HTMLAnchorElement[] = [];

    const click = spyOn(
      HTMLAnchorElement.prototype,
      "click"
    ).mockImplementation(function (this: HTMLAnchorElement) {
      followed.push(this);
    });

    try {
      await userEvent.click(
        within(card).getByRole("button", { name: /Download/ })
      );
      await waitFor(() => expect(followed).toHaveLength(1));
    } finally {
      click.mockRestore();
    }

    await expect(fileLink).toHaveBeenCalledTimes(1);
    await expect(fileLink).toHaveBeenCalledWith(agentFile("ready").id);
    await expect(followed[0]?.href).toBe(FILE_URL);
    await expect(followed[0]?.hasAttribute("download")).toBe(true);
  },
};

export const FileNotMade: Story = {
  name: "File not made",
  args: {
    message: FILE_CALL,
    files: [agentFile("failed")],
    onDownload: fileLink,
  },
  decorators: [withChartCheck(resolveKpi)],
  play: async ({ canvas }) => {
    const card = await canvas.findByRole("group", { name: "All invoices" });

    await expect(within(card).getByText("Not made")).toBeVisible();
    await expect(
      within(card).getByText(
        "The file could not be made. Ask again in a moment."
      )
    ).toBeVisible();
    await expect(
      within(card).queryByRole("button", { name: /Download/ })
    ).toBeNull();
  },
};

export const ToolCalls: Story = {
  name: "Tool calls",
  args: {
    message: { id: "tools", role: "assistant", parts: TOOL_PARTS },
  },
  decorators: [withChartCheck(resolveKpi)],
};
