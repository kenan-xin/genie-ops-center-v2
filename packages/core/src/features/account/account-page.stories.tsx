import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  FIXTURE_ACCOUNT_PAGE,
  FIXTURE_NOW,
} from "./__fixtures__/account-page.ts";
import { AccountPage } from "./account-page.tsx";

/**
 * The Account page's three Section 2 blocks (R-18): Profile, Sessions, and the read-only Roles
 * and access. The interactions cover the shared confirm dialog both sign-outs open - the title
 * names the device or the count, Cancel is focused, the confirm is the danger tone - and the
 * page-level callbacks are asserted against their spies.
 *
 * The block renders both the phone card list and the desktop table under the `md` breakpoint in
 * the application; the Storybook host loads no stylesheet, so an assertion scopes itself to one
 * of the two rather than relying on which is hidden.
 */
const onRevokeSession = fn();

const onRevokeOtherSessions = fn();

const meta = {
  title: "Core/Account page",
  component: AccountPage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The person's own account page: identity as synced from the directory, active sessions with per-session sign-out and sign out everywhere, and a read-only roles summary. Nothing on this page edits a row.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    ...FIXTURE_ACCOUNT_PAGE,
    nowIso: FIXTURE_NOW,
    onRevokeSession,
    onRevokeOtherSessions,
  },
} satisfies Meta<typeof AccountPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The desktop table's session rows, in the fixture's current-first order. */
function sessionTable(canvasElement: HTMLElement) {
  const table = within(canvasElement).getByRole("table");

  return within(table);
}

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Profile: initials tile, name, email, one chip per group with its source.
    await expect(canvas.getByText("PN")).toBeInTheDocument();
    await expect(canvas.getByText("Priya Nair")).toBeInTheDocument();
    await expect(
      canvas.getByText("priya.nair@example.com")
    ).toBeInTheDocument();
    await expect(canvas.getByText("Directory admins")).toBeInTheDocument();
    await expect(canvas.getAllByText("Directory").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Local")).toBeInTheDocument();

    // The muted note names where changes happen.
    await expect(
      canvas.getByText(/changes are made in the company directory/i)
    ).toBeInTheDocument();

    // Sessions: the current row carries the chip and no button; the others a Sign out. The
    // assertions scope to the desktop table; the phone card list renders the same rows.
    const table = sessionTable(canvasElement);

    await expect(table.getByText("THIS DEVICE")).toBeInTheDocument();
    await expect(
      table.getAllByRole("button", { name: "Sign out" }).length
    ).toBe(2);

    // Roles and access: both grants with count, scope, and arrival.
    await expect(canvas.getByText("Solutions editor")).toBeInTheDocument();
    await expect(canvas.getByText("2 permissions")).toBeInTheDocument();
    await expect(canvas.getByText("Whole tenant")).toBeInTheDocument();
    await expect(canvas.getByText("Direct")).toBeInTheDocument();
    await expect(canvas.getByText("Contract viewer")).toBeInTheDocument();
    await expect(canvas.getByText("Vendor agreements")).toBeInTheDocument();
    await expect(
      canvas.getByText("Through Field engineers")
    ).toBeInTheDocument();

    // Read-only: the note says who changes roles.
    await expect(
      canvas.getByText(/contact an administrator/i)
    ).toBeInTheDocument();
  },
};

export const RevokeOneSession: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const table = sessionTable(canvasElement);

    const phoneRow = table.getByRole("row", {
      name: /Pixel 7 \(Android\)/,
    });

    await step("cancel keeps the session", async () => {
      await userEvent.click(
        within(phoneRow).getByRole("button", { name: "Sign out" })
      );

      const dialog = within(await canvas.findByRole("dialog"));

      // The title names the device; the consequence is one sentence.
      await expect(dialog.getByText(/Pixel 7 \(Android\)/)).toBeInTheDocument();

      // Cancel is focused when the dialog opens.
      await expect(
        dialog.getByRole("button", { name: "Cancel" })
      ).toHaveFocus();

      await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

      await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await step("confirm signs the session out", async () => {
      onRevokeSession.mockClear();

      await userEvent.click(
        within(phoneRow).getByRole("button", { name: "Sign out" })
      );

      const dialog = within(await canvas.findByRole("dialog"));

      await userEvent.click(dialog.getByRole("button", { name: "Sign out" }));

      await expect(onRevokeSession).toHaveBeenCalledWith("s-phone");
      await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    });
  },
};

export const SignOutEverywhere: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Sign out all other sessions" })
    );

    const dialog = within(await canvas.findByRole("dialog"));

    // The title names the count.
    await expect(dialog.getByText(/2 other sessions/)).toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "Sign out" }));

    await expect(onRevokeOtherSessions).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const OnlyThisDevice: Story = {
  args: {
    sessions: FIXTURE_ACCOUNT_PAGE.sessions.filter(
      (session) => session.isCurrent
    ),
  },
  play: async ({ canvasElement }) => {
    // One session offers neither a row sign-out nor the block-level one, in either layout.
    const canvas = within(canvasElement);

    await expect(
      sessionTable(canvasElement).getByText("THIS DEVICE")
    ).toBeInTheDocument();

    await expect(
      canvas.queryByRole("button", { name: "Sign out" })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Sign out all other sessions" })
    ).not.toBeInTheDocument();
  },
};

export const WithoutRoles: Story = {
  args: {
    roleGrants: [],
    groups: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText(/contact an administrator/i)
    ).toBeInTheDocument();

    // No groups reads as its own line, not as a missing block.
    await expect(canvas.getByText(/no groups yet/i)).toBeInTheDocument();
  },
};

export const LocalAccountTenant: Story = {
  args: {
    accountManagementUrl: "https://id.example.com/realms/genie/account",
  },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", {
      name: "Change password",
    });

    await expect(link).toHaveAttribute(
      "href",
      "https://id.example.com/realms/genie/account"
    );
    await expect(link).toHaveAttribute("target", "_blank");
  },
};
