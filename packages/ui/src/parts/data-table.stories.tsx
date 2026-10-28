import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UserIcon } from "lucide-react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

// The package entry, not ./data-table.tsx, so that the stories prove what an
// app can import.
import { DataTable, IconTile, LabelPill } from "../index.ts";

type Person = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly lastSeen: string;
  readonly signIns: number;
};

const people: readonly Person[] = [
  {
    id: "p-1",
    email: "avery@example.com",
    name: "Avery Stone",
    role: "Administrator",
    status: "Active",
    lastSeen: "Today",
    signIns: 12,
  },
  {
    id: "p-2",
    email: "averyveryveryverylongaddressforatest@example.com",
    name: "Jordan Lee of the long review group",
    role: "Reviewer",
    status: "Active",
    lastSeen: "Yesterday",
    signIns: 4,
  },
  {
    id: "p-3",
    email: "sam@example.com",
    name: "Sam Okafor",
    role: "Reviewer",
    status: "Invited",
    lastSeen: "Never",
    signIns: 0,
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
          'The composed table of Spec 3 R-23. From 768 px it is a table in a bordered card, with the header band on top and the edge columns inset 20 px. A column with `align: "end"` lines its header and cells up at the end, for counts. Below, the same rows are a card list with the identity, the status, at most two facts and the actions menu. The identity is a native button, so Enter and Space open the row, and the actions menu follows it in the tab order. A refused action stays in the menu, disabled, and shows its reason as visible text that is the item\'s description. Columns use the TanStack field names `id`, `header` and `cell`, so a later sort can adopt them.',
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
      {
        id: "signIns",
        header: "Sign-ins",
        cell: (row) => row.signIns,
        align: "end",
      },
    ],
    status: (row) => row.status,
    card: {
      media: () => (
        <IconTile>
          <UserIcon />
        </IconTile>
      ),
      title: (row) => row.email,
      detail: (row) => row.name,
      badge: (row) => <LabelPill>{row.id}</LabelPill>,
      facts: (row) => [row.status, row.role, row.lastSeen],
      trailing: (row) => `${row.signIns} sign-ins`,
    },
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
    const table = canvas.getByRole("table", { name: "People" });

    await expect(table).toBeVisible();
    await expect(canvas.queryByRole("list", { name: "People" })).toBeNull();

    // UI-1 finding 5: a bordered card holds the table, so the header band does not float.
    const card = table.closest("[data-slot=data-table]");

    await expect(card).not.toBeNull();
    await expect(getComputedStyle(card!).borderTopWidth).toBe("1px");
    await expect(getComputedStyle(card!).borderTopLeftRadius).toBe("12px");
    await expect(
      getComputedStyle(canvas.getByRole("columnheader", { name: "Email" }))
        .paddingLeft
    ).toBe("20px");

    // A count lines up at the end of its column, header and cells alike.
    await expect(
      getComputedStyle(canvas.getByRole("columnheader", { name: "Sign-ins" }))
        .textAlign
    ).toBe("right");
    await expect(
      getComputedStyle(
        within(
          canvas.getByRole("row", { name: /avery@example.com/ })
        ).getByRole("cell", { name: "12" })
      ).textAlign
    ).toBe("right");

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
    // Under load the closing menu still holds its enabled Remove item.
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Actions for averyveryveryverylongaddressforatest@example.com",
      })
    );

    const refused = await screen.findByRole("menuitem", { name: "Remove" });

    await expect(refused).toHaveAttribute("aria-disabled", "true");
    await expect(refused).toHaveAccessibleDescription(
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
  play: async ({ canvas, args }) => {
    const list = canvas.getByRole("list", { name: "People" });

    await expect(list).toBeVisible();
    await expect(canvas.queryByRole("table")).toBeNull();
    // The card list is one bordered card, like the table above 768 px.
    await expect(getComputedStyle(list).borderTopLeftRadius).toBe("12px");

    const cards = within(list).getAllByRole("listitem");

    await expect(cards).toHaveLength(3);

    // One card shape: a long email truncates instead of growing its card. The divider is not the
    // card, so it comes off each box.
    const heights = cards.map((card) => {
      const style = getComputedStyle(card);

      return (
        card.getBoundingClientRect().height -
        Number.parseFloat(style.borderTopWidth) -
        Number.parseFloat(style.borderBottomWidth)
      );
    });

    await expect(new Set(heights).size).toBe(1);

    // The facts are one line, joined with " · ".
    const facts = within(cards[0]!).getByText("Active · Administrator · Today");

    await expect(facts).toBeVisible();

    // A neutral tile leads the card, left of the name, and lines up with it.
    const tile = cards[0]!.querySelector("[data-slot=icon-tile]");

    const name = within(cards[0]!).getByRole("button", {
      name: "avery@example.com",
    });

    await expect(tile).not.toBeNull();
    await expect(tile!.getBoundingClientRect().width).toBe(40);
    await expect(tile!.getBoundingClientRect().right).toBeLessThan(
      name.getBoundingClientRect().left
    );

    // The badge sits on the name's line, not on a line of its own.
    const badge = within(cards[0]!).getByText("p-1");

    await expect(
      Math.abs(
        name.getBoundingClientRect().top - badge.getBoundingClientRect().top
      )
    ).toBeLessThan(6);

    // The card is one tap target: the point over the facts belongs to the row's button (R-23).
    await expect(
      cards[0]!.getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(44);

    const overFacts = facts.getBoundingClientRect();

    await expect(
      document
        .elementFromPoint(
          overFacts.left + overFacts.width / 2,
          overFacts.top + overFacts.height / 2
        )
        ?.closest("button")
    ).toBe(name);

    await userEvent.click(name);
    await expect(args.onOpenRow).toHaveBeenLastCalledWith(people[0]);

    await expect(
      canvas
        .getByRole("button", { name: "Actions for avery@example.com" })
        .getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(40);
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

// A touch screen has no hover title, so the reason is visible text (R-21, R-38).
export const PhoneRefusal: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Actions for averyveryveryverylongaddressforatest@example.com",
      })
    );

    const refused = await screen.findByRole("menuitem", { name: "Remove" });

    const reason = within(refused).getByText(
      "The last administrator cannot be removed."
    );

    await expect(refused).toHaveAttribute("aria-disabled", "true");
    // The popup fades in from opacity 0.
    await waitFor(() => expect(reason).toBeVisible());
    await expect(refused).toHaveAttribute("aria-describedby", reason.id);
    await expect(refused).not.toHaveAttribute("title");

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
