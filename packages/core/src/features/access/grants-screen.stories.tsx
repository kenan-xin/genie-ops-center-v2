import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { AdvancedChanges } from "../../services/roles/advanced.ts";
import type {
  AccessPath,
  AccessRecipient,
} from "../../services/roles/effective-access.ts";
import type { GrantChanges } from "../../services/roles/grants.ts";
import {
  ADVANCED_CATALOGUE,
  ADVANCED_LABELS,
  FIXTURE_RECIPIENTS,
  FIXTURE_ROWS,
  fixturePath,
  fixturePaths,
  held,
  searchFixtureRecords,
  tenantAdminOf,
} from "./__fixtures__/access.ts";
import { GrantsScreen } from "./grants-screen.tsx";

type Args = {
  readonly initial: AccessRecipient | null;
  readonly link?: {
    readonly recipient?: string;
    readonly module?: string;
    readonly role?: string;
  };
  readonly refusal?: string;
  /** Paths of the chosen recipient, when a story needs its own; fixture paths otherwise. */
  readonly paths?: readonly AccessPath[];
  readonly onSave: (changes: GrantChanges) => Promise<void>;
  readonly onSaveAdvanced: (changes: AdvancedChanges) => Promise<void>;
  readonly onRecipientChange?: (next: AccessRecipient | null) => void;
};

/** Holds the recipient the way the route does, and answers each recipient's paths at once. */
function Harness(args: Args) {
  const [recipient, setRecipient] = React.useState(args.initial);

  return (
    <GrantsScreen
      catalogue={FIXTURE_ROWS}
      recipients={FIXTURE_RECIPIENTS}
      recipient={recipient}
      onRecipientChange={(next) => {
        args.onRecipientChange?.(next);
        setRecipient(next);
      }}
      paths={
        args.paths ??
        (recipient === null ? undefined : fixturePaths(recipient.id))
      }
      {...(args.link === undefined ? {} : { link: args.link })}
      onSave={async (changes) => {
        await args.onSave(changes);

        if (args.refusal !== undefined) throw new Error(args.refusal);
      }}
      advanced={{
        catalogue: ADVANCED_CATALOGUE,
        guards: recipient === null ? undefined : [],
        onSave: args.onSaveAdvanced,
        onSearchRecords: searchFixtureRecords,
      }}
      recordLabels={ADVANCED_LABELS}
    />
  );
}

const group = (id: string): AccessRecipient => ({ type: "group", id });

const person = (id: string): AccessRecipient => ({ type: "user", id });

const meta = {
  title: "Core/Access/GrantsScreen",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The Grants tab of Access (R-37a). Pick a group, or a person as the exception, move module rows between Catalog and Granted, pick the role of each Granted row, and save once. Every Remove opens a confirmation that names the roles that go and the paths that stay. A refused save keeps every staged change on the screen.",
      },
    },
    a11y: { test: "error" },
  },
  args: { initial: null, onSave: fn(), onSaveAdvanced: fn() },
  render: (args) => (
    <div className="p-4 md:p-8">
      <Harness {...args} />
    </div>
  ),
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

const pendingBar = () =>
  within(screen.getByRole("region", { name: "Unsaved changes" }));

const tickAndMove = async (row: string, button: RegExp) => {
  await userEvent.click(screen.getAllByRole("checkbox", { name: row })[0]!);
  await userEvent.click(screen.getByRole("button", { name: button }));
};

/** S1: a recipient switch with unsaved work asks first, and Cancel keeps the work. */
export const NoRecipient: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Choose a group" })
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Choose a group" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Operations · 40 members" })
    );
    await expect(
      await canvas.findByRole("group", { name: "Granted" })
    ).toBeVisible();

    await tickAndMove("Slides", /^Remove 1$/);
    await expect(pendingBar().getByText("1 unsaved change")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "People" }));

    const discard = await screen.findByRole("dialog", {
      name: "Discard 1 unsaved change?",
    });

    await waitFor(() =>
      expect(
        within(discard).getByText(
          "Switching to People drops the changes for Operations."
        )
      ).toBeVisible()
    );
    await userEvent.click(
      within(discard).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(pendingBar().getByText("1 unsaved change")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "People" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Discard",
      })
    );
    await expect(
      await canvas.findByRole("heading", { name: "Choose a person" })
    ).toBeVisible();
    await expect(canvas.queryByRole("group", { name: "Granted" })).toBeNull();
    await expect(
      canvas.queryByRole("region", { name: "Unsaved changes" })
    ).toBeNull();
  },
};

/** C06-2: the Grant to chips take the md height of the picker, and Advanced access sits at the row end. */
export const GrantToRowLinesUp: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    const grantTo = await canvas.findByRole("group", { name: "Grant to" });
    const row = within(grantTo.parentElement!);

    // The segmented track, not its segments, takes the row's md height (6wz1.105).
    const controls = [
      grantTo,
      ...row
        .getAllByRole("button")
        .filter((button) => !grantTo.contains(button)),
      ...row.getAllByRole("combobox"),
    ];

    const top = controls[0]!.getBoundingClientRect().top;

    // One string, so that a failure prints every control in full.
    await expect(
      controls
        .flatMap((control) => {
          const { height, top: at } = control.getBoundingClientRect();

          return height === 36 && at === top
            ? []
            : [`${control.textContent}: ${height} px at ${at}`];
        })
        .join("; ")
    ).toBe("");

    // 6wz1.107: the action holds the row's right end, with its icon.
    const advanced = row.getByRole("button", { name: "Advanced access" });

    await expect(advanced.querySelector("svg")).not.toBeNull();
    await expect(
      Math.abs(
        advanced.getBoundingClientRect().right -
          grantTo.parentElement!.getBoundingClientRect().right
      )
    ).toBeLessThanOrEqual(1);
  },
};

/** C08-4: the help trigger's hover fill starts clear of the heading. */
export const HelpClearsTheHeading: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole("heading", {
      name: "Modules and roles",
    });

    const help = canvas.getByRole("button", { name: "How access works" });

    await expect(
      help.getBoundingClientRect().left - heading.getBoundingClientRect().right
    ).toBeGreaterThanOrEqual(2);
  },
};

/** 6wz1.107: on a phone, Advanced access sits under the picker at the row's right end, with its icon. */
export const AdvancedAccessAtTheRowEndPhone: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    // The toolbar row: the card below also holds role selects and, after Task 6, Show.
    const toolbar = (await canvas.findByRole("group", { name: "Grant to" }))
      .parentElement!;

    const row = toolbar.getBoundingClientRect();

    const picker = within(toolbar)
      .getByRole("combobox")
      .getBoundingClientRect();

    const advanced = within(toolbar).getByRole("button", {
      name: "Advanced access",
    });

    const box = advanced.getBoundingClientRect();

    await expect(advanced.querySelector("svg")).not.toBeNull();
    await expect(Math.abs(box.right - row.right)).toBeLessThanOrEqual(1);
    await expect(box.top).toBeGreaterThanOrEqual(picker.bottom);
  },
};

export const NoRecipientPerson: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "People" }));
    await expect(
      await canvas.findByText(
        "A person is the exception. Use it when one person needs a module that their groups do not give."
      )
    ).toBeVisible();
  },
};

/** The prototype's role-choice state: Invoices on Operations from Viewer to Finance. */
export const RoleChoicePending: Story = {
  args: { initial: group("g-ops") },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Role for Invoices" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" })
    );
    await expect(pendingBar().getByText("1 to change")).toBeVisible();
  },
};

export const RoleChoicePendingPhone: Story = {
  ...RoleChoicePending,
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async (context) => {
    await RoleChoicePending.play?.(context);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

/** S2, second half: an Add alone saves at once, with the default role. */
export const AddPending: Story = {
  args: { initial: group("g-analysts") },
  play: async ({ args }) => {
    await tickAndMove("Placeholder", /^Add 1$/);
    await expect(pendingBar().getByText("1 to add")).toBeVisible();

    await userEvent.click(pendingBar().getByRole("button", { name: "Save" }));
    await expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        add: [{ row: "placeholder", roleId: "r-placeholder-user" }],
        change: [],
        remove: [],
      })
    );
  },
};

/** S2: a Remove confirms first, names the group path that stays, and saves the staged row. */
export const RemoveConfirm: Story = {
  args: { initial: person("p-jamie") },
  play: async ({ args }) => {
    await tickAndMove("Invoices", /^Remove 1$/);
    await expect(pendingBar().getByText("1 to remove")).toBeVisible();
    await expect(
      pendingBar().getByText("Finance stays, assigned via Finance team.")
    ).toBeVisible();

    await userEvent.click(pendingBar().getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Remove Invoices from Jamie Chen?",
    });

    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove and save" })
    );
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        add: [],
        change: [],
        remove: [{ row: "invoices" }],
      })
    );
  },
};

export const RemoveConfirmPhone: Story = {
  ...RemoveConfirm,
  globals: { viewport: { value: "phone390", isRotated: false } },
};

export const RemoveLast: Story = {
  args: { initial: person("p-sam") },
  play: async () => {
    await tickAndMove("Slides", /^Remove 1$/);
    await userEvent.click(pendingBar().getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Remove Slides from Sam Rivera?",
    });

    await waitFor(() => expect(dialog).toBeVisible());
  },
};

/** G6, G9: Finance team holds the switched-off Analytics, so its Granted row is a paused assignment. */
export const ModuleOff: Story = {
  args: { initial: group("g-finance") },
  play: async ({ canvas }) => {
    const granted = within(
      await canvas.findByRole("group", { name: "Granted" })
    );

    await expect(granted.getByText("Paused: Module off")).toBeVisible();
    await expect(
      within(canvas.getByRole("group", { name: "Catalog" })).queryByText(
        "Module off"
      )
    ).toBeNull();
  },
};

/** G6: a group without Analytics sees the module, not an assignment, as off in Catalog. */
export const ModuleOffInCatalog: Story = {
  args: { initial: group("g-ops") },
  play: async ({ canvas }) => {
    const catalog = within(
      await canvas.findByRole("group", { name: "Catalog" })
    );

    await expect(catalog.getByText("Module off")).toBeVisible();
    await expect(
      within(canvas.getByRole("group", { name: "Granted" })).queryByText(
        /^Paused/
      )
    ).toBeNull();
  },
};

export const CoreAsk: Story = {
  args: { initial: group("g-sales") },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Not shown here/)).toBeNull();
    await expect(
      screen.getByRole("group", { name: "Granted" })
    ).toHaveTextContent("Assigned via Tenant administrator (role)");
  },
};

const desktop = { viewport: { value: "desktop", isRotated: false } };

/** P08-4: Show narrows both panes to one caption, and a staged change it hides still counts. */
export const ShowFilter: Story = {
  args: { initial: group("g-ops") },
  globals: desktop,
  play: async ({ args, canvas }) => {
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Role for Invoices" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" })
    );
    await userEvent.click(canvas.getByRole("combobox", { name: "Show" }));
    await userEvent.click(await screen.findByRole("option", { name: "Core" }));

    const catalog = within(canvas.getByRole("group", { name: "Catalog" }));

    const granted = within(canvas.getByRole("group", { name: "Granted" }));

    await expect(catalog.queryAllByText(/^Modules · /)).toHaveLength(0);
    await expect(granted.queryAllByText(/^Modules · /)).toHaveLength(0);
    await expect(granted.getByText(/^Core · /)).toBeVisible();

    await expect(
      canvas.queryByRole("combobox", { name: "Role for Invoices" })
    ).toBeNull();
    // Review Focus 2: the hidden row's staged change still counts, and Save writes it.
    await expect(pendingBar().getByText("1 to change")).toBeVisible();

    await userEvent.click(pendingBar().getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        add: [],
        change: [
          {
            row: "invoices",
            assignmentId: "a-ops-1",
            roleId: "r-invoices-finance",
          },
        ],
        remove: [],
      })
    );
  },
};

/** A tick that Show hides still counts, as one a search hides does, and Add moves it. */
export const ShowKeepsTicks: Story = {
  args: { initial: group("g-analysts") },
  globals: desktop,
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Placeholder" })
    );
    await userEvent.click(canvas.getByRole("combobox", { name: "Show" }));
    await userEvent.click(await screen.findByRole("option", { name: "Core" }));

    await userEvent.click(canvas.getByRole("button", { name: "Add 1" }));
    await expect(pendingBar().getByText("1 to add")).toBeVisible();
  },
};

/** P08-4: on a phone the Show select drops under the heading, and nothing overflows sideways. */
export const ShowFilterPhone: Story = {
  ...ShowFilter,
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async (context) => {
    await ShowFilter.play?.(context);

    const heading = context.canvas.getByRole("heading", {
      name: "Modules and roles",
    });

    const show = context.canvas.getByRole("combobox", { name: "Show" });

    await expect(show.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      heading.getBoundingClientRect().bottom
    );
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

/** P08-3: from 768 to 1279 px the panes stack too, Catalog above Granted, each as wide as the card. */
export const StackedBelowXl: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "phone844x390", isRotated: false } },
  play: async ({ canvas }) => {
    const catalog = (
      await canvas.findByRole("group", { name: "Catalog" })
    ).getBoundingClientRect();

    const granted = canvas
      .getByRole("group", { name: "Granted" })
      .getBoundingClientRect();

    await expect(catalog.bottom).toBeLessThanOrEqual(granted.top);
    await expect(granted.width).toBe(catalog.width);
  },
};

const grantedPane = () =>
  within(screen.getByRole("group", { name: "Granted" }));

/**
 * d8l5.42: Riley Park gets Invoices and the switched-off Analytics through Finance team. Both show
 * in Granted, read-only, with the group as their source. A direct Invoices role added on top shows
 * both paths, and the module still counts once.
 */
export const ThroughGroupIsReadOnly: Story = {
  args: { initial: person("p-riley"), onRecipientChange: fn() },
  globals: desktop,
  play: async ({ args, canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Granted · 3" })
    ).toBeVisible();
    await expect(
      grantedPane().getAllByRole("button", { name: "Finance team" })
    ).toHaveLength(2);
    // d8l5.60: the role and its source read on one line (A-4).
    await expect(
      screen.getByRole("group", { name: "Granted" })
    ).toHaveTextContent("Finance · Assigned via Finance team");
    await expect(
      screen.getByRole("group", { name: "Granted" })
    ).toHaveTextContent("Analytics viewer · Assigned via Finance team");
    await expect(
      grantedPane().queryByRole("checkbox", { name: "Invoices" })
    ).toBeNull();
    await expect(grantedPane().getByText("Paused: Module off")).toBeVisible();

    const catalog = within(canvas.getByRole("group", { name: "Catalog" }));

    await userEvent.click(catalog.getByRole("checkbox", { name: "Invoices" }));
    await userEvent.click(catalog.getByRole("button", { name: "Add 1" }));

    await expect(
      grantedPane().getByRole("checkbox", { name: "Invoices" })
    ).toBeVisible();
    // C1: a staged row shows the unsaved dot with "(unsaved)", never "Pending" (G15).
    await expect(grantedPane().getByText("(unsaved)")).toBeInTheDocument();
    await expect(grantedPane().queryByText("Pending")).toBeNull();
    await expect(
      grantedPane().getAllByRole("button", { name: "Finance team" })
    ).toHaveLength(2);
    await expect(
      canvas.getByRole("heading", { name: "Granted · 3" })
    ).toBeVisible();

    await userEvent.click(
      grantedPane().getAllByRole("button", { name: "Finance team" })[0]!
    );
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Discard 1 unsaved change?" })
      ).getByRole("button", { name: "Discard" })
    );

    await expect(args.onRecipientChange).toHaveBeenLastCalledWith({
      type: "group",
      id: "g-finance",
    });
    await expect(
      canvas.getByRole("button", { name: "Groups" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.getByRole("combobox", { name: "Choose a group" })
    ).toHaveTextContent("Finance team");
  },
};

/** A12: the stacked phone form keeps the source line and its link. */
export const ThroughGroupIsReadOnlyPhone: Story = {
  args: { initial: person("p-riley") },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async () => {
    await expect(
      (await screen.findAllByRole("button", { name: "Finance team" }))[0]
    ).toBeVisible();
    await expect(
      grantedPane().getAllByRole("button", { name: "Finance team" })
    ).toHaveLength(2);
  },
};

/** d8l5.42: Genie Administrators reaches Ask only through Tenant administrator, which opens Advanced access. */
export const ThroughCoreRoleIsReadOnly: Story = {
  args: { initial: group("g-admins") },
  globals: desktop,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Granted · 1" })
    ).toBeVisible();
    await expect(
      screen.getByRole("group", { name: "Granted" })
    ).toHaveTextContent("Assigned via Tenant administrator (role)");
    await expect(
      within(canvas.getByRole("group", { name: "Catalog" })).getByText(
        "Also assigned via Tenant administrator"
      )
    ).toBeVisible();

    await userEvent.click(
      grantedPane().getByRole("button", { name: "Tenant administrator" })
    );

    const sheet = await advancedSheet();

    await waitFor(() =>
      expect(sheet.getAllByText("Tenant administrator")[0]).toBeVisible()
    );
  },
};

/** P11-34: a direct role that the row owns is no route, also when it is at one record. */
export const DirectRecordRoleIsNoRoute: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    const granted = await canvas.findByRole("group", { name: "Granted" });

    await expect(granted).toHaveTextContent("Finance · Direct");
    await expect(granted).not.toHaveTextContent("Assigned via Finance (role)");
    await expect(granted).toHaveTextContent("One record · INV-2026-0142");
  },
};

/** G6: a refused save keeps every staged change, and its reason takes focus. */
export const SaveRefused: Story = {
  args: {
    initial: group("g-ops"),
    refusal:
      "The access changes were not saved. Invoices is off for this deployment. Your changes are still here.",
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Role for Invoices" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" })
    );
    await userEvent.click(pendingBar().getByRole("button", { name: "Save" }));

    const alert = await pendingBar().findByRole("alert");

    await expect(alert).toHaveTextContent(
      "Invoices is off for this deployment."
    );
    await waitFor(() => expect(alert).toHaveFocus());
    await expect(pendingBar().getByText("1 unsaved change")).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Role for Invoices" })
    ).toHaveTextContent("Finance");
  },
};

/** A save in flight freezes the picker and the rows, so no edit races the write it does not see. */
export const SaveInFlight: Story = {
  args: {
    initial: group("g-ops"),
    onSave: fn(() => new Promise<void>(() => undefined)),
  },
  play: async ({ canvas }) => {
    const choice = await canvas.findByRole("combobox", {
      name: "Role for Invoices",
    });

    await userEvent.click(choice);
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" })
    );
    await userEvent.click(pendingBar().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(choice.closest("[inert]")).not.toBeNull());
    await expect(
      canvas
        .getByRole("button", { name: "People", hidden: true })
        .closest("[inert]")
    ).not.toBeNull();
  },
};

const advancedSheet = async () =>
  within(await screen.findByRole("dialog", { name: "Advanced access" }));

/** W2: Advanced access waits for a recipient, then opens on their advanced roles. */
export const AdvancedAccessOpensFromTheToolbar: Story = {
  play: async ({ canvas }) => {
    const open = canvas.getByRole("button", { name: "Advanced access" });
    const trigger = canvas.getByRole("combobox", { name: "Choose a group" });

    // Bug caught: the button was disabled with its reason only in a title tooltip.
    await expect(open).toBeEnabled();
    await expect(open).not.toHaveAttribute("title");

    await userEvent.click(open);

    await expect(canvas.getByText("Choose a group first.")).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-invalid", "true");
    await expect(trigger).toHaveAccessibleDescription("Choose a group first.");
    await expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("option", { name: "Operations · 40 members" })
    );
    await waitFor(() =>
      expect(canvas.queryByText("Choose a group first.")).toBeNull()
    );
    await userEvent.click(open);

    const sheet = await advancedSheet();

    // The sheet fades in, so its rows turn visible after the transition.
    await waitFor(() =>
      expect(sheet.getByText("Invoice approver")).toBeVisible()
    );
  },
};

const admins = {
  type: "group",
  id: "g-admins",
  name: "Genie Administrators",
  source: "local",
} as const;

/**
 * A-4: an inherited row names its role and how on one line, also stacked on a phone, and the role
 * never stands alone in its own element.
 */
export const InheritedRouteOnOneLineOnPhone: Story = {
  args: {
    initial: person("p-riley"),
    paths: [tenantAdminOf("a-riley-admin", admins)],
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    const granted = await canvas.findByRole("group", { name: "Granted" });

    await expect(granted).toHaveTextContent(
      "Tenant administrator · Assigned via Genie Administrators"
    );
    await expect(
      canvas.queryByText("Tenant administrator", { exact: true })
    ).toBeNull();
    await expect(
      within(granted).getByRole("button", { name: "Genie Administrators" })
    ).toBeVisible();
  },
};

/** A-2: the group's two Ask rows say how each one arrives, so they never read alike. */
export const GroupAskRowsSayHow: Story = {
  args: {
    initial: group("g-admins"),
    paths: [
      held("a-admins-ask", admins, "r-ask-user"),
      tenantAdminOf("a-admins-admin", admins),
    ],
  },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    const granted = await canvas.findByRole("group", { name: "Granted" });

    await expect(
      within(granted).getByText("Direct", { exact: true })
    ).toBeVisible();
    await expect(granted).toHaveTextContent(
      "Assigned via Tenant administrator (role)"
    );
  },
};

/** A-2: a direct role that opens no module gets its own row, and its way into Advanced access. */
export const RoleWithoutModuleHasItsOwnRow: Story = {
  args: {
    initial: person("p-jamie"),
    paths: [
      {
        ...fixturePath({
          id: "a-jamie-auditor",
          holder: { type: "user", id: "p-jamie", name: "Jamie Chen" },
          role: { id: "r-auditor", name: "Auditor" },
          moduleId: "core",
        }),
        role: {
          id: "r-auditor",
          name: "Auditor",
          kind: "system",
          moduleId: null,
          permissions: ["core:audit:read"],
        },
      },
    ],
  },
  play: async ({ canvas }) => {
    const granted = await canvas.findByRole("group", { name: "Granted" });

    await expect(within(granted).getByText("Auditor")).toBeVisible();
    await expect(canvas.queryByText(/Not shown here/)).toBeNull();

    await userEvent.click(
      within(granted).getByRole("button", {
        name: "Change in Advanced access",
      })
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Advanced access",
    });

    await waitFor(() => expect(sheet).toBeVisible());
    await expect(sheet).toHaveTextContent("Auditor");
  },
};

/** W2, AD12: a `?role=` link of a core role opens Advanced access with the role staged. */
export const CoreRoleLinkOpensAdvancedAccess: Story = {
  args: { initial: group("g-ops"), link: { role: "r-auditor" } },
  play: async ({ args }) => {
    const sheet = await advancedSheet();

    const row = sheet.getByText("Auditor", { exact: true }).closest("li");

    await expect(row).not.toBeNull();
    await waitFor(() =>
      expect(
        within(row ?? document.body).getByText("(unsaved)")
      ).toBeInTheDocument()
    );
    await expect(
      within(row ?? document.body).queryByText("Pending")
    ).toBeNull();
    await expect(args.onSaveAdvanced).not.toHaveBeenCalled();
  },
};

/** LK1: a `?recipient=` link of a person presses People and picks the person once. */
export const PrefilledPersonLink: Story = {
  args: { link: { recipient: "p-jamie" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("group", { name: "Granted" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "People" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.getByRole("combobox", { name: "Choose a person" })
    ).toHaveTextContent("Jamie Chen");
  },
};

/** LK1: a link to an id that no list holds (an archived group, an old bookmark) picks nobody. */
export const UnlistedRecipientLinkIsIgnored: Story = {
  args: { link: { recipient: "g-former" } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Choose a group" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Groups" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.queryByRole("group", { name: "Granted" })).toBeNull();
  },
};

/** P17: a `?role=` link stages a change on the first recipient, and writes nothing. */
export const PrefilledRoleLink: Story = {
  args: { initial: group("g-ops"), link: { role: "r-invoices-finance" } },
  play: async ({ args }) => {
    await expect(
      await screen.findByRole("region", { name: "Unsaved changes" })
    ).toHaveTextContent("1 to change");
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
