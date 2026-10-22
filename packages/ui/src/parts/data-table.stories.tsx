import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

// The package entry, not ./data-table.tsx, so that the stories prove what an
// app can import.
import { DataTable } from "../index.ts";

type Person = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly lastSeen: string;
};

const people: readonly Person[] = [
  {
    id: "p-1",
    email: "avery@example.com",
    name: "Avery Stone",
    role: "Administrator",
    status: "Active",
    lastSeen: "Today",
  },
  {
    id: "p-2",
    email: "averyveryveryverylongaddressforatest@example.com",
    name: "Jordan Lee",
    role: "Reviewer",
    status: "Active",
    lastSeen: "Yesterday",
  },
  {
    id: "p-3",
    email: "sam@example.com",
    name: "Sam Okafor",
    role: "Reviewer",
    status: "Invited",
    lastSeen: "Never",
  },
];

const onRemove = fn();

const meta = {
  title: "UI/DataTable",
  component: DataTable<Person>,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The composed table of Spec 3 R-23. From 768 px it is a table. Below, the same rows are a card list with the identity, the status, at most two facts and the actions menu. The identity is a native button, so Enter and Space open the row, and the actions menu follows it in the tab order. A refused action stays in the menu, disabled, with its reason as the title. Columns use the TanStack field names `id`, `header` and `cell`, so a later sort can adopt them.",
      },
    },
  },
  args: {
    label: "People",
    rows: people,
    rowKey: (row) => row.id,
    rowLabel: (row) => row.email,
    columns: [
      { id: "email", header: "Email", cell: (row) => row.email },
      { id: "name", header: "Name", cell: (row) => row.name },
      { id: "role", header: "Role", cell: (row) => row.role },
    ],
    status: (row) => row.status,
    facts: (row) => [row.name, row.role, row.lastSeen],
    onOpenRow: fn(),
    actions: (row) => [
      row.id === "p-2"
        ? {
            label: "Remove",
            onSelect: onRemove,
            danger: true,
            refusal: "The last administrator cannot be removed.",
          }
        : { label: "Remove", onSelect: onRemove, danger: true },
    ],
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta<typeof DataTable<Person>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("table", { name: "People" })).toBeVisible();
    await expect(canvas.queryByRole("list", { name: "People" })).toBeNull();

    await expect(
      canvas.getByRole("columnheader", { name: "Status" })
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("row", { name: /sam@example.com/ })).getByRole(
        "cell",
        { name: "Invited" }
      )
    ).toBeVisible();

    const open = canvas.getByRole("button", { name: "avery@example.com" });

    await userEvent.click(open);
    await expect(args.onOpenRow).toHaveBeenLastCalledWith(people[0]);

    await userEvent.click(document.body);
    await userEvent.tab();
    await expect(open).toHaveFocus();
    await expect(getComputedStyle(open).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(args.onOpenRow).toHaveBeenCalledTimes(3);

    await userEvent.tab();

    const actions = canvas.getByRole("button", {
      name: "Actions for avery@example.com",
    });

    await expect(actions).toHaveFocus();
    await expect(actions.getBoundingClientRect().height).toBe(40);

    await userEvent.keyboard("{Enter}");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" })
    );
    await expect(onRemove).toHaveBeenCalledTimes(1);

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Actions for averyveryveryverylongaddressforatest@example.com",
      })
    );

    const refused = await screen.findByRole("menuitem", { name: "Remove" });

    await expect(refused).toHaveAttribute("aria-disabled", "true");
    await expect(refused).toHaveAttribute(
      "title",
      "The last administrator cannot be removed."
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "People" });

    await expect(list).toBeVisible();
    await expect(canvas.queryByRole("table")).toBeNull();

    const cards = within(list).getAllByRole("listitem");

    await expect(cards).toHaveLength(3);
    await Promise.all(
      cards.map(async (card, index) => {
        await expect(
          within(card).getByText(people[index]!.status)
        ).toBeVisible();
        // Two facts at most: the third (last seen) never renders.
        await expect(
          within(card).queryByText(people[index]!.lastSeen)
        ).toBeNull();
      })
    );

    await expect(
      canvas.getByRole("button", { name: "avery@example.com" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Actions for avery@example.com" })
    ).toBeVisible();
    await expect(
      canvas
        .getByRole("button", { name: "avery@example.com" })
        .getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(44);
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
