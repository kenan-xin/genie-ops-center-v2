import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

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
  const table = within(canvasElement).getByRole("table", { name: "Sessions" });

  return within(table);
}

/** The row's overflow menu trigger: R-23 puts the per-session sign-out in it. */
function phoneRowActions(canvasElement: HTMLElement) {
  return sessionTable(canvasElement).getByRole("button", {
    name: "Actions for Pixel 7 (Android)",
  });
}

/** The number of line boxes the text of an element takes. */
function lines(element: Element): number {
  const range = document.createRange();

  range.selectNodeContents(element);

  return new Set(
    [...range.getClientRects()].map((rect) => Math.round(rect.top))
  ).size;
}

/** Last active reads against the page clock (`nowIso`), as the capture's "Now" and "1 h ago". */
export const LastActiveReadsAgainstTheClock: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const table = sessionTable(canvasElement);

    // The fixture's current session was last active 2 minutes before FIXTURE_NOW.
    const current = within(table.getByRole("row", { name: /THIS DEVICE/ }));

    await expect(current.getByText("2 min ago")).toBeVisible();
  },
};

/**
 * At desktop width each session row keeps one line per fact: the chip sits beside the device, as
 * in the design, so no Status column takes the width that would wrap the dates.
 */
export const DesktopSessionRowsDoNotWrap: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  // The names a session gets when its user agent says nothing, as in the live 1440 capture.
  args: {
    sessions: FIXTURE_ACCOUNT_PAGE.sessions.map((session) =>
      session.isCurrent
        ? { ...session, device: "Unknown device", browser: "Unknown browser" }
        : session
    ),
  },
  play: async ({ canvasElement }) => {
    const table = sessionTable(canvasElement);

    await expect(
      table.queryByRole("columnheader", { name: "Status" })
    ).toBeNull();

    const chip = table.getByText("THIS DEVICE");

    const current = within(table.getByRole("row", { name: /THIS DEVICE/ }));

    const device = current.getByText("Unknown device");

    await expect(lines(chip)).toBe(1);
    // The device and the browser keep one line each, with the chip to their right (1440 capture).
    await expect(lines(device)).toBe(1);
    await expect(lines(current.getByText("Unknown browser"))).toBe(1);
    await expect(chip.getBoundingClientRect().left).toBeGreaterThan(
      device.getBoundingClientRect().right
    );

    // The one-line facts still fit the card, with no sideways scroll.
    const scroller = canvasElement.querySelector(
      '[data-slot="table-container"]'
    );

    if (scroller === null) throw new Error("No table container");

    await expect(scroller.scrollWidth).toBeLessThanOrEqual(
      scroller.clientWidth
    );

    const dated = table
      .getAllByRole("cell")
      .filter((cell) => /\d{4}/.test(cell.textContent ?? ""));

    await expect(dated.length).toBeGreaterThan(0);
    await expect(dated.map(lines)).toEqual(dated.map(() => 1));
  },
};

/**
 * On a phone the Sessions header stacks as in the mobile capture: the description under the
 * title at the same left edge, then Sign out all other sessions under the description.
 */
export const SessionsHeaderStacksOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const title = canvas.getByRole("heading", { name: "Sessions" });

    const description = canvas.getByText(/^Where you are signed in/);

    const action = canvas.getByRole("button", {
      name: "Sign out all other sessions",
    });

    await expect(description.getBoundingClientRect().left).toBe(
      title.getBoundingClientRect().left
    );
    await expect(
      description.getBoundingClientRect().top
    ).toBeGreaterThanOrEqual(title.getBoundingClientRect().bottom);
    await expect(action.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      description.getBoundingClientRect().bottom
    );
  },
};

/**
 * The page header sits as on every admin page: at the content's left edge, not centered, with the
 * 24 px gap above the first card, and the subtitle names what the page holds.
 */
export const HeaderGapMatchesTheAdminPages: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const main = within(canvasElement).getByTestId("account-page");

    const header = main.querySelector<HTMLElement>(
      "header[data-shell-page-header]"
    );

    if (header === null) throw new Error("No page header");

    const profile = within(main)
      .getByRole("heading", { name: "Profile" })
      .closest('[data-slot="card"]');

    if (profile === null) throw new Error("No Profile card");

    await expect(
      profile.getBoundingClientRect().top -
        header.getBoundingClientRect().bottom
    ).toBe(24);
    await expect(
      header.getBoundingClientRect().top - main.getBoundingClientRect().top
    ).toBe(0);

    const container = main.parentElement;

    if (container === null) throw new Error("No container");

    await expect(header.getBoundingClientRect().left).toBe(
      container.getBoundingClientRect().left
    );
    await expect(
      within(header).getByText("Your profile, sessions, and access.")
    ).toBeInTheDocument();
  },
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Each block sits in its own bordered card.
    await expect(
      ["Profile", "Sessions", "Roles and access"].filter(
        (name) =>
          canvas
            .getByRole("heading", { name })
            .closest('[data-slot="card"]') === null
      )
    ).toEqual([]);

    // Profile: initials tile, name, email, one chip per group with its source.
    await expect(canvas.getByText("PN")).toBeInTheDocument();
    await expect(canvas.getByText("Priya Nair")).toBeInTheDocument();
    await expect(
      canvas.getByText("priya.nair@example.com")
    ).toBeInTheDocument();
    await expect(canvas.getByText("Directory admins")).toBeInTheDocument();
    await expect(canvas.getAllByText("Directory").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Local")).toBeInTheDocument();

    // Where changes happen sits behind help (helper-text rule).
    await expect(
      canvas.getByRole("button", { name: "Where your profile comes from" })
    ).toBeInTheDocument();

    // Sessions: the current row carries the chip and no menu; the others an actions menu. The
    // assertions scope to the desktop table; the phone card list renders the same rows.
    const table = sessionTable(canvasElement);

    await expect(table.getByText("THIS DEVICE")).toBeInTheDocument();
    await expect(
      table.getAllByRole("button", { name: /^Actions for / }).length
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

    // Read-only: the help says who changes roles.
    await expect(
      canvas.getByRole("button", { name: "How your roles change" })
    ).toBeInTheDocument();
  },
};

export const RevokeOneSession: Story = {
  play: async ({ canvasElement, step }) => {
    const signOut = async () => {
      await userEvent.click(phoneRowActions(canvasElement));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Sign out" })
      );
    };

    await step("cancel keeps the session", async () => {
      await signOut();

      const dialog = within(await screen.findByRole("dialog"));

      // The title names the device; the consequence is one sentence.
      await expect(dialog.getByText(/Pixel 7 \(Android\)/)).toBeInTheDocument();

      // Cancel is focused when the dialog opens; Base UI moves focus a frame after it mounts.
      await waitFor(() =>
        expect(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus()
      );

      await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
    });

    await step("confirm signs the session out", async () => {
      onRevokeSession.mockClear();

      await signOut();

      const dialog = within(await screen.findByRole("dialog"));

      await userEvent.click(dialog.getByRole("button", { name: "Sign out" }));

      await expect(onRevokeSession).toHaveBeenCalledWith("s-phone");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
    });
  },
};

export const EscapeCancelsAndReturnsFocus: Story = {
  play: async ({ canvasElement }) => {
    const opener = phoneRowActions(canvasElement);

    onRevokeSession.mockClear();
    await userEvent.click(opener);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Sign out" })
    );
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );

    await waitFor(() => expect(opener).toHaveFocus());
    await expect(onRevokeSession).not.toHaveBeenCalled();
  },
};

export const SignOutEverywhere: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Sign out all other sessions" })
    );

    const dialog = within(await screen.findByRole("dialog"));

    // The title names the count.
    await expect(dialog.getByText(/2 other sessions/)).toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "Sign out" }));

    await expect(onRevokeOtherSessions).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  },
};

export const SignOutInFlight: Story = {
  args: { revoking: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const others = canvas.getByRole("button", {
      name: "Sign out all other sessions",
    });

    // DR-17: while a sign-out runs, the block button is busy and the row item is refused, so
    // neither starts a second one.
    await expect(others).toHaveAttribute("aria-busy", "true");

    await userEvent.click(others);
    await expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(phoneRowActions(canvasElement));

    const item = await screen.findByRole("menuitem", { name: "Sign out" });

    await expect(item).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(item);
    await expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    );
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
      canvas.queryByRole("button", { name: /^Actions for / })
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
      canvas.getByRole("button", { name: "How your roles change" })
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
