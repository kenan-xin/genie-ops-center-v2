import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { UserMenu } from "./user-menu.tsx";

/**
 * The shell's user footer (R-32): the person, their role, and a menu that opens upward with
 * Account, Change password (local accounts), the chrome switch (administrators), Help and support
 * (when branding has a contact) and Sign out, which posts the sign-out form.
 */
const meta = {
  title: "Core/Shell/User menu",
  component: UserMenu,
  tags: ["autodocs"],
  args: {
    user: { name: "Alex Morgan", roleLabel: "Member" },
    menu: {
      accountHref: "/account",
      changePasswordHref: null,
      switchTarget: null,
      supportHref: "mailto:help@acme.example",
      signOutAction: "/api/auth/sign-out",
    },
    strings: {
      account: "Account",
      changePassword: "Change password",
      opensInNewTab: "Opens in a new tab",
      helpAndSupport: "Help and support",
      signOut: "Sign out",
    },
  },
  decorators: [
    (Story) => (
      // Room above the footer, so the upward menu has space to open.
      <div className="flex h-96 w-60 flex-col justify-end rounded-xl border border-border bg-muted p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

const trigger = (canvasElement: HTMLElement) => {
  const element = canvasElement.querySelector<HTMLElement>(
    "[data-shell-user-menu]"
  );

  if (element === null) throw new Error("No user menu trigger");

  return element;
};

export const Member: Story = {
  play: async ({ canvasElement, canvas }) => {
    await expect(canvas.getByText("Alex Morgan")).toHaveAttribute(
      "title",
      "Alex Morgan"
    );
    await userEvent.click(trigger(canvasElement));

    // The popup is portalled to the body, outside the canvas.
    const menu = await within(document.body).findByRole("menu");

    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);

    await expect(names).toEqual(["Account", "Help and support", "Sign out"]);
    await expect(
      within(menu).getByRole("menuitem", { name: "Help and support" })
    ).toHaveAttribute("href", "mailto:help@acme.example");
    await expect(
      within(menu).queryByRole("menuitem", { name: "Administration" })
    ).toBeNull();
  },
};

export const AdministratorLocalAccount: Story = {
  args: {
    user: { name: "Priya Nair", roleLabel: "Administrator" },
    menu: {
      accountHref: "/account",
      changePasswordHref:
        "https://id.acme.example/realms/acme/account/account-security/signing-in",
      switchTarget: { label: "Administration", href: "/admin/people" },
      supportHref: null,
      signOutAction: "/api/auth/sign-out",
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));

    const menu = await within(document.body).findByRole("menu");

    await expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Account",
      expect.stringMatching(/^Change password/),
      "Administration",
      "Sign out",
    ]);

    const changePassword = within(menu).getByRole("menuitem", {
      name: /Change password/,
    });

    await expect(changePassword).toHaveAttribute("target", "_blank");
    await expect(changePassword).toHaveAttribute("rel", "noopener noreferrer");
    await expect(changePassword).toHaveAccessibleName(
      expect.stringContaining("Opens in a new tab")
    );
    await expect(
      within(menu).getByRole("menuitem", { name: "Administration" })
    ).toHaveAttribute("href", "/admin/people");
  },
};

// Submissions the story records and prevents, so the page never navigates.
const submitted: HTMLFormElement[] = [];

const record = (event: SubmitEvent) => {
  event.preventDefault();

  if (event.target instanceof HTMLFormElement) submitted.push(event.target);
};

export const SignOutPostsTheForm: Story = {
  beforeEach: () => {
    submitted.length = 0;
    document.addEventListener("submit", record);

    return () => document.removeEventListener("submit", record);
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));

    const menu = await within(document.body).findByRole("menu");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Sign out" })
    );

    await waitFor(() => expect(submitted).toHaveLength(1));
    await expect(submitted[0]?.method).toBe("post");
    await expect(submitted[0]?.action).toMatch(/\/api\/auth\/sign-out$/);
    // The closing popup keeps its focus guards until it leaves; axe runs after that.
    await waitFor(() =>
      expect(within(document.body).queryByRole("menu")).toBeNull()
    );
  },
};

export const EscapeCloses: Story = {
  play: async ({ canvasElement }) => {
    const button = trigger(canvasElement);
    await userEvent.click(button);
    await within(document.body).findByRole("menu");

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(within(document.body).queryByRole("menu")).toBeNull()
    );
    await expect(button).toHaveFocus();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
