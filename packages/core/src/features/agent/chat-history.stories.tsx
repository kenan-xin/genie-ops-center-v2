import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import type { AgentHistoryEntry } from "../../services/agent/index.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { AgentHistory } from "./chat-history.tsx";

const SURFACES = [
  {
    id: "slides",
    name: "Slides",
    label: "Slides",
    icon: "presentation" as const,
    recordPage: "/m/slides/decks/:id",
    acceptsHandoff: true,
  },
  {
    id: "analytics",
    name: "Dashboards",
    label: "Dashboards",
    icon: "layout-dashboard" as const,
    recordPage: "/m/analytics/dashboards/:id",
    acceptsHandoff: true,
  },
];

function entry(
  n: number,
  title: string,
  surface: string,
  more: { readonly run?: AgentRunStatus; readonly unseen?: boolean } = {}
): AgentHistoryEntry {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const record = SURFACES.find((s) => s.id === surface);

  return {
    id,
    title,
    modelId: "openai/gpt-6.1-terra",
    surface,
    recordId: record === undefined ? null : `rec-${n}`,
    runState: null,
    // Newest first, one minute apart, so the order is fixed.
    updatedAt: new Date(Date.UTC(2026, 10, 5, 8, 60 - n)).toISOString(),
    run: more.run ?? null,
    unseen: more.unseen ?? false,
    handedFromSessionId: null,
    agentName: record?.name ?? null,
    address:
      record === undefined
        ? null
        : `${record.recordPage.replace(":id", `rec-${n}`)}?chat=${id}`,
  };
}

const DRAFTING = entry(1, "October collections update", "slides", {
  run: "building",
});

const ENDED = entry(2, "Overdue by customer", "analytics", {
  run: "saved",
  unseen: true,
});

/** The history newest first, as `agent.history` answers it. */
const ENTRIES: readonly AgentHistoryEntry[] = [
  DRAFTING,
  ENDED,
  entry(3, "Which invoices are overdue?", "core:ask"),
  entry(4, "Board pack for November", "slides"),
  entry(5, "Summarize the October payment runs", "core:ask"),
  entry(6, "Supplier onboarding", "slides"),
  entry(7, "Who owes the most this quarter?", "core:ask"),
  entry(8, "Collections review", "slides"),
  entry(9, "What can you do?", "core:ask"),
  entry(10, "Payments by week", "analytics"),
  // A surface chat with no record has no page to open.
  {
    ...entry(11, "A chat with no deck", "slides"),
    recordId: null,
    address: null,
  },
];

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * Ask's chat history as the run list (DEC-57 items 9 and 11): the chats grouped by agent, Recents at
 * the bottom, a spinner on a chat that works, and a dot on a chat whose run ended unseen.
 */
const meta = {
  title: "Core/Agent/Agent history",
  component: AgentHistory,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Ask's chat history (DEC-57 item 11). Search chats, then one group per agent: Ask first, then each listed surface in registration order, a group with no chat left out. A group header folds its group and keeps a spinner while folded if one of its chats works. Each group shows its newest 3 chats and Show more reveals the rest. Recents at the bottom lists the newest 6 chats of every agent, each with its agent's icon. A working chat shows a spinner; a chat whose run ended while the person was away shows a dot and a bold title until it is opened. An Ask chat opens in Ask; a surface chat links to its record page on that chat (`?chat=`). The history is read-only: Rename and Delete stay in an Ask chat's header.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <div className="flex h-dvh w-80 flex-col bg-muted">
        <Story />
      </div>
    ),
  ],
  globals: desktop,
  args: {
    entries: ENTRIES,
    surfaces: SURFACES,
    currentId: ENTRIES[2]?.id,
    askHref: (id: string) => `/ask/${id}`,
  },
} satisfies Meta<typeof AgentHistory>;

export default meta;

type Story = StoryObj<typeof meta>;

const group = (canvas: HTMLElement, label: string) =>
  within(canvas).getByRole("group", { name: `${label} chats` });

export const GroupedByAgent: Story = {
  name: "Grouped by agent",
  play: async ({ canvas, canvasElement }) => {
    const headers = canvas
      .getAllByRole("button", { expanded: true })
      .map((button) => button.textContent);

    await expect(headers).toEqual(["Ask", "Slides", "Dashboards"]);

    const slides = group(canvasElement, "Slides");

    await expect(within(slides).getAllByRole("link")).toHaveLength(3);
    await userEvent.click(
      within(slides).getByRole("button", { name: "Show more" })
    );
    await expect(within(slides).getAllByRole("link")).toHaveLength(4);
    await expect(
      within(slides).queryByRole("button", { name: "Show more" })
    ).toBeNull();
    // Two Dashboards chats need no Show more.
    await expect(
      within(group(canvasElement, "Dashboards")).queryByRole("button", {
        name: "Show more",
      })
    ).toBeNull();

    const recents = canvas.getByRole("region", { name: "Recents" });
    const rows = within(recents).getAllByRole("link");

    await expect(rows).toHaveLength(6);
    // Every Recents row carries its agent's icon, Ask included.
    await expect(
      within(rows[0]!).getByRole("img", { name: "Slides" })
    ).toBeVisible();
    await expect(
      within(rows[2]!).getByRole("img", { name: "Ask" })
    ).toBeVisible();
    await expect(
      within(recents).getByRole("link", { name: /Which invoices are overdue/ })
    ).toHaveAttribute("aria-current", "page");
  },
};

export const GroupedByAgentOnAPhone: Story = {
  ...GroupedByAgent,
  name: "Grouped by agent on a phone",
  globals: phone,
};

const LONG_TITLE =
  "Unpaid invoices by customer for the third quarter, with the overdue ones first and their contacts";

/**
 * T2-a, T2-b (6wz1.112): a long title wraps in full in the 320 px list and its row grows, and the
 * row's icon and unseen dot stay on its first line.
 */
export const LongTitleOnAPhone: Story = {
  name: "A long title on a phone",
  globals: phone,
  args: {
    entries: [entry(9, LONG_TITLE, "slides", { unseen: true }), ...ENTRIES],
  },
  play: async ({ canvas, canvasElement }) => {
    const recents = canvas.getByRole("region", { name: "Recents" });

    const row = within(recents).getByRole("link", {
      name: /Unpaid invoices by customer/,
    });

    const title = within(row).getByText(LONG_TITLE);

    // A title the list cut off has a scrollWidth larger than its clientWidth.
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);

    const oneLine = within(canvasElement).getByRole("link", {
      name: /Payments by week/,
    });

    await expect(row.getBoundingClientRect().height).toBeGreaterThan(
      oneLine.getBoundingClientRect().height
    );
  },
};

export const WorkingChat: Story = {
  name: "Working chat",
  play: async ({ canvasElement }) => {
    const row = within(group(canvasElement, "Slides")).getByRole("link", {
      name: /October collections update/,
    });

    await expect(
      within(row).getByRole("img", { name: "Working" })
    ).toBeVisible();
  },
};

export const FoldedGroupKeepsTheSpinner: Story = {
  name: "Folded group keeps the spinner",
  play: async ({ canvas, canvasElement }) => {
    const header = canvas.getByRole("button", { name: /^Slides/ });

    // Open, the rows show the work, so the header needs no spinner.
    await expect(
      within(header).queryByRole("img", { name: "A chat is working" })
    ).toBeNull();
    await userEvent.click(header);
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(
      within(canvasElement).queryByRole("group", { name: "Slides chats" })
    ).toBeNull();
    await expect(
      within(header).getByRole("img", { name: "A chat is working" })
    ).toBeVisible();

    // A folded group with no working chat shows none.
    const dashboards = canvas.getByRole("button", { name: "Dashboards" });

    await userEvent.click(dashboards);
    await expect(within(dashboards).queryByRole("img")).toBeNull();
  },
};

export const EndedUnseen: Story = {
  name: "Ended unseen",
  play: async ({ canvasElement }) => {
    const dashboards = group(canvasElement, "Dashboards");

    const row = within(dashboards).getByRole("link", {
      name: /Overdue by customer/,
    });

    await expect(
      within(row).getByRole("img", { name: "Finished, not opened yet" })
    ).toBeVisible();
    await expect(within(row).getByText("Overdue by customer")).toHaveClass(
      "font-semibold"
    );

    const seen = within(dashboards).getByRole("link", {
      name: "Payments by week",
    });

    await expect(within(seen).queryByRole("img")).toBeNull();
    await expect(within(seen).getByText("Payments by week")).not.toHaveClass(
      "font-semibold"
    );
  },
};

export const SurfaceChatLink: Story = {
  name: "Surface chat link",
  play: async ({ canvasElement }) => {
    await expect(
      within(group(canvasElement, "Slides")).getByRole("link", {
        name: /October collections update/,
      })
    ).toHaveAttribute("href", `/m/slides/decks/rec-1?chat=${DRAFTING.id}`);
    await expect(
      within(group(canvasElement, "Ask")).getByRole("link", {
        name: "Which invoices are overdue?",
      })
    ).toHaveAttribute("href", `/ask/${ENTRIES[2]!.id}`);

    // With no address it is listed without a link, never sent to Ask.
    const slides = group(canvasElement, "Slides");

    await userEvent.click(
      within(slides).getByRole("button", { name: "Show more" })
    );
    await expect(within(slides).getByText("A chat with no deck")).toBeVisible();
    await expect(
      within(slides).queryByRole("link", { name: "A chat with no deck" })
    ).toBeNull();
  },
};
