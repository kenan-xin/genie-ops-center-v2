import { useListState } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type {
  AccessPath,
  AssignmentFilters,
} from "../../services/roles/effective-access.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";
import {
  ALL_OVERVIEW_PATHS,
  FIXTURE_ROLES,
  FIXTURE_ROWS,
  OVERVIEW_MEMBER_COUNTS,
  overviewPaths,
} from "./__fixtures__/access.ts";
import { moduleNameOf } from "./grants-view.ts";
import { OverviewScreen } from "./overview-screen.tsx";
import { overviewDefinition, parseWho, readFilters } from "./overview-view.ts";

const PAGE = 25;

const LIST = "Assignments, newest first";

const JAMIE: RecipientRow = {
  type: "user",
  id: "p-jamie",
  name: "Jamie Chen",
  email: "jamie.chen@example.com",
  assignedRoles: 1,
};

const FINANCE: RecipientRow = {
  type: "group",
  id: "g-finance",
  name: "Finance team",
  source: "local",
  memberCount: 12,
  archived: false,
  assignedRoles: 4,
};

const RECIPIENTS: readonly RecipientRow[] = [FINANCE, JAMIE];

const DEFINITION = overviewDefinition(FIXTURE_ROWS, FIXTURE_ROLES);

const rowOf = (who: { readonly type: string; readonly id: string } | null) =>
  who === null
    ? null
    : (RECIPIENTS.find((row) => row.type === who.type && row.id === who.id) ??
      null);

/** The server's filters and search, in memory (d8l5.62). */
function matching(
  filters: AssignmentFilters,
  query: string
): readonly AccessPath[] {
  const { recipient, moduleId, roleId } = filters;

  const base =
    recipient === undefined
      ? ALL_OVERVIEW_PATHS
      : recipient.type === "user"
        ? overviewPaths(recipient)
        : ALL_OVERVIEW_PATHS.filter(
            (path) =>
              path.holder.type === "group" && path.holder.id === recipient.id
          );

  const words = query.trim().toLowerCase();

  return base.filter(
    (path) =>
      (moduleId === undefined ||
        path.role.moduleId === moduleId ||
        path.role.permissions.includes(`${moduleId}:use`)) &&
      (roleId === undefined || path.role.id === roleId) &&
      [path.holder.name, path.role.name, moduleNameOf(path, FIXTURE_ROWS)].some(
        (name) => name.toLowerCase().includes(words)
      )
  );
}

/** Holds the address and the page the way the route does, and pages by 25. */
function Harness(args: { readonly total?: number | undefined }) {
  const state = useListState(DEFINITION);

  const read = readFilters({
    params: state.params,
    who: rowOf(parseWho(state.params["who"])),
    catalogue: FIXTURE_ROWS,
    roles: FIXTURE_ROLES,
  });

  const key = JSON.stringify([read.filters, read.query]);

  const [at, setAt] = React.useState({ key, index: 0 });

  const index = at.key === key ? at.index : 0;

  const found = matching(read.filters, read.query);

  const total = args.total ?? found.length;

  return (
    <OverviewScreen
      definition={DEFINITION}
      state={state}
      catalogue={FIXTURE_ROWS}
      filters={read.filters}
      who={rowOf(read.filters.recipient ?? null)}
      searchRecipients={async (query) => {
        const rows = RECIPIENTS.filter((row) =>
          row.name.toLowerCase().includes(query.toLowerCase())
        );

        return { rows, total: rows.length };
      }}
      page={{
        paths: found.slice(index * PAGE, index * PAGE + PAGE),
        memberCounts: OVERVIEW_MEMBER_COUNTS,
        from: index * PAGE + 1,
        total,
        hasPrevious: index > 0,
        hasNext: (index + 1) * PAGE < total,
      }}
      onPage={(step) => setAt({ key, index: index + step })}
      paging={false}
      personPaths={
        read.filters.recipient?.type === "user"
          ? overviewPaths(read.filters.recipient)
          : undefined
      }
      recordLabels={new Map()}
      timeZone="UTC"
      roleHref={(id) => `/admin/roles?selected=${id}`}
      personHref={(id) => `/admin/people?selected=${id}`}
      groupHref={(id) => `/admin/groups?selected=${id}`}
    />
  );
}

const NAMES = ["q", "who", "module", "role"];

/** The story's address: only the given list parameters, so each story starts from its own filters. */
const address = (params: Readonly<Record<string, string>>) => () => {
  const url = new URL(window.location.href);

  for (const name of NAMES) url.searchParams.delete(name);

  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, value);

  window.history.replaceState(null, "", url);
};

const param = (name: string) =>
  new URLSearchParams(window.location.search).get(name);

const meta = {
  title: "Core/Access/OverviewScreen",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The Overview tab of Access (d8l5.62, access-start b): every assignment, newest first, 25 to a page, filtered on the server by Person or group, Module and Role, and searched by role or name. Assigned via and the line that counts a person's roles show only while the Person or group filter names a person. A phone card leaves out the column the list is filtered by (ADM-14b). The tab writes nothing.",
      },
    },
    a11y: { test: "error" },
  },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  args: {},
  beforeEach: address({}),
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

/** T7-d (d8l5.62): the first render lists rows and the range, and asks for no choice. */
export const StartsFilled: Story = {
  args: { total: 1284 },
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: LIST });

    await expect(within(table).getAllByRole("row")).toHaveLength(26);
    await expect(canvas.getByText("1–25 of 1,284")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Next" })).toBeEnabled();
    await expect(
      canvas.getByRole("columnheader", { name: "Assigned" })
    ).toHaveAttribute("aria-sort", "descending");
    await expect(
      canvas.queryByRole("columnheader", { name: "Assigned via" })
    ).toBeNull();
    await expect(canvas.queryByText("Choose what to look up")).toBeNull();
  },
};

/** T7-e (G2 pick): with a person in Person or group, Assigned via and the reach line show; cleared, neither does. */
export const PersonFilterShowsAssignedVia: Story = {
  beforeEach: address({ who: "user:p-jamie" }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Jamie Chen has 10 roles: 1 direct, 4 via Finance team and 5 via Operations."
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("columnheader", { name: "Assigned via" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Person or group" })
    ).toHaveTextContent("Jamie Chen");

    // The parent decision: Assigned to names the filtered person on every row, and Assigned via
    // names the group (filtered-1440).
    const table = await canvas.findByRole("table", { name: LIST });

    const viaGroup = within(table)
      .getAllByRole("row")
      .find((row) => within(row).queryByText(/\(group\)/) !== null);

    if (viaGroup === undefined)
      throw new Error("No row reached through a group.");

    const toCell = within(viaGroup).getAllByRole("cell")[1];

    if (toCell === undefined) throw new Error("No Assigned to cell.");

    await expect(within(toCell).getByText("Jamie Chen")).toBeVisible();
    await expect(within(toCell).queryByText("Finance team")).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear filters" })
    );
    await waitFor(() => expect(param("who")).toBeNull());
    await waitFor(() =>
      expect(
        canvas.queryByRole("columnheader", { name: "Assigned via" })
      ).toBeNull()
    );
    await expect(canvas.queryByText(/has 10 roles/)).toBeNull();
  },
};

/** T7-f (C11-18): Paused sits in the Role cell, under the role, not under the name. */
export const PausedSitsUnderTheRole: Story = {
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: LIST });
    const [pill] = within(table).getAllByText("Paused: Module off");
    const cell = pill?.closest("td");

    if (cell === null || cell === undefined)
      throw new Error("The pill is not in a table cell.");

    await expect(within(cell).getByText("Analytics viewer")).toBeVisible();
    await expect(within(cell).queryByText("Finance team")).toBeNull();
  },
};

/** T7-g (ADM-14b): at 390, with Person or group and Module set, no card names the person or the module. */
export const PhoneCardDropsFilteredColumn: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  beforeEach: address({ who: "user:p-jamie", module: "invoices" }),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: LIST });

    await expect(
      within(list).getAllByText("Assigned via").length
    ).toBeGreaterThan(0);
    await expect(within(list).queryAllByText("Assigned to")).toHaveLength(0);
    await expect(
      within(list).queryAllByText("Invoices", { exact: true })
    ).toHaveLength(0);
    await expect(within(list).getByText("Custom role")).toBeVisible();
  },
};

/** T7-h: no match offers one button that clears the search and every filter. */
export const NoMatchClearsFilters: Story = {
  beforeEach: address({ q: "zzz", module: "invoices" }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "No assignments match" })
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear search and filters" })
    );
    await waitFor(() => expect(param("q")).toBeNull());
    await expect(param("module")).toBeNull();
    await expect(
      await canvas.findByRole("table", { name: LIST })
    ).toBeVisible();
  },
};
