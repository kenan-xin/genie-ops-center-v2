import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { expect, fn, waitFor } from "storybook/test";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { AgentMessage } from "../../services/agent/index.ts";
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

function FirstFrame(props: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    firstFrame = ref.current?.textContent ?? "";
  }, []);

  return <div ref={ref}>{props.children}</div>;
}

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
      <ChartCheckProvider check={props.check} timeZone={props.timeZone}>
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
          "One message of an agent chat. User text renders as text. An answer renders each text part through the OpenUI catalog, each tool call as one muted line, and skips step markers. The Chart view draws nothing until the answer finished streaming, then asks the chart gate as the viewer.",
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
};

export const ToolCalls: Story = {
  name: "Tool calls",
  args: {
    message: { id: "tools", role: "assistant", parts: TOOL_PARTS },
  },
  decorators: [withChartCheck(resolveKpi)],
};
