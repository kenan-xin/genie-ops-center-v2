import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { AdvancedChanges } from "../../services/roles/advanced.ts";
import type { AccessRecipient } from "../../services/roles/effective-access.ts";
import type { GrantChanges } from "../../services/roles/grants.ts";
import {
  ADVANCED_CATALOGUE,
  ADVANCED_LABELS,
  FIXTURE_RECIPIENTS,
  FIXTURE_ROWS,
  fixturePaths,
  searchFixtureRecords,
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
  readonly onSave: (changes: GrantChanges) => Promise<void>;
  readonly onSaveAdvanced: (changes: AdvancedChanges) => Promise<void>;
};

/** Holds the recipient the way the route does, and answers each recipient's paths at once. */
function Harness(args: Args) {
  const [recipient, setRecipient] = React.useState(args.initial);

  return (
    <GrantsScreen
      catalogue={FIXTURE_ROWS}
      recipients={FIXTURE_RECIPIENTS}
      recipient={recipient}
      onRecipientChange={setRecipient}
      paths={recipient === null ? undefined : fixturePaths(recipient.id)}
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

    await userEvent.click(
      pendingBar().getByRole("button", { name: "Save changes" })
    );
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
      pendingBar().getByText("Finance through Finance team stays.")
    ).toBeVisible();

    await userEvent.click(
      pendingBar().getByRole("button", { name: "Save changes" })
    );

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
    await userEvent.click(
      pendingBar().getByRole("button", { name: "Save changes" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Remove Slides from Sam Rivera?",
    });

    await waitFor(() => expect(dialog).toBeVisible());
  },
};

export const ModuleOff: Story = {
  args: { initial: group("g-finance") },
};

export const CoreAsk: Story = {
  args: { initial: group("g-sales") },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Not shown here: Tenant administrator (Core administration, whole tenant)"
      )
    ).toBeVisible();
  },
};

/** G6: a refused save keeps every staged change, and its reason takes focus. */
export const SaveRefused: Story = {
  args: {
    initial: group("g-ops"),
    refusal:
      "The access changes were not saved. Invoices is switched off for this deployment. Your changes are still here.",
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Role for Invoices" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" })
    );
    await userEvent.click(
      pendingBar().getByRole("button", { name: "Save changes" })
    );

    const alert = await pendingBar().findByRole("alert");

    await expect(alert).toHaveTextContent(
      "Invoices is switched off for this deployment."
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
    await userEvent.click(
      pendingBar().getByRole("button", { name: "Save changes" })
    );

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

    await expect(open).toBeDisabled();

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Choose a group" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Operations · 40 members" })
    );
    await waitFor(() => expect(open).toBeEnabled());
    await userEvent.click(open);

    const sheet = await advancedSheet();

    // The sheet fades in, so its rows turn visible after the transition.
    await waitFor(() =>
      expect(sheet.getByText("Invoice approver")).toBeVisible()
    );
  },
};

/** W2: "Not shown here" names the record by label and opens Advanced access. */
export const NotShownHereOpensAdvancedAccess: Story = {
  args: { initial: group("g-ops") },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Finance \(Invoices, one record, INV-2026-0142\)/)
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Open Advanced access" })
    );
    const sheet = await advancedSheet();

    await waitFor(() =>
      expect(sheet.getByText("One record · INV-2026-0142")).toBeVisible()
    );
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
      expect(within(row ?? document.body).getByText("Pending")).toBeVisible()
    );
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
