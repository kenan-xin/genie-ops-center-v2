import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { COLLAPSED_CATEGORIES_KEY } from "./collapsed-categories.ts";
import { NavigationRail } from "./navigation-rail.tsx";
import type { ShellNavigation } from "./types.ts";

const workspaceNavigation: ShellNavigation = {
  workspace: [
    { id: "placeholder-home", label: "Placeholder", href: "/placeholder" },
    { id: "reports-home", label: "Reports", href: "/reports" },
  ],
  pinned: [{ id: "finance-ledger", label: "Ledger", href: "/finance/ledger" }],
  categories: [
    {
      id: "operations",
      name: "Operations",
      entries: [
        { id: "ops-orders", label: "Orders", href: "/operations/orders" },
        {
          id: "ops-shipments",
          label: "Shipments",
          href: "/operations/shipments",
        },
      ],
    },
    {
      id: "finance",
      name: "Finance",
      entries: [
        {
          id: "finance-invoices",
          label: "Invoices",
          href: "/finance/invoices",
        },
      ],
    },
  ],
  admin: [],
};

const adminNavigation: ShellNavigation = {
  workspace: [],
  pinned: [],
  categories: [],
  admin: [
    {
      id: "people-and-access",
      label: "People and access",
      entries: [
        { id: "core-people", label: "People", href: "/admin/people" },
        { id: "core-groups", label: "Groups", href: "/admin/groups" },
        { id: "core-roles", label: "Roles", href: "/admin/roles" },
      ],
    },
    {
      id: "tenant",
      label: "Tenant",
      entries: [
        { id: "core-branding", label: "Branding", href: "/admin/branding" },
        { id: "core-settings", label: "Settings", href: "/admin/settings" },
        { id: "core-audit", label: "Audit log", href: "/admin/audit" },
      ],
    },
    {
      id: "catalog",
      label: "Catalog",
      entries: [
        { id: "core-modules", label: "Modules", href: "/admin/modules" },
        {
          id: "core-categories",
          label: "Categories",
          href: "/admin/categories",
        },
      ],
    },
    {
      id: "placeholder",
      label: "Placeholder",
      entries: [
        {
          id: "placeholder-admin",
          label: "Placeholder admin",
          href: "/admin/placeholder",
        },
      ],
    },
  ],
};

const clearCollapsed = () => {
  try {
    localStorage.removeItem(COLLAPSED_CATEGORIES_KEY);
  } catch {
    // A story that stubs storage restores it before this cleanup runs.
  }
};

/**
 * The shell's navigation rail (R-27, R-29, R-31). The workspace chrome shows the workspace links,
 * the pinned rail and one disclosure per category; the admin chrome shows one captioned group per
 * admin group with no indent. Collapsed categories persist per device in local storage.
 */
const meta = {
  title: "Core/Shell/Navigation rail",
  component: NavigationRail,
  tags: ["autodocs"],
  args: {
    chrome: "workspace",
    navigation: workspaceNavigation,
    currentPath: "/operations/orders/42",
    strings: {
      workspace: "Workspace",
      pinned: "Pinned",
      categories: "Categories",
    },
  },
  decorators: [
    (Story) => (
      <div className="w-60 rounded-xl border border-border bg-muted p-2">
        <Story />
      </div>
    ),
  ],
  // Clear the device state before and after each story, so no story inherits a collapse.
  beforeEach: () => {
    clearCollapsed();

    return clearCollapsed;
  },
} satisfies Meta<typeof NavigationRail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Workspace: Story = {
  play: async ({ canvas }) => {
    const workspace = canvas.getByRole("navigation", { name: "Workspace" });
    await expect(within(workspace).getAllByRole("link")).toHaveLength(2);

    const categories = canvas.getByRole("navigation", { name: "Categories" });

    await Promise.all(
      ["Operations", "Finance"].map((name) =>
        expect(
          within(categories).getByRole("button", { name })
        ).toHaveAttribute("aria-expanded", "true")
      )
    );

    const current = canvas
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    await expect(current).toHaveLength(1);
    await expect(current[0]).toHaveAttribute("href", "/operations/orders");
  },
};

export const CollapsePersistsOnTheDevice: Story = {
  play: async ({ canvas }) => {
    const operations = canvas.getByRole("button", { name: "Operations" });
    await userEvent.click(operations);

    await expect(operations).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByRole("group", { name: "Operations" })
    ).toBeNull();
    await expect(canvas.getByRole("group", { name: "Finance" })).toBeVisible();
    await expect(
      JSON.parse(localStorage.getItem(COLLAPSED_CATEGORIES_KEY) ?? "[]")
    ).toEqual(["operations"]);
  },
};

const refuse = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

export const StorageUnavailable: Story = {
  // Private mode: both calls throw. Stubbed before render, so the mount read throws too.
  beforeEach: () => {
    const { getItem, setItem } = Storage.prototype;

    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;

    return () => {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    };
  },
  play: async ({ canvas }) => {
    const operations = canvas.getByRole("button", { name: "Operations" });
    await expect(operations).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(operations);

    await expect(operations).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByRole("group", { name: "Operations" })
    ).toBeNull();
  },
};

export const Admin: Story = {
  args: {
    chrome: "admin",
    navigation: adminNavigation,
    currentPath: "/admin/people",
  },
  play: async ({ canvas }) => {
    const names = canvas
      .getAllByRole("navigation")
      .map((nav) => nav.getAttribute("aria-label"));

    await expect(names).toEqual([
      "People and access",
      "Tenant",
      "Catalog",
      "Placeholder",
    ]);

    // A module's entry brings no icon and gets the default one (UI fix list, drawer).
    const rowsWithoutIcon = adminNavigation.admin
      .flatMap((group) => group.entries)
      .filter(
        (entry) =>
          canvas
            .getByRole("link", { name: entry.label })
            .querySelector("svg") === null
      );

    await expect(rowsWithoutIcon).toEqual([]);
    await expect(canvas.getByRole("link", { name: "People" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  },
};

export const Empty: Story = {
  args: {
    navigation: { workspace: [], pinned: [], categories: [], admin: [] },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("nav")).toBeNull();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
