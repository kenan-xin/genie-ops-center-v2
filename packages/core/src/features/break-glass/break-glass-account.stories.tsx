import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { FIXTURE_BREAK_GLASS_SESSIONS } from "./__fixtures__/break-glass.ts";
import { BreakGlassAccount } from "./break-glass-account.tsx";
/* oxlint-disable anti-slop/require-readable-spacing -- story spies and fixtures stay together. */

/**
 * The `/admin/account` break-glass variant (R-66): Profile, Change password, Authenticator and
 * Sessions, and no Preferences or Roles and access block. The interactions cover the forced-change
 * meter, the re-enroll start and the session sign-outs.
 */
const onChangePassword = fn();
const onStartReenroll = fn();
const onConfirmReenroll = fn();
const onRevokeSession = fn();
const onRevokeOtherSessions = fn();

const meta = {
  title: "Core/Break-glass account",
  component: BreakGlassAccount,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The account page a break-glass administrator sees: change password with the current password required, re-enroll the authenticator, and sessions. No preferences, no roles.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    name: "Break Glass",
    email: "breakglass@example.com",
    authenticatorEnrolledAt: "2026-09-20T10:00:00.000Z",
    sessions: FIXTURE_BREAK_GLASS_SESSIONS,
    timeZone: "UTC",
    enrollment: null,
    onChangePassword,
    onStartReenroll,
    onConfirmReenroll,
    onRevokeSession,
    onRevokeOtherSessions,
  },
} satisfies Meta<typeof BreakGlassAccount>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Profile names the local identity source and where the secrets are managed.
    await expect(canvas.getByText("Break Glass")).toBeInTheDocument();
    await expect(
      canvas.getByText("breakglass@example.com")
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Identity source: Genie/)
    ).toBeInTheDocument();

    // The three blocks; no Preferences and no Roles and access (R-66).
    await expect(
      canvas.getByRole("heading", { name: "Change password" })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Authenticator" })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Sessions" })
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Preferences" })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Roles and access" })
    ).not.toBeInTheDocument();
  },
};

export const ChangePassword: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    onChangePassword.mockClear();

    await userEvent.type(
      canvas.getByLabelText("Current password"),
      "temporary-pass-1!"
    );
    await userEvent.type(
      canvas.getByLabelText("New password"),
      "Abcdefghij1!xy"
    );
    await userEvent.type(
      canvas.getByLabelText("Confirm new password"),
      "Abcdefghij1!xy"
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set password and continue" })
    );

    await expect(onChangePassword).toHaveBeenCalledWith(
      "temporary-pass-1!",
      "Abcdefghij1!xy"
    );
  },
};

export const Reenroll: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    onStartReenroll.mockClear();

    await userEvent.click(canvas.getByRole("button", { name: "Re-enroll" }));
    await userEvent.type(
      canvas.getByLabelText("Confirm your password"),
      "Abcdefghij1!xy"
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Start re-enroll" })
    );

    await expect(onStartReenroll).toHaveBeenCalledWith("Abcdefghij1!xy");
  },
};

export const ConfirmReenroll: Story = {
  args: {
    enrollment: {
      otpauthUri: "otpauth://totp/Genie:breakglass@example.com?secret=ABCD",
      manualKey: "ABCD EFGH IJKL MNOP",
      issuer: "Genie Ops Center",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    onConfirmReenroll.mockClear();

    await expect(canvas.getByTestId("enrollment-manual-key")).toHaveTextContent(
      "ABCD EFGH IJKL MNOP"
    );

    await userEvent.type(canvas.getByLabelText("Code from the app"), "123456");
    await userEvent.click(canvas.getByRole("button", { name: "Confirm" }));

    await expect(onConfirmReenroll).toHaveBeenCalledWith("123456");
  },
};

export const SignOutPhone: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    onRevokeSession.mockClear();
    onRevokeOtherSessions.mockClear();

    // The current device carries the chip and no action; the other offers Sign out.
    await expect(canvas.getByText("THIS DEVICE")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }));
    await expect(onRevokeSession).toHaveBeenCalledWith("s-phone");

    await userEvent.click(
      canvas.getByRole("button", { name: "Sign out all other sessions" })
    );
    await expect(onRevokeOtherSessions).toHaveBeenCalledTimes(1);
  },
};
