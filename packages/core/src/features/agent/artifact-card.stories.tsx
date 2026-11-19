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

/** A table of `count` records, each with an amount in its own currency, and six columns to show. */
function tableOf(count: number, truncated = false): ChartData {
  return {
    kind: "table",
    title: "Records",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "total", label: "Total", type: "money", currencyKey: "currency" },
      { key: "currency", label: "Currency", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "region", label: "Region", type: "text" },
      { key: "team", label: "Team", type: "text" },
    ],
    rows: Array.from({ length: count }, (_, index) => ({
      name: `Record ${index + 1}`,
      total: 120_000 + index,
      currency: "SGD",
      status: "Open",
      owner: "Alex",
      region: "North",
      team: "Sales",
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

/** The visible column headers of the card's first rows, in order. */
async function headersOf(canvas: ReturnType<typeof within>) {
  const table = await canvas.findByRole("table", { name: "First rows" });

  return within(table)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
}

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
          'The card of a chart or a table an answer made (R-45a, AG24). `action` `panel` opens the artifact panel in Ask ("Open", or "Showing" with `aria-pressed` for the shown version); `link` goes to the artifact in Ask. Until its answer is stored, the card reads "Ready when the answer ends" and is disabled. A table card reads its rows through the chart gate as the viewer and shows the first 5 as a small table with column headers, three columns in a narrow card and five from a 480 px card (czjw.197). Its footer holds "7 more rows", which opens the full list (R-44a).',
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
    action: { kind: "panel", shown: null, onOpen: fn(), onOpenRows: fn() },
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
    await expect(
      canvas.queryByRole("table", { name: "First rows" })
    ).toBeNull();
  },
};

export const Showing: Story = {
  args: {
    action: {
      kind: "panel",
      shown: { artifactId: ARTIFACT.artifactId, version: 2 },
      onOpen: fn(),
      onOpenRows: fn(),
    },
  },
};

export const InThePanel: Story = {
  name: "In the panel",
  args: {
    action: {
      kind: "link",
      href: () => "/ask/chat-1",
      rowsHref: () => "/ask/chat-1?rows=call-1",
    },
  },
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
    action: { kind: "panel", shown: null, onOpen: openTable, onOpenRows: fn() },
  },
  beforeEach: () => {
    openTable.mockClear();
  },
  // From a 480 px card the preview shows five columns (czjw.197).
  decorators: [
    (Story) => (
      <div style={{ width: 560 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(await headersOf(canvas)).toEqual([
      "Name",
      "Total",
      "Status",
      "Owner",
      "Region",
    ]);

    const table = canvas.getByRole("table", { name: "First rows" });

    const rows = within(table).getAllByRole("row").slice(1);

    await expect(rows).toHaveLength(5);
    await expect(rows[0]).toHaveTextContent(/^Record 1SGD\s1,200\.00Open/);
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
    // The amount carries its currency, so the currency column is not a column of its own.
    await expect(await headersOf(canvas)).toEqual(["Name", "Total", "Status"]);

    const table = canvas.getByRole("table", { name: "First rows" });

    await expect(within(table).getAllByRole("row")).toHaveLength(5);
    await expect(canvas.queryByText(/more/)).toBeNull();
  },
};

export const CutTable: Story = {
  name: "Table cut at 1,000 rows",
  args: {
    artifact: TABLE_ARTIFACT,
    action: { kind: "panel", shown: null, onOpen: openTable, onOpenRows: fn() },
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

    // G5: no version tag while one version exists.
    await expect(
      canvas.getByRole("button", { name: /^Records/ })
    ).toHaveTextContent("Table · 1,000+ rows");
    await expect(await headersOf(canvas)).toEqual(["Name", "Total", "Status"]);

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
  play: async ({ canvas }) => {
    // A narrow card shows three columns (czjw.197).
    await expect(await headersOf(canvas)).toEqual(["Name", "Total", "Status"]);
  },
};

/** Whether an element shows its whole text, with nothing cut off. */
const whole = (element: Element | null | undefined) =>
  element !== null &&
  element !== undefined &&
  element.scrollWidth <= element.clientWidth;

/** An id and an amount show whole on a phone, and a long name ends in an ellipsis (czjw.94). */
export const TableKeepsIdsWhole: Story = {
  name: "Table keeps ids whole",
  args: { artifact: TABLE_ARTIFACT },
  globals: { viewport: { value: "phone390", isRotated: false } },
  decorators: [
    withChartCheck(
      answering({
        ...tableOf(1),
        columns: [
          { key: "number", label: "Invoice", type: "text" },
          { key: "customer", label: "Customer", type: "text" },
          {
            key: "total",
            label: "Total",
            type: "money",
            currencyKey: "currency",
          },
          { key: "currency", label: "Currency", type: "text" },
        ],
        rows: [
          {
            number: "INV-2026-08-04",
            customer:
              "Northern Harbour Logistics and Cold Storage Holdings Limited",
            total: 405_000,
            currency: "SGD",
          },
        ],
      })
    ),
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: "First rows" });

    const [id, name, amount] = within(table).getAllByRole("cell");

    await expect(id).toHaveTextContent("INV-2026-08-04");
    await expect(whole(id?.querySelector("span"))).toBe(true);
    await expect(amount?.textContent).toMatch(/^SGD\s4,050\.00$/);
    await expect(whole(amount)).toBe(true);
    await expect(whole(name)).toBe(false);
  },
};

export const TableInThePanel: Story = {
  name: "Table in the panel",
  args: {
    artifact: TABLE_ARTIFACT,
    action: {
      kind: "link",
      href: () => "/ask/chat-1?artifact=2",
      rowsHref: () => "/ask/chat-1?rows=call-1",
    },
  },
  play: async ({ canvas }) => {
    const more = await canvas.findByRole("link", {
      name: "7 more rows, open the full list",
    });

    await expect(more).toHaveAttribute("href", "/ask/chat-1?artifact=2");
    await expect(await headersOf(canvas)).toEqual(["Name", "Total", "Status"]);
  },
};
