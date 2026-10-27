import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  FIXTURE_DETAILS,
  FIXTURE_JIT_SETTINGS,
  FIXTURE_PEOPLE,
  FIXTURE_ROLES,
  FIXTURE_SETTINGS,
  FIXTURE_SOLE_ADMIN_PERSON_ID,
  FIXTURE_VIEWER,
} from "./__fixtures__/people.ts";
import { PeopleScreen, SELF_REASON } from "./people-screen.tsx";
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
    const table = within(canvas.getByRole("table", { name: "People" }));

    await expect(table.getByText("Ada Admin")).toBeInTheDocument();
    await expect(table.getByText("Leo Local")).toBeInTheDocument();
    await expect(table.getByText("Bea Brokered")).toBeInTheDocument();

    // The three statuses render as pills.
    await expect(table.getAllByText("Active").length).toBeGreaterThan(0);
    await expect(table.getAllByText("Pending").length).toBe(2);
    await expect(table.getByText("Disabled")).toBeInTheDocument();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const list = within(canvas.getByRole("list", { name: "People" }));

    await expect(canvas.queryByRole("table")).toBeNull();
    // The toolbar and a long email must not push the page sideways.
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
    await expect(
      list.getByRole("button", { name: "Actions for ada@example.com" })
    ).toBeInTheDocument();
    // One role reads in the singular.
    await expect(list.getAllByText(/^1 role · /).length).toBeGreaterThan(0);

    await userEvent.click(list.getByRole("button", { name: /Leo Local/ }));

    await expect(
      await screen.findByRole("dialog", { name: "Leo Local" })
    ).toBeInTheDocument();
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

    const search = canvas.getByRole("textbox", { name: "Search people" });

    await expect(search).toHaveAttribute("placeholder", "Search people");
    await expect(search.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      300
    );
  },
};

/** UI-1 People findings 1 and 4: the initials sit beside the name, and the placeholder shows on desktop. */
export const DesktopRowShowsTheAvatarBesideTheName: Story = {
  parameters: {
    viewport: {
      options: {
        desktop1440: {
          name: "Desktop 1440",
          styles: { width: "1440px", height: "900px" },
          type: "desktop",
        },
      },
    },
  },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(1440);
    await expect(
      canvas.getByRole("textbox", { name: "Search people" })
    ).toHaveAttribute("placeholder", "Search people");

    const table = within(canvas.getByRole("table", { name: "People" }));
    const avatar = table.getByText("AA").getBoundingClientRect();
    const name = table.getByText("Ada Admin").getBoundingClientRect();

    await expect(avatar.right).toBeLessThanOrEqual(name.left);
    await expect(avatar.bottom).toBeGreaterThan(name.top);
    await expect(avatar.top).toBeLessThan(name.bottom);
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    // Open the inspector, so that the a11y addon measures the sheet in the dark theme too.
    await userEvent.click(canvas.getByRole("button", { name: /Ada Admin/ }));

    const inspector = await screen.findByRole("dialog", { name: "Ada Admin" });

    await waitFor(() => expect(inspector).toBeVisible());
  },
};

/** An audit target link opens the screen with that person selected (6wz1.26). */
export const OpensTheLinkedPerson: Story = {
  args: { initialSelectedId: "u-leo" },
  play: async () => {
    const inspector = await screen.findByRole("dialog", { name: "Leo Local" });

    await waitFor(() => expect(inspector).toBeVisible());
  },
};

export const RowMenuNamesTheRefusal: Story = {
  play: async ({ canvas }) => {
    onRemovePerson.mockClear();

    // The viewer's own row keeps Disable and Remove, refused with the server's reason (R-38).
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for ada@example.com" })
    );

    for (const name of ["Disable", "Remove"]) {
      // oxlint-disable-next-line no-await-in-loop -- one menu item at a time.
      const item = await screen.findByRole("menuitem", { name });

      // oxlint-disable-next-line no-await-in-loop -- one menu item at a time.
      await expect(item).toHaveAttribute("aria-disabled", "true");
      // oxlint-disable-next-line no-await-in-loop -- one menu item at a time.
      await expect(item).toHaveAccessibleDescription(SELF_REASON);
    }

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );

    // Another row's Remove confirms at screen level before it fires.
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for dan@example.com" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Re-enable" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for dan@example.com" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" })
    );

    const confirm = within(
      await screen.findByRole("dialog", { name: "Remove Dan Disabled?" })
    );

    await userEvent.click(
      confirm.getByRole("button", { name: "Remove person" })
    );

    expect(onEnablePerson).toHaveBeenCalledWith("u-dan");
    expect(onRemovePerson).toHaveBeenCalledWith("u-dan");
  },
};

export const RowMenuConfirmReturnsFocusToTheMenu: Story = {
  play: async ({ canvas }) => {
    onDisablePerson.mockClear();

    const trigger = canvas.getByRole("button", {
      name: "Actions for bea@example.com",
    });

    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Disable" })
    );
    await screen.findByRole("dialog", { name: "Disable Bea Brokered?" });

    // Escape cancels the confirm, and keyboard focus goes back to the row's menu (primitives L-5).
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(onDisablePerson).not.toHaveBeenCalled();
  },
};

export const DisableFromTheInspector: Story = {
  play: async ({ canvas }) => {
    onDisablePerson.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Bea Brokered/ }));

    const inspector = await screen.findByRole("dialog", {
      name: "Bea Brokered",
    });

    await userEvent.click(
      within(inspector).getByRole("button", { name: "Disable" })
    );
    await screen.findByRole("dialog", { name: "Disable Bea Brokered?" });

    // One Escape closes only the confirm dialog, and focus returns to the control in the sheet.
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Disable Bea Brokered?" })
      ).not.toBeInTheDocument()
    );
    await expect(
      screen.getByRole("dialog", { name: "Bea Brokered" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(inspector).getByRole("button", { name: "Disable" })
      ).toHaveFocus()
    );
    await expect(onDisablePerson).not.toHaveBeenCalled();

    // Confirming fires the write.
    await userEvent.click(
      within(inspector).getByRole("button", { name: "Disable" })
    );
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Disable Bea Brokered?" })
      ).getByRole("button", { name: "Disable" })
    );
    await expect(onDisablePerson).toHaveBeenCalledWith("u-bea");

    // The next Escape closes the sheet.
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Disable Bea Brokered?" })
      ).not.toBeInTheDocument()
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
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

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

    await userEvent.type(dialog.getByLabelText("Email"), "new@example.com");
    await userEvent.type(dialog.getByLabelText("Display name"), "New Person");
    await userEvent.click(dialog.getByRole("combobox", { name: "Roles" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "E2E reader" })
    );
    await userEvent.keyboard("{Escape}");
    // The trigger names the picked role, not its id.
    await expect(
      dialog.getByRole("combobox", { name: "Roles" })
    ).toHaveTextContent("E2E reader");

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

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

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

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

    await userEvent.type(dialog.getByLabelText("Email"), "local@example.com");
    await userEvent.click(
      dialog.getByRole("radio", { name: "Local password" })
    );

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

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

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

    const inspector = within(
      await screen.findByRole("dialog", { name: "Leo Local" })
    );

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
      await screen.findByRole("dialog", { name: "Bea Brokered" })
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

    const inspector = within(
      await screen.findByRole("dialog", { name: "Ada Admin" })
    );

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
      await screen.findByRole("dialog", { name: "Dan Disabled" })
    );

    await userEvent.click(inspector.getByRole("button", { name: /Remove/ }));

    const confirm = within(
      await screen.findByRole("dialog", { name: "Remove Dan Disabled?" })
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
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by status" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Pending" })
    );

    const table = within(canvas.getByRole("table", { name: "People" }));

    await expect(table.getByText("Leo Local")).toBeInTheDocument();
    await expect(table.getByText("Bea Brokered")).toBeInTheDocument();
    await expect(table.queryByText("Ada Admin")).not.toBeInTheDocument();

    // The active filter renders as a removable chip with a Clear all.
    await expect(canvas.getByText("Status: Pending")).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove filter Status: Pending" })
    );

    await expect(table.getByText("Ada Admin")).toBeInTheDocument();
  },
};

export const SearchNarrowsTheList: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Search people"), "bea");

    const table = within(canvas.getByRole("table", { name: "People" }));

    await expect(table.getByText("Bea Brokered")).toBeInTheDocument();
    await expect(table.queryByText("Ada Admin")).not.toBeInTheDocument();
  },
};

/**
 * A host that refuses Add person the way the People route does: it sets the catalogue message on
 * `error` and rejects the promise.
 */
function RefusingHost(props: PeopleScreenProps) {
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <PeopleScreen
      {...props}
      error={error}
      onAddPerson={async (input) => {
        await props.onAddPerson?.(input);
        setError("A person with that email already exists.");

        throw new Error("email-taken");
      }}
    />
  );
}

export const AddPersonRefusedOnSubmitStaysOpen: Story = {
  render: (args) => <RefusingHost {...args} />,
  play: async ({ canvas }) => {
    onAddPerson.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

    await userEvent.type(dialog.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    await expect(onAddPerson).toHaveBeenCalled();

    // The refusal is shown inside the dialog, which stays open with the typed address.
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "already exists"
    );
    await expect(
      screen.getByRole("dialog", { name: "Add person" })
    ).toBeInTheDocument();
    await expect(dialog.getByLabelText("Email")).toHaveValue("ada@example.com");
    // The page does not repeat it behind the dialog.
    await expect(screen.getAllByText(/already exists/)).toHaveLength(1);
  },
};

export const AddPersonRateLimitedNamesTheWait: Story = {
  args: {
    error:
      "Too many attempts in a short time. Wait a few minutes and try again. Try again in 5 minutes.",
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

    await expect(dialog.getByRole("alert")).toHaveTextContent(
      "Try again in 5 minutes."
    );
  },
};

export const AddPersonPartialSuccessNotice: Story = {
  args: { notice: "Person added; the email was not sent. Use Resend." },
  play: async ({ canvas }) => {
    // A committed add whose email failed is a status notice, not an error.
    await expect(canvas.getByRole("status")).toHaveTextContent("Use Resend");
  },
};

export const RolePickerHiddenWithoutTheRolesPermission: Story = {
  args: { canAssignRoles: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

    await expect(dialog.queryByLabelText("Roles")).not.toBeInTheDocument();
  },
};
