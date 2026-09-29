import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { FIXTURE_ENROLLMENT } from "./__fixtures__/break-glass.ts";
import { BreakGlassSignIn, breakGlassSteps } from "./break-glass-sign-in.tsx";
/* oxlint-disable anti-slop/require-readable-spacing -- story spies and fixtures stay together. */

/**
 * The break-glass door (R-62 to R-65): the credentials card, the rate-limited state, the six-digit
 * code step for an enrolled account, the forced password change with the shared R-64 meter, and
 * authenticator enrollment. Each interaction is asserted against the host callbacks.
 */
const onSubmitCredentials = fn();
const onSubmitAuthenticatorCode = fn();
const onChangePassword = fn();
const onConfirmEnrollment = fn();
const onStartEnrollment = fn();
const onUseDifferentAccount = fn();
const onGoToMemberSignIn = fn();

const FIRST_SIGN_IN_STEPS = breakGlassSteps({
  mustChangePassword: true,
  mustEnrollAuthenticator: true,
});

const ENROLLED_STEPS = breakGlassSteps({
  mustChangePassword: false,
  mustEnrollAuthenticator: false,
});

const meta = {
  title: "Core/Break-glass sign-in",
  component: BreakGlassSignIn,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The administrator door at /admin/login. Credentials, then either the authenticator code (enrolled) or the forced password change and enrollment (first sign-in or after rotation).",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    productName: "Genie Ops Center",
    steps: FIRST_SIGN_IN_STEPS,
    onSubmitCredentials,
    onSubmitAuthenticatorCode,
    onChangePassword,
    onConfirmEnrollment,
    onStartEnrollment,
    onUseDifferentAccount,
    onGoToMemberSignIn,
  },
} satisfies Meta<typeof BreakGlassSignIn>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Credentials: Story = {
  args: { step: "credentials" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Administrator")).toBeInTheDocument();
    await expect(canvas.getByText("Step 1 of 3")).toBeInTheDocument();

    onSubmitCredentials.mockClear();

    await userEvent.type(
      canvas.getByLabelText("Email"),
      "breakglass@example.com"
    );
    await userEvent.type(
      canvas.getByLabelText("Password"),
      "temporary-pass-1!"
    );
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));

    await expect(onSubmitCredentials).toHaveBeenCalledWith(
      "breakglass@example.com",
      "temporary-pass-1!"
    );
  },
};

export const RateLimited: Story = {
  args: { step: "credentials", tooManyAttempts: true, retryAfterMinutes: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The neutral notice names the remaining minutes; the inputs and the button are disabled.
    await expect(canvas.getByTestId("rate-limit-notice")).toHaveTextContent(
      "Try again in 12 minutes."
    );
    await expect(canvas.getByLabelText("Email")).toBeDisabled();
    await expect(canvas.getByLabelText("Password")).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Sign in" })
    ).toBeDisabled();
  },
};

export const AuthenticatorCode: Story = {
  args: { step: "authenticator-code", steps: ENROLLED_STEPS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Step 2 of 2")).toBeInTheDocument();

    onSubmitAuthenticatorCode.mockClear();

    // Typing the six digits into the first box advances through all of them.
    await userEvent.type(canvas.getByLabelText("Digit 1 of 6"), "123456");

    await userEvent.click(canvas.getByRole("button", { name: "Verify" }));

    await expect(onSubmitAuthenticatorCode).toHaveBeenCalledWith("123456");

    await userEvent.click(
      canvas.getByRole("button", { name: "Use a different account" })
    );
    await expect(onUseDifferentAccount).toHaveBeenCalled();
  },
};

export const ForcedChangeMeter: Story = {
  args: { step: "change-password" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The fourth rule is neutral until save (R-64).
    await expect(canvas.getByText(/Checked when you save/)).toBeInTheDocument();

    const weak = canvas.getByLabelText("New password");
    await userEvent.type(weak, "short");

    const submit = canvas.getByRole("button", {
      name: "Set password and continue",
    });

    await expect(submit).toBeDisabled();

    await userEvent.type(
      canvas.getByLabelText("Current password"),
      "temporary-pass-1!"
    );
    await userEvent.clear(weak);
    await userEvent.type(weak, "Abcdefghij1!xy");
    await userEvent.type(
      canvas.getByLabelText("Confirm new password"),
      "Abcdefghij1!xy"
    );

    onChangePassword.mockClear();

    await userEvent.click(submit);

    await expect(onChangePassword).toHaveBeenCalledWith(
      "temporary-pass-1!",
      "Abcdefghij1!xy"
    );
  },
};

export const Enrollment: Story = {
  args: { step: "authenticator-enroll", enrollment: FIXTURE_ENROLLMENT },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByLabelText("QR code for the authenticator app")
    ).toBeInTheDocument();
    await expect(canvas.getByTestId("enrollment-manual-key")).toHaveTextContent(
      "JBSW Y3DP EHPK 3PXP"
    );

    onConfirmEnrollment.mockClear();

    await userEvent.type(canvas.getByLabelText("Digit 1 of 6"), "123456");

    await userEvent.click(
      canvas.getByRole("button", { name: "Confirm and open the console" })
    );

    await expect(onConfirmEnrollment).toHaveBeenCalledWith("123456");
  },
};

export const EnrollmentNeedsPassword: Story = {
  args: { step: "authenticator-enroll", enrollment: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    onStartEnrollment.mockClear();

    await userEvent.type(
      canvas.getByLabelText("Confirm your password to add an authenticator"),
      "Abcdefghij1!xy"
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Start enrollment" })
    );

    await expect(onStartEnrollment).toHaveBeenCalledWith("Abcdefghij1!xy");
  },
};
