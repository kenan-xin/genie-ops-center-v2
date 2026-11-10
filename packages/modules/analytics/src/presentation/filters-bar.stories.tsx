import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { DashboardChange, DashboardFilters } from "../contract.ts";
import { addressParam, withFilterAddress } from "./__fixtures__/address.ts";
import {
  FIELD_VALUES,
  filtersDashboardPage,
  TWO_SET,
} from "./__fixtures__/dashboards.ts";
import { FiltersBar, type FiltersBarProps } from "./filters-bar.tsx";
import { useDashboardFilters } from "./use-dashboard.ts";
import type { DashboardView } from "./views.ts";

const filterValues = fn();

const changeDashboard = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** A fresh query cache per story, with no retries so a refusal reports at once. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider
        client={{ analytics: { filterValues, changeDashboard } }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

/** The bar over the page address, as the dashboard page composes it. */
function Live(props: FiltersBarProps) {
  const filters = useDashboardFilters(props.dashboard);

  return (
    <FiltersBar
      dashboard={props.dashboard}
      filters={filters}
      onReload={props.onReload}
    />
  );
}

const docsFilters: FiltersBarProps["filters"] = {
  filters: filtersDashboardPage.dashboard.filters,
  viewId: null,
  fromAddress: false,
  set: fn(),
  selectView: fn(),
  reset: fn(),
};

const meta = {
  title: "Modules/Analytics/Dashboard filters",
  component: FiltersBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The dashboard filter bar, variant A (Spec 7 R-49, S7-46, S7-47), built on the list header controls. The view menu first (see Dashboard view menu), then the date range, then one trigger per field filter (a select, a multi-select or a toggle), each with Remove filter; Add filter offers the other fields, up to four. A change writes the page address only, so a reload or a shared link keeps it, and saves nothing. With no view selected and filters that differ from the stored ones, the bar ends in "Not saved as default" and Save as default, which stores them and clears the default view in one change. With a view selected and changed filters, it ends in "Changed", Update view and Save as new view. On a phone the controls move into the Filters sheet, with a one-line summary under it.',
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: {
    dashboard: filtersDashboardPage.dashboard,
    filters: docsFilters,
    onReload: fn(),
  },
  render: (args) => <Live {...args} />,
} satisfies Meta<typeof FiltersBar>;

export default meta;

type Story = StoryObj<typeof meta>;

function serve(dashboard: DashboardView) {
  filterValues
    .mockReset()
    .mockImplementation(async ({ field }: { readonly field: string }) => [
      ...(FIELD_VALUES.get(field) ?? []),
    ]);
  changeDashboard
    .mockReset()
    .mockImplementation(
      async ({ changes }: { readonly changes: readonly DashboardChange[] }) => {
        const change = changes[0];

        return change?.op === "set-filters"
          ? {
              ...dashboard,
              version: dashboard.version + 1,
              filters: change.filters,
            }
          : dashboard;
      }
    );
}

/** Opens the story on the filters dashboard with `filters` in the address. */
const opened = (filters: DashboardFilters | null) => () => {
  serve(filtersDashboardPage.dashboard);

  return withFilterAddress(filters);
};

export const Default: Story = {
  globals: desktop,
  beforeEach: opened(null),
};

export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  beforeEach: opened(null),
};

const FOUR: DashboardFilters = {
  dateRange: { preset: "last-3-months" },
  fields: [
    { kind: "select", field: "region", label: "Region", value: "North" },
    {
      kind: "multi-select",
      field: "label",
      label: "Customer",
      values: ["Bravo", "Charlie"],
    },
    { kind: "toggle", field: "overdue", label: "Overdue only", value: true },
    { kind: "select", field: "status", label: "Status", value: "Open" },
  ],
};

// R-49: four field filters at most, so Add filter stops at four and says why.
export const MaxFields: Story = {
  name: "Four filters",
  globals: desktop,
  beforeEach: opened(FOUR),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("switch", { name: "Overdue only" })
    ).toBeChecked();
    await expect(canvas.getByLabelText("Status: Open")).toBeVisible();
    // A label names no many, so two values count as selected.
    await expect(canvas.getByLabelText("Customer: 2 selected")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add filter" })
    ).toBeDisabled();
    await expect(
      canvas.getByText("Up to 4 filters. Remove one to add another.")
    ).toBeVisible();
  },
};

// The phone keeps the filters one tap away and names what applies in one line.
export const Phone: Story = {
  name: "Two filters set on a phone",
  globals: phone,
  beforeEach: opened(TWO_SET),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Last 3 months · Region: North · Customer: A, B Ltd"
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Save as default" })
    ).toBeVisible();

    // The date range counts too, as in every list header (LH26).
    await userEvent.click(
      canvas.getByRole("button", { name: "Filters 3 set" })
    );

    const sheet = within(await screen.findByRole("dialog"));

    // The sheet slides in, so wait for it to settle.
    await waitFor(() =>
      expect(sheet.getByLabelText("Region: North")).toBeVisible()
    );
    await userEvent.click(sheet.getByRole("button", { name: "Status" }));
    await expect(await sheet.findByLabelText("Status: All")).toBeVisible();
    // The empty field is in the address, so a reload or a copied link keeps it (S7-46 ruling).
    await expect(addressParam("fields")).toBe(
      "region:select,label:multi-select,status:select"
    );
    await expect(screen.getByText("Not saved as default")).toBeVisible();
    await expect(changeDashboard).not.toHaveBeenCalled();
  },
};

/** The day buttons of the open calendar, in date order; the month shown is today's. */
const shownDays = () =>
  waitFor(() => {
    const days = [
      ...document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
    ];

    if (days.length < 6) throw new Error("The calendar is not open.");

    return days;
  });

// A custom range reaches the address once both ends are picked, and saves nothing.
export const CustomRange: Story = {
  name: "Custom range",
  globals: desktop,
  beforeEach: opened(null),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Date: Last 3 months"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Custom range" })
    );
    await userEvent.click(await canvas.findByLabelText(/^Dates:/u));

    const days = await shownDays();
    const from = days[0]?.dataset["day"];
    const to = days[5]?.dataset["day"];

    await userEvent.click(days[0] ?? document.body);
    await expect(addressParam("range")).toBeNull();
    await userEvent.click(days[5] ?? document.body);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(addressParam("range")).toBe(`${from}..${to}`));
    await expect(changeDashboard).not.toHaveBeenCalled();
  },
};

const DASHBOARD_CHANGED =
  "This dashboard changed since you opened it. Reload it to see the latest version.";

// A Save as default that meets a newer version offers the same Reload as the view's refusal line.
export const VersionConflict: Story = {
  name: "Version conflict",
  globals: desktop,
  beforeEach: () => {
    const done = opened(TWO_SET)();

    changeDashboard.mockRejectedValue(
      Object.assign(new Error(DASHBOARD_CHANGED), {
        data: { appCode: "analytics:dashboard-changed", requestId: "req-1" },
      })
    );

    return done;
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save as default" })
    );

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent(DASHBOARD_CHANGED);
    // DESIGN.md "Save failures": the failure takes focus, so the person hears it.
    await waitFor(() => expect(alert).toHaveFocus());
    // The address keeps the filters the save did not store.
    await expect(addressParam("f.region")).toBe("North");
    await userEvent.click(
      within(alert).getByRole("button", { name: "Reload" })
    );

    await expect(args.onReload).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};
