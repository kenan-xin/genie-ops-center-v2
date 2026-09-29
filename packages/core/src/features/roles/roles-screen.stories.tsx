import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  FIXTURE_CATALOGUE,
  FIXTURE_CUSTOM_DETAIL,
  FIXTURE_ROLES,
  FIXTURE_SYSTEM_DETAIL,
  FIXTURE_TWO_UNAVAILABLE_DETAIL,
  FIXTURE_VIEWER,
} from "./__fixtures__/roles.ts";
import { RolesScreen } from "./roles-screen.tsx";
import type { RolesScreenProps } from "./types.ts";

const onCreateRole = fn();

const onUpdateRole = fn();

const onDeleteRole = fn();

/**
 * The Roles directory and detail (R-33, R-33b). System roles are read-only and copyable; custom
 * roles are editable. The detail warns on a key the catalogue no longer holds and lets a custom
 * role remove it without deleting the role or its assignments.
 */
const meta = {
  title: "Core/Roles",
  component: RolesScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Roles directory. It edits role definitions only; who holds a role is decided in Access, the one assignment writer.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    roles: FIXTURE_ROLES,
    viewer: FIXTURE_VIEWER,
    catalogue: FIXTURE_CATALOGUE,
    selectedRoleId: null,
    onSelectRole: fn(),
    onCreateRole,
    onUpdateRole,
    onDeleteRole,
  } satisfies RolesScreenProps,
} satisfies Meta<typeof RolesScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Tenant administrator")).toBeInTheDocument();
    await expect(canvas.getByText("Invoice approver")).toBeInTheDocument();
    await expect(canvas.getByText("System · core")).toBeInTheDocument();
    await expect(canvas.getByText("Custom")).toBeInTheDocument();
  },
};

export const SystemRoleIsReadOnlyAndCopyable: Story = {
  args: {
    selectedRoleId: FIXTURE_SYSTEM_DETAIL.id,
    detail: FIXTURE_SYSTEM_DETAIL,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /Copy role/ })
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /Edit role/ })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /Delete role/ })
    ).not.toBeInTheDocument();
    // The admin key added by entitlement is marked.
    await expect(canvas.getByText("Added by entitlement")).toBeInTheDocument();
  },
};

export const CopyPrefillsTheKeysAndCreatesACustomRole: Story = {
  args: {
    selectedRoleId: FIXTURE_SYSTEM_DETAIL.id,
    detail: FIXTURE_SYSTEM_DETAIL,
  },
  play: async ({ canvas }) => {
    onCreateRole.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Copy role/ }));

    const dialog = within(canvas.getByRole("dialog", { name: "Copy role" }));

    await expect(dialog.getByLabelText("Role name")).toHaveValue(
      "Tenant administrator copy"
    );
    // The source's keys arrive ticked.
    await expect(
      dialog.getByRole("checkbox", { name: /Administer the fixture/ })
    ).toBeChecked();

    await userEvent.clear(dialog.getByLabelText("Role name"));
    await userEvent.type(
      dialog.getByLabelText("Role name"),
      "Administrator copy"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create role" }));

    expect(onCreateRole).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Administrator copy",
        permissions: expect.arrayContaining(["fixture:admin"]),
      })
    );
  },
};

export const CustomRoleIsEditable: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /Edit role/ })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /Delete role/ })
    ).toBeInTheDocument();
  },
};

export const UnavailableKeyWarnsAndCanBeRemoved: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
  },
  play: async ({ canvas }) => {
    onUpdateRole.mockClear();

    await expect(
      canvas.getByText("Unavailable, this key grants nothing")
    ).toBeInTheDocument();
    await expect(canvas.getByText("retired:key")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));

    expect(onUpdateRole).toHaveBeenCalledWith(FIXTURE_CUSTOM_DETAIL.id, {
      name: "Invoice approver",
      description: "Approves invoices",
      permissions: ["fixture:use"],
    });
  },
};

export const DeleteCustomRoleConfirms: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
  },
  play: async ({ canvas }) => {
    onDeleteRole.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Delete role/ }));

    const confirm = within(
      canvas.getByRole("dialog", { name: "Delete Invoice approver?" })
    );

    await expect(
      confirm.getByText(/1 assignment go with it/)
    ).toBeInTheDocument();

    await userEvent.click(confirm.getByRole("button", { name: "Delete role" }));

    expect(onDeleteRole).toHaveBeenCalledWith(FIXTURE_CUSTOM_DETAIL.id);
  },
};

export const NewRoleForm: Story = {
  play: async ({ canvas }) => {
    onCreateRole.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /New role/ }));

    const dialog = within(canvas.getByRole("dialog", { name: "New role" }));

    await userEvent.type(dialog.getByLabelText("Role name"), "Support agent");
    // The picker offers the declared catalogue, so a new role can actually carry a permission.
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Use the fixture" })
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create role" }));

    expect(onCreateRole).toHaveBeenCalledWith({
      name: "Support agent",
      description: "",
      permissions: ["fixture:use"],
    });
  },
};

export const EditRoleDispatchesUpdate: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
  },
  play: async ({ canvas }) => {
    onUpdateRole.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Edit role/ }));

    const dialog = within(canvas.getByRole("dialog", { name: "Edit role" }));

    await userEvent.clear(dialog.getByLabelText("Role name"));
    await userEvent.type(
      dialog.getByLabelText("Role name"),
      "Invoice approver v2"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save role" }));

    expect(onUpdateRole).toHaveBeenCalledWith(
      FIXTURE_CUSTOM_DETAIL.id,
      expect.objectContaining({ name: "Invoice approver v2" })
    );
    expect(onCreateRole).not.toHaveBeenCalled();
  },
};

export const TwoUnavailableKeysRemoveOnlyTheClicked: Story = {
  args: {
    selectedRoleId: FIXTURE_TWO_UNAVAILABLE_DETAIL.id,
    detail: FIXTURE_TWO_UNAVAILABLE_DETAIL,
  },
  play: async ({ canvas }) => {
    onUpdateRole.mockClear();

    // Each unavailable key of a custom role carries its own Remove; the first is retired:one.
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Remove" })[0]!
    );

    expect(onUpdateRole).toHaveBeenCalledWith(
      FIXTURE_TWO_UNAVAILABLE_DETAIL.id,
      expect.objectContaining({
        permissions: ["fixture:use", "retired:two"],
      })
    );
  },
};

export const Empty: Story = {
  args: { roles: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No roles match.")).toBeInTheDocument();
  },
};
