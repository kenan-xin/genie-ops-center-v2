import type { ThemeName } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  FIXTURE_CATALOGUE,
  FIXTURE_CUSTOM_DETAIL,
  FIXTURE_DISABLED_MODULE_DETAIL,
  FIXTURE_ROLES,
  FIXTURE_SYSTEM_ROLE,
  FIXTURE_SYSTEM_DETAIL,
  FIXTURE_TWO_UNAVAILABLE_DETAIL,
  FIXTURE_VIEWER,
  HOLDERS_NONE,
  HOLDERS_THREE,
  HOLDERS_TWELVE,
} from "./__fixtures__/roles.ts";
import { RolesScreen } from "./roles-screen.tsx";
import type { RolesScreenProps } from "./types.ts";

const onCreateRole = fn();

const onUpdateRole = fn();

const onDeleteRole = fn();

const onRemoveUnavailableKey = fn();

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
    searchLabel: "Search roles",
    noMatch: {
      title: "No roles match",
      description: "Clear the search to see every role.",
      clearLabel: "Clear search and filters",
    },
    roles: FIXTURE_ROLES,
    viewer: FIXTURE_VIEWER,
    catalogue: FIXTURE_CATALOGUE,
    selectedRoleId: null,
    onSelectRole: fn(),
    onCreateRole,
    onUpdateRole,
    onDeleteRole,
    onRemoveUnavailableKey,
  } satisfies RolesScreenProps,
} satisfies Meta<typeof RolesScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The help sits beside the search as an icon, named by its topic (people-groups-and-roles spec). */
export const HelpIsIconOnly: Story = {
  play: async ({ canvas }) => {
    const help = canvas.getByRole("button", { name: "How roles work" });

    await expect(help.textContent).toBe("");
  },
};

export const Default: Story = {
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Roles" }));

    await expect(table.getByText("Tenant administrator")).toBeInTheDocument();
    await expect(table.getByText("Invoice approver")).toBeInTheDocument();
    await expect(table.getByText("System · Core")).toBeInTheDocument();
    await expect(table.getByText("Custom")).toBeInTheDocument();
    await expect(canvas.getByPlaceholderText("Search roles")).toBeVisible();
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

    const search = canvas.getByRole("textbox", { name: "Search roles" });

    await expect(search.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      300
    );

    // The icon-only help stays beside the search, not on a row of its own.
    const field = search.getBoundingClientRect();

    const help = canvas
      .getByRole("button", { name: "How roles work" })
      .getBoundingClientRect();

    await expect(help.top + help.height / 2).toBeGreaterThan(field.top);
    await expect(help.top + help.height / 2).toBeLessThan(field.bottom);
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ args, canvas, canvasElement }) => {
    const list = within(canvas.getByRole("list", { name: "Roles" }));

    await expect(window.innerWidth).toBe(390);
    await expect(canvas.queryByRole("table")).toBeNull();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );

    // G49: the card carries the role's description, as the table row does.
    await expect(
      list.getByText("Full administration of this tenant")
    ).toBeVisible();

    // One assignment reads in the singular.
    await expect(
      list.getByText("2 permissions · 1 assignment")
    ).toBeInTheDocument();

    // The card leads with a tile, and the kind pill shares the name's line.
    const cards = list.getAllByRole("listitem");
    const first = within(cards[0]!);
    const name = first.getByRole("button", { name: /^Tenant administrator/ });
    // G56: the phone card says only "System", as the mockup does.
    const kind = first.getByText("System", { exact: true });

    await expect(
      new Set(cards.map((card) => card.getBoundingClientRect().height)).size
    ).toBeLessThanOrEqual(2);
    await expect(
      cards[0]!.querySelector("[data-slot=icon-tile]")
    ).not.toBeNull();
    await expect(
      Math.abs(
        name.getBoundingClientRect().top - kind.getBoundingClientRect().top
      )
    ).toBeLessThan(6);

    // The primary action sits in the phone's bottom bar.
    const bar = canvasElement.querySelector<HTMLElement>(
      "[data-shell-bottom-bar]"
    );

    await expect(bar).not.toBeNull();
    await expect(
      within(bar!).getByRole("button", { name: "New role" })
    ).toBeVisible();

    await userEvent.click(
      list.getByRole("button", { name: /^Tenant administrator/ })
    );

    expect(args.onSelectRole).toHaveBeenCalledWith("r-tenant-admin");
  },
};

/** The card list in the dark theme, so axe reads the dark pairs at the phone width too. */
export const PhoneDark: Story = {
  globals: { theme: "dark", viewport: { value: "phone390", isRotated: false } },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};

/** G40: a module's system role names the module by its display name, not its id. */
export const KindNamesTheModule: Story = {
  args: {
    roles: [
      ...FIXTURE_ROLES,
      {
        ...FIXTURE_SYSTEM_ROLE,
        id: "r-fixture-user",
        name: "Fixture user",
        moduleId: "fixture",
        moduleName: "Fixture",
      },
      // A switched-off module is not in the catalogue, so the row carries its name (d8l5.48).
      {
        ...FIXTURE_SYSTEM_ROLE,
        id: "r-dormant-user",
        name: "Dormant user",
        moduleId: "dormant",
        moduleName: "Dormant",
      },
    ],
  },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Roles" }));

    await expect(table.getByText("System · Fixture")).toBeVisible();
    await expect(table.getByText("System · Dormant")).toBeVisible();
  },
};

/** G42: the row menu copies a system role, and edits, copies or deletes a custom one. */
export const RowMenuMatchesTheKind: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Tenant administrator" })
    );
    await expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent)
    ).toEqual(["Copy"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoice approver" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" })
    );

    const confirm = await screen.findByRole("dialog", {
      name: "Delete Invoice approver?",
    });

    await userEvent.click(
      within(confirm).getByRole("button", { name: "Delete role" })
    );
    await expect(args.onDeleteRole).toHaveBeenCalledWith("r-invoice");
  },
};

/** G48: with a long catalogue the New role dialog stays on screen with its buttons visible. */
export const LongCatalogueFormFitsTheScreen: Story = {
  args: {
    catalogue: Array.from({ length: 5 }, (_, index) => ({
      moduleId: `module-${index}`,
      moduleName: `Module ${index}`,
      entitled: true,
      keys: Array.from({ length: 6 }, (_entry, key) => ({
        key: `module-${index}:key-${key}`,
        label: `Permission ${key} of module ${index}`,
        unavailable: false,
      })),
    })),
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getAllByRole("button", { name: "New role" })[0]!
    );

    const dialog = await screen.findByRole("dialog", { name: "New role" });
    const create = within(dialog).getByRole("button", { name: "Create role" });

    await waitFor(() =>
      expect(dialog.getBoundingClientRect().top).toBeGreaterThan(0)
    );
    await expect(create.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight
    );
  },
};

/** G42: a row's Copy offers the row's retired key for removal, so the copy can be saved (R-33b). */
export const RowCopyOffersTheUnavailableKey: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Invoice approver" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Copy" })
    );

    const dialog = within(
      await screen.findByRole("dialog", { name: "Copy role" })
    );

    await expect(dialog.getByText("retired:key")).toBeInTheDocument();
    await expect(
      dialog.getByRole("button", { name: "Remove" })
    ).toBeInTheDocument();
  },
};

/** G50: a failed role read shows its error, not "Loading role…" forever. */
export const DetailReadFailureShowsTheError: Story = {
  args: {
    selectedRoleId: "r-missing",
    error: "The role could not be read.",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "The role could not be read."
    );
    await expect(canvas.queryByText("Loading role…")).toBeNull();
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
    // The admin key added by entitlement is marked, and the note says why (G46).
    await expect(canvas.getByText("Added by entitlement")).toBeInTheDocument();
    await expect(
      canvas.getByText(/its admin permission is appended to this role/)
    ).toBeVisible();
  },
};

/** R-37a: "Manage in Access" opens Access on the role. */
export const ManageInAccessWhenTheHostPassesIt: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
    holders: HOLDERS_THREE,
    onOpenInAccess: fn(),
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Manage in Access" })
    );
    await expect(args.onOpenInAccess).toHaveBeenCalledWith(
      FIXTURE_CUSTOM_DETAIL.id
    );
  },
};

const holderHref = (holder: { readonly type: string; readonly id: string }) =>
  `/admin/${holder.type === "group" ? "groups" : "people"}?selected=${holder.id}`;

/** `d8l5.47`: a role nobody holds keeps the empty sentence and Manage in Access. */
export const HoldersNone: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
    holders: HOLDERS_NONE,
    holderHref,
    onOpenInAccess: fn(),
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nobody holds this role yet.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Manage in Access" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("list", { name: "Who holds this role" })
    ).toBeNull();
  },
};

/** `d8l5.47`: the holders by name and path, groups first, each a link. */
export const HoldersListed: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
    holders: HOLDERS_THREE,
    holderHref,
  },
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", {
      name: "Who holds this role",
    });

    const items = within(list).getAllByRole("listitem");

    await expect(items.map((item) => item.textContent)).toEqual([
      "Dry runGroup, 1 member",
      "Ada LovelaceDirect assignment",
      "Zoe BrandtDirect assignment",
    ]);
    await expect(
      within(list).getByRole("link", { name: "Dry run" })
    ).toHaveAttribute("href", "/admin/groups?selected=g-solo");
    await expect(
      within(list).getByRole("link", { name: "Ada Lovelace" })
    ).toHaveAttribute("href", "/admin/people?selected=p-ada");
    await expect(canvas.queryByRole("link", { name: /See all/ })).toBeNull();
  },
};

/** `d8l5.47`: past ten, the first ten show, groups first, and "See all" opens Access by role. */
export const HoldersPastTen: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
    holders: HOLDERS_TWELVE,
    holderHref,
  },
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", {
      name: "Who holds this role",
    });

    const items = within(list).getAllByRole("listitem");

    await expect(items).toHaveLength(10);
    await expect(items[0]).toHaveTextContent("Finance teamGroup, 12 members");
    await expect(items[1]).toHaveTextContent("OperationsGroup, 40 members");
    await expect(
      canvas.getByRole("link", { name: "See all 12 in Access" })
    ).toHaveAttribute("href", `/admin/access?role=${FIXTURE_CUSTOM_DETAIL.id}`);
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

    const dialog = within(
      await screen.findByRole("dialog", { name: "Copy role" })
    );

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

export const UnavailableKeyWarnsAndCanBeRemoved: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
  },
  play: async ({ canvas }) => {
    onRemoveUnavailableKey.mockClear();

    await expect(
      canvas.getByText("Unavailable, the key is retired")
    ).toBeInTheDocument();
    await expect(canvas.getByText("retired:key")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));

    expect(onRemoveUnavailableKey).toHaveBeenCalledWith(
      FIXTURE_CUSTOM_DETAIL.id,
      {
        name: "Invoice approver",
        description: "Approves invoices",
        permissions: ["fixture:use"],
      }
    );
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

    const confirmDialog = await screen.findByRole("dialog", {
      name: "Delete Invoice approver?",
    });

    const confirm = within(confirmDialog);

    // Cancel holds the focus, and the confirm is the danger action.
    await waitFor(() =>
      expect(confirm.getByRole("button", { name: "Cancel" })).toHaveFocus()
    );

    await expect(
      confirm.getByText(/1 assignment goes with it/)
    ).toBeInTheDocument();

    await userEvent.click(confirm.getByRole("button", { name: "Delete role" }));

    expect(onDeleteRole).toHaveBeenCalledWith(FIXTURE_CUSTOM_DETAIL.id);
  },
};

export const DeleteUnassignedRoleCountsNothing: Story = {
  args: {
    selectedRoleId: FIXTURE_TWO_UNAVAILABLE_DETAIL.id,
    detail: FIXTURE_TWO_UNAVAILABLE_DETAIL,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Delete role/ }));

    const confirm = within(
      await screen.findByRole("dialog", { name: "Delete Two retired keys?" })
    );

    await expect(confirm.queryByText(/go with it/)).toBeNull();
  },
};

export const WriteInFlight: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
    pending: true,
  },
  play: async ({ canvas }) => {
    const remove = canvas.getByRole("button", { name: /Delete role/ });

    // DR-17: while a write runs, the buttons that write are busy and drop a second press.
    await expect(remove).toHaveAttribute("aria-busy", "true");
    await expect(
      canvas.getByRole("button", { name: /Edit role/ })
    ).toHaveAttribute("aria-busy", "true");

    await userEvent.click(remove);
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

export const NewRoleForm: Story = {
  play: async ({ canvas }) => {
    onCreateRole.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /New role/ }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "New role" })
    );

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

// U-1: a refused role form keeps its dialog open, with the typed name and the refusal.
export const NewRoleRefusedStaysOpen: Story = {
  args: {
    onCreateRole: fn(() =>
      Promise.reject(new Error("The role was not saved."))
    ),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /New role/ }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "New role" })
    );

    await userEvent.type(dialog.getByLabelText("Role name"), "Support agent");
    await userEvent.click(dialog.getByRole("button", { name: "Create role" }));

    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "The role was not saved."
    );
    await expect(dialog.getByLabelText("Role name")).toHaveValue(
      "Support agent"
    );
  },
};

/** Presses Tab until the target holds focus, so the ring shows as it does for a keyboard user. */
async function tabTo(target: Element, stops = 40): Promise<void> {
  if (document.activeElement === target || stops === 0) return;

  await userEvent.tab();

  return tabTo(target, stops - 1);
}

/** R-8: the ring is --ring, blue-600 in light and the fixed --brand-on-dark (blue-400) in dark. */
function ringColor(theme: ThemeName): string {
  return theme === "dark" ? "rgb(96, 165, 250)" : "rgb(37, 99, 235)";
}

export const PermissionRowFocus: Story = {
  play: async ({ canvas, globals }) => {
    await userEvent.click(canvas.getByRole("button", { name: /New role/ }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "New role" })
    );

    const box = dialog.getByRole("checkbox", { name: "Use the fixture" });

    await tabTo(box);
    await expect(box).toHaveFocus();
    await expect(getComputedStyle(box).boxShadow).toContain(
      ringColor(globals["theme"])
    );
    // DR-02, R-5: each permission row is a 44 px target.
    await expect(
      box.closest("label")?.getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(44);
  },
};

export const PermissionRowFocusOnDark: Story = {
  ...PermissionRowFocus,
  globals: { theme: "dark" },
};

export const EditRoleDispatchesUpdate: Story = {
  args: {
    selectedRoleId: FIXTURE_CUSTOM_DETAIL.id,
    detail: FIXTURE_CUSTOM_DETAIL,
  },
  play: async ({ canvas }) => {
    onUpdateRole.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Edit role/ }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Edit role" })
    );

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

export const DisabledModuleKeyShowsTheReasonAndRemoves: Story = {
  args: {
    selectedRoleId: FIXTURE_DISABLED_MODULE_DETAIL.id,
    detail: FIXTURE_DISABLED_MODULE_DETAIL,
  },
  play: async ({ canvas }) => {
    onRemoveUnavailableKey.mockClear();

    await expect(
      canvas.getByText("Unavailable, the module is switched off")
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));

    expect(onRemoveUnavailableKey).toHaveBeenCalledWith(
      FIXTURE_DISABLED_MODULE_DETAIL.id,
      expect.objectContaining({ permissions: ["fixture:use"] })
    );
  },
};

export const TwoUnavailableKeysRemoveOnlyTheClicked: Story = {
  args: {
    selectedRoleId: FIXTURE_TWO_UNAVAILABLE_DETAIL.id,
    detail: FIXTURE_TWO_UNAVAILABLE_DETAIL,
  },
  play: async ({ canvas }) => {
    onRemoveUnavailableKey.mockClear();

    // Each unavailable key of a custom role carries its own Remove; the first is retired:one.
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Remove" })[0]!
    );

    expect(onRemoveUnavailableKey).toHaveBeenCalledWith(
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
    await expect(canvas.getByText("No roles match")).toBeInTheDocument();
  },
};

export const NoMatchClearsTheSearch: Story = {
  play: async ({ canvas }) => {
    const search = canvas.getByRole("textbox", { name: "Search roles" });

    await userEvent.type(search, "no role is called this");
    await expect(canvas.queryByRole("table", { name: "Roles" })).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear search and filters" })
    );

    await expect(search).toHaveValue("");
    await expect(canvas.getByRole("table", { name: "Roles" })).toBeVisible();
  },
};
