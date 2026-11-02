import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import {
  defaultPaymentList,
  linkedPaymentPage,
  notLinkedPaymentPage,
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
function atAddress(query: string, page: PaymentListView) {
  return () => {
    listPayments.mockReset();
    listPayments.mockResolvedValue(page);

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

  return ["q", "link", "customer", "from", "to"].flatMap((name) => {
    const value = params.get(name);

    return value === null ? [] : [`${name}=${value}`];
  });
};

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
};

async function showsMore(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]
) {
  listPayments.mockReset();
  listPayments.mockResolvedValue(NEXT_PAGE);

  await expect(canvas.getByText("Showing the first 3 payments.")).toBeVisible();

  await userEvent.click(canvas.getByRole("button", { name: "Show more" }));

  // The role query skips the copy that the other viewport hides (table or cards).
  await expect(
    await canvas.findByRole("link", { name: "TRF-0830-777" })
  ).toBeVisible();
  await expect(listPayments).toHaveBeenCalledWith({
    after: CURSOR,
    filters: {},
  });
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
  await expect(canvas.queryByText(/Showing the first/)).toBeNull();
}

const meta = {
  title: "Modules/Invoices/Payments list",
  component: PaymentList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Payments list at `/m/invoices/payments`, read from `invoices.payments` as of the reporting date (Spec 7 R-59, R-60). The caption names the reporting date because `PageHeader` hides its description below `lg`. From 768 px the rows are a table; below that they are the same rows as cards, with the reference or date opening the record and the unallocated amount as a fact. The status is R-31's Allocated, Part allocated or Unallocated. The search (reference or customer), the link chips (Linked is Allocated, Not linked is Part allocated or Unallocated), the customer picker and the payment-date range live in the page address (`q`, `link`, `customer`, `from`, `to`) and run on the server through `listPayments`; on a phone the filters sit behind one Filters button (design review 1.4).",
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
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Show more" })
    ).toBeNull();
    await expect(canvas.queryByText(/Showing the first/)).toBeNull();
  },
};

export const FilterByLink: Story = {
  name: "Filter by link",
  globals: desktop,
  beforeEach: atAddress("", notLinkedPaymentPage),
  play: async ({ canvas }) => {
    const notLinked = canvas.getByRole("button", { name: "Not linked" });

    await userEvent.click(notLinked);

    await expect(listPayments).toHaveBeenCalledWith({
      after: null,
      filters: { link: "not-linked" },
    });
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "TRF-0921-118" })).toBeNull()
    );
    await expect(
      canvas.getByRole("link", { name: "TRF-1003-204" })
    ).toBeVisible();
    await expect(notLinked).toHaveAttribute("aria-pressed", "true");
    await expect(listAddress()).toEqual(["link=not-linked"]);
  },
};

export const FiltersFromTheAddress: Story = {
  name: "Filters from the address",
  globals: desktop,
  beforeEach: atAddress("?link=linked&q=TRF-0921", linkedPaymentPage),
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(listPayments).toHaveBeenCalledWith({
        after: null,
        filters: { search: "TRF-0921", link: "linked" },
      })
    );
    await expect(
      canvas.getByRole("button", { name: /^Linked$/ })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.getByRole("searchbox", { name: "Search reference or customer" })
    ).toHaveValue("TRF-0921");
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
    // The chips sit behind one button, so the cards start near the top.
    await expect(canvas.queryByRole("group", { name: "Link" })).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Not linked" })
    );

    await expect(listPayments).toHaveBeenCalledWith({
      after: null,
      filters: { link: "not-linked" },
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

export const Empty: Story = {
  args: {
    view: {
      asOf: "2026-10-27",
      rows: [],
      truncated: false,
      next: null,
      customers: [],
    },
  },
};
