import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  expect,
  fireEvent,
  fn,
  screen,
  userEvent,
  waitFor,
} from "storybook/test";

import type { RecipientRow } from "../../services/roles/recipients.ts";
import {
  RecipientField,
  type RecipientFieldProps,
} from "./recipient-field.tsx";

const GROUPS: readonly RecipientRow[] = [
  {
    type: "group",
    id: "g-coll",
    name: "Collections",
    source: "local",
    memberCount: 6,
    archived: false,
    assignedRoles: 2,
  },
  {
    type: "group",
    id: "g-fin",
    name: "Finance team",
    source: "idp",
    memberCount: 17,
    archived: false,
    assignedRoles: 3,
  },
];

const PEOPLE: readonly RecipientRow[] = [
  {
    type: "user",
    id: "p-ada",
    name: "Ada Quinn",
    email: "ada.quinn@example.com",
    assignedRoles: 1,
  },
  {
    type: "user",
    id: "p-priya",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    assignedRoles: 4,
  },
  {
    type: "user",
    id: "p-riley",
    name: "Riley Chen",
    email: "riley.chen@example.com",
    assignedRoles: 1,
  },
];

type Args = Omit<RecipientFieldProps, "value"> & {
  readonly initial: readonly RecipientRow[];
};

/** Holds the picks the way the form does. */
function Harness(props: Args) {
  const [value, setValue] = useState<readonly RecipientRow[]>(props.initial);

  return (
    <div className="max-w-md">
      <RecipientField
        label={props.label}
        placeholder={props.placeholder}
        multiple={props.multiple}
        value={value}
        onChange={(next) => {
          props.onChange(next);
          setValue(next);
        }}
        search={props.search}
        selfId={props.selfId}
        look={props.look}
        invalid={props.invalid}
        describedBy={props.describedBy}
      />
    </div>
  );
}

const meta = {
  title: "Core/Access/RecipientField",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Picks people and groups for Access: one (the Person or group filter, Grant to) or many as chips (Assign to). It searches on the server through the host's `search` on open and 300 ms after the last keystroke, lists Groups before People with a mark and a second line, and names the cut when more match.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    label: "Assign to",
    placeholder: "Search people and groups",
    multiple: true,
    initial: [],
    selfId: "p-priya",
    search: fn(async (_query: string) => ({
      rows: [...GROUPS, ...PEOPLE],
      total: 5,
    })),
    onChange: fn(),
  },
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

/** T5-a (d8l5.65): Groups before People, each option with its mark and second line. */
export const GroupsThenPeopleWithMarks: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Assign to" }));
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Groups" })).toBeVisible()
    );
    await expect(args.search).toHaveBeenCalledWith("");
    const [first, second] = screen.getAllByRole("group");
    await expect(first).toHaveAccessibleName("Groups");
    await expect(second).toHaveAccessibleName("People");

    const finance = screen.getByRole("option", { name: /Finance team/ });
    await expect(finance).toHaveTextContent("Directory group · 17 members");
    await expect(
      finance.querySelector("[data-recipient-mark='group']")
    ).not.toBeNull();

    const ada = screen.getByRole("option", { name: /Ada Quinn/ });
    await expect(ada).toHaveTextContent("ada.quinn@example.com");
    await expect(
      ada.querySelector("[data-recipient-mark='user']")
    ).toHaveTextContent("AQ");
  },
};

/** T5-b (P12-3): your own row is listed, disabled, with the self line; a click picks nothing. */
export const SelfIsDisabled: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Assign to" }));

    const me = await screen.findByRole("option", {
      name: /Priya Nair \(you\)/,
    });

    await expect(me).toHaveAttribute("aria-disabled", "true");
    await expect(me).toHaveTextContent(
      "Only another administrator can change your own access."
    );
    // A disabled option takes no pointer events, so the click is dispatched directly.
    fireEvent.click(me);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

/** T5-c (WCAG 2.4.3): removing the first chip by keyboard leaves one chip and focuses it. */
export const ChipRemoveMovesFocus: Story = {
  args: { initial: [GROUPS[1]!, PEOPLE[2]!] },
  play: async ({ args, canvas }) => {
    const input = canvas.getByRole("combobox", { name: "Assign to" });
    await expect(input).toHaveAttribute("placeholder", "Add more");
    input.focus();
    // From the start of the input, Left Arrow walks to the chips.
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await expect(document.activeElement).toHaveTextContent("Finance team");

    await userEvent.keyboard("{Backspace}");

    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Remove Finance team" })
      ).toBeNull()
    );
    await expect(
      canvas.getAllByRole("button", { name: /^Remove / })
    ).toHaveLength(1);
    await expect(document.activeElement).toHaveTextContent("Riley Chen");
    await expect(args.onChange).toHaveBeenLastCalledWith([PEOPLE[2]]);
  },
};

/** T5-d: a cut list says how many match. */
export const ShowsFirstTenOfTotal: Story = {
  args: {
    search: fn(async (_query: string) => ({
      rows: [
        ...GROUPS,
        ...Array.from({ length: 8 }, (_, i) => ({
          type: "user" as const,
          id: `p-${i}`,
          name: `Person ${i + 1}`,
          email: `person${i + 1}@example.com`,
          assignedRoles: 0,
        })),
      ],
      total: 317,
    })),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Assign to" }));
    // The popup fades in from opacity 0, so the line is waited for visible.
    await waitFor(() =>
      expect(
        screen.getByText("Showing 10 of 317. Type to search.")
      ).toBeVisible()
    );
  },
};

/** The Overview's Person or group filter: one pick, the filter look (czjw.102). Documentation only. */
export const FilterLook: Story = {
  args: {
    multiple: false,
    look: "filter",
    label: "Person or group",
    placeholder: "Anyone",
  },
};
