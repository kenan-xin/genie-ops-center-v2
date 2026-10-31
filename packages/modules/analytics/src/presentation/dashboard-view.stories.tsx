import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, within } from "storybook/test";

import {
  chartOf,
  defaultDashboardPage,
  emptyDashboardPage,
  FILTER_VALUES,
  noChatDashboardPage,
  readOnlyDashboardPage,
} from "./__fixtures__/dashboards.ts";
import { DashboardView } from "./dashboard-view.tsx";
import type { DashboardPageView } from "./views.ts";

const readDashboard = fn();

const panelData = fn();

const filterValues = fn();

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
        client={{ analytics: { readDashboard, panelData, filterValues } }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Analytics/Dashboard",
  component: DashboardView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One dashboard at `/m/analytics/dashboards/:id` (Spec 7 R-48 to R-50). Its panels form a four-column grid from 768 px, one column below it, each spanning its stored columns and rows. Every panel asks again every 10 seconds and when the window regains focus. A refused panel shows its own refusal line while the other panels still draw.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: defaultDashboardPage },
} satisfies Meta<typeof DashboardView>;

export default meta;

type Story = StoryObj<typeof meta>;

function serve(page: DashboardPageView) {
  readDashboard.mockReset().mockResolvedValue(page.dashboard);
  panelData
    .mockReset()
    .mockImplementation(async ({ panelId }: { readonly panelId: string }) =>
      chartOf(panelId)
    );
  filterValues.mockReset().mockResolvedValue([...FILTER_VALUES]);
}

export const Panels: Story = {
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("figure", { name: "Invoiced sales" })
    ).toBeVisible();
    await expect(
      await canvas.findByRole("figure", { name: "Monthly invoiced sales" })
    ).toBeVisible();
    await expect(
      await canvas.findByRole("figure", { name: "Top customers" })
    ).toBeVisible();

    const table = within(
      await canvas.findByRole("table", { name: "Top customers" })
    );

    await expect(table.getByText("ABC Trading")).toBeVisible();
  },
};

export const PanelsOnPhone: Story = {
  name: "Panels on a phone",
  globals: phone,
  beforeEach: () => serve(defaultDashboardPage),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("figure", { name: "Invoiced sales" })
    ).toBeVisible();
  },
};

export const Empty: Story = {
  args: { view: emptyDashboardPage },
  globals: desktop,
  beforeEach: () => serve(emptyDashboardPage),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No panels yet")).toBeVisible();
    await expect(
      canvas.getByText("Ask in the chat beside the dashboard to add a panel.")
    ).toBeVisible();
  },
};

export const EmptyWithoutChat: Story = {
  name: "Empty without chat",
  args: { view: noChatDashboardPage },
  globals: desktop,
  beforeEach: () => serve(noChatDashboardPage),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("This dashboard has no panels.")
    ).toBeVisible();
  },
};

// Without analytics:write there are no filter controls.
export const ReadOnly: Story = {
  name: "Read only",
  args: { view: readOnlyDashboardPage },
  globals: desktop,
  beforeEach: () => serve(readOnlyDashboardPage),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("combobox", { name: "Date range" })
    ).toBeNull();
  },
};

// B4.3: a refused panel shows its own alert line while the other panels draw.
export const RefusedPanel: Story = {
  name: "Refused panel",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage);
    panelData.mockImplementation(
      async ({ panelId }: { readonly panelId: string }) => {
        if (panelId === "p2") {
          throw new Error("You may not read this dataset.");
        }

        return chartOf(panelId);
      }
    );
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "You may not read this dataset."
    );
    await expect(
      await canvas.findByRole("figure", { name: "Invoiced sales" })
    ).toBeVisible();
    await expect(
      await canvas.findByRole("figure", { name: "Top customers" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("figure", { name: "Monthly invoiced sales" })
    ).toBeNull();
  },
};
