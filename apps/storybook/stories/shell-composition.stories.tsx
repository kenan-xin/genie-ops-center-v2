import { AppShell, PageHeader } from "@genie/core/features/shell";
import { Button } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

/**
 * A host outside `apps/genie` composes the shell from `@genie/core` and `@genie/ui` alone
 * (R-27): no app import, no server, literal data.
 */
const meta = {
  title: "Composition/Shell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: {
    chrome: "workspace",
    currentPath: "/reports",
    navigation: {
      workspace: [{ id: "reports-home", label: "Reports", href: "/reports" }],
      pinned: [],
      categories: [],
      admin: [
        {
          id: "people-and-access",
          label: "People and access",
          entries: [
            { id: "core-people", label: "People", href: "/admin/people" },
          ],
        },
      ],
    },
    identity: {
      companyName: "Acme Logistics",
      productName: "Ops Center",
      logoLightUrl: null,
      logoDarkUrl: null,
      markUrl: null,
    },
    user: { name: "Alex Morgan", roleLabel: "Administrator" },
    menu: {
      accountHref: "/account",
      changePasswordHref: null,
      switchTarget: null,
      supportHref: null,
      signOutAction: "/api/auth/sign-out",
    },
    strings: {
      workspace: "Workspace",
      adminPortal: "Admin portal",
      pinned: "Pinned",
      categories: "Categories",
      navigation: "Navigation",
      openNavigation: "Open navigation",
      closeNavigation: "Close navigation",
      offline: "You are offline.",
      pageContent: "Page content",
      account: "Account",
      changePassword: "Change password",
      opensInNewTab: "Opens in a new tab",
      helpAndSupport: "Help and support",
      signOut: "Sign out",
    },
    children: (
      <main>
        <PageHeader title="Reports" actions={<Button>New report</Button>} />
        <p>Reports render here.</p>
      </main>
    ),
  },
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Workspace: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("navigation", { name: "Workspace" })
    ).toBeVisible();
  },
};

export const Admin: Story = {
  args: { chrome: "admin", currentPath: "/admin/people" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Admin portal")).toBeVisible();
    await expect(
      canvas.getByRole("navigation", { name: "People and access" })
    ).toBeVisible();
  },
};
