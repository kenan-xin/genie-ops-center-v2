import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "./app-shell.tsx";
import { PageHeader } from "./page-header.tsx";
import type { ShellNavigation, ShellStrings } from "./types.ts";

const navigation: ShellNavigation = {
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
  ],
  admin: [
    {
      id: "people-and-access",
      label: "People and access",
      entries: [
        { id: "core-people", label: "People", href: "/admin/people" },
        { id: "core-groups", label: "Groups", href: "/admin/groups" },
      ],
    },
    {
      id: "tenant",
      label: "Tenant",
      entries: [
        { id: "core-branding", label: "Branding", href: "/admin/branding" },
      ],
    },
    {
      id: "catalog",
      label: "Catalog",
      entries: [
        { id: "core-modules", label: "Modules", href: "/admin/modules" },
      ],
    },
  ],
};

const strings: ShellStrings = {
  workspace: "Workspace",
  adminPortal: "Admin portal",
  pinned: "Pinned",
  categories: "Categories",
  navigation: "Navigation",
  openNavigation: "Open navigation",
  closeNavigation: "Close navigation",
  offline:
    "You are offline. Changes will not be saved until the connection returns.",
  pageContent: "Page content",
  account: "Account",
  changePassword: "Change password",
  opensInNewTab: "Opens in a new tab",
  helpAndSupport: "Help and support",
  signOut: "Sign out",
};

const LONG = "A very long name that keeps going well past the rail width xx";

/**
 * The app shell (R-27, R-35, R-38, R-40). From `lg` a 240px rail panel sits beside the content;
 * below `lg` a top bar shows the page title and opens the same panel in a drawer. The page brings
 * its own `<main>`; the shell adds none, and no bell or search box.
 */
const meta = {
  title: "Core/Shell/App shell",
  component: AppShell,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    chrome: "workspace",
    currentPath: "/operations/orders/42",
    navigation,
    identity: {
      companyName: "Acme Logistics",
      productName: "Ops Center",
      logoLightUrl: null,
      logoDarkUrl: null,
      markUrl: null,
    },
    user: { name: "Alex Morgan", roleLabel: "Member" },
    menu: {
      accountHref: "/account",
      changePasswordHref: null,
      switchTarget: null,
      supportHref: null,
      signOutAction: "/api/auth/sign-out",
    },
    strings,
    children: (
      <main>
        <PageHeader title="Orders" description="Every open order." />
        <p>Orders render here.</p>
      </main>
    ),
  },
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "mobile1", isRotated: false } };

function element(root: ParentNode, selector: string) {
  const found = root.querySelector<HTMLElement>(selector);

  if (found === null) throw new Error(`${selector} is missing`);

  return found;
}

/** No page scroll sideways, and every label cut short keeps its full text in `title`. */
async function expectNoOverflow(root: HTMLElement) {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  );

  const cutWithoutTitle = [
    ...root.querySelectorAll<HTMLElement>(".truncate"),
  ].filter(
    (label) =>
      label.scrollWidth > label.clientWidth && label.closest("[title]") === null
  );

  await expect(cutWithoutTitle).toEqual([]);
}

export const WorkspaceDesktop: Story = {
  globals: desktop,
  play: async ({ canvas }) => {
    const aside = canvas.getByRole("complementary", { name: "Navigation" });
    await expect(aside).toBeVisible();
    await expect(
      within(aside).getByRole("navigation", { name: "Workspace" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Open navigation" })
    ).toBeNull();
    await expect(canvas.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await expect(
      canvas.getByRole("group", { name: "Page content" })
    ).toHaveAttribute("tabindex", "0");
    await expect(canvas.queryByRole("searchbox")).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: /notifications/i })
    ).toBeNull();
  },
};

export const AdminDesktop: Story = {
  globals: desktop,
  args: { chrome: "admin", currentPath: "/admin/people" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Admin portal")).toBeVisible();

    await Promise.all(
      ["People and access", "Tenant", "Catalog"].map((name) =>
        expect(canvas.getByRole("navigation", { name })).toBeVisible()
      )
    );
  },
};

export const WorkspacePhone: Story = {
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole("complementary")).toBeNull();

    const topBar = element(canvasElement, "[data-shell-top-bar]");
    await expect(within(topBar).getByText("Orders")).toBeVisible();
    const search = element(topBar, '[data-shell-slot="search"]');
    await expect(search).toBeEmptyDOMElement();

    const open = canvas.getByRole("button", { name: "Open navigation" });
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(open);

    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    // The drawer fades in from opacity 0, so visibility settles after the enter transition.
    await waitFor(() =>
      expect(
        within(drawer).getByRole("navigation", { name: "Workspace" })
      ).toBeVisible()
    );
    // The scrim stays visible beside the drawer, so a tap outside can close it.
    await expect(drawer.getBoundingClientRect().width).toBeLessThanOrEqual(
      Math.ceil(window.innerWidth * 0.84)
    );

    await userEvent.click(
      within(drawer).getByRole("button", { name: "Close navigation" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(open);
    await screen.findByRole("dialog", { name: "Navigation" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

const longNames = {
  identity: {
    companyName: LONG,
    productName: LONG,
    logoLightUrl: null,
    logoDarkUrl: null,
    markUrl: null,
  },
  user: { name: LONG, roleLabel: "Member" },
  currentPath: "/long",
  navigation: {
    ...navigation,
    workspace: [{ id: "long", label: LONG, href: "/long" }],
  },
} as const;

export const LongNames: Story = {
  globals: desktop,
  args: longNames,
  play: async ({ canvasElement }) => {
    await expectNoOverflow(canvasElement);
  },
};

export const LongNamesPhone: Story = {
  globals: phone,
  args: longNames,
  play: async ({ canvas, canvasElement }) => {
    await expectNoOverflow(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Open navigation" })
    );
    await expectNoOverflow(
      await screen.findByRole("dialog", { name: "Navigation" })
    );
  },
};

export const Offline: Story = {
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    window.dispatchEvent(new Event("offline"));

    // Back online even when an assertion fails, so later stories do not start offline.
    try {
      const message = await canvas.findByText(strings.offline);
      const bar = message.getBoundingClientRect();

      const shell = element(
        canvasElement,
        "[data-shell]"
      ).getBoundingClientRect();

      const aside = canvas
        .getByRole("complementary", { name: "Navigation" })
        .getBoundingClientRect();

      await expect(bar.top).toBe(shell.top);
      await expect(bar.width).toBe(shell.width);
      await expect(aside.top).toBeGreaterThanOrEqual(bar.bottom);
    } finally {
      window.dispatchEvent(new Event("online"));
    }
  },
};

export const WorkspaceDark: Story = {
  globals: { ...desktop, theme: "dark" },
};

export const WorkspacePhoneDark: Story = {
  globals: { ...phone, theme: "dark" },
};
