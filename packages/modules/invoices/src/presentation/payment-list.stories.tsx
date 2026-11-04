import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  defaultPaymentList,
  linkedPaymentPage,
  notLinkedPaymentPage,
  twoCurrencyPaymentList,
} from "./__fixtures__/payments.ts";
import { PaymentList } from "./payment-list.tsx";
import type { PaymentListPageView, PaymentListView } from "./views.ts";

const listPayments = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** A fresh query cache per story, and the list procedure as a mock. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider client={{ invoices: { listPayments } }}>
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const CURSOR = { values: ["2026-09-01", "TRF-0901-001", "payment-3"] };

/** Opens the story at an address with these list parameters, and `listPayments` answering `page`. */
function atAddress(query: string, page?: PaymentListView) {
  return () => {
    listPayments.mockReset();

    if (page !== undefined) listPayments.mockResolvedValueOnce(page);

    // Any later read, such as scroll loading, answers the next page.
    listPayments.mockResolvedValue(NEXT_PAGE);

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

const cut: PaymentListPageView = {
  ...defaultPaymentList,
  truncated: true,
  next: CURSOR,
};

const [firstRow] = defaultPaymentList.rows;

const NEXT_PAGE: PaymentListView = {
  asOf: "2026-10-27",
  rows:
    firstRow === undefined
      ? []
      : [{ ...firstRow, id: "payment-4", reference: "TRF-0830-777" }],
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
    await canvas.findByRole("link", { name: "TRF-0830-777" })
  ).toBeVisible();
  // K2: the next page keeps the list's parameters.
  await expect(listPayments).toHaveBeenCalledWith({ after: CURSOR, params });
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
  await expect(canvas.queryByText(/^Showing/)).toBeNull();
}

/** The note under one figure: the second `dd` after its label. */
const note = (canvasElement: HTMLElement, currency: string, label: string) =>
  figure(canvasElement, currency, label)?.nextElementSibling;

const isVisible = (element: HTMLElement) => element.checkVisibility();

/** K1: Updated in the tenant's zone, and the figure notes with their counts. */
async function updatedAndFigures(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"],
  canvasElement: HTMLElement
) {
  // 08:40 UTC is 16:40 in Asia/Singapore (Review Focus 5).
  await expect(
    canvas.getAllByText(/2 Nov 2026, 16:40/).filter(isVisible)
  ).toHaveLength(1);
  await expect(note(canvasElement, "SGD", "Collected")).toHaveTextContent(
    "All payment dates"
  );
  await expect(note(canvasElement, "SGD", "Allocated")).toHaveTextContent(
    "In 2 payments"
  );
  await expect(note(canvasElement, "SGD", "Payments")).toHaveTextContent(
    "2 not linked"
  );
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
}

const meta = {
  title: "Modules/Invoices/Payments list",
  component: PaymentList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Payments list at `/m/invoices/payments`, read from `invoices.payments` as of the reporting date (Spec 7 R-59, R-60). The caption names the reporting date because `PageHeader` hides its description below `lg`. The page is one `ListHeader` (variant C, `czjw.73`): one figure card per currency, the link tabs (Linked is Allocated, Not linked is Part allocated or Unallocated), the search, customer and payment-date filters, and the table, with Updated in the tenant's time zone, newest first. The status is R-31's Allocated, Part allocated or Unallocated. Below 768 px the rows are cards, and the tabs and filters sit in one Filters sheet. The tab, the filters and the sort live in the page address (`status`, `q`, `customer`, `date`, `sort`) and run on the server through `listPayments`. Unallocated and Status do not sort.",
      },
    },
    a11y: { test: "error" },
  },
  args: { view: defaultPaymentList },
  decorators: [withQuery],
  // Each story leaves the address as it found it.
  beforeEach: () => {
    const before = window.location.href;

    return () => window.history.replaceState(null, "", before);
  },
} satisfies Meta<typeof PaymentList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await updatedAndFigures(canvas, canvasElement);
    // Unallocated is computed, so it does not sort (LH5).
    await expect(
      within(
        canvas.getByRole("columnheader", { name: /Unallocated/ })
      ).queryByRole("button")
    ).toBeNull();
  },
};

export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await updatedAndFigures(canvas, canvasElement);
    await expect(canvas.getByText("Updated, newest")).toBeVisible();
  },
};

export const TwoCurrencies: Story = {
  name: "Two currencies",
  args: { view: twoCurrencyPaymentList },
  play: async ({ canvasElement }) => {
    // One strip per currency: no figure adds SGD and USD.
    await expect(figure(canvasElement, "SGD", "Collected")).toHaveTextContent(
      /^SGD\s?13,500\.00$/
    );
    await expect(figure(canvasElement, "SGD", "Allocated")).toHaveTextContent(
      /^SGD\s?8,000\.00$/
    );
    await expect(figure(canvasElement, "SGD", "Unallocated")).toHaveTextContent(
      /^SGD\s?5,500\.00$/
    );
    await expect(figure(canvasElement, "SGD", "Payments")).toHaveTextContent(
      /^3$/
    );
    await expect(figure(canvasElement, "USD", "Collected")).toHaveTextContent(
      /^US\$750\.00$/
    );
    await expect(figure(canvasElement, "USD", "Payments")).toHaveTextContent(
      /^1$/
    );
  },
};

export const FilterByLink: Story = {
  name: "Filter by link",
  globals: desktop,
  beforeEach: atAddress("", notLinkedPaymentPage),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Not linked 2" }));

    await expect(listPayments).toHaveBeenCalledWith({
      after: null,
      params: { status: "not-linked" },
    });
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "TRF-0921-118" })).toBeNull()
    );
    await expect(
      canvas.getByRole("link", { name: "TRF-1003-204" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: "Not linked 2" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(listAddress()).toEqual(["status=not-linked"]);
    // The strip is the filtered page's: two payments, not the three of the unfiltered page.
    await expect(figure(canvasElement, "SGD", "Payments")).toHaveTextContent(
      /^2$/
    );
    await expect(figure(canvasElement, "SGD", "Collected")).toHaveTextContent(
      /^SGD\s?8,500\.00$/
    );
  },
};

export const FiltersFromTheAddress: Story = {
  name: "Filters from the address",
  globals: desktop,
  beforeEach: atAddress("?status=linked&q=TRF-0921", linkedPaymentPage),
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(listPayments).toHaveBeenCalledWith({
        after: null,
        params: { q: "TRF-0921", status: "linked" },
      })
    );
    await expect(canvas.getByRole("tab", { name: "Linked 1" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(canvas.getByRole("searchbox")).toHaveValue("TRF-0921");
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "TRF-1003-204" })).toBeNull()
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
  beforeEach: atAddress("", notLinkedPaymentPage),
  play: async ({ canvas }) => {
    // The tabs sit in the Filters sheet, so the cards start near the top.
    await expect(canvas.queryByRole("tablist")).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      await screen.findByRole("radio", { name: /^Not linked/ })
    );

    await expect(listPayments).toHaveBeenCalledWith({
      after: null,
      params: { status: "not-linked" },
    });
    // Show closes the sheet, and the Filters button counts the tab.
    await userEvent.click(
      screen.getByRole("button", { name: "Show 2 payments" })
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
