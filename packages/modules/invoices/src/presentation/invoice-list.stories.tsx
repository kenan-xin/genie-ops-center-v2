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
function atAddress(query: string, page: InvoiceListView) {
  return () => {
    listInvoices.mockReset();
    listInvoices.mockResolvedValue(page);

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

  return ["q", "status", "customer", "from", "to"].flatMap((name) => {
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
  summary: defaultInvoiceList.summary,
};

async function showsMore(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]
) {
  listInvoices.mockReset();
  listInvoices.mockResolvedValue(NEXT_PAGE);

  await expect(canvas.getByText("Showing the first 4 invoices.")).toBeVisible();

  await userEvent.click(canvas.getByRole("button", { name: "Show more" }));

  // The role query skips the copy that the other viewport hides (table or cards).
  await expect(
    await canvas.findByRole("link", { name: "INV-2026-08-30" })
  ).toBeVisible();
  await expect(listInvoices).toHaveBeenCalledWith({
    after: CURSOR,
    filters: {},
  });
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
  await expect(canvas.queryByText(/Showing the first/)).toBeNull();
}

const meta = {
  title: "Modules/Invoices/Invoices list",
  component: InvoiceList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Invoices list at `/m/invoices/invoices`, read from `invoices.invoices` as of the reporting date (Spec 7 R-59, R-60). The caption names the reporting date because `PageHeader` hides its description below `lg`. From 768 px the rows are a table; below that they are the same rows as cards, with the invoice number opening the record and the balance as a fact. A cut read says how many rows it shows. The search, the status chips, the customer picker and the invoice-date range live in the page address (`q`, `status`, `customer`, `from`, `to`) and run on the server through `listInvoices`; on a phone the filters sit behind one Filters button. The summary line, one per currency, covers every invoice the filters keep (design review 1.4).",
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

export const Default: Story = {
  play: async ({ canvas }) => {
    // The caption writes the date as the table does (design review 1.1).
    await expect(
      canvas.getByText("Balances as of 27 Oct 2026, the reporting date.")
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Show more" })
    ).toBeNull();
    await expect(canvas.queryByText(/Showing the first/)).toBeNull();
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
      /^4$/
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
    const overdue = canvas.getByRole("button", { name: "Overdue" });

    await userEvent.click(overdue);

    await expect(listInvoices).toHaveBeenCalledWith({
      after: null,
      filters: { status: "overdue" },
    });
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "INV-2026-09-01" })).toBeNull()
    );
    await expect(
      canvas.getByRole("link", { name: "INV-2026-09-03" })
    ).toBeVisible();
    await expect(overdue).toHaveAttribute("aria-pressed", "true");
    await expect(listAddress()).toEqual(["status=overdue"]);
    // The strip is the filtered page's: one invoice, not the four of the unfiltered page.
    await expect(figure(canvasElement, "SGD", "Invoices")).toHaveTextContent(
      /^1$/
    );
    await expect(figure(canvasElement, "SGD", "Overdue")).toHaveTextContent(
      /^SGD\s?3,000\.00$/
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
        filters: { search: "INV-2026-09", status: "paid" },
      })
    );
    await expect(canvas.getByRole("button", { name: "Paid" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(
      canvas.getByRole("searchbox", {
        name: "Search invoice number or customer",
      })
    ).toHaveValue("INV-2026-09");
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
    // The chips sit behind one button, so the cards start near the top.
    await expect(canvas.queryByRole("group", { name: "Status" })).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(await screen.findByRole("button", { name: "Paid" }));

    await expect(listInvoices).toHaveBeenCalledWith({
      after: null,
      filters: { status: "paid" },
    });
    await expect(
      await screen.findByRole("button", { name: /Filters/ })
    ).toHaveTextContent("1");
  },
};

export const ShowMore: Story = {
  name: "Show more",
  args: { view: cut },
  globals: desktop,
  play: async ({ canvas }) => showsMore(canvas),
};

export const ShowMoreOnPhone: Story = {
  name: "Show more on a phone",
  args: { view: cut },
  globals: phone,
  play: async ({ canvas }) => showsMore(canvas),
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
      summary: [],
      customers: [],
    },
  },
};
