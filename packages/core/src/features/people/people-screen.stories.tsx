import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  FIXTURE_DETAILS,
  FIXTURE_JIT_SETTINGS,
  FIXTURE_PEOPLE,
  FIXTURE_ROLES,
  FIXTURE_SETTINGS,
  FIXTURE_SOLE_ADMIN_PERSON_ID,
  FIXTURE_VIEWER,
} from "./__fixtures__/people.ts";
import { PeopleScreen } from "./people-screen.tsx";
import type { PeopleScreenProps } from "./types.ts";

const onAddPerson = fn();

const onDisablePerson = fn();

const onEnablePerson = fn();

const onRemovePerson = fn();

const onResendSetPassword = fn();

const onResendInvitation = fn();

/**
 * The People directory (R-37 to R-43). The host owns the data and the writes, so each destructive
 * story asserts the confirm copy before the callback fires, and the callback spies prove the
 * screen routes the action the design names. A story asserts presentation only; the real
 * authorization is proved by the router's database-backed tests.
 */
const meta = {
  title: "Core/People",
  component: PeopleScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The People directory and inspector. Add person writes the person and the picked roles together; a local account's password is set by the realm's own email. Remove revokes access and keeps the audit trail. The break-glass account never appears here.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    people: FIXTURE_PEOPLE,
    viewer: FIXTURE_VIEWER,
    settings: FIXTURE_SETTINGS,
    roles: FIXTURE_ROLES,
    details: FIXTURE_DETAILS,
    lastAdministratorPersonIds: [],
    onAddPerson,
    onDisablePerson,
    onEnablePerson,
    onRemovePerson,
    onResendSetPassword,
    onResendInvitation,
  } satisfies PeopleScreenProps,
} satisfies Meta<typeof PeopleScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ada Admin")).toBeInTheDocument();
    await expect(canvas.getByText("Leo Local")).toBeInTheDocument();
    await expect(canvas.getByText("Bea Brokered")).toBeInTheDocument();

    // The three statuses render as pills.
    await expect(canvas.getAllByText("Active").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Pending").length).toBe(2);
    await expect(canvas.getByText("Disabled")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { people: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No people match/)).toBeInTheDocument();
  },
};

export const ErrorState: Story = {
  args: { people: [], error: "The people could not be read." },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "The people could not be read."
    );
  },
};

export const AddPersonSendsTheInvitationByDefault: Story = {
  play: async ({ canvas }) => {
    onAddPerson.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(canvas.getByRole("dialog", { name: "Add person" }));

    await userEvent.type(dialog.getByLabelText("Email"), "new@example.com");
    await userEvent.type(dialog.getByLabelText("Display name"), "New Person");
    await userEvent.selectOptions(dialog.getByLabelText("Roles"), "r-reader");

    // R-40a: the invitation checkbox is checked by default.
    const invitation = dialog.getByRole("checkbox", {
      name: "Send invitation email",
    });

    await expect(invitation).toBeChecked();

    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    expect(onAddPerson).toHaveBeenCalledWith({
      email: "new@example.com",
      name: "New Person",
      roleIds: ["r-reader"],
      accountType: "brokered",
      sendInvitation: true,
    });
  },
};

export const UncheckedInvitationSendsNoEmail: Story = {
  play: async ({ canvas }) => {
    onAddPerson.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(canvas.getByRole("dialog", { name: "Add person" }));

    await userEvent.type(dialog.getByLabelText("Email"), "quiet@example.com");
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Send invitation email" })
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    expect(onAddPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "quiet@example.com",
        sendInvitation: false,
      })
    );
  },
};

export const AddLocalAccountNotesTheSetPasswordEmail: Story = {
  play: async ({ canvas }) => {
    onAddPerson.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(canvas.getByRole("dialog", { name: "Add person" }));

    await userEvent.type(dialog.getByLabelText("Email"), "local@example.com");
    await userEvent.click(dialog.getByLabelText("Local password"));

    await expect(
      dialog.getByText("A separate email sets this person's password.")
    ).toBeInTheDocument();

    // A local account has no invitation checkbox; the realm sends the set-password email.
    await expect(
      dialog.queryByRole("checkbox", { name: "Send invitation email" })
    ).not.toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    expect(onAddPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "local@example.com",
        accountType: "local",
      })
    );
  },
};

export const JitModeNoteExplainsSelfAdmission: Story = {
  args: { settings: FIXTURE_JIT_SETTINGS },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(canvas.getByRole("dialog", { name: "Add person" }));

    await expect(
      dialog.getByText(
        "People in a group mapped to a role can also sign in without being added here."
      )
    ).toBeInTheDocument();
  },
};

export const PendingLocalOffersResendSetPassword: Story = {
  play: async ({ canvas }) => {
    onResendSetPassword.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Leo Local/ }));

    const inspector = within(canvas.getByRole("dialog", { name: "Leo Local" }));

    await expect(
      inspector.getByText("A separate email sets this person's password.")
    ).toBeInTheDocument();
    await expect(inspector.getByText(/Last sent/)).toBeInTheDocument();

    // A local account never offers resend invitation.
    await expect(
      inspector.queryByRole("button", { name: "Resend invitation" })
    ).not.toBeInTheDocument();

    await userEvent.click(
      inspector.getByRole("button", { name: "Resend set-password email" })
    );

    expect(onResendSetPassword).toHaveBeenCalledWith("u-leo");
  },
};

export const PendingBrokeredOffersResendInvitation: Story = {
  play: async ({ canvas }) => {
    onResendInvitation.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Bea Brokered/ }));

    const inspector = within(
      canvas.getByRole("dialog", { name: "Bea Brokered" })
    );

    await expect(
      inspector.queryByRole("button", { name: "Resend set-password email" })
    ).not.toBeInTheDocument();

    await userEvent.click(
      inspector.getByRole("button", { name: "Resend invitation" })
    );

    expect(onResendInvitation).toHaveBeenCalledWith("u-bea");
  },
};

export const SelfAndLastAdministratorDisableIsBlocked: Story = {
  args: { lastAdministratorPersonIds: [FIXTURE_SOLE_ADMIN_PERSON_ID] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Ada Admin/ }));

    const inspector = within(canvas.getByRole("dialog", { name: "Ada Admin" }));

    await expect(
      inspector.getByRole("button", { name: "Disable" })
    ).toBeDisabled();
    await expect(
      inspector.getByRole("button", { name: "Remove" })
    ).toBeDisabled();
    await expect(
      inspector.getByText("You cannot disable or remove yourself")
    ).toBeInTheDocument();
  },
};

export const RemoveConfirmsBeforeItFires: Story = {
  play: async ({ canvas }) => {
    onRemovePerson.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Dan Disabled/ }));

    const inspector = within(
      canvas.getByRole("dialog", { name: "Dan Disabled" })
    );

    await userEvent.click(inspector.getByRole("button", { name: /Remove/ }));

    const confirm = within(
      canvas.getByRole("dialog", { name: "Remove Dan Disabled?" })
    );

    await expect(confirm.getByText(/Every session ends/)).toBeInTheDocument();

    await userEvent.click(
      confirm.getByRole("button", { name: "Remove person" })
    );

    expect(onRemovePerson).toHaveBeenCalledWith("u-dan");
  },
};

export const StatusFilterNarrowsTheList: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(
      canvas.getByLabelText("Filter by status"),
      "pending"
    );

    await expect(canvas.getByText("Leo Local")).toBeInTheDocument();
    await expect(canvas.getByText("Bea Brokered")).toBeInTheDocument();
    await expect(canvas.queryByText("Ada Admin")).not.toBeInTheDocument();

    // The active filter renders as a removable chip with a Clear all.
    await expect(canvas.getByText("Status: Pending")).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove filter Status: Pending" })
    );

    await expect(canvas.getByText("Ada Admin")).toBeInTheDocument();
  },
};

export const SearchNarrowsTheList: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Search people"), "bea");

    await expect(canvas.getByText("Bea Brokered")).toBeInTheDocument();
    await expect(canvas.queryByText("Ada Admin")).not.toBeInTheDocument();
  },
};
