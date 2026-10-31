import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  expect,
  fireEvent,
  fn,
  screen,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

import type { DashboardChange } from "../contract.ts";
import {
  defaultDashboardPage,
  FILTER_VALUES,
} from "./__fixtures__/dashboards.ts";
import { FiltersBar } from "./filters-bar.tsx";
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

const meta = {
  title: "Modules/Analytics/Dashboard filters",
  component: FiltersBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The dashboard filters (Spec 7 R-49, D3). A date range preset relative to the reporting date, or a custom From and To; and one text field filter whose values come from the panel datasets. Each choice saves one `set-filters` change, and a custom range that ends before it starts shows its field error and saves nothing.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { dashboard: defaultDashboardPage.dashboard, onReload: fn() },
} satisfies Meta<typeof FiltersBar>;

export default meta;

type Story = StoryObj<typeof meta>;

function serve(dashboard: DashboardView) {
  filterValues.mockReset().mockResolvedValue([...FILTER_VALUES]);
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

export const Default: Story = {
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage.dashboard),
};

export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  beforeEach: () => serve(defaultDashboardPage.dashboard),
};

// B4.4: a range that ends before it starts shows a field error and saves nothing.
export const CustomRange: Story = {
  name: "Custom range",
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage.dashboard),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Date range" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Custom range" })
    );

    fireEvent.change(canvas.getByLabelText("From"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.change(canvas.getByLabelText("To"), {
      target: { value: "2026-03-01" },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Apply" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The end date is on or after the start date."
    );
    await expect(canvas.getByLabelText("From")).toHaveAccessibleDescription(
      "The end date is on or after the start date."
    );
    await expect(canvas.getByLabelText("To")).toHaveAccessibleDescription(
      "The end date is on or after the start date."
    );
    await expect(changeDashboard).not.toHaveBeenCalled();

    fireEvent.change(canvas.getByLabelText("To"), {
      target: { value: "2026-04-30" },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [
        {
          op: "set-filters",
          filters: {
            dateRange: { from: "2026-03-31", to: "2026-04-30" },
            field: { field: "label", label: "Customer", value: null },
          },
        },
      ],
    });
  },
};

const DASHBOARD_CHANGED =
  "This dashboard changed since you opened it. Reload it to see the latest version.";

// A filter save that meets a newer version offers the same Reload as the view's refusal line.
export const VersionConflict: Story = {
  name: "Version conflict",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage.dashboard);
    changeDashboard.mockRejectedValue(
      Object.assign(new Error(DASHBOARD_CHANGED), {
        data: { appCode: "analytics:dashboard-changed", requestId: "req-1" },
      })
    );
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Date range" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "This year" })
    );

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent(DASHBOARD_CHANGED);
    await userEvent.click(
      within(alert).getByRole("button", { name: "Reload" })
    );

    await expect(args.onReload).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

// B4.5: the field filter lists All and the values, and a choice saves that value.
export const FieldFilter: Story = {
  name: "Field filter",
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage.dashboard),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Customer" }));

    const options = await screen.findAllByRole("option");

    await expect(options.map((option) => option.textContent)).toEqual([
      "All",
      ...FILTER_VALUES,
    ]);

    await userEvent.click(await screen.findByRole("option", { name: "Bravo" }));

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [
        {
          op: "set-filters",
          filters: {
            dateRange: { preset: "all" },
            field: { field: "label", label: "Customer", value: "Bravo" },
          },
        },
      ],
    });
  },
};
