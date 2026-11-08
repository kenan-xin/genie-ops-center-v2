import type { ChartData } from "@genie/ui/chart-data";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { KPI_CONFIG, TABLE_CONFIG } from "./__fixtures__/answers.ts";
import { ArtifactCard } from "./artifact-card.tsx";
import { ChartCheckProvider, type CheckChart } from "./chart-check.tsx";

const ARTIFACT = {
  artifactId: "11111111-1111-4111-8111-111111111111",
  version: 2,
  toolCallId: "call-chart",
  kind: "chart" as const,
  title: "Quantity by record",
  config: KPI_CONFIG,
};

const TABLE_ARTIFACT = {
  artifactId: "22222222-2222-4222-8222-222222222222",
  version: 1,
  toolCallId: "call-table",
  kind: "table" as const,
  title: "Records",
  config: TABLE_CONFIG,
};

/** A table of `count` records, each with an amount in its own currency. */
function tableOf(count: number, truncated = false): ChartData {
  return {
    kind: "table",
    title: "Records",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "total", label: "Total", type: "money", currencyKey: "currency" },
      { key: "currency", label: "Currency", type: "text" },
    ],
    rows: Array.from({ length: count }, (_, index) => ({
      name: `Record ${index + 1}`,
      total: 120_000 + index,
      currency: "SGD",
    })),
    datasets: ["example.items"],
    readAt: "2026-10-30T06:05:00Z",
    truncated,
  };
}

function answering(data: ChartData): CheckChart {
  return async () => ({ config: TABLE_CONFIG, data });
}

function Providers(props: {
  readonly check: CheckChart;
  readonly children: ReactNode;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

  return (
    <QueryClientProvider client={client}>
      <ChartCheckProvider check={props.check} timeZone="UTC">
        {props.children}
      </ChartCheckProvider>
    </QueryClientProvider>
  );
}

/** A fresh query client and a gate stub for one story, so no story shares a cache. */
function withChartCheck(check: CheckChart): Decorator {
  return (Story) => (
    <Providers check={check}>
      <Story />
    </Providers>
  );
}

const openTable = fn();

/**
 * One artifact an answer made: its kind, title and version. In Ask it opens the artifact panel and
 * marks the shown version; in the agent panel it links to Ask; while its answer streams it waits.
 * A table card also shows its first 5 rows and how many more (R-44a).
 */
const meta = {
  title: "Core/Agent/ArtifactCard",
  component: ArtifactCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The card of a chart or a table an answer made (R-45a, AG24). `action` `panel` opens the artifact panel in Ask ("Open", or "Showing" with `aria-pressed` for the shown version); `link` goes to the artifact in Ask. Until its answer is stored, the card reads "Ready when the answer ends" and is disabled. A table card reads its rows through the chart gate as the viewer and shows the first 5, one line each, under its header. Its footer holds "7 more rows", which opens the full list, and a note that names the amounts the rows show (R-44a, czjw.118).',
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    withChartCheck(answering(tableOf(12))),
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    artifact: ARTIFACT,
    action: { kind: "panel", shown: null, onOpen: fn() },
    ready: true,
  },
} satisfies Meta<typeof ArtifactCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InAsk: Story = {
  name: "In Ask",
  play: async ({ canvas }) => {
    // A chart card stays compact: no row lines.
    await expect(
      canvas.getByRole("button", { name: /^Quantity by record/ })
    ).toBeVisible();
    await expect(canvas.queryByRole("list", { name: "First rows" })).toBeNull();
  },
};

export const Showing: Story = {
  args: {
    action: {
      kind: "panel",
      shown: { artifactId: ARTIFACT.artifactId, version: 2 },
      onOpen: fn(),
    },
  },
};

export const InThePanel: Story = {
  name: "In the panel",
  args: { action: { kind: "link", href: () => "/ask/chat-1" } },
};

export const WhileTheAnswerStreams: Story = {
  name: "While the answer streams",
  args: { ready: false },
  play: async ({ canvas }) => {
    const card = canvas.getByRole("button", { name: /^Quantity by record/ });

    await expect(card).toBeDisabled();
    await expect(card).toHaveTextContent("Ready when the answer ends");
  },
};

export const TableInAsk: Story = {
  name: "Table in Ask, 12 rows",
  args: {
    artifact: TABLE_ARTIFACT,
    action: { kind: "panel", shown: null, onOpen: openTable },
  },
  beforeEach: () => {
    openTable.mockClear();
  },
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "First rows" });

    const lines = within(list).getAllByRole("listitem");

    await expect(lines).toHaveLength(5);
    await expect(lines[0]).toHaveTextContent("Record 1 · SGD 1,200.00");
    await expect(canvas.queryByText(/Record 6/)).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: /^7 more/ }));
    await expect(openTable).toHaveBeenCalledWith({
      artifactId: TABLE_ARTIFACT.artifactId,
      version: 1,
    });
  },
};

export const ShortTable: Story = {
  name: "Table of 4 rows",
  args: { artifact: TABLE_ARTIFACT },
  decorators: [withChartCheck(answering(tableOf(4)))],
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "First rows" });

    const lines = within(list).getAllByRole("listitem");

    await expect(lines).toHaveLength(4);
    // The amount carries its currency, so the currency column is not a field of its own.
    await expect(lines[0]?.textContent).toMatch(/^Record 1 · SGD\s1,200\.00$/);
    await expect(canvas.queryByText(/more/)).toBeNull();
    await expect(canvas.getByText("Amount: Total")).toBeVisible();
  },
};

export const CutTable: Story = {
  name: "Table cut at 1,000 rows",
  args: {
    artifact: TABLE_ARTIFACT,
    action: { kind: "panel", shown: null, onOpen: openTable },
  },
  decorators: [withChartCheck(answering(tableOf(1000, true)))],
  beforeEach: () => {
    openTable.mockClear();
  },
  play: async ({ canvas }) => {
    // The gate stopped at 1,000, so each count is a floor, never an exact number.
    const more = await canvas.findByRole("button", {
      name: "995+ more rows, open the full list",
    });

    await expect(
      canvas.getByRole("button", { name: /^Records/ })
    ).toHaveTextContent("Table · v1 · 1,000+ rows");
    await expect(canvas.getByText("Amount: Total")).toBeVisible();

    await userEvent.click(more);
    await expect(openTable).toHaveBeenCalledWith({
      artifactId: TABLE_ARTIFACT.artifactId,
      version: 1,
    });
  },
};

/** Variant A at 390 px: the header, the rows and the footer keep the card's 16 px edge. */
export const TableOnAPhone: Story = {
  name: "Table on a phone",
  args: { artifact: TABLE_ARTIFACT },
  globals: { viewport: { value: "phone390", isRotated: false } },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
};

export const TableInThePanel: Story = {
  name: "Table in the panel",
  args: {
    artifact: TABLE_ARTIFACT,
    action: { kind: "link", href: () => "/ask/chat-1?artifact=2" },
  },
  play: async ({ canvas }) => {
    const more = await canvas.findByRole("link", {
      name: "7 more rows, open the full list",
    });

    await expect(more).toHaveAttribute("href", "/ask/chat-1?artifact=2");
  },
};
