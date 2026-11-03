import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type {
  AccessPath,
  AccessSubject,
} from "../../services/roles/effective-access.ts";
import {
  FIXTURE_ROWS,
  OVERVIEW_RECIPIENTS,
  overviewPaths,
} from "./__fixtures__/access.ts";
import { moduleNameOf } from "./grants-view.ts";
import { OverviewScreen } from "./overview-screen.tsx";

type Args = {
  readonly initial: AccessSubject | null;
  readonly onSubjectChange: (next: AccessSubject | null) => void;
};

const PAGE = 10;

/** The server search: holder, role and module names, case-insensitive (S2-19). */
const matches = (path: AccessPath, query: string) =>
  [path.holder.name, path.role.name, moduleNameOf(path, FIXTURE_ROWS)].some(
    (name) => name.toLowerCase().includes(query.trim().toLowerCase())
  );

/** Holds the subject, the search and the page the way the route does, and pages by ten. */
function Harness(args: Args) {
  const [subject, setSubject] = React.useState(args.initial);

  const [query, setQuery] = React.useState("");

  const [index, setIndex] = React.useState(0);

  const all = subject === null ? [] : overviewPaths(subject);

  const found = all.filter((path) => matches(path, query));

  return (
    <OverviewScreen
      catalogue={FIXTURE_ROWS}
      recipients={OVERVIEW_RECIPIENTS}
      subject={subject}
      onSubjectChange={(next) => {
        args.onSubjectChange(next);
        setSubject(next);
        setQuery("");
        setIndex(0);
      }}
      onQueryChange={(next) => {
        setQuery(next);
        setIndex(0);
      }}
      page={
        subject === null
          ? undefined
          : {
              paths: found.slice(index * PAGE, index * PAGE + PAGE),
              from: index * PAGE + 1,
              total: all.length,
              matches: found.length,
              hasPrevious: index > 0,
              hasNext: (index + 1) * PAGE < found.length,
            }
      }
      onPage={(step) => setIndex((current) => current + step)}
      paging={false}
      personPaths={subject?.type === "user" ? all : undefined}
      timeZone="UTC"
      auditLogHref="/admin/audit"
    />
  );
}

const meta = {
  title: "Core/Access/OverviewScreen",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The Overview tab of Access (R-37b, R-37d). The administrator looks up one group or person, or one module, and reads every path to a role: who holds it, the module, the role, the path (direct or through a group) and who added it. Nothing is read before the choice. The server searches and pages by ten. The tab writes nothing.",
      },
    },
    a11y: { test: "error" },
  },
  args: { initial: null, onSubjectChange: fn() },
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

const jamie: AccessSubject = { type: "user", id: "p-jamie" };

const invoices: AccessSubject = { type: "module", id: "invoices" };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** The header line. Case-sensitive, so the table caption ("Holders of …") does not match. */
const header = (canvas: ReturnType<typeof within>, words: string) =>
  canvas.findByText(new RegExp(words));

/** The table row of a cell's text. */
function rowOf(cell: HTMLElement) {
  const row = cell.closest("tr");

  if (row === null) throw new Error("The text is not in a table row.");

  return within(row);
}

/** S1: before a choice the card asks for one, and a pick reports the subject (R-37b). */
export const NoSubject: Story = {
  play: async ({ args, canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Choose what to look up" })
    ).toBeVisible();
    await expect(canvas.queryByRole("region", { name: "Results" })).toBeNull();

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Choose a group or person" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Operations · 40 members" })
    );

    await waitFor(() =>
      expect(args.onSubjectChange).toHaveBeenCalledWith({
        type: "group",
        id: "g-ops",
      })
    );
  },
};

/** S2: each part of a row lands in its column (R-37d). */
export const ByPerson: Story = {
  args: { initial: jamie },
  play: async ({ canvas }) => {
    await expect(await header(canvas, "assignments for")).toHaveTextContent(
      "10 assignments for Jamie Chen"
    );

    const table = within(
      canvas.getByRole("table", { name: "Assignments for Jamie Chen" })
    );

    const row = (text: string) => rowOf(table.getByText(text));

    const viaFinance = table
      .getAllByText("via Finance team")
      .map(rowOf)
      .find((cells) => cells.queryByText("Finance") !== null);

    await expect(
      viaFinance?.getByText("also through a direct assignment, Operations")
    ).toBeVisible();

    await expect(
      row("The Analytics module is off").getByText("Not in effect")
    ).toBeVisible();
    await expect(row("Analytics viewer").getByText("Analytics")).toBeVisible();
    const record = table.getByText("a0774a4a-a630-41ba-8364-bcb715ff0c6a");

    await expect(record).toBeVisible();
    await expect(record.parentElement).toHaveTextContent(
      "One record · a0774a4a-a630-41ba-8364-bcb715ff0c6a"
    );
    await expect(row("Invoice auditor").getByText("Custom role")).toBeVisible();

    const direct = row("Invoices and Payments user");

    await expect(direct.getByText("Direct assignment")).toBeVisible();
    await expect(direct.getByText("1 Oct 2026")).toBeVisible();
    await expect(direct.getByText("by Jordan Lee")).toBeVisible();
  },
};

/** S3: on a phone the rows are cards, and the page does not scroll sideways (DEC-25). */
export const ByPersonPhone: Story = {
  args: { initial: jamie },
  globals: phone,
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Assignments for Jamie Chen" })
    );

    const card = within(list.getAllByRole("listitem")[0] ?? document.body);

    await Promise.all(
      ["Module", "Role", "Path", "Added"].map((term) =>
        expect(card.getByText(term)).toBeVisible()
      )
    );

    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );

    // A long record id must wrap inside its card, not run past the edge.
    await Promise.all(
      list
        .getAllByRole("listitem")
        .map((item) =>
          expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth)
        )
    );
  },
};

/** S4: the pager walks every page of a module's holders and stops at the end. */
export const ByModule: Story = {
  args: { initial: invoices },
  play: async ({ canvas }) => {
    await expect(await header(canvas, "holders of")).toHaveTextContent(
      "21 holders of Invoices"
    );
    await expect(canvas.getByText("1–10 of 21")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(await canvas.findByText("11–20 of 21")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(await canvas.findByText("21–21 of 21")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();

    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(await canvas.findByText("11–20 of 21")).toBeVisible();
  },
};

/** S5: the search narrows the pager, and the header keeps counting every path (O5). */
export const Search: Story = {
  args: { initial: invoices },
  play: async ({ canvas }) => {
    const search = await canvas.findByRole("searchbox", {
      name: "Search these results",
    });

    await userEvent.type(search, "finance");

    await expect(await canvas.findByText("1–7 of 7")).toBeVisible();
    await expect(await header(canvas, "holders of")).toHaveTextContent(
      "21 holders of Invoices"
    );

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");

    await expect(
      await canvas.findByText("No row matches the search.")
    ).toBeVisible();
  },
};

/** S6: the email picks the right one of two people who share a name (Review Focus 3). */
export const HoldsNoRole: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Choose a group or person" })
    );
    await userEvent.type(
      await screen.findByRole("combobox", { name: "Search groups and people" }),
      "a.morgan@example.com"
    );
    await userEvent.click(
      await screen.findByRole("option", {
        name: "Alex Morgan · a.morgan@example.com",
      })
    );

    await expect(await header(canvas, "assignments for")).toHaveTextContent(
      "0 assignments for Alex Morgan"
    );
    await expect(canvas.getByText("Alex Morgan holds no role.")).toBeVisible();
    await expect(
      canvas.queryByRole("searchbox", { name: "Search these results" })
    ).toBeNull();
  },
};

/** A group: every row is its own direct path, so no row names another. */
export const ByGroup: Story = {
  args: { initial: { type: "group", id: "g-ops" } },
};

export const ByModulePhone: Story = {
  args: { initial: invoices },
  globals: phone,
};

/** A module that nobody holds. */
export const NobodyHolds: Story = {
  args: { initial: { type: "module", id: "placeholder" } },
};
