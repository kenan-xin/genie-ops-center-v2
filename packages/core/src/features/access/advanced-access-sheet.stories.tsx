import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type ComponentProps, useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { ScopeRecord } from "../../services/roles/records.ts";
import {
  ADVANCED_CATALOGUE,
  ADVANCED_LABELS,
  ADVANCED_PATHS,
  FIXTURE_ROWS,
  searchFixtureRecords,
} from "./__fixtures__/access.ts";
import { AdvancedAccessSheet } from "./advanced-access-sheet.tsx";

const meta = {
  title: "Core/Access/AdvancedAccessSheet",
  component: AdvancedAccessSheet,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      // Every story mounts the sheet open; inline, the 15 modal sheets stack over the docs page.
      story: { inline: false, iframeHeight: 640 },
      description: {
        component:
          "Advanced access on the Grants tab (R-37c): extra access that the main list does not cover, such as admin portal rights, the Auditor role, a role on one record only and custom roles. Each change shows as not saved, and one Save keeps them all. Remove is turned off in place on a protected Tenant administrator row (R-38). A refused save keeps every change.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    open: true,
    recipientName: "Operations",
    rows: ADVANCED_PATHS["g-ops"],
    catalogue: ADVANCED_CATALOGUE,
    guards: [],
    grantRows: FIXTURE_ROWS,
    recordLabels: ADVANCED_LABELS,
    onSearchRecords: fn(searchFixtureRecords),
    onSave: fn(async () => undefined),
    onClose: fn(),
  },
} satisfies Meta<typeof AdvancedAccessSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

const sheet = async () =>
  within(await screen.findByRole("dialog", { name: "Advanced access" }));

/** The list row of one role, found by its exact name. */
const rowOf = (scope: ReturnType<typeof within>, role: string) => {
  const row = scope.getByText(role, { exact: true }).closest("li");

  if (row === null) throw new Error(`No row for ${role}`);

  return within(row);
};

const chooseRole = async (label: string) => {
  await userEvent.click(
    (await sheet()).getByRole("combobox", { name: "Role" })
  );
  await userEvent.click(await screen.findByRole("option", { name: label }));
};

/** K1: each row shows its module and its scope, and a custom role says so. */
export const ListsAdvancedRoles: Story = {
  play: async () => {
    await expect(
      await screen.findByRole("dialog", { name: "Advanced access" })
    ).toHaveAccessibleDescription(
      "Extra access for Operations that the main list does not cover: admin portal rights, the Auditor role, a role on one record only, and custom roles. Nothing changes until you press Save."
    );

    const body = await sheet();

    const finance = rowOf(body, "Finance");

    await expect(finance.getByText("Invoices")).toBeVisible();
    await expect(finance.getByText("One record · INV-2026-0142")).toBeVisible();

    const approver = rowOf(body, "Invoice approver");

    await expect(approver.getByText("All records")).toBeVisible();
    await expect(approver.getByText("Custom role")).toBeVisible();
    await expect(body.getByText("Nothing to save yet.")).toBeVisible();
  },
};

export const ListsAdvancedRolesPhone: Story = {
  ...ListsAdvancedRoles,
  globals: { viewport: { value: "phone390", isRotated: false } },
};

/** K1: a record the caller cannot open shows its id. */
export const RecordWithoutLabel: Story = {
  args: { recordLabels: new Map() },
  play: async () => {
    await expect(
      rowOf(await sheet(), "Finance").getByText("One record · inv-0142")
    ).toBeVisible();
  },
};

/** A long record label wraps inside the sheet on a phone, and does not run past its edge. */
export const LongRecordLabelPhone: Story = {
  args: {
    recordLabels: new Map([
      [
        "invoices-invoice\u0000inv-0142",
        "Placeholder record 00000000-0000-4000-8000-0000000000a1",
      ],
    ]),
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async () => {
    const dialog = await screen.findByRole("dialog", {
      name: "Advanced access",
    });

    const text = within(dialog).getByText(/^One record · Placeholder record/);

    // The pill box stops at the row's width, so the text inside it is what overflows.
    const pill = text.closest<HTMLElement>("[class*='rounded-full']") ?? text;

    await waitFor(() =>
      expect(pill.scrollWidth).toBeLessThanOrEqual(pill.clientWidth)
    );
  },
};

/** K2: Undo restores a row, and Save sends only the removal still staged. */
export const RemoveAndUndo: Story = {
  play: async ({ args }) => {
    const body = await sheet();

    await userEvent.click(body.getByRole("button", { name: "Remove Finance" }));
    await expect(
      rowOf(body, "Finance").getByText("(unsaved removal)")
    ).toBeInTheDocument();

    await userEvent.click(body.getByRole("button", { name: "Undo" }));
    await expect(
      rowOf(body, "Finance").queryByText("(unsaved removal)")
    ).toBeNull();

    await userEvent.click(
      body.getByRole("button", { name: "Remove Invoice approver" })
    );
    await expect(body.getByText("1 unsaved change")).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        add: [],
        remove: [{ assignmentId: "a-ops-approver" }],
      })
    );
    await expect(args.onSave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};

const LEADERSHIP = {
  recipientName: "Leadership",
  rows: ADVANCED_PATHS["g-leads"],
} as const;

/** K3: the last active administrator path keeps a disabled Remove with its reason. */
export const GuardedLastAdministrator: Story = {
  args: {
    ...LEADERSHIP,
    guards: [{ assignmentId: "a-leads-admin", reason: "last-administrator" }],
  },
  play: async () => {
    const row = rowOf(await sheet(), "Tenant administrator");

    const reason =
      "This is the last active Tenant administrator. Assign the role to someone else first.";

    const remove = row.getByRole("button", {
      name: "Remove Tenant administrator",
    });

    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAccessibleDescription(reason);
    await expect(row.getByText(reason)).toBeVisible();
  },
};

export const GuardedLastAdministratorPhone: Story = {
  ...GuardedLastAdministrator,
  globals: { viewport: { value: "phone390", isRotated: false } },
};

/** K3: an administrator cannot remove their own Tenant administrator role. */
export const GuardedOwnRole: Story = {
  args: {
    recipientName: "Alex Morgan",
    rows: ADVANCED_PATHS["g-leads"],
    guards: [{ assignmentId: "a-leads-admin", reason: "self-protection" }],
  },
  play: async () => {
    const row = rowOf(await sheet(), "Tenant administrator");

    await expect(
      row.getByRole("button", { name: "Remove Tenant administrator" })
    ).toBeDisabled();
    await expect(
      row.getByText(
        "Only another administrator can remove your own Tenant administrator role."
      )
    ).toBeVisible();
  },
};

/** The Grants host: the sheet stays mounted, so closing and reopening runs its reset block. */
function ReopenedSheet(props: ComponentProps<typeof AdvancedAccessSheet>) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open the sheet again
      </button>
      <AdvancedAccessSheet
        {...props}
        open={open}
        onClose={() => {
          props.onClose();
          setOpen(false);
        }}
      />
    </>
  );
}

/** K4: a module role here needs a record, picked by search, and saves with it. */
export const AddsOneRecord: Story = {
  render: (args) => <ReopenedSheet {...args} />,
  play: async ({ args }) => {
    const body = await sheet();

    const add = body.getByRole("button", { name: "Add to the list" });
    const save = body.getByRole("button", { name: "Save" });
    const role = body.getByRole("combobox", { name: "Role" });

    // Nothing staged: Save stays focusable and names its reason.
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(save).toHaveAccessibleDescription("Nothing to save yet.");

    // Bug caught: Add was disabled with no role, so nothing said what was missing.
    await expect(add).toBeEnabled();
    await userEvent.click(add);
    await expect(body.getByText("Choose a role first.")).toBeVisible();
    await expect(role).toHaveAttribute("aria-invalid", "true");
    await expect(role).toHaveAccessibleDescription("Choose a role first.");
    await expect(body.queryByText("(unsaved)")).toBeNull();

    // Bug caught: the error outlived the close, because the open reset skipped it.
    await userEvent.click(
      body.getByRole("button", { name: "Close Advanced access" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(
      screen.getByRole("button", { name: "Open the sheet again" })
    );

    const reopened = await sheet();

    await expect(reopened.queryByText("Choose a role first.")).toBeNull();
    await expect(
      reopened.getByRole("combobox", { name: "Role" })
    ).not.toHaveAttribute("aria-invalid", "true");

    const reopenedAdd = reopened.getByRole("button", {
      name: "Add to the list",
    });

    await userEvent.click(reopenedAdd);
    // The reopened sheet fades in, so its error turns visible after the transition.
    await waitFor(() =>
      expect(reopened.getByText("Choose a role first.")).toBeVisible()
    );

    await chooseRole("Placeholder: Placeholder user");
    await expect(reopened.queryByText("Choose a role first.")).toBeNull();
    await expect(
      reopened.getByText(
        "Here a module role covers one record only. To give the whole module, use its row on Grants."
      )
    ).toBeVisible();

    // A module role with no record picked says so too.
    await userEvent.click(reopenedAdd);
    await expect(reopened.getByText("Choose a record first.")).toBeVisible();

    const record = reopened.getByRole("combobox", { name: "Choose a record" });

    await expect(record).toHaveAttribute("aria-invalid", "true");
    await expect(record).toHaveAccessibleDescription("Choose a record first.");

    await userEvent.click(record);
    await userEvent.click(
      await screen.findByRole("option", { name: "North depot" })
    );
    await userEvent.click(reopenedAdd);

    const added = rowOf(reopened, "Placeholder user");

    await expect(added.getByText("(unsaved)")).toBeInTheDocument();
    await expect(added.getByText("One record · North depot")).toBeVisible();

    await userEvent.click(reopened.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        add: [
          {
            roleId: "r-placeholder-user",
            scope: { type: "placeholder-record", id: "rec-north" },
          },
        ],
        remove: [],
      })
    );
  },
};

export const AddsOneRecordPhone: Story = {
  ...AddsOneRecord,
  globals: { viewport: { value: "phone390", isRotated: false } },
};

/** 6wz1.105: the Scope track keeps its own width inside the full-width field. */
export const ScopedCustomRole: Story = {
  play: async () => {
    const body = await sheet();

    await chooseRole("Invoice approver (Invoices)");

    const group = body.getByRole("group", { name: "Scope" });

    await expect(group.getBoundingClientRect().width).toBeLessThan(
      group.parentElement!.getBoundingClientRect().width
    );
  },
};

/** The searches of `LateSearchAnswer`, each waiting until the story answers it. */
const late = new Map<string, (records: readonly ScopeRecord[]) => void>();

/** K5: an answer for an older query never replaces the answer of the newest query. */
export const LateSearchAnswer: Story = {
  args: {
    onSearchRecords: fn(
      (_type: string, query: string) =>
        new Promise<readonly ScopeRecord[]>((resolve) => {
          late.set(query, resolve);
        })
    ),
  },
  play: async ({ args }) => {
    late.clear();

    const body = await sheet();

    await chooseRole("Placeholder: Placeholder user");
    await userEvent.click(
      body.getByRole("combobox", { name: "Choose a record" })
    );

    const search = await screen.findByRole("combobox", {
      name: "Search records",
    });

    // Each letter waits for its own search, so the 300 ms debounce sends both queries.
    await userEvent.type(search, "a");
    await waitFor(() =>
      expect(args.onSearchRecords).toHaveBeenCalledWith(
        "placeholder-record",
        "a"
      )
    );
    await userEvent.type(search, "b");
    await waitFor(() =>
      expect(args.onSearchRecords).toHaveBeenCalledWith(
        "placeholder-record",
        "ab"
      )
    );

    late.get("ab")?.([{ id: "rec-bay", label: "Bay depot" }]);
    await expect(
      await screen.findByRole("option", { name: "Bay depot" })
    ).toBeVisible();

    late.get("a")?.([{ id: "rec-anchor", label: "Anchor depot" }]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(
      screen.queryByRole("option", { name: "Anchor depot" })
    ).toBeNull();
    await expect(
      screen.getByRole("option", { name: "Bay depot" })
    ).toBeVisible();
  },
};

/** K6: a switched-off module takes no new grant, and the amber line names it. */
export const ModuleOff: Story = {
  play: async () => {
    const body = await sheet();

    await expect(
      body.getByText(
        "Analytics is off. You cannot add its roles until it is on, but you can remove them."
      )
    ).toBeVisible();

    await userEvent.click(body.getByRole("combobox", { name: "Role" }));
    await expect(
      await screen.findByRole("option", {
        name: "Dashboard curator (Analytics), module off",
      })
    ).toHaveAttribute("aria-disabled", "true");
  },
};

/** K8: a save in flight keeps the sheet open, so its late answer cannot close another recipient's sheet. */
export const SaveInFlight: Story = {
  args: { onSave: fn(() => new Promise<void>(() => undefined)) },
  play: async ({ args }) => {
    const body = await sheet();

    await userEvent.click(body.getByRole("button", { name: "Remove Finance" }));
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onSave).toHaveBeenCalled());

    const save = body.getByRole("button", { name: "Save" });

    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(
      screen.queryByRole("button", { name: "Saving…", hidden: true })
    ).toBeNull();

    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).not.toHaveBeenCalled();
    await expect(
      body.getByRole("button", { name: "Close Advanced access" })
    ).toBeDisabled();
  },
};

/** K7: a refused save keeps every staged change and shows the server's reason. */
export const RefusedSave: Story = {
  args: {
    onSave: fn(async () => {
      throw {
        message:
          "That change would leave no active tenant administrator. Give the role to another active person first.",
      };
    }),
  },
  play: async ({ args }) => {
    const body = await sheet();

    await userEvent.click(body.getByRole("button", { name: "Remove Finance" }));
    await userEvent.click(body.getByRole("button", { name: "Save" }));

    await expect(await body.findByRole("alert")).toHaveTextContent(
      "That change would leave no active tenant administrator."
    );
    await expect(
      rowOf(body, "Finance").getByText("(unsaved removal)")
    ).toBeInTheDocument();
    await expect(body.getByText("1 unsaved change")).toBeVisible();
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};
