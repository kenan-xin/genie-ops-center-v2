import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  FIXTURE_CATEGORIES,
  FIXTURE_CONFIG_REFUSAL,
  FIXTURE_MODULES,
} from "./__fixtures__/modules.ts";
import { ModulesScreen } from "./modules-screen.tsx";
import type { ModulesScreenProps } from "./types.ts";

const phone = { viewport: { value: "mobile1", isRotated: false } };

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
  } satisfies ModulesScreenProps,
} satisfies Meta<typeof ModulesScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Modules" }));

    await expect(table.getByText("Fixture")).toBeInTheDocument();
    await expect(table.getByText("Reporting exports")).toBeInTheDocument();
    // A person holding the key through two roles is listed once per role.
    await expect(table.getAllByText(/Ada Lovelace/)).toHaveLength(2);

    await userEvent.click(
      table.getByRole("combobox", { name: "Category for Fixture" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" })
    );

    await expect(args.onCategory).toHaveBeenCalledWith("fixture", "c-fin");
    // The popup's focus guards stay until it has closed; axe runs after the play function.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  },
};

export const Phone: Story = {
  globals: phone,
  play: async ({ args, canvas }) => {
    const list = within(canvas.getByRole("list", { name: "Modules" }));

    await expect(canvas.queryByRole("table")).toBeNull();
    await expect(
      list.getByRole("switch", { name: "Fixture enabled" })
    ).toBeChecked();

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

const switchOffConfirms: Story["play"] = async ({ args, canvas }) => {
  await userEvent.click(
    canvas.getByRole("switch", { name: "Fixture enabled" })
  );

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

  await userEvent.click(
    canvas.getByRole("switch", { name: "Fixture enabled" })
  );
  dialog = within(
    await screen.findByRole("dialog", { name: "Switch off Fixture?" })
  );
  await userEvent.click(dialog.getByRole("button", { name: "Switch off" }));

  await expect(args.onSwitch).toHaveBeenCalledTimes(1);
  await expect(args.onSwitch).toHaveBeenCalledWith("fixture", false);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

export const SwitchOffConfirms: Story = { play: switchOffConfirms };

export const SwitchOffConfirmsOnPhone: Story = {
  globals: phone,
  play: switchOffConfirms,
};

export const SwitchOnSavesAtOnce: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("switch", { name: "Dormant enabled" })
    );

    await expect(args.onSwitch).toHaveBeenCalledTimes(1);
    await expect(args.onSwitch).toHaveBeenCalledWith("dormant", true);
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

export const EnableRefused: Story = {
  args: { refusal: FIXTURE_CONFIG_REFUSAL },
  play: async ({ canvas }) => {
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
    await expect(
      alert.getByRole("link", { name: /settings/i })
    ).toHaveAttribute("href", "/admin/settings");
    // The refused module stays off.
    await expect(
      canvas.getByRole("switch", { name: "Ticketing enabled" })
    ).not.toBeChecked();
  },
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
      row.getByRole("switch", { name: "Dormant enabled" })
    ).not.toBeChecked();
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
