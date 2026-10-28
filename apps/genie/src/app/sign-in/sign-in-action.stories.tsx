import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SignInAction } from "./sign-in-action.tsx";

const meta = {
  title: "Genie Ops/Sign-in/SignInAction",
  component: SignInAction,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The action block of the sign-in page: the tenant's system-use notice, the optional acknowledgement checkbox that gates the action, and the one company-account sign-in action. A notice with no text never gates the action, so a person can always sign in.",
      },
    },
  },
  args: {
    notice: null,
    requiresAcknowledgement: false,
    label: "Sign in with your company account",
    acknowledgeLabel: "I acknowledge these conditions.",
  },
} satisfies Meta<typeof SignInAction>;

export default meta;

type Story = StoryObj<typeof meta>;

const NOTICE = "This system is for authorized staff only. Activity is logged.";

const assertOpenAction: NonNullable<Story["play"]> = async ({
  canvas,
  args,
}) => {
  await expect(canvas.getByRole("link", { name: args.label })).toHaveAttribute(
    "href",
    "/api/auth/sign-in/keycloak"
  );
  await expect(canvas.queryByRole("checkbox")).not.toBeInTheDocument();
};

export const Default: Story = {
  play: async (context) => {
    await assertOpenAction(context);
    await expect(context.canvas.queryByRole("note")).not.toBeInTheDocument();
  },
};

export const NoticeOnly: Story = {
  args: { notice: NOTICE },
  play: async (context) => {
    await expect(context.canvas.getByRole("note")).toHaveTextContent(NOTICE);
    await assertOpenAction(context);
  },
};

export const NoticeWithAcknowledgement: Story = {
  args: { notice: NOTICE, requiresAcknowledgement: true },
  play: async ({ canvas, args, userEvent }) => {
    await expect(
      canvas.getByRole("button", { name: args.label })
    ).toBeDisabled();
    await expect(
      canvas.queryByRole("link", { name: args.label })
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("checkbox", { name: args.acknowledgeLabel })
    );

    await expect(
      canvas.getByRole("link", { name: args.label })
    ).toHaveAttribute("href", "/api/auth/sign-in/keycloak");
  },
};

export const AcknowledgementWithoutNotice: Story = {
  args: { notice: "  ", requiresAcknowledgement: true },
  play: async (context) => {
    await assertOpenAction(context);
    await expect(context.canvas.queryByRole("note")).not.toBeInTheDocument();
  },
};

const RESET_URL =
  "https://id.example.invalid/realms/acme/login-actions/reset-credentials";

export const LocalAccounts: Story = {
  args: {
    label: "Continue to sign in",
    forgotPasswordUrl: RESET_URL,
    forgotPasswordLabel: "Forgot your password?",
  },
  play: async (context) => {
    await assertOpenAction(context);
    await expect(
      context.canvas.getByRole("link", { name: "Forgot your password?" })
    ).toHaveAttribute("href", RESET_URL);
  },
};

export const NoForgotPasswordWithoutLocalAccounts: Story = {
  args: { forgotPasswordLabel: "Forgot your password?" },
  play: async (context) => {
    await assertOpenAction(context);
    await expect(
      context.canvas.queryByRole("link", { name: "Forgot your password?" })
    ).not.toBeInTheDocument();
  },
};

export const Dark: Story = {
  args: { notice: NOTICE, requiresAcknowledgement: true },
  globals: { theme: "dark" },
};

// R-17c: a brokered realm opened to local accounts offers both entries. Only the SSO entry carries
// the identity provider hint, so a local person lands on the realm's password form.
const BESIDE_SSO = {
  label: "Sign in with SSO",
  href: "/api/auth/sign-in/keycloak?entry=sso",
  passwordLabel: "Sign in with email and password",
} as const;

export const LocalAccountsBesideSso: Story = {
  args: BESIDE_SSO,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: BESIDE_SSO.label })
    ).toHaveAttribute("href", BESIDE_SSO.href);
    await expect(
      canvas.getByRole("link", { name: BESIDE_SSO.passwordLabel })
    ).toHaveAttribute("href", "/api/auth/sign-in/keycloak");
  },
};

export const LocalAccountsBesideSsoWithAcknowledgement: Story = {
  args: { ...BESIDE_SSO, notice: NOTICE, requiresAcknowledgement: true },
  play: async ({ canvas, args, userEvent }) => {
    await expect(
      canvas.getByRole("button", { name: BESIDE_SSO.label })
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: BESIDE_SSO.passwordLabel })
    ).toBeDisabled();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("checkbox", { name: args.acknowledgeLabel })
    );

    await expect(
      canvas.getByRole("link", { name: BESIDE_SSO.label })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: BESIDE_SSO.passwordLabel })
    ).toBeInTheDocument();
  },
};

export const LocalAccountsBesideSsoDark: Story = {
  args: BESIDE_SSO,
  globals: { theme: "dark" },
};
