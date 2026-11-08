import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  defaultInvoiceList,
  overdueInvoicePage,
  paidInvoicePage,
  twoCurrencyInvoiceList,
} from "./__fixtures__/invoices.ts";
import { InvoiceList } from "./invoice-list.tsx";
import type { InvoiceListPageView, InvoiceListView } from "./views.ts";

const listInvoices = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** A fresh query cache per story, and the list procedure as a mock. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider client={{ invoices: { listInvoices } }}>
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const CURSOR = { values: ["2026-09-01", "INV-2026-09-01", "invoice-4"] };

/** Opens the story at an address with these list parameters, and `listInvoices` answering `page`. */
function atAddress(query: string, page?: InvoiceListView) {
  return () => {
    listInvoices.mockReset();

    if (page !== undefined) listInvoices.mockResolvedValueOnce(page);

    // Any later read, such as scroll loading, answers the next page.
    listInvoices.mockResolvedValue(NEXT_PAGE);

    const url = new URL(window.location.href);

    for (const [name, value] of new URLSearchParams(query)) {
      url.searchParams.set(name, value);
    }

    window.history.replaceState(null, "", url);
  };
}

/** The list's own parameters in the address now. */
const listAddress = () => {
  const params = new URLSearchParams(window.location.search);

  return ["q", "status", "customer", "date", "sort"].flatMap((name) => {
    const value = params.get(name);

    return value === null ? [] : [`${name}=${value}`];
  });
};

/** The value of one figure in a currency's strip: the `dd` right after its label. */
const figure = (canvasElement: HTMLElement, currency: string, label: string) =>
  within(
    within(canvasElement).getByRole("region", {
      name: `Totals in ${currency}`,
    })
  ).getByText(label, { selector: "dt" }).nextElementSibling;

/** A first page that was cut, and the one row the next page answers. */
const cut: InvoiceListPageView = {
  ...defaultInvoiceList,
  truncated: true,
  next: CURSOR,
};

const [firstRow] = defaultInvoiceList.rows;

const NEXT_PAGE: InvoiceListView = {
  asOf: "2026-10-27",
  rows:
    firstRow === undefined
      ? []
      : [{ ...firstRow, id: "invoice-5", invoiceNumber: "INV-2026-08-30" }],
  truncated: false,
  next: null,
  counts: null,
  summary: null,
};

async function showsMore(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"],
  params: Readonly<Record<string, string>> = {}
) {
  // Scroll loading reads the next page as soon as the end is near; Show more is its fallback.
  const more = canvas.queryByRole("button", { name: "Show more" });

  if (more !== null) await userEvent.click(more);

  // The role query skips the copy that the other viewport hides (table or cards).
  await expect(
    await canvas.findByRole("link", { name: "INV-2026-08-30" })
  ).toBeVisible();
  // K2: the next page keeps the list's parameters.
  await expect(listInvoices).toHaveBeenCalledWith({ after: CURSOR, params });
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
  await expect(canvas.queryByText(/^Showing/)).toBeNull();
}

/** The note under one figure: the second `dd` after its label. */
const note = (canvasElement: HTMLElement, currency: string, label: string) =>
  figure(canvasElement, currency, label)?.nextElementSibling;

const meta = {
  title: "Modules/Invoices/Invoices list",
  component: InvoiceList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Invoices list at `/m/invoices/invoices`, read from `invoices.invoices` as of the reporting date (Spec 7 R-59, R-60). The caption names the reporting date because `PageHeader` hides its description below `lg`. The page is one `ListHeader` (variant C, `czjw.73`): one figure card per currency, the status tabs with their counts, the search, customer and invoice-date filters, and the table, with Updated in the tenant's time zone, newest first. Below 768 px the rows are cards, and the tabs and filters sit in one Filters sheet. The tab, the filters and the sort live in the page address (`status`, `q`, `customer`, `date`, `sort`) and run on the server through `listInvoices`. Outstanding and Status do not sort. Scroll loading reads the next page, with Show more as its fallback.",
      },
    },
    a11y: { test: "error" },
  },
  args: { view: defaultInvoiceList },
  decorators: [withQuery],
  // Each story leaves the address as it found it.
  beforeEach: () => {
    const before = window.location.href;

    return () => window.history.replaceState(null, "", before);
  },
} satisfies Meta<typeof InvoiceList>;

export default meta;

type Story = StoryObj<typeof meta>;

/** K1: Updated in the tenant's zone, and the figure notes with their counts. */
async function updatedAndFigures(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"],
  canvasElement: HTMLElement
) {
  // The caption writes the date as the table does (design review 1.1).
  await expect(
    canvas.getByText("Balances as of 27 Oct 2026, the reporting date.")
  ).toBeVisible();
  // 08:40 UTC is 16:40 in Asia/Singapore (Review Focus 5), the time under its day (czjw.102).
  const time = canvas.getAllByText(/16:40$/).filter(isVisible);

  await expect(time).toHaveLength(1);
  await expect(time[0]!.parentElement).toHaveTextContent("2 Nov 2026");
  await expect(note(canvasElement, "SGD", "Outstanding")).toHaveTextContent(
    "In 7 invoices"
  );
  await expect(note(canvasElement, "SGD", "Invoices")).toHaveTextContent(
    "29 paid"
  );
  await expect(note(canvasElement, "SGD", "Invoiced")).toHaveTextContent(
    "In 36 invoices"
  );
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
}

const isVisible = (element: HTMLElement) => element.checkVisibility();

export const Default: Story = {
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await updatedAndFigures(canvas, canvasElement);
    await expect(
      canvas.getByRole("columnheader", { name: /Updated/ })
    ).toHaveAttribute("aria-sort", "descending");
  },
};

export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await updatedAndFigures(canvas, canvasElement);
    await expect(canvas.getByText("Updated, newest")).toBeVisible();

    // Updated keeps its own card line, so the facts never cut it off (variant C).
    const updated = canvas
      .getAllByText(/^Updated 2 Nov 2026, 16:40$/)
      .find(isVisible);

    await expect(updated!.scrollWidth).toBeLessThanOrEqual(
      updated!.clientWidth
    );
  },
};

export const TwoCurrencies: Story = {
  name: "Two currencies",
  args: { view: twoCurrencyInvoiceList },
  play: async ({ canvasElement }) => {
    // One strip per currency: no figure adds SGD and USD.
    await expect(figure(canvasElement, "SGD", "Outstanding")).toHaveTextContent(
      /^SGD\s?12,550\.00$/
    );
    await expect(figure(canvasElement, "SGD", "Invoiced")).toHaveTextContent(
      /^SGD\s?21,750\.00$/
    );
    await expect(figure(canvasElement, "SGD", "Invoices")).toHaveTextContent(
      /^36$/
    );
    await expect(figure(canvasElement, "USD", "Outstanding")).toHaveTextContent(
      /^US\$1,250\.00$/
    );
    await expect(figure(canvasElement, "USD", "Invoices")).toHaveTextContent(
      /^1$/
    );
  },
};

export const FilterByStatus: Story = {
  name: "Filter by status",
  globals: desktop,
  beforeEach: atAddress("", overdueInvoicePage),
  play: async ({ canvas, canvasElement }) => {
    // K2: the tab writes the address, and the procedure gets it.
    await userEvent.click(canvas.getByRole("tab", { name: "Overdue 1" }));

    await expect(listInvoices).toHaveBeenCalledWith({
      after: null,
      params: { status: "overdue" },
    });
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "INV-2026-09-01" })).toBeNull()
    );
    await expect(
      canvas.getByRole("link", { name: "INV-2026-09-03" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: "Overdue 1" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(listAddress()).toEqual(["status=overdue"]);
    // The strip stays the whole ledger's on every tab (czjw.112).
    await expect(figure(canvasElement, "SGD", "Invoices")).toHaveTextContent(
      /^36$/
    );
    await expect(figure(canvasElement, "SGD", "Outstanding")).toHaveTextContent(
      /^SGD\s?12,550\.00$/
    );
  },
};

export const FiltersFromTheAddress: Story = {
  name: "Filters from the address",
  globals: desktop,
  beforeEach: atAddress("?status=paid&q=INV-2026-09", paidInvoicePage),
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(listInvoices).toHaveBeenCalledWith({
        after: null,
        params: { q: "INV-2026-09", status: "paid" },
      })
    );
    await expect(canvas.getByRole("tab", { name: "Paid 1" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(canvas.getByRole("searchbox")).toHaveValue("INV-2026-09");
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "INV-2026-10-02" })).toBeNull()
    );
  },
};

export const FiltersOnAPhone: Story = {
  name: "Filters on a phone",
  globals: phone,
  // The story ends with the panel open. Base UI's focus guards are `aria-hidden` on purpose (they
  // hand focus on), so only they skip `aria-hidden-focus`, as in the audit log stories.
  parameters: {
    a11y: {
      test: "error",
      config: {
        rules: [
          {
            id: "aria-hidden-focus",
            selector: '[aria-hidden="true"]:not([data-base-ui-focus-guard])',
          },
        ],
      },
    },
  },
  beforeEach: atAddress("", paidInvoicePage),
  play: async ({ canvas }) => {
    // The tabs sit in the Filters sheet, so the cards start near the top.
    await expect(canvas.queryByRole("tablist")).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(await screen.findByRole("radio", { name: /^Paid/ }));

    await expect(listInvoices).toHaveBeenCalledWith({
      after: null,
      params: { status: "paid" },
    });
    // Show closes the sheet, and the Filters button counts the tab.
    await userEvent.click(
      screen.getByRole("button", { name: "Show 1 invoice" })
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /^Filters/ })
      ).toHaveTextContent("1")
    );
  },
};

export const ShowMore: Story = {
  name: "Show more",
  args: { view: cut },
  beforeEach: atAddress(""),
  globals: desktop,
  play: async ({ canvas }) => showsMore(canvas),
};

export const ShowMoreOnPhone: Story = {
  name: "Show more on a phone",
  args: { view: cut },
  beforeEach: atAddress(""),
  globals: phone,
  play: async ({ canvas }) => showsMore(canvas),
};

export const ShowMoreKeepsTheFilters: Story = {
  name: "Show more keeps the filters",
  globals: desktop,
  beforeEach: atAddress("?status=overdue", {
    ...overdueInvoicePage,
    rows: defaultInvoiceList.rows,
    next: CURSOR,
  }),
  play: async ({ canvas }) => showsMore(canvas, { status: "overdue" }),
};

export const SortByTotal: Story = {
  name: "Sort by total",
  globals: desktop,
  beforeEach: atAddress("", paidInvoicePage),
  play: async ({ canvas }) => {
    // A new column sorts descending first; Outstanding does not sort (LH5).
    await userEvent.click(canvas.getByRole("button", { name: /^Total/ }));

    await expect(listInvoices).toHaveBeenCalledWith({
      after: null,
      params: { sort: "total.desc" },
    });
    await expect(
      within(
        canvas.getByRole("columnheader", { name: /Outstanding/ })
      ).queryByRole("button")
    ).toBeNull();
  },
};

/** The list, left for another screen and opened again with a new first page from the server. */
function LeaveAndReturn() {
  const [view, setView] = useState<InvoiceListPageView | null>(
    defaultInvoiceList
  );

  return (
    <>
      <button type="button" onClick={() => setView(null)}>
        Leave
      </button>
      <button type="button" onClick={() => setView(twoCurrencyInvoiceList)}>
        Return
      </button>
      {view === null ? null : <InvoiceList view={view} />}
    </>
  );
}

export const FreshAfterReturn: Story = {
  name: "Fresh after a return",
  globals: desktop,
  render: () => <LeaveAndReturn />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Leave" }));
    await userEvent.click(canvas.getByRole("button", { name: "Return" }));

    // A save on another screen changes the server's first page; the list shows that page.
    const amounts = await canvas.findAllByText("US$1,250.00");

    await expect(amounts[0]).toBeVisible();
  },
};

export const Empty: Story = {
  args: {
    view: {
      asOf: "2026-10-27",
      rows: [],
      truncated: false,
      next: null,
      counts: {},
      summary: [],
      customers: [],
      timeZone: "Asia/Singapore",
    },
  },
};
