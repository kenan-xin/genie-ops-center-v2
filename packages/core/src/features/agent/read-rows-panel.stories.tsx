import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { GROUPED_READ, READ_LABELS } from "./__fixtures__/reads.ts";
import { readsOf } from "./answer-sources.ts";
import { ChartCheckProvider } from "./chart-check.tsx";
import { ReadRowsPanel } from "./read-rows-panel.tsx";

const [READ] = readsOf([GROUPED_READ]);

if (READ === undefined) throw new Error("The grouped read does not parse.");

// The view draws the rows the answer already holds; a call here would be a second read.
const check = fn(async () => {
  throw new Error("The rows view read the gate.");
});

const close = fn();

/**
 * The rows one read of an answer returned (czjw.108, method-fold variant A): its source, row count
 * and date, what each row is, and the rows with their field labels. It draws the answer's own
 * rows and reads nothing. In Ask it is a column beside the chat, or a sheet with Back to the chat.
 */
const meta = {
  title: "Core/Agent/ReadRowsPanel",
  component: ReadRowsPanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The rows of one read, from the answer itself (czjw.108). The header reads "Rows read from <Title>" and "<n> rows · as of <day> · the rows this answer used", a note says whether each row is one group or one record, and the table labels each column by its field or measure, never by a name. `variant` `column` closes with "Close the rows"; `sheet` goes back with "Back to the chat".',
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <ChartCheckProvider check={check} timeZone="UTC">
        <div style={{ height: 640, width: 480 }}>
          <Story />
        </div>
      </ChartCheckProvider>
    ),
  ],
  args: {
    read: READ,
    labels: READ_LABELS,
    variant: "column",
    timeZone: "UTC",
    onClose: close,
  },
  beforeEach: () => {
    check.mockClear();
    close.mockClear();
  },
} satisfies Meta<typeof ReadRowsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RowsOfAGroupedRead: Story = {
  name: "Rows of a grouped read",
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Rows read from Items" })
    ).toBeVisible();
    await expect(
      canvas.getByText("6 rows · as of 27 Oct 2026 · the rows this answer used")
    ).toBeVisible();
    await expect(canvas.getByText("Each row is one group.")).toBeVisible();

    const table = canvas.getByRole("table");

    // The table's own last column holds its row actions.
    await expect(
      within(table)
        .getAllByRole("columnheader")
        .slice(0, 2)
        .map((header) => header.textContent)
    ).toEqual(["Created on", "Amount"]);
    await expect(within(table).getAllByRole("row")).toHaveLength(7);
    await expect(check).not.toHaveBeenCalled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Close the rows" })
    );
    await expect(close).toHaveBeenCalled();
  },
};

export const RowsOnAPhone: Story = {
  name: "Rows on a phone",
  args: { variant: "sheet" },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Back to the chat" })
    );
    await expect(close).toHaveBeenCalled();
  },
};
