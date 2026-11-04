import {
  AgentButton,
  AgentPanelHost,
  resetAgentPanel,
} from "@genie/core/features/agent/panel";
import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  chartOf,
  chatNoneDashboardPage,
  chatOffDashboardPage,
  chatOnDashboardPage,
  defaultDashboardPage,
  emptyDashboardPage,
  FILTER_VALUES,
  noChatDashboardPage,
  readOnlyDashboardPage,
} from "./__fixtures__/dashboards.ts";
import { DashboardView } from "./dashboard-view.tsx";
import type { DashboardPageView } from "./views.ts";

const readDashboard = fn();

const changeDashboard = fn();

const undoDashboard = fn();

const panelData = fn();

const filterValues = fn();

/** The chat's chart gate; these stories send no message, so it never runs. */
const chart = fn();

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
        client={{
          analytics: {
            readDashboard,
            changeDashboard,
            undoDashboard,
            panelData,
            filterValues,
          },
          agent: { chart, messages: async () => [] },
        }}
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

/** The Rename dashboard item sits in the header's More menu (redesign 7.2 pattern). */
async function openRenameDashboard(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getByRole("button", { name: "More" }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Rename dashboard" })
  );
}

/** The shell's agent panel and its button beside the page, as the app mounts them. */
function withAgentPanel(Story: () => ReactNode) {
  return (
    <>
      <AgentButton />
      <Story />
      <AgentPanelHost
        person="person-1"
        models={null}
        labels={{ steps: {}, datasets: {} }}
        suggestions={[]}
        inbox={[]}
        timeZone="UTC"
      />
    </>
  );
}

/** The chat's request, held open, so a story sees what a starter chip sent without a model. */
const agentFetch = fn(
  (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Promise<Response>(() => {})
);

function holdAgentRequests() {
  const original = globalThis.fetch;

  agentFetch.mockClear();
  globalThis.fetch = agentFetch;

  return () => {
    globalThis.fetch = original;
  };
}

function serve(page: DashboardPageView) {
  resetAgentPanel();
  readDashboard.mockReset().mockResolvedValue(page.dashboard);
  changeDashboard.mockReset().mockResolvedValue(page.dashboard);
  undoDashboard.mockReset().mockResolvedValue(page.dashboard);
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

    // One line names the read time; each panel names only its source (6.1).
    await expect(
      await canvas.findByText(/^Figures as of \d+ \w{3} \d{4}, \d{2}:\d{2}\.$/)
    ).toBeVisible();
    await expect(canvas.queryByText(/ · Read /)).toBeNull();
    await expect(canvas.getByRole("button", { name: "More" })).toBeVisible();
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

/** A starter chip sends its text to the dashboard's chat, which opens for it (6.5). */
async function starterSends(canvas: ReturnType<typeof within>) {
  await expect(canvas.getByText("No panels yet")).toBeVisible();
  await userEvent.click(
    canvas.getByRole("button", { name: "Add a chart by month" })
  );

  // The chip opens the shell's agent panel and sends through it.
  const chat = within(await screen.findByRole("region", { name: "Agent" }));

  // The conversation loads in its own chunk once the panel opens.
  const sent = await within(await chat.findByRole("log")).findByText(
    "Add a chart by month"
  );

  // The phone's sheet slides in, so wait for it to settle.
  await waitFor(() => expect(sent).toBeVisible());
  await waitFor(() => expect(agentFetch).toHaveBeenCalledTimes(1));
  await expect(String(agentFetch.mock.calls[0]?.[1]?.body)).toContain(
    "Add a chart by month"
  );
}

export const Empty: Story = {
  args: { view: emptyDashboardPage },
  globals: desktop,
  decorators: [withAgentPanel],
  beforeEach: () => {
    serve(emptyDashboardPage);

    return holdAgentRequests();
  },
  play: ({ canvas }) => starterSends(canvas),
};

/** Below 1280 px the panel is a closed sheet, so the chip opens it first. */
export const EmptyOnPhone: Story = {
  name: "Empty on a phone",
  args: { view: emptyDashboardPage },
  globals: phone,
  decorators: [withAgentPanel],
  beforeEach: () => {
    serve(emptyDashboardPage);

    return holdAgentRequests();
  },
  play: ({ canvas }) => starterSends(canvas),
};

/** The panel opens with the dashboard's name and its own suggestions (R-49, AG9). */
const chatOnPlay: Story["play"] = async ({ canvas }) => {
  await expect(screen.queryByRole("region", { name: "Agent" })).toBeNull();
  await userEvent.click(canvas.getByRole("button", { name: "Agent" }));

  const chat = await screen.findByRole("region", { name: "Agent" });

  await expect(chat).toHaveTextContent(
    `About: ${chatOnDashboardPage.dashboard.name}`
  );
  // The sheet slides in on a phone, so the chip shows once it settles.
  await waitFor(() =>
    expect(
      within(chat).getByRole("button", {
        name: "Compare with the prior quarter",
      })
    ).toBeVisible()
  );
};

/**
 * The shell's agent panel beside the dashboard, for a person who may ask while AI is on (R-49).
 * It starts closed; the Agent button opens it. No message is sent here; `dashboards.spec.ts`
 * proves a chat change in a browser.
 */
export const ChatOn: Story = {
  name: "Chat on",
  args: { view: chatOnDashboardPage },
  globals: desktop,
  decorators: [withAgentPanel],
  beforeEach: () => serve(chatOnDashboardPage),
  play: chatOnPlay,
};

export const ChatOnPhone: Story = {
  name: "Chat on a phone",
  args: { view: chatOnDashboardPage },
  globals: phone,
  decorators: [withAgentPanel],
  beforeEach: () => serve(chatOnDashboardPage),
  play: chatOnPlay,
};

/** AI is off for the deployment: a note in place of the chat, and hand editing still works. */
export const ChatOff: Story = {
  name: "Chat off",
  args: { view: chatOffDashboardPage },
  globals: desktop,
  beforeEach: () => serve(chatOffDashboardPage),
};

/** A person who may not ask (no `core:ask:use`): no chat and no note. */
export const ChatNone: Story = {
  name: "No chat",
  args: { view: chatNoneDashboardPage },
  globals: desktop,
  beforeEach: () => serve(chatNoneDashboardPage),
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

const emptyReadOnlyPage: DashboardPageView = {
  ...emptyDashboardPage,
  canWrite: false,
};

// With chat but without analytics:write the chat has no write tool, so it does not offer one.
export const EmptyReadOnly: Story = {
  name: "Empty, read only",
  args: { view: emptyReadOnlyPage },
  globals: desktop,
  beforeEach: () => serve(emptyReadOnlyPage),
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
    // The refused panel keeps its title, so the person can tell which one failed.
    await expect(canvas.getByText("Monthly invoiced sales")).toBeVisible();
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

// A change from Ask, another tab or a chat whose follow-up failed shows within 10 seconds.
export const ChangedElsewhere: Story = {
  name: "Changed elsewhere",
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage),
  play: async ({ canvas }) => {
    readDashboard.mockResolvedValue({
      ...defaultDashboardPage.dashboard,
      name: "Cash in",
      version: 2,
    });

    await expect(
      await canvas.findByRole(
        "heading",
        { name: "Cash in" },
        { timeout: 12_000 }
      )
    ).toBeVisible();
  },
};

// czjw.42: a refetch that started before a save and answers after it never shows the older version.
export const SaveDuringRefetch: Story = {
  name: "Save during a refetch",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage);
    changeDashboard.mockResolvedValue({
      ...defaultDashboardPage.dashboard,
      name: "Cash in",
      version: 2,
    });
  },
  play: async ({ canvas }) => {
    const refetch =
      Promise.withResolvers<typeof defaultDashboardPage.dashboard>();

    readDashboard.mockClear().mockReturnValue(refetch.promise);
    // The focus refetch starts and stays in flight.
    window.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(readDashboard).toHaveBeenCalledTimes(1));

    await openRenameDashboard(canvas);

    const renameBoard = within(
      await screen.findByRole("dialog", { name: "Rename dashboard" })
    );

    const nameField = renameBoard.getByRole("textbox", { name: "Name" });

    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Cash in");
    await userEvent.click(renameBoard.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByRole("heading", { name: "Cash in" })
    ).toBeVisible();

    // The slow refetch answers the version from before the save.
    refetch.resolve(defaultDashboardPage.dashboard);
    await new Promise((settle) => setTimeout(settle, 200));

    await expect(
      canvas.getByRole("heading", { name: "Cash in" })
    ).toBeVisible();

    // The next hand edit sends the saved version, so it meets no conflict.
    changeDashboard.mockClear();
    await openRenameDashboard(canvas);

    const renameAgain = within(
      await screen.findByRole("dialog", { name: "Rename dashboard" })
    );

    await userEvent.click(renameAgain.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 2 })
    );
  },
};

// A save moves the version, and each panel keeps its drawn chart while it asks again.
export const SaveKeepsCharts: Story = {
  name: "Save keeps charts",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage);
    changeDashboard.mockResolvedValue({
      ...defaultDashboardPage.dashboard,
      version: 2,
    });
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("figure", { name: "Invoiced sales" });
    panelData
      .mockClear()
      .mockImplementation(() => new Promise(() => undefined));

    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move later" })
    );

    // Every panel asks for version 2; none drops back to the loading line.
    await waitFor(() => expect(panelData).toHaveBeenCalledTimes(3));
    await expect(
      canvas.getByRole("figure", { name: "Invoiced sales" })
    ).toBeVisible();
    await expect(canvas.queryByText("Loading…")).toBeNull();
  },
};

// A save may change the field or add a dataset, so the filter options are asked for again.
export const FilterValuesFollowSave: Story = {
  name: "Filter values follow a save",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage);
    changeDashboard.mockResolvedValue({
      ...defaultDashboardPage.dashboard,
      version: 2,
    });
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(filterValues).toHaveBeenCalledTimes(1));

    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move later" })
    );

    await waitFor(() => expect(filterValues).toHaveBeenCalledTimes(2));
  },
};

// A panel still loading shows its title above the loading line.
export const LoadingPanel: Story = {
  name: "Loading panel",
  globals: phone,
  beforeEach: () => {
    serve(defaultDashboardPage);
    panelData.mockImplementation(() => new Promise(() => undefined));
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Top customers")).toBeVisible();
  },
};

const DASHBOARD_CHANGED =
  "This dashboard changed since you opened it. Reload it to see the latest version.";

const CHART_INVALID =
  "The chart does not fit its data. Fix the marked parts and try again.";

// B5.2: each panel action sends one change, with the layout and the index it names.
export const EditActions: Story = {
  name: "Edit actions",
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await expect(
      canvas.getByRole("button", { name: "Edit dashboard" })
    ).toHaveAttribute("aria-pressed", "true");

    // Rename dashboard
    await openRenameDashboard(canvas);

    const renameBoard = within(
      await screen.findByRole("dialog", { name: "Rename dashboard" })
    );

    const nameField = renameBoard.getByRole("textbox", { name: "Name" });

    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Cash in");
    await userEvent.click(renameBoard.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [{ op: "rename", name: "Cash in" }],
    });
    changeDashboard.mockClear();

    // Rename panel
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Rename panel" })
    );

    const rename = within(
      await screen.findByRole("dialog", { name: "Rename panel" })
    );

    const titleField = rename.getByRole("textbox", { name: "Title" });

    await userEvent.clear(titleField);
    await userEvent.type(titleField, "Total invoiced");
    await userEvent.click(rename.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [
        expect.objectContaining({
          op: "change-panel",
          panelId: "p1",
          panel: expect.objectContaining({ title: "Total invoiced" }),
        }),
      ],
    });
    changeDashboard.mockClear();

    // Move later; the first panel cannot move earlier.
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await expect(
      await screen.findByRole("menuitem", { name: "Move earlier" })
    ).toHaveAttribute("data-disabled");
    await userEvent.click(screen.getByRole("menuitem", { name: "Move later" }));

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [{ op: "move-panel", panelId: "p1", toIndex: 1 }],
    });
    changeDashboard.mockClear();

    // Width 4 columns
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Width" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "4 columns" })
    );

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [
        expect.objectContaining({
          op: "change-panel",
          panelId: "p1",
          layout: { columns: 4, rows: 1 },
        }),
      ],
    });
    changeDashboard.mockClear();

    // Chart type: a KPI offers only Table.
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Chart type" })
    );
    await expect(screen.queryByRole("menuitem", { name: "Bar" })).toBeNull();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Table" })
    );

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [
        expect.objectContaining({
          op: "change-panel",
          panelId: "p1",
          panel: expect.objectContaining({ type: "table" }),
        }),
      ],
    });
    changeDashboard.mockClear();

    // Remove panel
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove panel" })
    );

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 1,
      changes: [{ op: "remove-panel", panelId: "p1" }],
    });
  },
};

// The current width and height are off, so a choice never saves a no-op and spends an Undo entry.
export const CurrentSize: Story = {
  name: "Current size",
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Width" })
    );
    await expect(
      await screen.findByRole("menuitem", { name: "1 column" })
    ).toHaveAttribute("data-disabled");

    // Another width still saves, and choosing it closes the menu.
    await userEvent.click(screen.getByRole("menuitem", { name: "2 columns" }));
    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Height" })
    );
    await expect(
      await screen.findByRole("menuitem", { name: "Short" })
    ).toHaveAttribute("data-disabled");
  },
};

// B5.3: a refused change names the panel and its hint, and keeps the stored panel.
export const RefusedEdit: Story = {
  name: "Refused edit",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage);
    changeDashboard.mockRejectedValue(
      Object.assign(new Error(CHART_INVALID), {
        data: {
          appCode: "chart-invalid",
          requestId: "req-1",
          issues: [
            {
              path: "changes.0.panel.series.0.x",
              message: "Use a date field for the x-axis.",
            },
          ],
        },
      })
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove panel" })
    );

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent(
      `Invoiced sales was not changed. ${CHART_INVALID}`
    );
    await expect(alert).toHaveTextContent("Use a date field for the x-axis.");
    await expect(
      canvas.getByRole("figure", { name: "Invoiced sales" })
    ).toBeVisible();
  },
};

// B5.4: a version conflict offers a Reload that asks for the dashboard again.
export const VersionConflict: Story = {
  name: "Version conflict",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage);
    changeDashboard.mockRejectedValue(
      Object.assign(new Error(DASHBOARD_CHANGED), {
        data: {
          appCode: "analytics:dashboard-changed",
          requestId: "req-2",
        },
      })
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove panel" })
    );

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent(DASHBOARD_CHANGED);

    readDashboard.mockClear();
    await userEvent.click(
      within(alert).getByRole("button", { name: "Reload" })
    );

    await waitFor(() =>
      expect(readDashboard).toHaveBeenCalledWith({ id: "dashboard-1" })
    );
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

// B5.5: no Undo while the dashboard has nothing to undo.
export const UndoUnavailable: Story = {
  name: "Undo unavailable",
  globals: desktop,
  beforeEach: () => serve(defaultDashboardPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );

    await expect(canvas.queryByRole("button", { name: "Undo" })).toBeNull();
  },
};

const undoablePage: DashboardPageView = {
  ...defaultDashboardPage,
  dashboard: {
    ...defaultDashboardPage.dashboard,
    version: 2,
    canUndo: true,
    panels: [],
  },
};

const restoredPage: DashboardPageView = {
  ...defaultDashboardPage,
  dashboard: {
    ...defaultDashboardPage.dashboard,
    version: 3,
    canUndo: false,
    filters: {
      ...defaultDashboardPage.dashboard.filters,
      dateRange: { from: "2026-09-01", to: "2026-09-30" },
    },
  },
};

// B5.5: Undo shows outside edit mode, because a chat answer points at it (R-49); it sends the
// current version and draws the restored config.
export const Undo: Story = {
  args: { view: undoablePage },
  globals: desktop,
  beforeEach: () => {
    serve(undoablePage);
    undoDashboard.mockResolvedValue(restoredPage.dashboard);
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(undoDashboard).toHaveBeenCalledWith({
        id: "dashboard-1",
        expectedVersion: 2,
      })
    );
    await expect(
      await canvas.findByRole("figure", { name: "Invoiced sales" })
    ).toBeVisible();
    // The range text carries a thin space each side of its dash.
    await expect(
      canvas.getByRole("button", { name: /^Dates: 1\s–\s30 Sept 2026$/u })
    ).toBeVisible();
  },
};

// DEC-25: the header with Undo at the phone viewport.
export const UndoOnPhone: Story = {
  name: "Undo on a phone",
  args: { view: undoablePage },
  globals: phone,
  beforeEach: () => serve(undoablePage),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeVisible();
  },
};

const chatChangedPage: DashboardPageView = {
  ...defaultDashboardPage,
  dashboard: {
    ...defaultDashboardPage.dashboard,
    version: 2,
    panels: [
      {
        id: "p1",
        layout: { columns: 1, rows: 1 },
        config: {
          type: "table",
          title: "Chat changed",
          series: [
            {
              name: "Rows",
              dataset: "invoices.invoices",
              query: { select: ["customerName"] },
            },
          ],
        },
      },
      ...defaultDashboardPage.dashboard.panels.slice(1),
    ],
  },
};

// Fix round 1: Save after a refetch sends the current panel config, not the dialog snapshot.
export const RenamePanelAfterRefetch: Story = {
  name: "Rename panel after refetch",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDashboardPage);
    changeDashboard.mockRejectedValue(
      Object.assign(new Error(DASHBOARD_CHANGED), {
        data: {
          appCode: "analytics:dashboard-changed",
          requestId: "req-3",
        },
      })
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Rename panel" })
    );

    const dialog = within(
      await screen.findByRole("dialog", { name: "Rename panel" })
    );

    const titleField = dialog.getByRole("textbox", { name: "Title" });

    await userEvent.clear(titleField);
    await userEvent.type(titleField, "Total invoiced");

    // The first save meets the conflict and offers Reload inside the dialog.
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));

    readDashboard.mockResolvedValue(chatChangedPage.dashboard);
    await userEvent.click(
      await dialog.findByRole("button", { name: "Reload" })
    );

    await waitFor(() =>
      expect(readDashboard).toHaveBeenCalledWith({ id: "dashboard-1" })
    );

    changeDashboard.mockClear();
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(changeDashboard).toHaveBeenCalledTimes(1));
    await expect(changeDashboard).toHaveBeenCalledWith({
      id: "dashboard-1",
      expectedVersion: 2,
      changes: [
        expect.objectContaining({
          op: "change-panel",
          panelId: "p1",
          panel: expect.objectContaining({
            type: "table",
            title: "Total invoiced",
          }),
        }),
      ],
    });
  },
};

// DEC-25: the edit toolbar and the panel menu run at the phone viewport too.
export const EditOnPhone: Story = {
  name: "Edit on a phone",
  globals: phone,
  beforeEach: () => serve(defaultDashboardPage),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit dashboard" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoiced sales" })
    );

    await expect(
      await screen.findByRole("menuitem", { name: "Remove panel" })
    ).toBeInTheDocument();
  },
};
