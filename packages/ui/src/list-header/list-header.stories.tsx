import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  Button,
  ListHeader,
  StatusPill,
  useListState,
  type ListDefinition,
  type ListFilterControlProps,
  type ListHeaderProps,
} from "../index.ts";
import {
  docsState,
  invoicesLike,
  param,
  resetAddress,
} from "./list-fixtures.ts";

type Row = {
  readonly id: string;
  readonly number: string;
  readonly customer: string;
  readonly total: string;
  readonly outstanding: string;
  readonly updated: string;
  readonly status: string;
};

const rowsOf = (count: number): readonly Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r-${index + 1}`,
    number: `INV-${String(1000 + index)}`,
    customer: ["Harbor Freight", "Northwind Traders", "Blue Fin Foods"][
      index % 3
    ]!,
    total: `SGD ${(1200 + index * 35).toLocaleString("en-SG")}.00`,
    outstanding: index % 4 === 0 ? "SGD 0.00" : "SGD 400.00",
    updated: `${1 + (index % 28)} Oct 2026, 16:40`,
    status: index % 4 === 0 ? "Paid" : "Open",
  }));

const table: ListHeaderProps<Row>["table"] = {
  rows: rowsOf(6),
  rowKey: (row) => row.id,
  rowLabel: (row) => row.number,
  columns: [
    {
      id: "number",
      header: "Invoice",
      cell: (row) => row.number,
      sort: "text",
    },
    {
      id: "customer",
      header: "Customer",
      cell: (row) => row.customer,
      sort: "text",
    },
    {
      id: "total",
      header: "Total",
      cell: (row) => row.total,
      align: "end",
      sort: "number",
    },
    {
      id: "outstanding",
      header: "Outstanding",
      cell: (row) => row.outstanding,
      align: "end",
    },
    {
      id: "updated",
      header: "Updated",
      cell: (row) => row.updated,
      sort: "date",
    },
  ],
  status: (row) => (
    <StatusPill tone={row.status === "Paid" ? "success" : "neutral"}>
      {row.status}
    </StatusPill>
  ),
  card: {
    title: (row) => row.number,
    badge: (row) => (
      <StatusPill tone={row.status === "Paid" ? "success" : "neutral"}>
        {row.status}
      </StatusPill>
    ),
    detail: (row) => row.customer,
    facts: (row) => [row.total, `Updated ${row.updated}`],
  },
  onOpenRow: fn(),
};

const invoiceFigures = [
  {
    label: "Figures",
    figures: [
      {
        label: "Outstanding",
        value: "SGD 48,210.00",
        note: "In 24 invoices",
        lead: true as const,
      },
      { label: "Overdue", value: "SGD 9,870.00", note: "In 3 invoices" },
      { label: "Invoiced", value: "SGD 152,400.00", note: "All invoice dates" },
      { label: "Invoices", value: "36", note: "21 paid" },
    ],
  },
];

const invoiceCounts = {
  "all": 36,
  "open": 12,
  "overdue": 3,
  "no-due-date": 0,
  "paid": 21,
};

const page = {
  loaded: 6,
  more: false,
  loading: false,
  failed: false,
  onMore: fn(),
};

const empty = {
  title: "No invoice matches these filters.",
  description: "Change a filter, or clear them all.",
};

type LiveProps = Omit<ListHeaderProps<Row>, "state">;

function Live(props: LiveProps) {
  const state = useListState(props.definition);

  return <ListHeader {...props} state={state} />;
}

const meta = {
  title: "UI/List header/ListHeader",
  component: ListHeader<Row>,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The one header of a module list (Spec 7 R-37a, variant C): figure cards, then one card with the status tabs on its top edge, the filter bar and the table, with a count and Show more in its footer. Every part but the table is optional and comes from a plain-data definition, so Invoices, Payments and the Documents inbox are three configurations. Below 768 px the card shows the active tab with its count, the Filters sheet, the search, and the sort of the current column. A tab with no rows shows no count.",
      },
    },
  },
  args: {
    definition: invoicesLike,
    state: docsState,
    counts: invoiceCounts,
    figures: invoiceFigures,
    anchorDay: "2026-11-03",
    table,
    page,
    empty,
  },
  beforeEach: resetAddress,
  render: ({ state: _state, ...args }) => <Live {...args} />,
  globals: { viewport: { value: "desktop1440", isRotated: false } },
} satisfies Meta<typeof ListHeader<Row>>;

export default meta;

type Story = StoryObj<typeof meta>;

// The distance between the highest and the lowest top of `elements`, in px.
const spread = (elements: readonly Element[]) => {
  const tops = elements.map((element) => element.getBoundingClientRect().top);

  return Math.max(...tops) - Math.min(...tops);
};

const upload = <Button size="filter">Upload</Button>;

/** H3, H4, H7, H8: tabs write the status, headers sort, the figure values line up, and actions follow Clear filters. */
export const InvoicesLike: Story = {
  args: { actions: upload },
  play: async ({ canvas }) => {
    // H3: a tab writes the status; a tab of 0 rows shows no count (czjw.68).
    await userEvent.click(canvas.getByRole("tab", { name: "Overdue 3" }));
    await waitFor(() => expect(param("status")).toBe("overdue"));
    await expect(
      canvas.getByRole("tab", { name: "Overdue 3" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.getByRole("tab", { name: "No due date" })
    ).toBeVisible();

    // H4: a new column sorts descending, a second click ascending; Outstanding does not sort.
    const total = canvas.getByRole("columnheader", { name: "Total" });

    await userEvent.click(within(total).getByRole("button", { name: "Total" }));
    await waitFor(() =>
      expect(total).toHaveAttribute("aria-sort", "descending")
    );
    await userEvent.click(within(total).getByRole("button", { name: "Total" }));
    await waitFor(() =>
      expect(total).toHaveAttribute("aria-sort", "ascending")
    );
    await expect(param("sort")).toBe("total.asc");
    await expect(
      within(
        canvas.getByRole("columnheader", { name: "Outstanding" })
      ).queryByRole("button")
    ).toBeNull();

    // H8: the actions part follows Clear filters.
    const clear = canvas.getAllByRole("button", { name: "Clear filters" })[0]!;

    const action = canvas
      .getAllByRole("button", { name: "Upload" })
      .find((button) => button.checkVisibility())!;

    await expect(action.getBoundingClientRect().left).toBeGreaterThan(
      clear.getBoundingClientRect().right
    );
  },
};

/** H5, H7, H8 on a phone: the active tab with its count, the sort of the current column, and the figures two by two. */
export const InvoicesLikePhone: Story = {
  args: { actions: upload },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "All invoices 36" })
    ).toBeVisible();

    const sort = canvas.getByRole("button", {
      name: "Sort: Updated, newest first",
    });

    await expect(sort).toHaveTextContent("Updated, newest");
    await userEvent.click(sort);
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Sort: Updated, oldest first" })
      ).toHaveTextContent("Updated, oldest")
    );
    await expect(param("sort")).toBe("updated.asc");

    const cells = [
      ...canvas
        .getByRole("region", { name: "Figures" })
        .querySelectorAll("dl > div"),
    ].map((cell) => cell.getBoundingClientRect());

    await expect(cells[0]!.top).toBe(cells[1]!.top);
    await expect(cells[2]!.top).toBe(cells[3]!.top);
    await expect(cells[2]!.top).toBeGreaterThan(cells[0]!.top);

    await expect(
      canvas
        .getAllByRole("button", { name: "Upload" })
        .find((button) => button.checkVisibility())
    ).toBeDefined();
    await expect(
      canvas.getByRole("button", { name: "Filters" }).getBoundingClientRect()
        .height
    ).toBe(44);
  },
};

const paymentsLike: ListDefinition = {
  ...invoicesLike,
  label: "Payments",
  noun: ["payment", "payments"],
  filters: [
    {
      id: "q",
      kind: "search",
      label: "Search payments",
      placeholder: "Search reference or customer",
    },
    invoicesLike.filters[1]!,
    {
      id: "date",
      kind: "date-range",
      label: "Payment date",
      placeholder: "Any payment date",
    },
  ],
  tabs: {
    param: "status",
    items: [
      { value: "all", label: "All" },
      { value: "allocated", label: "Allocated" },
      { value: "part-allocated", label: "Part allocated" },
      { value: "unallocated", label: "Not linked", tone: "warning" },
    ],
  },
};

const paymentArgs = {
  definition: paymentsLike,
  counts: { "all": 29, "allocated": 22, "part-allocated": 3, "unallocated": 4 },
  figures: [
    {
      label: "Figures",
      figures: [
        {
          label: "Collected",
          value: "SGD 104,190.00",
          note: "1 Oct – 3 Nov 2026",
          lead: true as const,
        },
        { label: "Allocated", value: "SGD 96,040.00", note: "In 25 payments" },
        { label: "Unallocated", value: "SGD 8,150.00", note: "In 7 payments" },
        { label: "Payments", value: "29", note: "4 not linked" },
      ],
    },
  ],
  empty: {
    title: "No payment matches these filters.",
    description: "Change a filter, or clear them all.",
  },
};

/** H1: the Payments configuration, checked by axe. */
export const PaymentsLike: Story = {
  args: paymentArgs,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("tab", { name: "Not linked 4" })
    ).toBeVisible();
    await expect(canvas.getByRole("table", { name: "Payments" })).toBeVisible();
  },
};

export const PaymentsLikePhone: Story = {
  args: paymentArgs,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "All payments 29" })
    ).toBeVisible();
    await expect(canvas.getByRole("list", { name: "Payments" })).toBeVisible();
  },
};

const documentsLike: ListDefinition = {
  label: "Documents",
  noun: ["document", "documents"],
  filters: [
    {
      id: "q",
      kind: "search",
      label: "Search documents",
      placeholder: "Search file, customer, number",
    },
    {
      id: "type",
      kind: "option",
      label: "Type",
      placeholder: "All types",
      icon: "file",
      options: [
        { value: "invoice", label: "Invoice" },
        { value: "payment", label: "Payment" },
      ],
    },
    {
      id: "date",
      kind: "date-range",
      label: "Uploaded",
      placeholder: "Any upload date",
    },
  ],
  tabs: {
    param: "status",
    items: [
      { value: "needs-you", label: "Needs you" },
      { value: "reading", label: "Reading" },
      { value: "done", label: "Done" },
      { value: "all", label: "All" },
    ],
  },
  sorts: [
    { column: "uploaded", kind: "date" },
    { column: "updated", kind: "date" },
  ],
  defaultSort: { column: "updated", direction: "desc" },
};

const documentArgs = {
  definition: documentsLike,
  counts: { "needs-you": 0, "reading": 1, "done": 30, "all": 36 },
  figures: undefined,
  empty: {
    title: "Nothing needs you.",
    description: "New uploads show here while they are read.",
  },
};

/** H3: the inbox configuration with no figures; an empty Needs you shows no count and its empty text. */
export const DocumentsLike: Story = {
  args: { ...documentArgs, page: { ...page, loaded: 0 } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("tab", { name: "Needs you" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(canvas.queryByRole("region", { name: "Figures" })).toBeNull();
    await expect(canvas.getByText("Nothing needs you.")).toBeVisible();
    await expect(canvas.getByLabelText("Type: All types")).toBeVisible();
  },
};

export const DocumentsLikePhone: Story = {
  args: { ...documentArgs, page: { ...page, loaded: 0 } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Needs you" })
    ).toBeVisible();
    await expect(canvas.getByText("Nothing needs you.")).toBeVisible();
  },
};

/** H6: the footer counts the loaded rows of the tab, and Show more shows only while more exist. */
export const ShowMore: Story = {
  args: {
    ...documentArgs,
    table: { ...table, rows: rowsOf(50) },
    page: { ...page, loaded: 50, more: true },
  },
  render: ({ state: _state, ...args }) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}&status=done`
    );

    return (
      <Live
        {...args}
        counts={{ "needs-you": 0, "reading": 1, "done": 66, "all": 67 }}
      />
    );
  },
  play: async ({ canvas, args }) => {
    await expect(
      canvas
        .getAllByText("Showing 50 of 66 documents")
        .find((text) => text.checkVisibility())
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Show more" }));
    await expect(args.page.onMore).toHaveBeenCalled();
  },
};

export const AllShown: Story = {
  args: {
    ...documentArgs,
    table: { ...table, rows: rowsOf(66) },
    page: { ...page, loaded: 66, more: false },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByText("66 documents").find((text) => text.checkVisibility())
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Show more" })
    ).toBeNull();
  },
};

const plain: ListDefinition = {
  label: "Records",
  noun: ["record", "records"],
  filters: [
    { id: "q", kind: "search", label: "Search records", placeholder: "Search" },
  ],
  sorts: [{ column: "updated", kind: "date" }],
  defaultSort: { column: "updated", direction: "desc" },
};

/** H2: a list with no tabs and no figures renders neither, only the bar and the table. */
export const NoTabsNoFigures: Story = {
  args: { definition: plain, counts: undefined, figures: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("tablist")).toBeNull();
    await expect(canvas.queryByRole("region", { name: "Figures" })).toBeNull();
    await expect(
      canvas
        .getAllByLabelText("Search records")
        .find((input) => input.checkVisibility())
    ).toBeVisible();
    await expect(canvas.getByRole("table", { name: "Records" })).toBeVisible();
  },
};

/**
 * H7: a caption that wraps to two lines still leaves every value on one line and every sub-line on
 * another, so no figure is ragged (owner note of 2026-11-03).
 */
export const FiguresLineUp: Story = {
  args: {
    figures: [
      {
        label: "Figures",
        figures: [
          invoiceFigures[0]!.figures[0]!,
          {
            label:
              "Overdue by more than thirty days, across every customer that you may read",
            value: "SGD 9,870.00",
            note: "In 3 invoices",
          },
          invoiceFigures[0]!.figures[2]!,
          invoiceFigures[0]!.figures[3]!,
        ],
      },
    ],
  },
  play: async ({ canvas }) => {
    const figures = canvas.getByRole("region", { name: "Figures" });
    const definitions = within(figures).getAllByRole("definition");

    // The values and the sub-lines alternate: value, sub-line, per figure.
    const values = definitions.filter((_, index) => index % 2 === 0);
    const notes = definitions.filter((_, index) => index % 2 === 1);

    await expect(
      within(figures).getAllByRole("term")[1]!.getBoundingClientRect().height
    ).toBeGreaterThan(20);
    await expect(notes).toHaveLength(4);
    await expect(spread(notes)).toBeLessThanOrEqual(1);
    await expect(
      spread(values.slice(1)) // the lead value is larger, so it shares the baseline, not the top
    ).toBeLessThanOrEqual(1);
  },
};

/** H7: with three figures the lead spans both phone columns (LH18). */
export const ThreeFiguresPhone: Story = {
  args: {
    figures: [
      { label: "Figures", figures: invoiceFigures[0]!.figures.slice(0, 3) },
    ],
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const region = canvas.getByRole("region", { name: "Figures" });

    const [lead, second, third] = [...region.querySelectorAll("dl > div")].map(
      (cell) => cell.getBoundingClientRect()
    );

    await expect(
      Math.abs(
        lead!.width - region.querySelector("dl")!.getBoundingClientRect().width
      )
    ).toBeLessThanOrEqual(1);
    await expect(second!.top).toBe(third!.top);
  },
};

// A story-only filter kind: the header shows it without knowing it (the contract's "registers its own control").
function FlagControl(props: ListFilterControlProps) {
  return (
    <Button
      variant={props.value === "1" ? "filter-set" : "secondary"}
      size="filter"
      aria-pressed={props.value === "1"}
      onClick={() => props.onChange(props.value === "1" ? undefined : "1")}
    >
      {props.filter.label}
    </Button>
  );
}

const flagged: ListDefinition = {
  ...invoicesLike,
  filters: [
    ...invoicesLike.filters,
    { id: "flag", kind: "flag", label: "Only flagged", placeholder: "Any" },
  ],
};

/** H8: a registered kind shows in the bar and writes its parameter. */
export const CustomKind: Story = {
  args: { definition: flagged, controls: { flag: FlagControl } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Only flagged" }));
    await waitFor(() => expect(param("flag")).toBe("1"));
  },
};

export const CustomKindPhone: Story = {
  args: { definition: flagged, controls: { flag: FlagControl } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Only flagged" })
    );
    await waitFor(() => expect(param("flag")).toBe("1"));
    await userEvent.keyboard("{Escape}");
  },
};
