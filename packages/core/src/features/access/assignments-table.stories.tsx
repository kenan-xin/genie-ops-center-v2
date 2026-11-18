import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { AccessPath } from "../../services/roles/effective-access.ts";
import { FIXTURE_ROWS, fixturePath } from "./__fixtures__/access.ts";
import {
  AssignmentsTable,
  type AssignmentsTableProps,
} from "./assignments-table.tsx";

const RILEY = { type: "user", id: "p-riley", name: "Riley Park" } as const;

const FINANCE = {
  type: "group",
  id: "g-finance",
  name: "Finance team",
  source: "local",
} as const;

const a1 = fixturePath({
  id: "a-1",
  holder: FINANCE,
  role: { id: "r-invoices-editor", name: "Invoices and Payments editor" },
  moduleId: "invoices",
});

const a2 = fixturePath({
  id: "a-2",
  holder: RILEY,
  role: { id: "r-slides-user", name: "Slides user" },
  moduleId: "slides",
});

const a3: AccessPath = {
  ...fixturePath({
    id: "a-3",
    holder: RILEY,
    role: { id: "r-invoices-viewer", name: "Invoices and Payments viewer" },
    moduleId: "invoices",
    scope: { type: "invoice", id: "INV-1042" },
  }),
  notInEffect: ["module-off"],
};

const a4: AccessPath = {
  ...fixturePath({
    id: "a-4",
    holder: RILEY,
    role: { id: "r-ask-user", name: "Ask user" },
    moduleId: "ask",
  }),
  addedBy: null,
};

const meta = {
  title: "Core/Access/AssignmentsTable",
  component: AssignmentsTable,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The standard assignments table of one person or group (A-9): Role, Scope and Assigned via, with who assigned it when under the role, and the same facts as label and value rows on a phone. A group's every row is Direct, so a group's table has no Assigned via column.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    paths: [a1, a2, a3, a4],
    catalogue: FIXTURE_ROWS,
    recordLabels: new Map(),
    recipient: { type: "user", id: "p-riley" },
    timeZone: "UTC",
    empty: {
      title: "No roles assigned",
      description: "This person can sign in but sees no modules.",
    },
  } satisfies AssignmentsTableProps,
} satisfies Meta<typeof AssignmentsTable>;

export default meta;

type Story = StoryObj<typeof meta>;

/** T3-a, T3-c: a roles manager reads every fact, and the role opens Roles. */
export const ForARolesManager: Story = {
  args: {
    roleHref: (id) => `/admin/roles?selected=${id}`,
    groupHref: (id) => `/admin/groups?selected=${id}`,
  },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Assigned roles" }));

    // The last header is the table's sr-only actions column.
    await expect(
      table
        .getAllByRole("columnheader")
        .slice(0, 3)
        .map((header) => header.textContent)
    ).toEqual(["Role", "Scope", "Assigned via"]);

    const slides = table.getByRole("row", { name: /Slides user/ });

    await expect(
      within(slides).getByRole("link", { name: "Slides user" })
    ).toHaveAttribute("href", "/admin/roles?selected=r-slides-user");
    await expect(within(slides).getByText("All records")).toBeVisible();
    await expect(within(slides).getByText("Direct")).toBeVisible();
    await expect(
      within(slides).getByText("Assigned 1 Nov 2026 by Alex Morgan")
    ).toBeVisible();

    const scoped = table.getByRole("row", {
      name: /Invoices and Payments viewer/,
    });

    await expect(within(scoped).getByText("INV-1042")).toBeVisible();
    await expect(within(scoped).getByText("Paused: Module off")).toBeVisible();

    const ask = table.getByRole("row", { name: /Ask user/ });

    await expect(
      within(ask).getByText("Assigned 1 Nov 2026", { exact: true })
    ).toBeVisible();

    const editor = table.getByRole("row", {
      name: /Invoices and Payments editor/,
    });

    await expect(within(editor).getByText("(group)")).toBeVisible();
    await expect(
      within(editor).getByRole("link", { name: "Finance team" })
    ).toHaveAttribute("href", "/admin/groups?selected=g-finance");
  },
};

/** T3-b: a people manager reads the same rows with no link into Roles (R-37e). */
export const ForAPeopleManager: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Assigned roles" }));

    await expect(table.queryAllByRole("link")).toHaveLength(0);
    await expect(table.getByText("Slides user")).toBeVisible();
  },
};

/** C11-5: in the sheet's width "All records" keeps one line; Assigned via wraps instead. */
export const ScopeStaysOnOneLine: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  decorators: [
    (Story) => (
      <div className="w-130">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Assigned roles" }));

    // A wrapped value is two line boxes; one line each is the check.
    const lineBoxes = table.getAllByText("All records").map((scope) => {
      const range = document.createRange();

      range.selectNodeContents(scope);

      return range.getClientRects().length;
    });

    await expect(Math.max(...lineBoxes)).toBe(1);
  },
};

/** T3-d: a group's every row is Direct, so the column would say nothing. */
export const ForAGroup: Story = {
  args: { recipient: { type: "group", id: "g-finance" }, paths: [a1] },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("columnheader", { name: "Assigned via" })
    ).toBeNull();
    await expect(
      canvas.getByText("Assigned 1 Nov 2026 by Alex Morgan")
    ).toBeVisible();
  },
};

/** T3-e: on a phone each row is a card of label and value rows, not a table (A-9). */
export const OnAPhone: Story = {
  args: { roleHref: (id) => `/admin/roles?selected=${id}` },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("table")).toBeNull();

    const list = within(canvas.getByRole("list", { name: "Assigned roles" }));

    const slides = list
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("Slides user"));

    if (slides === undefined) throw new Error("No Slides user card");

    const card = within(slides);

    await expect(card.getByText("Scope")).toBeVisible();
    await expect(card.getByText("Assigned via")).toBeVisible();
    await expect(card.getByText("Assigned", { exact: true })).toBeVisible();
    await expect(card.getByText("All records")).toBeVisible();
    await expect(card.getByText("Direct")).toBeVisible();
    await expect(card.getByText("1 Nov 2026 by Alex Morgan")).toBeVisible();
  },
};

/** T3-f: no assignment says so, with the sheet's sentence. */
export const NoRoles: Story = {
  args: { paths: [] },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No roles assigned")).toBeVisible();
    await expect(
      canvas.getByText("This person can sign in but sees no modules.")
    ).toBeVisible();
  },
};
