import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  defaultDashboardList,
  emptyDashboardList,
  readOnlyDashboardList,
} from "./__fixtures__/dashboards.ts";
import { DashboardList } from "./dashboard-list.tsx";
import type { DashboardListView } from "./views.ts";

const listDashboards = fn();

const createDashboard = fn();

const deleteDashboard = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const NAME_TAKEN =
  "You already have a dashboard with that name. Choose another name.";

/** A fresh query cache per story, with no retries so a refusal reports at once. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider
        client={{
          analytics: { listDashboards, createDashboard, deleteDashboard },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Analytics/Dashboards list",
  component: DashboardList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Dashboards list at `/m/analytics/dashboards` (Spec 7 R-48). It shows only the signed-in person's own dashboards, the last changed first. New dashboard asks for a name; a taken name stays in the field with its refusal under it. Delete asks first, because a deleted dashboard and its panels cannot be undone.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: defaultDashboardList },
} satisfies Meta<typeof DashboardList>;

export default meta;

type Story = StoryObj<typeof meta>;

function serve(view: DashboardListView) {
  listDashboards.mockReset().mockResolvedValue([...view.dashboards]);
  createDashboard.mockReset();
  deleteDashboard.mockReset().mockResolvedValue({ id: "dashboard-1" });
}

export const Default: Story = {
  globals: desktop,
  beforeEach: () => serve(defaultDashboardList),
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Dashboards" }));

    await expect(
      table.getByRole("link", { name: "Receivables overview" })
    ).toBeVisible();
    await expect(table.getByRole("link", { name: "Cash in" })).toBeVisible();
  },
};

export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  beforeEach: () => serve(defaultDashboardList),
  play: async ({ canvas }) => {
    const list = within(canvas.getByRole("list", { name: "Dashboards" }));

    await expect(
      list.getByRole("link", { name: "Receivables overview" })
    ).toBeVisible();
  },
};

export const Empty: Story = {
  args: { view: emptyDashboardList },
  globals: desktop,
  beforeEach: () => serve(emptyDashboardList),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No dashboards yet")).toBeVisible();
    await expect(
      canvas.getByText("Create a dashboard, then add panels by chat beside it.")
    ).toBeVisible();
  },
};

// Without analytics:write there is no New dashboard and no per-row menu.
export const ReadOnly: Story = {
  name: "Read only",
  args: { view: readOnlyDashboardList },
  globals: desktop,
  beforeEach: () => serve(readOnlyDashboardList),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "New dashboard" })
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Actions for Receivables overview" })
    ).toBeNull();
  },
};

// B4.1: a taken name stays typed and its refusal shows under the field.
export const NameTaken: Story = {
  name: "Name taken",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardList);
    createDashboard.mockRejectedValue(
      Object.assign(new Error(NAME_TAKEN), {
        data: {
          appCode: "analytics:dashboard-name-taken",
          requestId: "req-1",
        },
      })
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "New dashboard" })
    );

    const dialog = within(
      await screen.findByRole("dialog", { name: "New dashboard" })
    );

    const input = dialog.getByRole("textbox", { name: "Name" });

    await userEvent.type(input, "Cash in");
    await userEvent.click(dialog.getByRole("button", { name: "Create" }));

    await expect(await dialog.findByText(NAME_TAKEN)).toBeVisible();
    await expect(input).toHaveValue("Cash in");
    await expect(input).toHaveAccessibleDescription(NAME_TAKEN);
  },
};

// B4.2: Delete asks first, Cancel keeps the row, and Delete removes it.
export const Delete: Story = {
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardList);
    deleteDashboard.mockImplementation(
      async ({ id }: { readonly id: string }) => {
        listDashboards.mockResolvedValue(
          defaultDashboardList.dashboards.filter((row) => row.id !== id)
        );

        return { id };
      }
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Receivables overview" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" })
    );

    const confirm = within(
      await screen.findByRole("dialog", {
        name: "Delete Receivables overview?",
      })
    );

    await userEvent.click(confirm.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      canvas.getByRole("link", { name: "Receivables overview" })
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Receivables overview" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" })
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete",
      })
    );

    await waitFor(() =>
      expect(
        canvas.queryByRole("link", { name: "Receivables overview" })
      ).toBeNull()
    );
    await expect(deleteDashboard).toHaveBeenCalledWith({ id: "dashboard-1" });
  },
};
