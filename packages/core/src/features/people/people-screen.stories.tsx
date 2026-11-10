import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { AccessPath } from "../../services/roles/effective-access.ts";
import { FIXTURE_ROWS, fixturePath } from "../access/__fixtures__/access.ts";
import {
  FIXTURE_DETAILS,
  FIXTURE_JIT_SETTINGS,
  FIXTURE_MANY_ROWS,
  FIXTURE_PEOPLE,
  FIXTURE_SETTINGS,
  FIXTURE_SIX_ROWS,
  FIXTURE_SOLE_ADMIN_PERSON_ID,
  FIXTURE_VIEWER,
} from "./__fixtures__/people.ts";
import {
  DISABLE_REMOVE_NOTE,
  PeopleScreen,
  SELF_REASON,
} from "./people-screen.tsx";
import type {
  AddedPerson,
  NewPersonInput,
  PeopleScreenProps,
} from "./types.ts";

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
    searchLabel: "Search people",
    noMatch: {
      title: "No people match",
      description: "Clear the search and the filters to see everyone.",
      clearLabel: "Clear search and filters",
    },
    people: FIXTURE_PEOPLE,
    viewer: FIXTURE_VIEWER,
    settings: FIXTURE_SETTINGS,
    // Harbor Point: Analytics off; Invoices, Placeholder, Slides and Ask on.
    grantRows: FIXTURE_ROWS,
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

/** The help sits beside the search as an icon, named by its topic (people-groups-and-roles spec). */
export const HelpIsIconOnly: Story = {
  play: async ({ canvas }) => {
    const help = canvas.getByRole("button", {
      name: "Pending, disabled, removed",
    });

    await expect(help.textContent).toBe("");
  },
};

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

/** G2, G3: last sign-in reads relative, a date once old, and "Never" for nobody yet (mockup). */
export const LastSignInIsRelative: Story = {
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "People" }));

    await expect(table.getByText("1 h ago")).toBeVisible();
    await expect(table.getByText("1 May 2026")).toBeVisible();
    await expect(table.getAllByText("Never")).toHaveLength(2);
  },
};

/** G11: the profile shows the first sign-in as a day and time, the last one relative (mockup). */
export const ProfileSignInTimes: Story = {
  args: { initialSelectedId: "u-viewer" },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog"));

    await expect(sheet.getByText("4 Jan, 10:00")).toBeVisible();
    await expect(sheet.getByText("1 h ago")).toBeVisible();
  },
};

/** G24: a session's last activity reads relative, as the mockup shows. */
export const SessionLastActiveIsRelative: Story = {
  args: { initialSelectedId: "u-viewer" },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog"));

    await userEvent.click(sheet.getByRole("tab", { name: /Sessions/ }));
    await expect(
      sheet.getByText(/203\.0\.113\.7 · last active 32 min ago/)
    ).toBeVisible();
  },
};

/** G14: the directory groups heading carries one relative Synced time (mockup). */
export const GroupsSyncedIsRelative: Story = {
  args: { initialSelectedId: "u-bea" },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog"));

    await userEvent.click(sheet.getByRole("tab", { name: /Groups/ }));
    await expect(sheet.getByText("Synced 1 d ago")).toBeVisible();
  },
};

const financeTeam = {
  type: "group",
  id: "g-finance",
  name: "Finance team",
} as const;

/**
 * Ada's paths from the S2-19 read: Invoices directly and through Finance team, and Slides through
 * an archived group, which grants nothing.
 */
const ADA_PATHS: readonly AccessPath[] = [
  fixturePath({
    id: "a-ada-direct",
    holder: { type: "user", id: "u-viewer", name: "Ada Admin" },
    role: { id: "r-invoices-viewer", name: "Viewer" },
    moduleId: "invoices",
  }),
  fixturePath({
    id: "a-ada-finance",
    holder: financeTeam,
    role: { id: "r-invoices-finance", name: "Finance" },
    moduleId: "invoices",
  }),
  {
    ...fixturePath({
      id: "a-ada-former",
      holder: { type: "group", id: "g-former", name: "Former finance" },
      role: { id: "r-slides-editor", name: "Slides editor" },
      moduleId: "slides",
    }),
    notInEffect: ["group-archived"],
  },
];

const adaAccess = {
  paths: ADA_PATHS,
  catalogue: FIXTURE_ROWS,
  recordLabels: new Map<string, string>(),
};

/** G19, G20: the Access tab lists module, role and path from the one read, read-only (LK2, LK3). */
export const AccessTabListsEveryPath: Story = {
  args: {
    initialSelectedId: "u-viewer",
    access: adaAccess,
    onManageAccess: fn(),
  },
  play: async ({ args }) => {
    const sheet = within(await screen.findByRole("dialog"));

    await userEvent.click(sheet.getByRole("tab", { name: /Access/ }));

    await expect(sheet.getByText("Invoices · Viewer")).toBeVisible();
    await expect(
      sheet.getByText(
        "Direct assignment · also through Finance team · added by Alex Morgan"
      )
    ).toBeVisible();
    await expect(sheet.getByText("Invoices · Finance")).toBeVisible();
    await expect(
      sheet.getByText(
        "via Finance team · also through a direct assignment · added by Alex Morgan"
      )
    ).toBeVisible();

    // I2: a path through an archived group is never shown as live.
    const former = sheet.getByText("Slides · Slides editor").closest("li");

    await expect(former).not.toBeNull();
    await expect(
      within(former ?? document.body).getByText("Not in effect")
    ).toBeVisible();
    await expect(
      within(former ?? document.body).getByText("The group is archived")
    ).toBeVisible();

    await userEvent.click(
      sheet.getByRole("button", { name: "Manage in Access" })
    );
    await expect(args.onManageAccess).toHaveBeenCalledWith("u-viewer");
  },
};

/** U5, LK4: without the Roles key the host passes no read and no link, so neither shows. */
export const NoAccessTabWithoutTheKey: Story = {
  args: { initialSelectedId: "u-viewer" },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog"));

    await expect(sheet.getByRole("tab", { name: /Profile/ })).toBeVisible();
    await expect(sheet.queryByRole("tab", { name: /Access/ })).toBeNull();
    await expect(sheet.queryByRole("tab", { name: /Roles/ })).toBeNull();
    await expect(
      sheet.queryByRole("button", { name: "Manage in Access" })
    ).toBeNull();
  },
};

/** A two-digit Access count must not push the four tabs past a 390 px sheet (phase 07 capture). */
export const AccessTabsFitOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  args: {
    initialSelectedId: "u-viewer",
    access: {
      ...adaAccess,
      paths: Array.from({ length: 11 }, (_, i) =>
        fixturePath({
          id: `a-ada-${i}`,
          holder: { type: "user", id: "u-viewer", name: "Ada Admin" },
          role: { id: `r-${i}`, name: `Role ${i}` },
          moduleId: "invoices",
        })
      ),
    },
    onManageAccess: fn(),
  },
  play: async () => {
    const sheet = within(await screen.findByRole("dialog"));
    const tabs = sheet.getByRole("tablist", { name: "Person detail" });

    await expect(sheet.getByRole("tab", { name: /Access/ })).toHaveTextContent(
      "11"
    );
    await expect(tabs.scrollWidth).toBeLessThanOrEqual(
      tabs.parentElement?.clientWidth ?? 0
    );
  },
};

/** G21: a role held through a group links that group, and the link opens that group's id. */
export const ViaGroupOpensTheGroup: Story = {
  args: { initialSelectedId: "u-viewer", access: adaAccess, onOpenGroup: fn() },
  play: async ({ args }) => {
    const sheet = within(await screen.findByRole("dialog"));

    await userEvent.click(sheet.getByRole("tab", { name: /Access/ }));
    await userEvent.click(sheet.getByRole("button", { name: "Finance team" }));
    await expect(args.onOpenGroup).toHaveBeenCalledWith("g-finance");
  },
};

/** G16: a group manager removes a local group from the person and adds one the person is not in. */
export const GroupsTabAddsAndRemovesLocalGroups: Story = {
  args: {
    initialSelectedId: "u-viewer",
    localGroups: [
      { id: "g-admins", label: "Genie Administrators" },
      { id: "g-ops", label: "Operations" },
    ],
    onAddToGroup: fn(),
    onRemoveFromGroup: fn(),
  },
  play: async ({ args }) => {
    const sheet = within(await screen.findByRole("dialog"));

    await userEvent.click(sheet.getByRole("tab", { name: /Groups/ }));
    await userEvent.click(
      sheet.getByRole("button", { name: "Remove from Genie Administrators" })
    );
    await expect(args.onRemoveFromGroup).toHaveBeenCalledWith(
      "u-viewer",
      "g-admins"
    );

    // The picker offers only a group the person is not in.
    await userEvent.click(
      sheet.getByRole("combobox", { name: "Add to group" })
    );
    await expect(
      screen.queryByRole("option", { name: "Genie Administrators" })
    ).toBeNull();
    await userEvent.click(
      await screen.findByRole("option", { name: "Operations" })
    );
    await userEvent.click(sheet.getByRole("button", { name: "Add" }));
    await expect(args.onAddToGroup).toHaveBeenCalledWith("u-viewer", "g-ops");
  },
};

const OBJECT_ID = "39545f73-134e-49ac-9731-0e96df8ea218";

/** UI-1 People finding 2: an unlabelled group whose value is an id shows a short pill (R-24c). */
export const UnlabelledGroupIdShowsAShortPill: Story = {
  args: {
    people: [
      {
        ...FIXTURE_PEOPLE[0]!,
        groups: [
          ...FIXTURE_PEOPLE[0]!.groups,
          { id: "g-oid", label: OBJECT_ID },
        ],
      },
      ...FIXTURE_PEOPLE.slice(1),
    ],
    details: {
      ...FIXTURE_DETAILS,
      "u-viewer": {
        ...FIXTURE_DETAILS["u-viewer"],
        groups: [
          ...FIXTURE_DETAILS["u-viewer"].groups,
          {
            id: "g-oid",
            name: OBJECT_ID,
            label: OBJECT_ID,
            source: "idp",
            syncedAt: null,
          },
        ],
      },
    },
  },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "People" }));

    const tooltip = { selector: "[data-slot=tooltip-content]" };

    // The pill shows 8 characters and an ellipsis; the tooltip and screen readers get the value.
    await expect(table.getByText(OBJECT_ID)).toHaveClass("sr-only");
    await userEvent.hover(table.getByText("39545f73…"));

    const tip = await screen.findByText(OBJECT_ID, tooltip);

    // The tooltip fades in, so wait until it paints.
    await waitFor(() => expect(tip).toBeVisible());
    await userEvent.unhover(table.getByText("39545f73…"));
    // The table's tooltip fades out; wait until it leaves, so the next find is the inspector's.
    await waitFor(() => expect(tip).not.toBeInTheDocument());

    await userEvent.click(canvas.getByRole("button", { name: /Ada Admin/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Ada Admin" })
    );

    await userEvent.click(inspector.getByRole("tab", { name: /Groups/ }));
    await userEvent.hover(inspector.getByText("39545f73…"));

    const inspectorTip = await screen.findByText(OBJECT_ID, tooltip);

    await waitFor(() => expect(inspectorTip).toBeVisible());
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const list = within(canvas.getByRole("list", { name: "People" }));

    await expect(window.innerWidth).toBe(390);
    await expect(canvas.queryByRole("table")).toBeNull();
    // The toolbar and a long email must not push the page sideways.
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );

    // The primary action sits in the phone's bottom bar, and the toolbar keeps none.
    const bar = canvasElement.querySelector<HTMLElement>(
      "[data-shell-bottom-bar]"
    );

    await expect(bar).not.toBeNull();

    const barButton = within(bar!).getByRole("button", { name: "Add person" });

    await expect(barButton).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add person" })
    ).toHaveLength(1);

    await userEvent.click(barButton);

    const adding = await screen.findByRole("dialog", { name: "Add person" });

    // The dialog fades in from opacity 0.
    await waitFor(() => expect(adding).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add person" })).toBeNull()
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

/** The card list in the dark theme, so axe reads the dark pairs at the phone width too. */
export const PhoneDark: Story = {
  globals: { theme: "dark", viewport: { value: "phone390", isRotated: false } },
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

    // The icon-only help stays beside the search, not on a row of its own.
    const field = search.getBoundingClientRect();

    const help = canvas
      .getByRole("button", { name: "Pending, disabled, removed" })
      .getBoundingClientRect();

    await expect(help.top + help.height / 2).toBeGreaterThan(field.top);
    await expect(help.top + help.height / 2).toBeLessThan(field.bottom);
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
    await expect(
      canvas.getByRole("button", { name: "Clear search and filters" })
    ).toBeInTheDocument();
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

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

const openAddPerson = async (canvas: Canvas) => {
  await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

  const dialog = await screen.findByRole("dialog", { name: "Add person" });

  // The popup fades in, so wait until it paints.
  await waitFor(() => expect(dialog).toBeVisible());

  return within(dialog);
};

type DialogQueries = Awaited<ReturnType<typeof openAddPerson>>;

/** Picks one role in a row, as the Access stories pick: the select by its label, then the option. */
const pickRole = async (dialog: DialogQueries, row: string, role: string) => {
  await userEvent.click(
    dialog.getByRole("combobox", { name: `Role for ${row}` })
  );
  await userEvent.click(await screen.findByRole("option", { name: role }));
  // The popup's focus guards stay until it has closed; axe runs after the play function.
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
};

/** The footer line, whose names sit in `<strong>`, read as one text. */
const footerLine = (dialog: DialogQueries, text: string) =>
  dialog.getByText(
    (_, element) => element?.tagName === "P" && element.textContent === text
  );

/** F1: every row starts at No access, a switched-off module is only named, the default is first. */
export const AddPersonStartsAtNoAccess: Story = {
  play: async ({ canvas }) => {
    const dialog = await openAddPerson(canvas);

    const access = within(dialog.getByRole("group", { name: /^Access now/ }));

    await expect(
      access.getByText(
        "One role per module. Each module starts at No access; the first role listed is the module's default."
      )
    ).toBeVisible();
    await expect(access.getByText("Modules · 3")).toBeVisible();
    await expect(access.getByText("Core · 1")).toBeVisible();

    for (const row of ["Invoices", "Placeholder", "Slides", "Ask"]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        access.getByRole("combobox", { name: `Role for ${row}` })
      ).toHaveTextContent("No access");
    }

    await expect(
      access.queryByRole("combobox", { name: "Role for Analytics" })
    ).toBeNull();
    await expect(
      access.getByText(
        "Switched off: Analytics. Switch a module on in Modules before you give access to it."
      )
    ).toBeVisible();
    await expect(
      access.getByText(
        "Administration roles (Tenant administrator, Auditor) are added in Access."
      )
    ).toBeVisible();
    await expect(
      access.getByRole("checkbox", { name: "Open in Access after adding" })
    ).not.toBeChecked();
    await expect(footerLine(dialog, "No access yet")).toBeVisible();

    await userEvent.click(
      access.getByRole("combobox", { name: "Role for Invoices" })
    );

    const options = await screen.findAllByRole("option");

    await expect(options.map((option) => option.textContent)).toEqual([
      "No access",
      "Viewer (default)",
      "Invoices and Payments user",
      "Finance",
      "Invoice auditor",
    ]);

    await userEvent.keyboard("{Escape}");
    // The popup's focus guards stay until it has closed; axe runs after the play function.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  },
};

/** F2: one role per row, a second pick replaces the first, and the footer names what they get. */
export const AddPersonGivesOneRolePerModule: Story = {
  play: async ({ canvas }) => {
    onAddPerson.mockClear();

    const dialog = await openAddPerson(canvas);

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "new@example.com"
    );
    await pickRole(dialog, "Invoices", "Viewer (default)");
    await pickRole(dialog, "Invoices", "Finance");
    await pickRole(dialog, "Slides", "Slides editor (default)");
    await pickRole(dialog, "Ask", "Ask user (default)");

    await expect(
      dialog.getByRole("combobox", { name: "Role for Invoices" })
    ).toHaveTextContent("Finance");
    await expect(
      footerLine(dialog, "Access to Invoices, Slides and Ask")
    ).toBeVisible();

    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Open in Access after adding" })
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    await expect(onAddPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        roleIds: ["r-invoices-finance", "r-slides-editor", "r-ask-user"],
        openInAccess: true,
      })
    );
  },
};

/** F3: six switched-on modules are one short of the finder. */
export const SixModulesShowNoFinder: Story = {
  args: { grantRows: FIXTURE_SIX_ROWS },
  play: async ({ canvas }) => {
    const dialog = await openAddPerson(canvas);

    await expect(dialog.getByText("Modules · 6")).toBeVisible();
    await expect(
      dialog.queryByRole("searchbox", { name: "Find a module" })
    ).toBeNull();
  },
};

/** F3: past six modules a finder narrows the rows, and more than three picks read as a count. */
export const ManyModulesFindAModule: Story = {
  args: { grantRows: FIXTURE_MANY_ROWS },
  play: async ({ canvas }) => {
    const dialog = await openAddPerson(canvas);

    await expect(dialog.getByText("Modules · 10")).toBeVisible();
    await expect(
      dialog.getByText(
        "Switched off: Travel, Fleet. Switch a module on in Modules before you give access to it."
      )
    ).toBeVisible();

    const finder = dialog.getByRole("searchbox", { name: "Find a module" });

    await userEvent.type(finder, "PAY");
    await expect(
      dialog.getByRole("combobox", { name: "Role for Payroll" })
    ).toBeVisible();
    await expect(
      dialog.queryByRole("combobox", { name: "Role for Contracts" })
    ).toBeNull();

    await userEvent.clear(finder);
    await userEvent.type(finder, "zzz");
    await expect(dialog.getByText("No module matches “zzz”.")).toBeVisible();

    await userEvent.clear(finder);

    for (const name of ["Contracts", "Approvals", "Assets"]) {
      // oxlint-disable-next-line no-await-in-loop
      await pickRole(dialog, name, `${name} viewer`);
    }

    await pickRole(dialog, "Ask", "Ask user (default)");
    await expect(footerLine(dialog, "Access to 4 modules")).toBeVisible();
  },
};

export const AddPersonSendsTheInvitationByDefault: Story = {
  play: async ({ canvas }) => {
    onAddPerson.mockClear();

    const dialog = await openAddPerson(canvas);

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "new@example.com"
    );
    await userEvent.type(dialog.getByLabelText("Display name"), "New Person");

    // R-40a: the invitation checkbox is checked by default.
    const invitation = dialog.getByRole("checkbox", {
      name: "Send invitation email",
    });

    await expect(invitation).toBeChecked();

    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    expect(onAddPerson).toHaveBeenCalledWith({
      email: "new@example.com",
      name: "New Person",
      roleIds: [],
      openInAccess: false,
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

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "quiet@example.com"
    );
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

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "local@example.com"
    );
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
      inspector.getByText(
        "You cannot change your own access. Ask another administrator."
      )
    ).toBeInTheDocument();
    // The refusal takes the place of the note, as the guard capture draws it.
    await expect(inspector.queryByText(DISABLE_REMOVE_NOTE)).toBeNull();
  },
};

/** The captures pin Disable and Remove under every tab, not only under Profile. */
export const ActionsStayUnderEveryTab: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Bea Brokered/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Bea Brokered" })
    );

    await userEvent.click(inspector.getByRole("tab", { name: /Groups/ }));
    await expect(inspector.getByText(DISABLE_REMOVE_NOTE)).toBeVisible();
    await expect(
      inspector.getByRole("button", { name: "Disable" })
    ).toBeVisible();
    await expect(
      inspector.getByRole("button", { name: "Remove" })
    ).toBeVisible();
  },
};

export const RemoveConfirmsBeforeItFires: Story = {
  play: async ({ canvas }) => {
    onRemovePerson.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: /Dan Disabled/ }));

    const inspector = within(
      await screen.findByRole("dialog", { name: "Dan Disabled" })
    );

    const remove = inspector.getByRole("button", { name: /Remove/ });

    // An outline with red text, as the inspector capture draws it, not a solid red fill.
    await expect(getComputedStyle(remove).color).toBe("rgb(220, 38, 38)");
    await userEvent.click(remove);

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
    // The filter panel is a popover, so it renders outside the canvas.
    await userEvent.click(
      await screen.findByRole("combobox", { name: "Filter by status" })
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

/** The footer counts the people shown against everyone, and names the onboarding mode (capture). */
export const FooterCountsTheShownPeople: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("4 of 4 people")).toBeVisible();
    await expect(canvas.getByText(/Onboarding: Invite only/)).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Search people"), "bea");

    await expect(canvas.getByText("1 of 4 people")).toBeVisible();
  },
};

export const FooterNamesJitOnboarding: Story = {
  args: { settings: FIXTURE_JIT_SETTINGS },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Onboarding: Just-in-time/)).toBeVisible();
  },
};

/**
 * A host that refuses Add person the way the People route does: the promise rejects with the
 * catalogue message.
 */
function RefusingHost(props: PeopleScreenProps) {
  return (
    <PeopleScreen
      {...props}
      onAddPerson={async (input) => {
        await props.onAddPerson?.(input);

        throw new Error("A person with that email already exists.");
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

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "ada@example.com"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    await expect(onAddPerson).toHaveBeenCalled();

    // The refusal is shown inside the dialog, which stays open with the typed address.
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "already exists"
    );
    await expect(
      screen.getByRole("dialog", { name: "Add person" })
    ).toBeInTheDocument();
    await expect(dialog.getByLabelText("Work email")).toHaveValue(
      "ada@example.com"
    );
    // The page does not repeat it behind the dialog.
    await expect(screen.getAllByText(/already exists/)).toHaveLength(1);
  },
};

const SSO_DOMAIN_REFUSAL =
  "This address uses the company sign-in. Add the person as a company account.";

// R-40b: a refusal with an issue at `email` shows under the email field, not in the action bar.
export const AddPersonLocalOnSsoDomainShowsAtEmail: Story = {
  args: {
    onAddPerson: fn(async () => {
      throw {
        message: `The person was not added. ${SSO_DOMAIN_REFUSAL} Your change is kept.`,
        issues: [{ path: "email", message: SSO_DOMAIN_REFUSAL }],
      };
    }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Add person" })
    );

    const email = dialog.getByLabelText("Work email");

    await userEvent.type(email, "ann@company.example");
    await userEvent.click(
      dialog.getByRole("radio", { name: "Local password" })
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    await expect(email).toHaveAccessibleDescription(SSO_DOMAIN_REFUSAL);
    await expect(email).toHaveFocus();
    await expect(email).toHaveValue("ann@company.example");
    await expect(
      screen.getByRole("dialog", { name: "Add person" })
    ).toBeInTheDocument();
    // The field's text is the one alert; the action bar does not repeat it.
    await expect(dialog.getAllByRole("alert")).toHaveLength(1);
    await expect(dialog.queryByText(/was not added/)).toBeNull();

    await userEvent.type(email, "m");

    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("");
    await expect(dialog.queryByRole("alert")).toBeNull();
  },
};

// Cancel drops the refusal, so neither the page nor the next open shows a stale one.
export const AddPersonRefusalClearsOnCancel: Story = {
  render: (args) => <RefusingHost {...args} />,
  play: async ({ canvas }) => {
    const open = async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

      return within(await screen.findByRole("dialog", { name: "Add person" }));
    };

    const dialog = await open();

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "ada@example.com"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));
    await expect(await dialog.findByRole("alert")).toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(canvas.queryByRole("alert")).toBeNull();

    await expect((await open()).queryByRole("alert")).toBeNull();
  },
};

// A refusal that answers after Cancel is dropped, so the next open starts clean.
export const AddPersonLateRefusalAfterCancelIsDropped: Story = {
  args: {
    onAddPerson: fn(
      () =>
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Late refusal.")), 300)
        )
    ),
  },
  play: async ({ canvas }) => {
    const open = async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add person" }));

      return within(await screen.findByRole("dialog", { name: "Add person" }));
    };

    const dialog = await open();

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "ada@example.com"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const reopened = await open();

    // Wait past the late answer, then the new open holds no refusal.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(reopened.queryByRole("alert")).toBeNull();
  },
};

/** F5: Access opens after a full add only; a partial add stays on People for Resend (P06-14). */
export const AddPersonOpensAccessAfterAFullAdd: Story = {
  args: {
    // The first add's email fails, the second's goes out. Storybook resets mocks before a story,
    // so the answer comes from the input, not from queued `mockResolvedValueOnce` values.
    onAddPerson: fn(async (input: NewPersonInput): Promise<AddedPerson> =>
      input.email === "new@example.com"
        ? { id: "u-new", emailSent: true }
        : { id: "u-partial", emailSent: false }
    ),
    onManageAccess: fn(),
  },
  play: async ({ args, canvas }) => {
    for (const email of ["partial@example.com", "new@example.com"]) {
      // oxlint-disable-next-line no-await-in-loop
      const dialog = await openAddPerson(canvas);

      // oxlint-disable-next-line no-await-in-loop
      await userEvent.type(dialog.getByLabelText("Work email"), email);
      // oxlint-disable-next-line no-await-in-loop
      await userEvent.click(
        dialog.getByRole("checkbox", { name: "Open in Access after adding" })
      );
      // oxlint-disable-next-line no-await-in-loop
      await userEvent.click(dialog.getByRole("button", { name: "Add person" }));
      // oxlint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }

    await expect(args.onManageAccess).toHaveBeenCalledTimes(1);
    await expect(args.onManageAccess).toHaveBeenCalledWith("u-new");
  },
};

/** F5: an add that answers after Cancel opens nothing and keeps the form opened since. */
export const LateAddAfterCancelKeepsTheReopenedForm: Story = {
  args: {
    onAddPerson: fn(
      () =>
        new Promise<AddedPerson>((resolve) =>
          setTimeout(() => resolve({ id: "u-late", emailSent: true }), 300)
        )
    ),
    onManageAccess: fn(),
  },
  play: async ({ args, canvas }) => {
    const dialog = await openAddPerson(canvas);

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "late@example.com"
    );
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Open in Access after adding" })
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const reopened = await openAddPerson(canvas);

    await userEvent.type(
      reopened.getByLabelText("Work email"),
      "next@example.com"
    );
    // Wait past the late answer.
    await new Promise((resolve) => setTimeout(resolve, 500));

    await expect(args.onManageAccess).not.toHaveBeenCalled();
    await expect(reopened.getByLabelText("Work email")).toHaveValue(
      "next@example.com"
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

/** F4: without the tenant-wide Roles key, no access is offered and none is sent. */
export const RolePickerHiddenWithoutTheRolesPermission: Story = {
  args: { canAssignRoles: false },
  play: async ({ canvas }) => {
    onAddPerson.mockClear();

    const dialog = await openAddPerson(canvas);

    await expect(
      dialog.queryByRole("group", { name: /^Access now/ })
    ).toBeNull();
    await expect(
      dialog.queryByRole("checkbox", { name: "Open in Access after adding" })
    ).toBeNull();

    await userEvent.type(
      dialog.getByLabelText("Work email"),
      "manager@example.com"
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add person" }));

    await expect(onAddPerson).toHaveBeenCalledWith(
      expect.objectContaining({ roleIds: [], openInAccess: false })
    );
  },
};
