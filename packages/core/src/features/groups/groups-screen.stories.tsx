import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  FIXTURE_ASSIGNMENTS,
  FIXTURE_DIRECTORY,
  FIXTURE_GROUPS,
  FIXTURE_LOCAL,
  FIXTURE_MEMBERS,
  FIXTURE_NOT_SEEN,
  FIXTURE_PEOPLE,
  FIXTURE_VIEWER,
} from "./__fixtures__/groups.ts";
import { GroupsScreen } from "./groups-screen.tsx";
import type { GroupsScreenProps } from "./types.ts";

const onAddDirectoryGroup = fn();

const onArchiveGroup = fn();

const onDeleteGroup = fn();

const onDeleteLocalGroup = fn();

const onCreateLocalGroup = fn();

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
  } satisfies GroupsScreenProps,
} satisfies Meta<typeof GroupsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Finance managers")).toBeInTheDocument();
    await expect(canvas.getAllByText("Not seen yet").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Stale").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Operations")).toBeInTheDocument();

    // The archived group stays behind the Show archived toggle.
    await expect(canvas.queryByText("Ex-contractors")).not.toBeInTheDocument();
  },
};

export const ShowArchived: Story = {
  args: {
    includeArchived: true,
    groups: [...FIXTURE_GROUPS, fixtureArchived()],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ex-contractors")).toBeInTheDocument();
    await expect(canvas.getByText("Archived")).toBeInTheDocument();
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
      canvas.getByRole("dialog", { name: "Add directory group" })
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
      canvas.getByRole("dialog", { name: "Finance managers" })
    );

    // The label names the header; the raw value stays visible (R-24c).
    await expect(
      inspector.getByText(/Value: 0a1b2c3d-ob-id/)
    ).toBeInTheDocument();
  },
};

export const NotSeenGroupOffersDeleteNotArchive: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Sales/ }));

    const inspector = within(canvas.getByRole("dialog", { name: "Sales" }));

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
        canvas.getByRole("dialog", { name: "Finance managers" })
      ).getByRole("button", { name: "Archive group" })
    );

    const confirm = within(
      canvas.getByRole("dialog", { name: "Archive Finance managers?" })
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

export const LastAdministratorBlocksArchiveWithTheReason: Story = {
  args: { lastAdministratorGroupIds: [FIXTURE_DIRECTORY.id] },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Finance managers/ })
    );

    const inspector = within(
      canvas.getByRole("dialog", { name: "Finance managers" })
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
    await userEvent.click(
      within(canvas.getByRole("dialog", { name: "Operations" })).getByRole(
        "button",
        { name: "Delete group" }
      )
    );

    const confirm = within(
      canvas.getByRole("dialog", { name: "Delete Operations?" })
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

export const Empty: Story = {
  args: { groups: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No groups match/)).toBeInTheDocument();
  },
};

export const NotSeenFixtureIsTheOnlyNotSeen: Story = {
  args: { groups: [FIXTURE_NOT_SEEN] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Sales")).toBeInTheDocument();
    await expect(canvas.getByText("Not seen yet")).toBeInTheDocument();
  },
};
