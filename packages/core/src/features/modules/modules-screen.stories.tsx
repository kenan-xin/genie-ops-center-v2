import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  FIXTURE_CATEGORIES,
  FIXTURE_CONFIG_REFUSAL,
  FIXTURE_CROWDED,
  FIXTURE_MODULES,
  FIXTURE_ON,
} from "./__fixtures__/modules.ts";
import { ModulesScreen } from "./modules-screen.tsx";
import type { ModulesScreenProps } from "./types.ts";

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * The Modules page (R-81 to R-86). Every compiled module, its switch, its category and who holds
 * its user role. Switching off confirms; switching on saves at once. Nothing here assigns a role.
 */
const meta = {
  title: "Core/Modules",
  component: ModulesScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Modules page. The host owns the list and the writes; the screen owns only the switch-off confirm.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    modules: FIXTURE_MODULES,
    categories: FIXTURE_CATEGORIES,
    onSwitch: fn(),
    onCategory: fn(),
    rolesHref: "/admin/roles",
    settingsHref: "/admin/settings",
    searchLabel: "Search modules",
    noMatch: {
      title: "No modules match",
      description: "Clear the search to see every module.",
      clearLabel: "Clear search and filters",
    },
    accessLabels: {
      more: (count) => `+${count}`,
      showAll: (count, module) => `+${count} more holders of ${module}`,
      title: (module) => `Holders of ${module}`,
      group: (group) => `${group} (group)`,
      saving: (module) => `Saving ${module}`,
      whoCanOpen: "Who can open it",
      whoCanOpenFor: (module) => `for ${module}`,
      nobody: "No one yet",
      manage: "Manage in Roles",
      category: "Category",
    },
  } satisfies ModulesScreenProps,
} satisfies Meta<typeof ModulesScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Modules" }));

    await expect(table.getByText("Fixture")).toBeInTheDocument();
    await expect(table.getByText("Reporting exports")).toBeInTheDocument();
    // A person holding the key through two roles is named once, groups first.
    await expect(
      table.getByText("Finance managers (group), Ada Lovelace")
    ).toBeInTheDocument();

    await userEvent.click(
      table.getByRole("combobox", { name: "Category for Fixture" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" })
    );

    await expect(args.onCategory).toHaveBeenCalledWith("fixture", "c-fin");
    // The popup's focus guards stay until it has closed; axe runs after the play function.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

    // A module under no category names that in its trigger, not a blank value.
    await expect(
      table.getByRole("combobox", { name: "Category for Dormant" })
    ).toHaveTextContent("No category");
  },
};

/** UI-1 People finding 2: an unlabelled object-id group holder shows a short name (R-24c). */
export const UnlabelledGroupIdHolder: Story = {
  args: {
    modules: [
      {
        ...FIXTURE_MODULES[0]!,
        holders: [
          {
            principalType: "group",
            principalId: "g-oid",
            label: "39545f73-134e-49ac-9731-0e96df8ea218",
            roleName: "Fixture user",
          },
        ],
      },
    ],
  },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Modules" }));

    const short = table.getByText("39545f73… (group)");

    await userEvent.hover(short);

    const tip = await screen.findByText(
      "39545f73-134e-49ac-9731-0e96df8ea218 (group)",
      { selector: "[data-slot=tooltip-content]" }
    );

    // The tooltip fades in, so wait until it paints.
    await waitFor(() => expect(tip).toBeVisible());
  },
};

/** The approved phone card (fix list "Modules page on phones (adapt)", `modules-phone.png`). */
export const Phone: Story = {
  globals: phone,
  play: async ({ args, canvas }) => {
    const list = within(canvas.getByRole("list", { name: "Modules" }));
    const [first, unplaceable] = list.getAllByRole("listitem");
    const card = within(first!);

    await expect(canvas.queryByRole("table")).toBeNull();

    // (1) The switch shares the name's line; the id is quiet mono under it, not a chip; no tile.
    const toggle = card.getByRole("switch", { name: "Fixture on" });
    const title = card.getByText("Fixture", { exact: true });

    await expect(toggle).toBeChecked();
    await expect(
      Math.abs(
        toggle.getBoundingClientRect().top - title.getBoundingClientRect().top
      )
    ).toBeLessThan(12);
    await expect(first!.querySelector("[data-slot=icon-tile]")).toBeNull();

    const id = card.getByText("fixture", { exact: true });

    await expect(id.closest("[data-slot=badge]")).toBeNull();
    await expect(getComputedStyle(id).textTransform).not.toBe("uppercase");

    // (2) One description line with an ellipsis; the full text stays on the line.
    const description = card.getByText(FIXTURE_ON.description!);

    await expect(getComputedStyle(description).textOverflow).toBe("ellipsis");
    await expect(description.scrollWidth).toBeGreaterThan(
      description.clientWidth
    );
    await userEvent.hover(description);

    const tip = await screen.findByText(FIXTURE_ON.description!, {
      selector: "[data-slot=tooltip-content]",
    });

    // The tooltip fades in, so wait until it paints.
    await waitFor(() => expect(tip).toBeVisible());

    // (3) A labelled picker as wide as the card, or the nothing-to-place line.
    await expect(card.getByText("Category", { exact: true })).toBeVisible();
    await expect(
      card
        .getByRole("combobox", { name: "Category for Fixture" })
        .getBoundingClientRect().width
    ).toBeGreaterThan(first!.getBoundingClientRect().width - 40);
    await expect(within(unplaceable!).queryByRole("combobox")).toBeNull();
    await expect(
      within(unplaceable!).getByText("No workspace entry, so nothing to place")
    ).toBeVisible();

    await userEvent.click(
      list.getByRole("combobox", { name: "Category for Dormant" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Operations" })
    );

    await expect(args.onCategory).toHaveBeenCalledWith("dormant", "c-ops");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};

/** The card list in the dark theme, so axe reads the dark pairs at the phone width too. */
export const PhoneDark: Story = {
  globals: { theme: "dark", viewport: phone.viewport },
};

const switchOffConfirms: Story["play"] = async ({ args, canvas }) => {
  await userEvent.click(canvas.getByRole("switch", { name: "Fixture on" }));

  let dialog = within(
    await screen.findByRole("dialog", { name: "Switch off Fixture?" })
  );

  await expect(
    dialog.getByText(
      "Members lose Fixture from their navigation until it is switched on again. Its data stays."
    )
  ).toBeInTheDocument();
  // Cancel holds the focus, so Enter does not switch the module off (R-83).
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus()
  );

  await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await expect(args.onSwitch).not.toHaveBeenCalled();

  await userEvent.click(canvas.getByRole("switch", { name: "Fixture on" }));
  dialog = within(
    await screen.findByRole("dialog", { name: "Switch off Fixture?" })
  );
  await userEvent.click(dialog.getByRole("button", { name: "Switch off" }));

  await expect(args.onSwitch).toHaveBeenCalledTimes(1);
  await expect(args.onSwitch).toHaveBeenCalledWith("fixture", false);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

export const SwitchInFlight: Story = {
  args: { pending: "fixture" },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Modules" }));

    // DR-17: a switch has no loading state, so a spinner beside it shows its running call.
    await expect(
      table.getByRole("switch", { name: "Fixture on" })
    ).toHaveAttribute("aria-busy", "true");
    await expect(table.getByRole("status")).toHaveTextContent("Saving Fixture");
  },
};

export const SwitchOffConfirms: Story = { play: switchOffConfirms };

export const SwitchOffConfirmsOnPhone: Story = {
  globals: phone,
  play: switchOffConfirms,
};

export const SwitchOnSavesAtOnce: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("switch", { name: "Dormant on" }));

    await expect(args.onSwitch).toHaveBeenCalledTimes(1);
    await expect(args.onSwitch).toHaveBeenCalledWith("dormant", true);
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

const enableRefused: Story["play"] = async ({ canvas }) => {
  const alert = within(canvas.getByRole("alert"));

  await expect(
    alert.getByText("The module configuration is not valid.")
  ).toBeInTheDocument();
  await expect(alert.getByText("apiUrl")).toBeInTheDocument();
  await expect(alert.getByText("Required")).toBeInTheDocument();
  await expect(alert.getByText("queue.name")).toBeInTheDocument();
  await expect(
    alert.getByText("Must be at least 3 characters")
  ).toBeInTheDocument();
  await expect(alert.getByRole("link", { name: /settings/i })).toHaveAttribute(
    "href",
    "/admin/settings"
  );
  // The refused module stays off.
  await expect(
    canvas.getByRole("switch", { name: "Ticketing on" })
  ).not.toBeChecked();
};

export const EnableRefused: Story = {
  args: { refusal: FIXTURE_CONFIG_REFUSAL },
  play: enableRefused,
};

export const EnableRefusedOnPhone: Story = {
  args: { refusal: FIXTURE_CONFIG_REFUSAL },
  globals: phone,
  play: enableRefused,
};

export const NoPickerWithoutWorkspaceEntry: Story = {
  play: async ({ canvas }) => {
    const row = within(canvas.getByRole("row", { name: /Reporting exports/ }));

    await expect(row.queryByRole("combobox")).toBeNull();
    await expect(
      row.getByText("No workspace entry, so nothing to place")
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("combobox", { name: "Category for Fixture" })
    ).toBeInTheDocument();
  },
};

export const SwitchedOffKeepsHolders: Story = {
  play: async ({ canvas }) => {
    const row = within(canvas.getByRole("row", { name: /Dormant/ }));

    await expect(row.getByText("Off")).toBeInTheDocument();
    await expect(row.getByText(/Night shift/)).toBeInTheDocument();
    await expect(
      row.getByRole("switch", { name: "Dormant on" })
    ).not.toBeChecked();
  },
};

/**
 * Fifteen holders: the table cell names three, groups first, and "+12" opens the full list with
 * each holder's role (DR-26). The keyboard reaches and opens it.
 */
export const ManyHolders: Story = {
  args: { modules: [FIXTURE_CROWDED] },
  play: async ({ canvas }) => {
    const area = within(canvas.getByRole("table", { name: "Modules" }));

    await expect(
      area.getByText("Night shift (group), Finance managers (group), Person 1")
    ).toBeInTheDocument();

    const more = area.getByRole("button", {
      name: "+12 more holders of Crowded",
    });

    await expect(more).toHaveTextContent("+12");

    // The category picker comes just before the cell: one Tab reaches the trigger, Enter opens it.
    area.getByRole("combobox", { name: "Category for Crowded" }).focus();
    await userEvent.tab();
    await expect(more).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const popup = within(
      await screen.findByRole("dialog", { name: "Holders of Crowded" })
    );

    await expect(popup.getAllByRole("listitem")).toHaveLength(15);
    await expect(popup.getByText("Person 13")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(more).toHaveFocus();
  },
};

/**
 * (4) On a phone "Who can open it" is one row that links to Roles: three holders, groups first,
 * and "+12". The full list lives on Roles, because a button inside the link is not allowed.
 */
export const ManyHoldersOnPhone: Story = {
  args: { modules: [FIXTURE_CROWDED] },
  globals: phone,
  play: async ({ canvas }) => {
    const list = within(canvas.getByRole("list", { name: "Modules" }));

    const who = list.getByRole("link", {
      name: /^Who can open it for Crowded/,
    });

    await expect(who).toHaveAttribute("href", "/admin/roles");
    await expect(who).toHaveTextContent(
      "Night shift (group), Finance managers (group), Person 1 +12"
    );
    // A thumb target as wide as the card (tokens.md, 44 px).
    await expect(who.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(who.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      list.getByRole("listitem").getBoundingClientRect().width - 1
    );
  },
};

/** (5) The search narrows the list by name or id, and a query that matches nothing says so. */
export const SearchNarrowsTheList: Story = {
  play: async ({ canvas }) => {
    const search = canvas.getByRole("textbox", { name: "Search modules" });

    const rows = () =>
      within(canvas.getByRole("table", { name: "Modules" })).getAllByRole(
        "row"
      );

    await userEvent.type(search, "dorm");
    // The header row and Dormant.
    await expect(rows()).toHaveLength(2);
    await expect(rows()[1]).toHaveTextContent("Dormant");

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    await expect(canvas.getByText("No modules match")).toBeVisible();
    await expect(canvas.queryByRole("table")).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear search and filters" })
    );
    await expect(search).toHaveValue("");
    await expect(rows()).toHaveLength(FIXTURE_MODULES.length + 1);
  },
};

export const NobodyHolds: Story = {
  play: async ({ canvas }) => {
    const row = within(canvas.getByRole("row", { name: /Reporting exports/ }));

    await expect(
      row.getByText("No one holds Reporting exports yet")
    ).toBeInTheDocument();
    await expect(row.getByRole("link", { name: /Roles/ })).toHaveAttribute(
      "href",
      "/admin/roles"
    );
  },
};

export const NoAssignControl: Story = {
  play: async ({ canvas }) => {
    const controls = [
      ...canvas.queryAllByRole("button"),
      ...canvas.queryAllByRole("link"),
    ];

    const assigning = controls.filter((control) =>
      /assign|grant|add (a )?(person|group)/i.test(control.textContent ?? "")
    );

    await expect(assigning).toEqual([]);

    // Every link leaves for Roles; none writes a role assignment here (R-85).
    const hrefs = new Set(
      canvas.getAllByRole("link").map((link) => link.getAttribute("href"))
    );

    await expect([...hrefs]).toEqual(["/admin/roles"]);
  },
};

/** The host is still reading the list: say so, and show no empty table. */
export const LoadingList: Story = {
  args: { modules: [], categories: [], loading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading modules"
    );
    await expect(canvas.queryByRole("table")).toBeNull();
  },
};

/** The list read failed: the host's text replaces the table, so nothing reads as empty. */
export const ListReadFailed: Story = {
  args: {
    modules: [],
    categories: [],
    error: "The modules could not be read.",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "The modules could not be read."
    );
    await expect(canvas.queryByRole("table")).toBeNull();
  },
};
