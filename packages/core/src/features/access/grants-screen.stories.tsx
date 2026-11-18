import { useListState } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { AdvancedChanges } from "../../services/roles/advanced.ts";
import type { AccessPath } from "../../services/roles/effective-access.ts";
import type { GrantChanges } from "../../services/roles/grants.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";
import {
  ADVANCED_CATALOGUE,
  ADVANCED_LABELS,
  FIXTURE_ROWS,
  fixturePath,
  fixturePaths,
  fixtureRecipient,
  fixtureRecipientPage,
  held,
  searchFixtureRecords,
  tenantAdminOf,
} from "./__fixtures__/access.ts";
import { GrantsScreen } from "./grants-screen.tsx";
import { GRANTS_LIST, grantsListInput } from "./grants-view.ts";

type Args = {
  readonly initial: RecipientRow | null;
  readonly link?: {
    readonly recipient?: string;
    readonly module?: string;
    readonly role?: string;
  };
  readonly refusal?: string;
  /** Paths of the chosen recipient, when a story needs its own; fixture paths otherwise. */
  readonly paths?: readonly AccessPath[];
  /** Paths of this recipient never arrive, so the screen between two recipients shows. */
  readonly loadingFor?: string;
  readonly onSave: (changes: GrantChanges) => Promise<void>;
  readonly onSaveAdvanced: (changes: AdvancedChanges) => Promise<void>;
  readonly onRecipientChange?: (next: RecipientRow | null) => void;
};

/** Holds the recipient the way the route does, and answers each recipient's paths at once. */
function Harness(args: Args) {
  const [recipient, setRecipient] = React.useState<RecipientRow | null>(
    args.initial
  );

  const state = useListState(GRANTS_LIST);

  const input = grantsListInput(state.params);

  const [offset, setOffset] = React.useState(0);

  return (
    <GrantsScreen
      catalogue={FIXTURE_ROWS}
      recipient={recipient}
      onRecipientChange={(next) => {
        args.onRecipientChange?.(next);
        setRecipient(next);
      }}
      paths={
        args.paths ??
        (recipient === null || recipient.id === args.loadingFor
          ? undefined
          : fixturePaths(recipient.id))
      }
      search={async (query) => fixtureRecipientPage({ query, limit: 10 })}
      lookup={async (id) =>
        fixtureRecipientPage({ ids: [id], limit: 1 }).rows[0] ?? null
      }
      list={{
        state,
        page: (() => {
          const found = fixtureRecipientPage({ ...input, offset, limit: 25 });

          return {
            rows: found.rows,
            from: offset + 1,
            total: found.total,
            hasPrevious: offset > 0,
            hasNext: offset + found.rows.length < found.total,
          };
        })(),
        onPage: (step) => setOffset(offset + step * 25),
        paging: false,
      }}
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

const group = fixtureRecipient;

const person = fixtureRecipient;

/** The story's address: only the given list parameters, so each story starts from its own filters. */
const address = (params: Readonly<Record<string, string>>) => () => {
  const url = new URL(window.location.href);

  for (const name of ["q", "show"]) url.searchParams.delete(name);

  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, value);

  window.history.replaceState(null, "", url);
};

const meta = {
  title: "Core/Access/GrantsScreen",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The Grants tab of Access (R-37a, P12-17). It opens on every group and person; a row opens its editor. Grant to changes the recipient and All groups and people returns to the list, each behind the unsaved-changes confirm. Move module rows between Catalog and Granted, pick the role of each Granted row, and save once. Every Remove opens a confirmation that names the roles that go and the paths that stay. A refused save keeps every staged change on the screen.",
      },
    },
    a11y: { test: "error" },
  },
  args: { initial: null, onSave: fn(), onSaveAdvanced: fn() },
  beforeEach: address({}),
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

/** T10-a (d8l5.62): Grants opens on every group, then every person, with counts and the range; no empty chooser. */
export const OpensOnGroupsAndPeople: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Groups and people" })
    ).toBeVisible();
    await expect(
      canvas.getByText("Open one to change several of its modules at once.")
    ).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: /^Choose a/ })
    ).toBeNull();

    const open = canvas.getAllByRole("button", {
      name: /^Open .+ in Grants$/,
    });

    await expect(
      open.map((button) => button.getAttribute("aria-label"))
    ).toEqual(
      [
        "Analysts",
        "Finance team",
        "Genie Administrators",
        "Leadership",
        "Operations",
        "Project office",
        "Sales desk",
        "Alex Morgan",
        "Alex Morgan",
        "Casey Park",
        "Jamie Chen",
        "Jordan Lee",
        "Riley Park",
        "Sam Rivera",
      ].map((name) => `Open ${name} in Grants`)
    );

    const table = within(
      canvas.getByRole("table", { name: "Groups and people, groups first" })
    );

    await expect(
      table.getByRole("row", { name: /Operations/ })
    ).toHaveTextContent("Group · 40 members");
    await expect(
      table.getByRole("row", { name: /Operations/ })
    ).toHaveTextContent("3");
    await expect(
      table.getByRole("row", { name: /Analysts/ })
    ).toHaveTextContent("None");
    await expect(
      table.getByRole("row", { name: /Project office/ })
    ).toHaveTextContent("Archived");
    await expect(canvas.getByText("1–14 of 14")).toBeVisible();
  },
};

/** T10-b (C11-24): a row opens that recipient's editor, and All groups and people returns to the list. */
export const RowOpensTheEditor: Story = {
  args: { onRecipientChange: fn() },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Operations in Grants" })
    );

    await expect(args.onRecipientChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "group", id: "g-ops" })
    );
    await expect(
      await canvas.findByRole("heading", { name: "Access assignments" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Grant to" })
    ).toHaveTextContent("Operations");
    await expect(canvas.getByRole("group", { name: "Granted" })).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "Groups and people" })
    ).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "All groups and people" })
    );
    await expect(
      await canvas.findByRole("heading", { name: "Groups and people" })
    ).toBeVisible();
    await expect(args.onRecipientChange).toHaveBeenLastCalledWith(null);
  },
};

/** T10-c (G2 change 3): a new pick in Grant to keeps the editor while the new paths load. */
export const ChangeOfRecipientKeepsTheScreen: Story = {
  args: { initial: group("g-ops"), loadingFor: "g-finance" },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Grant to" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Finance team/ })
    );

    await expect(
      canvas.getByRole("combobox", { name: "Grant to" })
    ).toHaveTextContent("Finance team");
    await expect(
      canvas.getByRole("heading", { name: "Access assignments" })
    ).toBeVisible();
    await expect(
      canvas.getByText("Loading the roles of Finance team…")
    ).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "Groups and people" })
    ).toBeNull();
    await expect(
      canvas.queryByRole("heading", { name: /^Choose a/ })
    ).toBeNull();
  },
};

/** T10-d (C11-23, Access spec line 36): on a phone the roster lists Granted first, in reading order too. */
export const GrantedFirstOnPhone: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    const granted = await canvas.findByRole("group", { name: "Granted" });

    const catalog = canvas.getByRole("group", { name: "Catalog" });

    await expect(granted.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      catalog.getBoundingClientRect().top
    );
    await expect(
      granted.compareDocumentPosition(catalog) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  },
};

/** T10-e (d8l5.74 item 2): a direct role with no Grants row shows each reason it is paused. */
export const RowlessDirectRoleShowsPaused: Story = {
  args: {
    initial: person("p-jamie"),
    // "reports" has no catalogue row, so the role is rowless; its permission opens no row.
    paths: [
      {
        ...fixturePath({
          id: "a-jamie-reports",
          holder: { type: "user", id: "p-jamie", name: "Jamie Chen" },
          role: { id: "r-reports-viewer", name: "Reports viewer" },
          moduleId: "reports",
        }),
        notInEffect: ["module-off"],
      },
    ],
  },
  play: async ({ canvas }) => {
    const granted = within(
      await canvas.findByRole("group", { name: "Granted" })
    );

    await expect(granted.getByText("Reports viewer")).toBeVisible();
    await expect(granted.getByText("Paused: Module off")).toBeVisible();
  },
};

/** T10 (S1): a draft blocks every exit: Grant to and All groups and people ask first, and Cancel keeps the work. */
export const SwitchWithUnsavedWorkAsksFirst: Story = {
  args: { initial: group("g-ops") },
  play: async ({ canvas }) => {
    await tickAndMove("Slides", /^Remove 1$/);
    await expect(pendingBar().getByText("1 unsaved change")).toBeVisible();

    await userEvent.click(canvas.getByRole("combobox", { name: "Grant to" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Analysts/ })
    );

    const discard = await screen.findByRole("dialog", {
      name: "Discard 1 unsaved change?",
    });

    await waitFor(() =>
      expect(discard).toHaveTextContent(
        "Switching to Analysts drops the changes for Operations."
      )
    );
    await userEvent.click(
      within(discard).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(pendingBar().getByText("1 unsaved change")).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Grant to" })
    ).toHaveTextContent("Operations");

    await userEvent.click(
      canvas.getByRole("button", { name: "All groups and people" })
    );
    await expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Switching to All groups and people drops the changes for Operations."
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Discard",
      })
    );
    await expect(
      await canvas.findByRole("heading", { name: "Groups and people" })
    ).toBeVisible();
    await expect(canvas.queryByRole("group", { name: "Granted" })).toBeNull();
    await expect(
      canvas.queryByRole("region", { name: "Unsaved changes" })
    ).toBeNull();
  },
};

/** C06-2: Grant to and Advanced access share the md height on one row, Advanced access at its end. */
export const GrantToRowLinesUp: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ canvas }) => {
    const field = await canvas.findByRole("combobox", { name: "Grant to" });
    const advanced = canvas.getByRole("button", { name: "Advanced access" });
    const row = advanced.parentElement!;

    const top = field.getBoundingClientRect().top;

    // One string, so that a failure prints both controls in full.
    await expect(
      [field, advanced]
        .flatMap((control) => {
          const { height, top: at } = control.getBoundingClientRect();

          return height === 36 && at === top
            ? []
            : [`${control.textContent}: ${height} px at ${at}`];
        })
        .join("; ")
    ).toBe("");

    await expect(advanced.querySelector("svg")).not.toBeNull();
    await expect(
      Math.abs(
        advanced.getBoundingClientRect().right -
          row.getBoundingClientRect().right
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
      name: "Access assignments",
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
    const advanced = await canvas.findByRole("button", {
      name: "Advanced access",
    });

    const toolbar = advanced.parentElement!;

    const picker = within(toolbar)
      .getByRole("combobox", { name: "Grant to" })
      .getBoundingClientRect();

    const row = toolbar.getBoundingClientRect();

    const box = advanced.getBoundingClientRect();

    await expect(advanced.querySelector("svg")).not.toBeNull();
    await expect(Math.abs(box.right - row.right)).toBeLessThanOrEqual(1);
    await expect(box.top).toBeGreaterThanOrEqual(picker.bottom);
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

/**
 * C12-2 review I-1: from 1280 px the panes sit side by side in a card about 920 px wide, where half a
 * Granted row is narrower than the 256 px select. The select keeps inside its row and its pane.
 */
export const RoleChoiceFitsNarrowPanes: Story = {
  args: { initial: group("g-ops") },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: (args) => (
    <div className="w-230 p-8">
      <Harness {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const select = await canvas.findByRole("combobox", {
      name: "Role for Invoices",
    });

    const row = select.closest("li");
    const pane = row?.closest("ul")?.parentElement;

    if (row === null || pane === null || pane === undefined)
      throw new Error("The select is not in a pane row.");

    await expect(select.getBoundingClientRect().right).toBeLessThanOrEqual(
      row.getBoundingClientRect().right
    );
    await expect(pane.scrollWidth).toBeLessThanOrEqual(pane.clientWidth);
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
      name: "Access assignments",
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

    await waitFor(() =>
      expect(args.onRecipientChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "group", id: "g-finance" })
      )
    );
    await expect(
      canvas.getByRole("combobox", { name: "Grant to" })
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
        .getByRole("combobox", { name: "Grant to", hidden: true })
        .closest("[inert]")
    ).not.toBeNull();
    await expect(
      canvas
        .getByRole("button", {
          name: "All groups and people",
          hidden: true,
        })
        .closest("[inert]")
    ).not.toBeNull();

    const save = pendingBar().getByRole("button", { name: "Save" });

    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(
      screen.queryByRole("button", { name: "Saving…", hidden: true })
    ).toBeNull();
  },
};

const advancedSheet = async () =>
  within(await screen.findByRole("dialog", { name: "Advanced access" }));

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

    const source = within(granted).getByRole("button", {
      name: "Genie Administrators",
    });

    await expect(source).toBeVisible();
    await expect(getComputedStyle(source, "::after").minHeight).toBe("44px");
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

/**
 * P11-35: the group's own role is no route. Its stay line goes, and the dialog reads
 * "Tenant administrator · Direct".
 */
export const GroupOwnRoleStaysIsDirect: Story = {
  args: {
    initial: group("g-admins"),
    paths: [
      held("a-admins-ask", admins, "r-ask-user"),
      tenantAdminOf("a-admins-admin", admins),
    ],
  },
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async () => {
    await tickAndMove("Ask", /^Remove 1$/);

    await expect(pendingBar().getByText("1 to remove")).toBeVisible();
    await expect(pendingBar().queryByText(/stays, assigned via/)).toBeNull();

    await userEvent.click(pendingBar().getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Remove Ask from Genie Administrators?",
    });

    const stays = within(dialog).getByRole("list", {
      name: "Assignments that stay",
    });

    await expect(stays).toHaveTextContent("Tenant administrator · Direct");
    await expect(dialog).not.toHaveTextContent(
      "Assigned via Genie Administrators"
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

/** LK1: a `?recipient=` link opens that person once. */
export const PrefilledPersonLink: Story = {
  args: { link: { recipient: "p-jamie" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("group", { name: "Granted" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Grant to" })
    ).toHaveTextContent("Jamie Chen");
  },
};

/** LK1, Review Focus 4: a link to an id that no read holds shows the list. */
export const StaleRecipientLinkShowsTheList: Story = {
  args: { link: { recipient: "g-former" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Groups and people" })
    ).toBeVisible();
    await expect(canvas.queryByRole("group", { name: "Granted" })).toBeNull();
    await expect(canvas.queryByRole("alert")).toBeNull();
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
