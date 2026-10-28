import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SignInView } from "./sign-in-view.tsx";

const phone = { viewport: { value: "phone390", isRotated: false } };

const desktop = { viewport: { value: "desktop", isRotated: false } };

const meta = {
  title: "Genie Ops/Sign-in/SignInView",
  component: SignInView,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          'The sign-in page (direction D2): one centered 320 px stack with the tenant mark, the heading, the notice, and the entries at full width. "Sign in with email and password" shows only when local accounts are on beside SSO (R-17c).',
      },
    },
  },
  globals: desktop,
  args: {
    identity: {
      companyName: "Genie",
      productName: "Genie Ops Center",
      logoLightUrl: null,
      logoDarkUrl: null,
      markUrl: null,
    },
    heading: "Sign in to Genie Ops Center",
    welcome: null,
    notice: null,
    action: {
      notice: null,
      requiresAcknowledgement: false,
      label: "Sign in with SSO",
      acknowledgeLabel: "I acknowledge these conditions.",
    },
    footer: {
      supportEmail: null,
      supportUrl: null,
      termsUrl: null,
      privacyUrl: null,
      termsLabel: "Terms of use",
      privacyLabel: "Privacy",
    },
    contextId: "story",
    state: "default",
  },
} satisfies Meta<typeof SignInView>;

export default meta;

type Story = StoryObj<typeof meta>;

const BESIDE_SSO = {
  label: "Sign in with SSO",
  href: "/api/auth/sign-in/keycloak?entry=sso",
  passwordLabel: "Sign in with email and password",
} as const;

function stackOf(canvasElement: HTMLElement): HTMLElement {
  const stack = canvasElement.querySelector<HTMLElement>(
    "[data-sign-in-stack]"
  );

  if (stack === null) throw new Error("No sign-in stack");

  return stack;
}

export const SsoOnly: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sign in to Genie Ops Center"
    );
    await expect(canvas.getAllByRole("heading")).toHaveLength(1);
    await expect(
      canvas.getByRole("link", { name: "Sign in with SSO" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Sign in with email and password" })
    ).toBeNull();
    await expect(canvas.queryByText(/Welcome to/)).toBeNull();
    // The old card footer repeated the product name under the stack.
    await expect(canvas.getAllByText(/Genie Ops Center/)).toHaveLength(1);
    await expect(stackOf(canvasElement)).not.toHaveClass(/border/);
  },
};

const BESIDE_SSO_ARGS = { action: { ...meta.args.action, ...BESIDE_SSO } };

export const SsoAndLocalAccounts: Story = {
  args: BESIDE_SSO_ARGS,
  play: async ({ canvas, canvasElement }) => {
    const stack = stackOf(canvasElement);

    const links = canvas.getAllByRole("link");

    await expect(links.map((link) => link.textContent)).toEqual([
      BESIDE_SSO.label,
      BESIDE_SSO.passwordLabel,
    ]);
    await expect(stack.offsetWidth).toBe(320);

    for (const link of links) {
      // oxlint-disable-next-line no-await-in-loop -- two links, each read once.
      await expect(link.offsetHeight).toBe(40);
      // oxlint-disable-next-line no-await-in-loop -- two links, each read once.
      await expect(link.offsetWidth).toBe(stack.offsetWidth);
    }
  },
};

const EXPIRED =
  "You were signed out after 30 minutes of inactivity. Sign in again.";

const EXPIRED_ARGS = { notice: { tone: "info", text: EXPIRED } } as const;

export const SessionExpired: Story = {
  args: EXPIRED_ARGS,
  play: async ({ canvas }) => {
    const notice = canvas.getByRole("status");

    await expect(notice).toHaveTextContent(EXPIRED);
    await expect(canvas.queryByRole("alert")).toBeNull();

    const heading = canvas.getByRole("heading", { level: 1 });

    const entry = canvas.getByRole("link", { name: "Sign in with SSO" });

    // Heading, then the notice, then the entries.
    await expect(
      heading.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await expect(
      notice.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  },
};

export const Refused: Story = {
  args: {
    notice: {
      tone: "warning",
      text: "This account is not registered for this service.",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "This account is not registered for this service."
    );
    await expect(canvas.queryByRole("status")).toBeNull();
  },
};

export const SsoAndLocalAccountsDark: Story = {
  args: BESIDE_SSO_ARGS,
  globals: { ...desktop, theme: "dark" },
};

export const SessionExpiredDark: Story = {
  args: EXPIRED_ARGS,
  globals: { ...desktop, theme: "dark" },
};

export const SsoOnlyPhone: Story = {
  globals: phone,
  play: async ({ canvasElement }) => {
    const stack = stackOf(canvasElement).getBoundingClientRect();

    await expect(stack.left).toBeGreaterThanOrEqual(16);
    await expect(window.innerWidth - stack.right).toBeGreaterThanOrEqual(16);
  },
};

export const LongProductNamePhone: Story = {
  globals: phone,
  args: {
    heading:
      "Sign in to Acme Regional Health and Community Care Services Operations Center",
  },
  play: async ({ canvas, canvasElement }) => {
    const heading = canvas.getByRole("heading", { level: 1 });

    await expect(heading.scrollWidth).toBeLessThanOrEqual(
      stackOf(canvasElement).clientWidth
    );
    await expect(heading.offsetHeight).toBeGreaterThan(
      parseFloat(getComputedStyle(heading).lineHeight)
    );
  },
};
