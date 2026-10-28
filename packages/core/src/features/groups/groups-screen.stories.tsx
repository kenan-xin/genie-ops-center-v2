import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  FIXTURE_ASSIGNMENTS,
  FIXTURE_DIRECTORY,
  FIXTURE_GROUPS,
  FIXTURE_LOCAL,
  FIXTURE_MEMBERS,
  FIXTURE_PEOPLE,
  FIXTURE_ROLES,
  FIXTURE_VIEWER,
} from "./__fixtures__/groups.ts";
import { GroupsScreen } from "./groups-screen.tsx";
import type { GroupsScreenProps } from "./types.ts";

const onAddDirectoryGroup = fn();

const onArchiveGroup = fn();

const onDeleteGroup = fn();

const onDeleteLocalGroup = fn();

const onCreateLocalGroup = fn();

const onAssignRole = fn();

/**
 * The Groups directory (R-24 to R-25). The host owns the data and the writes, so each destructive
 * story asserts the confirm copy before the callback fires, and the callback spies prove the
 * screen routes the action the design names.
 */
const meta = {
  title: "Core/Groups",
  component: GroupsScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Groups directory and inspector. A directory group's value and members come from the identity provider; only its label is editable. Archiving keeps the assignments and stops them granting.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    searchLabel: "Search groups",
    noMatch: {
      title: "No groups match",
      description:
        "Clear the search and the archived filter to see every group.",
      clearLabel: "Clear search and filters",
    },
    groups: FIXTURE_GROUPS,
    viewer: FIXTURE_VIEWER,
    includeArchived: false,
    onChangeIncludeArchived: fn(),
    people: FIXTURE_PEOPLE,
    roles: FIXTURE_ROLES,
    lastAdministratorGroupIds: [],
    details: {
      [FIXTURE_DIRECTORY.id]: {
        members: FIXTURE_MEMBERS,
        assignments: FIXTURE_ASSIGNMENTS,
      },
      [FIXTURE_LOCAL.id]: {
        members: FIXTURE_MEMBERS,
        assignments: [FIXTURE_ASSIGNMENTS[1]!],
      },
    },
    onAddDirectoryGroup,
    onArchiveGroup,
    onDeleteGroup,
    onDeleteLocalGroup,
    onCreateLocalGroup,
    onAssignRole,
    labelHint: "Add a display label",
  } satisfies GroupsScreenProps,
} satisfies Meta<typeof GroupsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The help sits beside the search as an icon, named by its topic (people-groups-and-roles spec). */
export const HelpIsIconOnly: Story = {
  play: async ({ canvas }) => {
    const help = canvas.getByRole("button", {
      name: "Directory and local groups",
    });

    await expect(help.textContent).toBe("");
  },
};

export const Default: Story = {
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Groups" }));

    await expect(table.getByText("Finance managers")).toBeInTheDocument();
    await expect(table.getByText("Not seen yet")).toBeInTheDocument();
    await expect(table.getByText("Stale")).toBeInTheDocument();
    await expect(table.getByText("Operations")).toBeInTheDocument();

    // The archived group stays behind the Show archived toggle.
    await expect(canvas.queryByText("Ex-contractors")).not.toBeInTheDocument();
    await expect(canvas.getByPlaceholderText("Search groups")).toBeVisible();
  },
};

/** UI-1 People finding 2: an unlabelled object-id group shows a short pill and the label hint (R-24c). */
export const UnlabelledGroupIdAsksForALabel: Story = {
  args: {
    groups: [
      ...FIXTURE_GROUPS,
      {
        ...FIXTURE_DIRECTORY,
        id: "g-oid",
        name: "39545f73-134e-49ac-9731-0e96df8ea218",
        externalId: "39545f73-134e-49ac-9731-0e96df8ea218",
        displayLabel: null,
      },
    ],
  },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Groups" }));

    const short = table.getByText("39545f73…");

    await userEvent.hover(short);

    const tip = await screen.findByText(
      "39545f73-134e-49ac-9731-0e96df8ea218",
      {
        selector: "[data-slot=tooltip-content]",
      }
    );

    // The tooltip fades in, so wait until it paints.
    await waitFor(() => expect(tip).toBeVisible());
    // Only the unlabelled id shows its short form; a label or a readable name shows as it is.
    await expect(table.getByText("39545f73…")).toBeVisible();
    await expect(canvas.queryAllByText("Add a display label")).toHaveLength(0);
  },
};

/** The label prompt left the row, so the inspector of an unlabelled id group asks for it (R-24c). */
export const UnlabelledGroupAsksForALabelInTheInspector: Story = {
  args: {
    groups: [
      {
        ...FIXTURE_DIRECTORY,
        id: "g-oid",
        name: "39545f73-134e-49ac-9731-0e96df8ea218",
        externalId: "39545f73-134e-49ac-9731-0e96df8ea218",
        displayLabel: null,
      },
    ],
    initialSelectedId: "g-oid",
  },
  play: async () => {
    const inspector = within(
      await screen.findByRole("dialog", {
        name: "39545f73-134e-49ac-9731-0e96df8ea218",
      })
    );

    await userEvent.click(
      inspector.getByRole("button", { name: "Add a display label" })
    );

    await expect(inspector.getByLabelText("Display label")).toBeVisible();
  },
};

/** An audit target link opens the screen with that group selected (6wz1.26). */
export const OpensTheLinkedGroup: Story = {
  args: { initialSelectedId: "g-local" },
  play: async () => {
    const inspector = await screen.findByRole("dialog", { name: "Operations" });

    await waitFor(() => expect(inspector).toBeVisible());
  },
};

export const PhoneSearchTakesTheRow: Story = {
  parameters: {
    viewport: {
      options: {
        phone390: {
          name: "Phone 390",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
      },
    },
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(390);

    const search = canvas.getByRole("textbox", { name: "Search groups" });

    await expect(search.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      300
    );

    // The icon-only help stays beside the search, not on a row of its own.
    const field = search.getBoundingClientRect();

    const help = canvas
      .getByRole("button", { name: "Directory and local groups" })
      .getBoundingClientRect();

    await expect(help.top + help.height / 2).toBeGreaterThan(field.top);
    await expect(help.top + help.height / 2).toBeLessThan(field.bottom);
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const list = within(canvas.getByRole("list", { name: "Groups" }));

    await expect(window.innerWidth).toBe(390);
    await expect(canvas.queryByRole("table")).toBeNull();
    // A long unbroken value must not push the page sideways.
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );

    // Two rows: the search, then the filter line. The primary action left the toolbar.
    const search = canvas
      .getByRole("textbox", { name: "Search groups" })
      .getBoundingClientRect();

    const filter = canvas
      .getByRole("checkbox", { name: "Show archived" })
      .getBoundingClientRect();

    const overflow = canvas
      .getByRole("button", { name: "More group actions" })
      .getBoundingClientRect();

    await expect(filter.top).toBeGreaterThan(search.bottom);
    await expect(overflow.top).toBeLessThan(filter.bottom);
    await expect(overflow.top).toBeGreaterThan(search.bottom);

    // The primary action sits in the bottom bar; the secondary one hides in the toolbar menu.
    const bar = canvasElement.querySelector<HTMLElement>(
      "[data-shell-bottom-bar]"
    );

    await expect(bar).not.toBeNull();
    await expect(
      within(bar!).getByRole("button", { name: "New local group" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add directory group" })
    ).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "More group actions" })
    );

    const addDirectory = await screen.findByRole("menuitem", {
      name: "Add directory group",
    });

    // The popup fades in from opacity 0.
    await waitFor(() => expect(addDirectory).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // The card leads with a kind tile, and the kind pill sits on the name's line.
    const first = within(list.getAllByRole("listitem")[0]!);
    const name = first.getByRole("button", { name: /Finance managers/ });
    const kind = first.getByText("Directory");

    await expect(
      first.getByRole("button", { name: /Finance managers/ })
    ).toBeVisible();
    await expect(
      Math.abs(
        name.getBoundingClientRect().top - kind.getBoundingClientRect().top
      )
    ).toBeLessThan(6);
    await expect(first.getByText(/2 members · 3 roles · synced/)).toBeVisible();

    // One member and one role read in the singular.
    await expect(list.getByText(/1 member · 0 roles/)).toBeInTheDocument();
    await expect(list.getByText(/0 members · 1 role/)).toBeInTheDocument();

    await userEvent.click(
      list.getByRole("button", { name: /Finance managers/ })
    );

    await expect(
      await screen.findByRole("dialog", { name: "Finance managers" })
    ).toBeInTheDocument();
  },
};

/** The card list in the dark theme, so axe reads the dark pairs at the phone width too. */
export const PhoneDark: Story = {
  globals: { theme: "dark", viewport: { value: "phone390", isRotated: false } },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    // Open the inspector, so that the a11y addon measures the sheet in the dark theme too.
    await userEvent.click(
      canvas.getByRole("button", { name: /Finance managers/ })
    );

    const inspector = await screen.findByRole("dialog", {
      name: "Finance managers",
    });

    await waitFor(() => expect(inspector).toBeVisible());
  },
};

export const ShowArchived: Story = {
  args: {
    includeArchived: true,
    groups: [...FIXTURE_GROUPS, fixtureArchived()],
  },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Groups" }));

    await expect(table.getByText("Ex-contractors")).toBeInTheDocument();
    await expect(table.getByText("Archived")).toBeInTheDocument();
  },
};

function fixtureArchived() {
  return {
    id: "g-archived",
    name: "Ex-contractors",
    description: "",
    source: "idp" as const,
    externalId: "Ex-contractors",
    displayLabel: null,
    memberCount: 0,
    assignmentCount: 2,
    lastSeenAt: "2025-06-01T10:00:00.000Z",
    archived: true,
    stale: false,
  };
}

export const AddDirectoryGroup: Story = {
  play: async ({ canvas }) => {
    onAddDirectoryGroup.mockClear();

    await userEvent.click(
      canvas.getByRole("button", { name: "Add directory group" })
    );

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add directory group" })
    );

    await userEvent.type(
      dialog.getByLabelText("Claim value"),
      "0a1b-object-id"
    );
    await userEvent.type(
      dialog.getByLabelText("Display label"),
      "Readable name"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add group" }));

    expect(onAddDirectoryGroup).toHaveBeenCalledWith(
      "0a1b-object-id",
      "Readable name"
    );
  },
};

const GROUP_EXISTS =
  "The group was not added. A group with that claim value already exists. Your change is kept.";

// U-1: a refused add keeps its dialog open, with the typed value and the refusal in its action bar.
export const AddDirectoryGroupRefusedStaysOpen: Story = {
  args: {
    onAddDirectoryGroup: fn(() => Promise.reject(new Error(GROUP_EXISTS))),
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Add directory group" })
    );

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add directory group" })
    );

    await userEvent.type(dialog.getByLabelText("Claim value"), "0a1b");
    await userEvent.click(dialog.getByRole("button", { name: "Add group" }));

    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      GROUP_EXISTS
    );
    await expect(dialog.getByLabelText("Claim value")).toHaveValue("0a1b");
  },
};

export const NewLocalGroupRefusedStaysOpen: Story = {
  args: {
    onCreateLocalGroup: fn(() =>
      Promise.reject(new Error("The local group was not created."))
    ),
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "New local group" })
    );

    const dialog = within(
      await screen.findByRole("dialog", { name: "New local group" })
    );

    await userEvent.type(dialog.getByLabelText("Name"), "Night shift");
    await userEvent.click(dialog.getByRole("button", { name: "Create group" }));

    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "The local group was not created."
    );
    await expect(dialog.getByLabelText("Name")).toHaveValue("Night shift");
  },
};

export const LabelShowsAndValueStaysInTheInspector: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Finance managers/ })
    );

    const inspector = within(
      await screen.findByRole("dialog", { name: "Finance managers" })
    );

    // The label names the header; the raw value stays visible (R-24c).
    await expect(
      inspector.getByText(/Value: "0a1b2c3d-ob-id"/)
    ).toBeInTheDocument();
  },
};

export const NotSeenGroupOffersDeleteNotArchive: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Sales/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Sales" })
    );

    await expect(
      inspector.getByRole("button", { name: "Delete group" })
    ).toBeInTheDocument();
    await expect(
      inspector.queryByRole("button", { name: "Archive group" })
    ).not.toBeInTheDocument();
  },
};

export const ArchiveConfirmNamesTheAssignmentCount: Story = {
  play: async ({ canvas }) => {
    onArchiveGroup.mockClear();

    await userEvent.click(
      canvas.getByRole("button", { name: /Finance managers/ })
    );
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Finance managers" })
      ).getByRole("button", { name: "Archive group" })
    );

    const confirm = within(
      await screen.findByRole("dialog", { name: "Archive Finance managers?" })
    );

    await expect(
      confirm.getByText(/3 assignments stop granting/)
    ).toBeInTheDocument();

    await userEvent.click(
      confirm.getByRole("button", { name: "Archive group" })
    );

    expect(onArchiveGroup).toHaveBeenCalledWith(FIXTURE_DIRECTORY.id);
  },
};

export const ArchiveConfirmUsesTheSingularForOne: Story = {
  args: { groups: [{ ...FIXTURE_DIRECTORY, assignmentCount: 1 }] },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Finance managers/ })
    );
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Finance managers" })
      ).getByRole("button", { name: "Archive group" })
    );

    const confirm = within(
      await screen.findByRole("dialog", { name: "Archive Finance managers?" })
    );

    await expect(
      confirm.getByText(/Its 1 assignment stops granting/)
    ).toBeInTheDocument();
  },
};

export const LastAdministratorBlocksArchiveWithTheReason: Story = {
  args: { lastAdministratorGroupIds: [FIXTURE_DIRECTORY.id] },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Finance managers/ })
    );

    const inspector = within(
      await screen.findByRole("dialog", { name: "Finance managers" })
    );

    const archive = inspector.getByRole("button", { name: "Archive group" });

    await expect(archive).toBeDisabled();
    await expect(
      inspector.getByText("This would leave no active tenant administrator")
    ).toBeInTheDocument();
  },
};

export const LocalGroupDeleteConfirmNamesBothCounts: Story = {
  play: async ({ canvas }) => {
    onDeleteLocalGroup.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Operations" })
    );

    // One role reads in the singular.
    await expect(
      inspector.getByText("1 role through this group")
    ).toBeInTheDocument();
    await userEvent.click(
      inspector.getByRole("button", { name: "Delete group" })
    );

    const confirm = within(
      await screen.findByRole("dialog", { name: "Delete Operations?" })
    );

    await expect(
      confirm.getByText(
        "2 members lose this membership and 1 role assignment is removed. This cannot be undone."
      )
    ).toBeInTheDocument();

    await userEvent.click(
      confirm.getByRole("button", { name: "Delete group" })
    );

    expect(onDeleteLocalGroup).toHaveBeenCalledWith(FIXTURE_LOCAL.id);
  },
};

export const EmptyLocalGroupDeleteConfirmCountsNothing: Story = {
  args: {
    groups: [{ ...FIXTURE_LOCAL, memberCount: 0, assignmentCount: 0 }],
    details: { [FIXTURE_LOCAL.id]: { members: [], assignments: [] } },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Operations" })
      ).getByRole("button", { name: "Delete group" })
    );

    const confirm = within(
      await screen.findByRole("dialog", { name: "Delete Operations?" })
    );

    await expect(confirm.queryByText(/lose this membership/)).toBeNull();
  },
};

export const Empty: Story = {
  args: { groups: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No groups match/)).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Clear search and filters" })
    ).toBeInTheDocument();
  },
};

export const AssignsARoleToAPreAddedGroup: Story = {
  play: async ({ canvas }) => {
    onAssignRole.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /^Sales/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Sales" })
    );

    await userEvent.click(inspector.getByRole("tab", { name: /^Roles/ }));
    await userEvent.click(
      inspector.getByRole("combobox", { name: "Give this group a role" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Auditor" })
    );
    await userEvent.click(
      inspector.getByRole("button", { name: "Assign role" })
    );

    expect(onAssignRole).toHaveBeenCalledWith("g-not-seen", "r-2");
  },
};

export const RemoveAllStaysVisibleWhenEveryoneIsAMember: Story = {
  args: {
    groups: [FIXTURE_LOCAL],
    people: FIXTURE_PEOPLE,
    details: {
      [FIXTURE_LOCAL.id]: { members: FIXTURE_MEMBERS, assignments: [] },
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Operations" })
    );

    // Every eligible person is already a member, so the picker is hidden, but Remove all stays.
    await expect(
      inspector.getByRole("button", { name: "Remove all" })
    ).toBeInTheDocument();
    await expect(
      inspector.queryByLabelText("Add members")
    ).not.toBeInTheDocument();
  },
};

export const ArchiveFromTheInspector: Story = {
  play: async ({ canvas }) => {
    onArchiveGroup.mockClear();

    await userEvent.click(
      canvas.getByRole("button", { name: /Finance managers/ })
    );

    const inspector = await screen.findByRole("dialog", {
      name: "Finance managers",
    });

    await userEvent.click(
      within(inspector).getByRole("button", { name: "Archive group" })
    );
    await screen.findByRole("dialog", { name: "Archive Finance managers?" });

    // One Escape closes only the confirm dialog, and focus returns to the control in the sheet.
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Archive Finance managers?" })
      ).not.toBeInTheDocument()
    );
    await expect(
      screen.getByRole("dialog", { name: "Finance managers" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(inspector).getByRole("button", { name: "Archive group" })
      ).toHaveFocus()
    );
    await expect(onArchiveGroup).not.toHaveBeenCalled();

    // The next Escape closes the sheet.
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  },
};

/** One search picks and adds: no second button between the pick and the write (fix list row 4). */
export const AddsAPersonInOneStep: Story = {
  args: {
    groups: [FIXTURE_LOCAL],
    people: [
      ...FIXTURE_PEOPLE,
      { id: "p-3", name: "Alan Turing", email: "alan@example.invalid" },
    ],
    details: {
      [FIXTURE_LOCAL.id]: { members: [FIXTURE_MEMBERS[0]!], assignments: [] },
    },
    onAddMembers: fn(),
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Operations" })
    );

    const search = inspector.getByRole("combobox", { name: "Add members" });

    await userEvent.type(search, "Alan");
    // The search narrows the list, so the other person who is not a member drops out.
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /Grace Hopper/ })).toBeNull()
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Alan Turing/ })
    );

    await expect(args.onAddMembers).toHaveBeenCalledWith("g-local", ["p-3"]);
    await expect(search).toHaveValue("");
  },
};

/** The members list: a header with its count and Remove all, and one remove per row (row 4). */
export const RemovesOneMemberFromTheGroup: Story = {
  args: { groups: [FIXTURE_LOCAL], onRemoveMembers: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Operations" })
    );

    const header = inspector.getByText("Members · 2");

    await expect(
      within(header.parentElement!).getByRole("button", { name: "Remove all" })
    ).toBeVisible();

    const members = within(inspector.getByRole("list", { name: "Members" }));
    const grace = within(members.getAllByRole("listitem")[1]!);

    // The avatar's initials, then the name over the email.
    await expect(grace.getByText("GH")).toBeInTheDocument();
    await expect(
      grace.getByText("Grace Hopper").getBoundingClientRect().bottom
    ).toBeLessThanOrEqual(
      grace.getByText("grace@example.invalid").getBoundingClientRect().top
    );

    await userEvent.click(
      grace.getByRole("button", { name: "Remove from group" })
    );

    // The capture confirms one removal first: nothing is written until the confirm agrees.
    await expect(args.onRemoveMembers).not.toHaveBeenCalled();

    const confirm = await screen.findByRole("dialog", {
      name: "Remove one person from Operations?",
    });

    await userEvent.click(
      within(confirm).getByRole("button", { name: "Remove" })
    );

    await expect(args.onRemoveMembers).toHaveBeenCalledWith("g-local", ["p-2"]);
  },
};

/** The access card names its roles and always offers a next step (row 2). */
export const AccessCardIsNeverADeadEnd: Story = {
  args: { groups: [FIXTURE_LOCAL] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Operations" })
    );

    await expect(
      inspector.getByText("1 role through this group")
    ).toBeInTheDocument();

    // The host passes no Access link, so the card opens the Roles tab instead.
    await userEvent.click(inspector.getByRole("button", { name: "See roles" }));

    await expect(
      inspector.getByRole("tab", { name: /^Roles/ })
    ).toHaveAttribute("aria-selected", "true");
  },
};

/** The header names the kind once, beside the name; the help sits under the access card (rows 1, 3). */
export const LocalHeaderNamesTheKindOnce: Story = {
  args: { groups: [FIXTURE_LOCAL] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const dialog = await screen.findByRole("dialog", { name: "Operations" });
    const inspector = within(dialog);
    const title = inspector.getByRole("heading", { name: "Operations" });
    const pill = inspector.getByText("Local");

    await expect(
      Math.abs(
        title.getBoundingClientRect().top - pill.getBoundingClientRect().top
      )
    ).toBeLessThan(8);
    await expect(inspector.queryByText(/Local group/)).toBeNull();

    const card = inspector.getByText("1 role through this group");

    const help = inspector.getByRole("button", {
      name: "How group access works",
    });

    const tabs = inspector.getByRole("tablist", { name: "Group detail" });

    await expect(help.getBoundingClientRect().top).toBeGreaterThan(
      card.getBoundingClientRect().bottom
    );
    await expect(help.getBoundingClientRect().bottom).toBeLessThan(
      tabs.getBoundingClientRect().top
    );
  },
};

/** Delete is an outline with red text, not a solid red button (row 5). */
export const DeleteIsAnOutlineWithRedText: Story = {
  args: { groups: [FIXTURE_LOCAL] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Operations" })
    );

    const remove = getComputedStyle(
      inspector.getByRole("button", { name: "Delete group" })
    );

    const edit = getComputedStyle(
      inspector.getByRole("button", { name: "Edit name and description" })
    );

    await expect(remove.backgroundColor).toBe(edit.backgroundColor);
    // The destructive token as text (red-600), not white on a red fill.
    await expect(remove.color).toBe("rgb(220, 38, 38)");
  },
};

/** The local group inspector at the phone width, with the add-members search, for axe. */
export const InspectorPhone: Story = {
  // One person who is not a member, so the add-members search renders too.
  args: {
    groups: [FIXTURE_LOCAL],
    people: [
      ...FIXTURE_PEOPLE,
      {
        id: "p-3",
        name: "Alan Turing",
        email: "alan.mathison.turing@example.invalid",
      },
    ],
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const dialog = await screen.findByRole("dialog", { name: "Operations" });

    await waitFor(() => expect(dialog).toBeVisible());
  },
};

/** The inspector in the dark theme at the phone width, for axe. */
export const InspectorPhoneDark: Story = {
  args: { groups: [FIXTURE_LOCAL] },
  globals: { theme: "dark", viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Operations/ }));

    const dialog = await screen.findByRole("dialog", { name: "Operations" });

    await waitFor(() => expect(dialog).toBeVisible());
  },
};
