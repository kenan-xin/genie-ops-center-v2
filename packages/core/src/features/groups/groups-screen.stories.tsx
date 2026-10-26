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
  } satisfies GroupsScreenProps,
} satisfies Meta<typeof GroupsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

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

/** An audit target link opens the screen with that group selected (6wz1.26). */
export const OpensTheLinkedGroup: Story = {
  args: { initialSelectedId: "g-local" },
  play: async () => {
    const inspector = await screen.findByRole("dialog", { name: "Operations" });

    await waitFor(() => expect(inspector).toBeVisible());
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const list = within(canvas.getByRole("list", { name: "Groups" }));

    await expect(canvas.queryByRole("table")).toBeNull();
    // A long unbroken value must not push the page sideways.
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
    // One member and one role read in the singular.
    await expect(list.getByText("1 member · 0 roles")).toBeInTheDocument();
    await expect(list.getByText("0 members · 1 role")).toBeInTheDocument();

    await userEvent.click(
      list.getByRole("button", { name: /Finance managers/ })
    );

    await expect(
      await screen.findByRole("dialog", { name: "Finance managers" })
    ).toBeInTheDocument();
  },
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

    // One grant reads in the singular.
    await expect(
      inspector.getByText("1 grant reaches this group today.")
    ).toBeInTheDocument();
    await userEvent.click(
      inspector.getByRole("button", { name: "Delete group" })
    );

    const confirm = within(
      await screen.findByRole("dialog", { name: "Delete Operations?" })
    );

    await expect(
      confirm.getByText(/2 members and 1 role assignment go with it/)
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

    await expect(confirm.queryByText(/go with it/)).toBeNull();
  },
};

export const Empty: Story = {
  args: { groups: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No groups match/)).toBeInTheDocument();
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
      inspector.queryByLabelText("Add to group")
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

export const AddsEveryPickedPerson: Story = {
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

    await userEvent.click(
      inspector.getByRole("combobox", { name: "Add to group" })
    );
    await userEvent.click(
      await screen.findByRole("option", {
        name: "Grace Hopper (grace@example.invalid)",
      })
    );
    await userEvent.click(
      await screen.findByRole("option", {
        name: "Alan Turing (alan@example.invalid)",
      })
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(inspector.getByRole("button", { name: "Add 2" }));

    expect(args.onAddMembers).toHaveBeenCalledWith("g-local", ["p-2", "p-3"]);
  },
};
