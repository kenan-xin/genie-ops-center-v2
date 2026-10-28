import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  createContext,
  use,
  useState,
  type ComponentPropsWithRef,
} from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

import { AppShell, type AppShellProps } from "./app-shell.tsx";
import { COLLAPSED_CATEGORIES_KEY } from "./collapsed-categories.ts";
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

    // No link component: every row is a plain anchor (NAV-1).
    const orders = within(aside).getByRole("link", { name: "Orders" });

    await expect(orders).toHaveAttribute("href", "/operations/orders");
    await expect(orders).not.toHaveAttribute("data-link-component");
  },
};

/** A host's router link for the story: it marks each anchor it renders. */
function MarkedLink(props: ComponentPropsWithRef<"a">) {
  return <a {...props} data-link-component="" />;
}

export const WithLinkComponent: Story = {
  globals: desktop,
  args: {
    linkComponent: MarkedLink,
    navigation: {
      ...navigation,
      workspace: [
        ...navigation.workspace,
        { id: "reports-viewer", label: "Viewer", href: "/viewer/reports" },
      ],
    },
    menu: {
      accountHref: "/account",
      changePasswordHref: "https://id.acme.example/realms/acme/account",
      switchTarget: { label: "Administration", href: "/admin/people" },
      supportHref: "mailto:help@acme.example",
      signOutAction: "/api/auth/sign-out",
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const aside = canvas.getByRole("complementary", { name: "Navigation" });

    await expect(
      within(aside).getByRole("link", { name: "Orders" })
    ).toHaveAttribute("data-link-component");
    // R-42: a viewer loads a document, so its own policy is installed before its frame renders.
    await expect(
      within(aside).getByRole("link", { name: "Viewer" })
    ).not.toHaveAttribute("data-link-component");

    await userEvent.click(
      element(canvasElement, "aside [data-shell-user-menu]")
    );

    const menu = await within(document.body).findByRole("menu");

    await Promise.all(
      ["Account", "Administration"].map((name) =>
        expect(within(menu).getByRole("menuitem", { name })).toHaveAttribute(
          "data-link-component"
        )
      )
    );
    await Promise.all(
      [/Change password/, "Help and support"].map((name) =>
        expect(
          within(menu).getByRole("menuitem", { name })
        ).not.toHaveAttribute("data-link-component")
      )
    );
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

    const close = within(drawer).getByRole("button", {
      name: "Close navigation",
    });

    // The focus ring (2px ring, 2px offset) must fit inside the drawer, which clips it.
    const edge = drawer.getBoundingClientRect();
    const box = close.getBoundingClientRect();

    await expect(box.top - edge.top).toBeGreaterThan(4);
    await expect(edge.right - box.right).toBeGreaterThan(4);

    await userEvent.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(open);
    await screen.findByRole("dialog", { name: "Navigation" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

/** The story's client router: a link click changes the path state in place of a document load. */
const Navigate = createContext<(href: string) => void>(() => undefined);

function RouterLink(props: ComponentPropsWithRef<"a">) {
  const navigate = use(Navigate);

  return (
    <a
      {...props}
      onClick={(event) => {
        props.onClick?.(event);

        if (event.defaultPrevented || props.href === undefined) return;

        event.preventDefault();
        navigate(props.href);
      }}
    />
  );
}

function ClientRouted(args: AppShellProps) {
  const [path, setPath] = useState(args.currentPath);

  return (
    <Navigate value={setPath}>
      <AppShell {...args} currentPath={path} linkComponent={RouterLink} />
    </Navigate>
  );
}

export const ClientRoutedPhone: Story = {
  globals: phone,
  render: (args) => <ClientRouted {...args} />,
  args: {
    children: (
      <main>
        <PageHeader title="Orders" description="Every open order." />
        <div className="h-dvh" />
        <div className="h-dvh" />
      </main>
    ),
  },
  // Another story's collapsed category must not hide Shipments.
  beforeEach: () => window.localStorage.removeItem(COLLAPSED_CATEGORIES_KEY),
  play: async ({ canvas, canvasElement }) => {
    const content = element(canvasElement, "[data-shell-content]");

    content.scrollTop = content.scrollHeight;
    await expect(content.scrollTop).toBeGreaterThan(0);

    await userEvent.click(
      within(await openDrawer(canvas)).getByRole("link", { name: "Shipments" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      within(element(canvasElement, "[data-shell-top-bar]")).getByText(
        "Shipments"
      )
    ).toBeVisible();
    await expect(element(canvasElement, "[data-shell-content]").scrollTop).toBe(
      0
    );

    // The current page's row changes no path, and the drawer still closes.
    await userEvent.click(
      within(await openDrawer(canvas)).getByRole("link", { name: "Shipments" })
    );
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

async function openDrawer(canvas: { getByRole: typeof screen.getByRole }) {
  await userEvent.click(
    canvas.getByRole("button", { name: "Open navigation" })
  );

  return screen.findByRole("dialog", { name: "Navigation" });
}

const fill = (node: Element) => getComputedStyle(node).backgroundColor;

/** The current entry is a filled row, not a hairline on the drawer's own color (UI fix list). */
async function expectFilledCurrentEntry(drawer: HTMLElement) {
  const current = element(drawer, '[aria-current="page"]');
  let behind = current.parentElement;

  // The first painted surface behind the row.
  while (behind !== null && fill(behind) === "rgba(0, 0, 0, 0)")
    behind = behind.parentElement;

  if (behind === null) throw new Error("No surface behind the entry");

  await expect(fill(current)).not.toBe(fill(behind));
}

export const WorkspacePhoneDark: Story = {
  globals: { ...phone, theme: "dark" },
  play: async ({ canvas }) => {
    await expectFilledCurrentEntry(await openDrawer(canvas));
  },
};

export const DrawerFocusesTheCurrentEntry: Story = {
  globals: phone,
  play: async ({ canvas }) => {
    const drawer = await openDrawer(canvas);

    await waitFor(() =>
      expect(within(drawer).getByRole("link", { name: "Orders" })).toHaveFocus()
    );
    await expectFilledCurrentEntry(drawer);
  },
};

export const DrawerFocusesCloseWithNoCurrentEntry: Story = {
  globals: phone,
  args: { currentPath: "/nowhere" },
  play: async ({ canvas }) => {
    const drawer = await openDrawer(canvas);

    await waitFor(() =>
      expect(
        within(drawer).getByRole("button", { name: "Close navigation" })
      ).toHaveFocus()
    );
  },
};

/** The placeholder and three stand-in modules: none of their entries brings an icon. */
const manyModules: ShellNavigation = {
  ...navigation,
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
    ...[
      ["placeholder", "Placeholder", "Placeholder settings"],
      ["invoices", "Invoices", "Invoice rules"],
      ["analytics", "Analytics", "Dashboards"],
      ["slides", "Slides", "Slide templates"],
    ].map(([id = "", label = "", entry = ""]) => ({
      id,
      label,
      entries: [{ id: `${id}-admin`, label: entry, href: `/admin/${id}` }],
    })),
  ],
};

export const LongDrawerScrollsOnlyTheEntries: Story = {
  globals: phone,
  args: {
    chrome: "admin",
    currentPath: "/admin/people",
    navigation: manyModules,
  },
  play: async ({ canvas }) => {
    const drawer = await openDrawer(canvas);
    const edge = drawer.getBoundingClientRect();

    const list = within(drawer).getByRole("navigation", {
      name: "People and access",
    }).parentElement?.parentElement;

    if (list === null || list === undefined) throw new Error("No entry list");

    // Every entry starts its label in one column, so an entry without its own icon gets one.
    const links = within(list).getAllByRole("link");
    await expect(links).toHaveLength(12);
    await Promise.all(
      links.map((link) => expect(link.querySelector("svg")).not.toBeNull())
    );

    const starts = new Set(
      links.map((link) => element(link, "span").getBoundingClientRect().left)
    );

    await expect(starts.size).toBe(1);

    // Only the entry list scrolls: the identity and the footer stay inside the drawer.
    const footer = element(drawer, "[data-shell-user-menu]");

    await expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      edge.bottom
    );
    await expect(
      within(drawer).getByText("Admin portal").getBoundingClientRect().top
    ).toBeGreaterThanOrEqual(edge.top);
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  },
};

export const LongDrawerDark: Story = {
  ...LongDrawerScrollsOnlyTheEntries,
  globals: { ...phone, theme: "dark" },
};
