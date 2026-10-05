import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  FIXTURE_EVENTS,
  FIXTURE_FILTER_OPTIONS,
  FIXTURE_NOW,
  FIXTURE_VIEWER,
} from "./__fixtures__/audit-events.ts";
import { AuditLog } from "./audit-log.tsx";
import type { AuditLogProps } from "./types.ts";
import { EMPTY_AUDIT_FILTERS } from "./types.ts";

/**
 * The Audit log reader (R-67 to R-69). The host owns the filters and the loaded page, so the
 * interaction stories render a thin stateful wrapper and assert on the visible result of a filter
 * change, while the page-level callbacks (Load more, open a target, copy the id) are asserted
 * against their spies. One row of each state is fixed in the fixtures: a person, a system row, an
 * anonymized person, an openable target, an existing target with no path, and a removed one.
 *
 * The screen renders both the phone card list and the desktop table; the two collapse under the
 * `md` breakpoint in the application. The Storybook host loads no stylesheet yet (Section 0), so an
 * assertion scopes itself to the table or the list rather than relying on which one is hidden.
 */
const onChangeAuditFilters = fn();

const onLoadMoreAuditEvents = fn();

const onOpenAuditTarget = fn();

const onCopyEventId = fn();

/** The filters are controlled; this wrapper is the host that owns them for an interaction story. */
function ControlledAuditLog(props: AuditLogProps) {
  const [filters, setFilters] = useState(props.filters);

  return (
    <AuditLog {...props} filters={filters} onChangeAuditFilters={setFilters} />
  );
}

const meta = {
  title: "Core/Audit log",
  component: AuditLog,
  render: (args) => <ControlledAuditLog {...args} />,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The read-only, filterable Audit log. It never edits, deletes, or exports a row: the only action on a row is opening its detail sheet, and the only write is a filter change.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    viewer: FIXTURE_VIEWER,
    events: FIXTURE_EVENTS,
    total: 42,
    filterOptions: FIXTURE_FILTER_OPTIONS,
    filters: EMPTY_AUDIT_FILTERS,
    hasMore: true,
    nowIso: FIXTURE_NOW,
    onChangeAuditFilters,
    onLoadMoreAuditEvents,
    onOpenAuditTarget,
    onCopyEventId,
  },
} satisfies Meta<typeof AuditLog>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The desktop table's row buttons, in the fixture's newest-first order. */
function rowButtons(canvasElement: HTMLElement) {
  const table = within(within(canvasElement).getByRole("table"));
  const rows = table.getAllByRole("button");
  const [first, second, third] = rows;

  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("the fixture did not render three clickable rows");
  }

  return { first, second, third };
}

export const Default: Story = {
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table"));

    await expect(
      table.getByText("Added Ada Lovelace and assigned Tenant administrator.")
    ).toBeInTheDocument();
    await expect(
      table.getAllByText("core:person_added").length
    ).toBeGreaterThan(0);
    await expect(canvas.getByText(/Showing 4 of 42/)).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Load more" })
    ).toBeInTheDocument();

    // No export and no row write: the screen is read-only.
    await expect(
      canvas.queryByRole("button", { name: /export/i })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /delete/i })
    ).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    events: [],
    total: 0,
    hasMore: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No events match")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Clear filters" })
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();
  },
};

/**
 * A filter change is loading: the rows on screen belong to the previous filter, so the footer
 * names no count, Load more is gone, and a status says the log is reloading.
 */
export const RefreshingAfterFilterChange: Story = {
  args: { refreshing: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading the audit log…"
    );
    await expect(canvas.queryByText(/Showing \d+ of/)).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();
  },
};

export const LoadingNextPage: Story = {
  args: { loading: true },
  play: async ({ canvas }) => {
    const loadMore = canvas.getByRole("button", { name: "Load more" });

    await expect(loadMore).toBeDisabled();
    await expect(loadMore).toHaveAttribute("aria-busy", "true");
  },
};

export const Filtering: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Filters/ }));
    await userEvent.selectOptions(canvas.getByLabelText("Actor"), "system");

    // The chip is the visible result of the filter change.
    await expect(
      canvas.getByRole("button", { name: "System" })
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      canvas.getByLabelText("Action"),
      "auth:sign_in"
    );

    await expect(
      canvas.getByRole("button", { name: "auth:sign_in" })
    ).toBeInTheDocument();
  },
};

export const ActiveFilterChipsAndClearAll: Story = {
  args: {
    filters: {
      ...EMPTY_AUDIT_FILTERS,
      query: "ada",
      actorId: "system",
      operatorOnly: true,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("“ada”")).toBeInTheDocument();
    await expect(canvas.getByText("Operator rows")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /^Filters/ })
    ).toHaveTextContent("2");

    await userEvent.click(canvas.getByRole("button", { name: "Clear all" }));

    await expect(canvas.queryByText("Operator rows")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Search summary or target")).toHaveValue(
      ""
    );
  },
};

export const OperatorFilter: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Filters/ }));

    const checkbox = canvas.getByRole("checkbox", {
      name: "Operator rows only",
    });

    await expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    await expect(checkbox).toBeChecked();
    await expect(
      canvas.getByRole("button", { name: "Operator rows" })
    ).toBeInTheDocument();
  },
};

export const LoadMore: Story = {
  play: async ({ canvas }) => {
    onLoadMoreAuditEvents.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));

    expect(onLoadMoreAuditEvents).toHaveBeenCalledTimes(1);
  },
};

export const DetailSheetOpensAnAuthorizedTarget: Story = {
  play: async ({ canvas, canvasElement }) => {
    const { first } = rowButtons(canvasElement);

    onOpenAuditTarget.mockClear();
    await userEvent.click(first);

    const dialog = within(canvas.getByRole("dialog", { name: "Audit event" }));

    await expect(dialog.getByText("Summary")).toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: /Open/ }));

    expect(onOpenAuditTarget).toHaveBeenCalledWith("/admin/people/p-1");
  },
};

export const DetailSheetShowsNoLinkForAnExistingTarget: Story = {
  play: async ({ canvas, canvasElement }) => {
    const { second } = rowButtons(canvasElement);

    await userEvent.click(second);

    const dialog = within(canvas.getByRole("dialog", { name: "Audit event" }));

    await expect(dialog.getByText("No link")).toBeInTheDocument();
    await expect(
      dialog.queryByRole("button", { name: /Open/ })
    ).not.toBeInTheDocument();
  },
};

export const DetailSheetShowsARemovedTarget: Story = {
  play: async ({ canvas, canvasElement }) => {
    const { third } = rowButtons(canvasElement);

    await userEvent.click(third);

    const dialog = within(canvas.getByRole("dialog", { name: "Audit event" }));

    await expect(dialog.getByText("Removed")).toBeInTheDocument();
    await expect(dialog.getByText(/anonymized id/)).toBeInTheDocument();
  },
};

export const DetailSheetCopiesTheEventId: Story = {
  play: async ({ canvas, canvasElement }) => {
    const { first } = rowButtons(canvasElement);

    onCopyEventId.mockClear();
    await userEvent.click(first);

    const dialog = within(canvas.getByRole("dialog", { name: "Audit event" }));

    await userEvent.click(dialog.getByRole("button", { name: /Copy/ }));

    expect(onCopyEventId).toHaveBeenCalledWith("ev-openable");
  },
};
