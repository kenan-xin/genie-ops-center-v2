import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

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

/** A person's tap target: the rendered height, since a primitive may own a hit area too. */
const heightOf = (element: Element) => element.getBoundingClientRect().height;

/** The height plus the invisible `after:` hit area a 32 px control owns (tokens.md, "Buttons"). */
const hitHeightOf = (element: Element) => {
  const after = getComputedStyle(element, "::after");
  const inset =
    after.position === "absolute"
      ? -Number.parseFloat(after.top) - Number.parseFloat(after.bottom)
      : 0;

  return heightOf(element) + inset;
};

const SETUP_HELP =
  "Until you finish setup, every other page brings you back here.";

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
    identity: {
      companyName: "Genie",
      productName: "Genie Ops Center",
      logoLightUrl: null,
      logoDarkUrl: null,
      markUrl: null,
    },
    setupHelpLabel: "Why am I here?",
    setupHelp: SETUP_HELP,
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
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Administrator")).toBeInTheDocument();

    // The counter is muted body text, not monospace (fix list, D2).
    await expect(
      getComputedStyle(canvas.getByText("Step 1 of 3")).fontFamily
    ).toBe(
      getComputedStyle(canvas.getByRole("heading", { level: 1 })).fontFamily
    );

    // The fields fill the 320 px sign-in stack: no card padding around them.
    const stack = canvasElement.querySelector<HTMLElement>(
      "[data-sign-in-stack]"
    );
    const form = canvas
      .getByRole("button", { name: "Sign in" })
      .closest("form");

    await expect(stack?.offsetWidth).toBe(320);
    await expect(form?.offsetWidth).toBe(320);

    // The setup help belongs to the setup steps only.
    await expect(
      canvas.queryByRole("button", { name: "Why am I here?" })
    ).toBeNull();

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

export const CredentialsDark: Story = {
  ...Credentials,
  globals: { theme: "dark", viewport: { value: "desktop", isRotated: false } },
};

export const PasswordReveal: Story = {
  args: { step: "credentials" },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const password = canvas.getByLabelText("Password");
    const toggle = canvas.getByRole("button", { name: "Show password" });

    // Phone-sized fields: every control of the card is at least 44 px tall (R-62).
    await expect(
      heightOf(canvas.getByLabelText("Email"))
    ).toBeGreaterThanOrEqual(44);
    await expect(heightOf(password)).toBeGreaterThanOrEqual(44);
    await expect(
      heightOf(canvas.getByRole("button", { name: "Sign in" }))
    ).toBeGreaterThanOrEqual(44);
    // The eye sits inside the field (Input Group) and keeps a 44 px hit area.
    const group = password.closest("[data-slot=input-group]");

    await expect(group?.contains(toggle)).toBe(true);
    await expect(heightOf(group ?? password)).toBeGreaterThanOrEqual(44);
    await expect(hitHeightOf(toggle)).toBeGreaterThanOrEqual(44);

    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(password).toHaveAttribute("type", "password");

    await userEvent.click(toggle);

    await expect(
      canvas.getByRole("button", { name: "Hide password" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(password).toHaveAttribute("type", "text");
  },
};

export const RateLimited: Story = {
  args: { step: "credentials", tooManyAttempts: true, retryAfterMinutes: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The neutral notice names the remaining minutes; the inputs and the button are disabled.
    await expect(canvas.getByRole("status")).toHaveTextContent(
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

    // The return link is a real tap target, not a line of text.
    await expect(
      heightOf(canvas.getByRole("button", { name: "Use a different account" }))
    ).toBeGreaterThanOrEqual(40);
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

    // The checklist is the only rule feedback: no strength bar, no score label.
    await expect(canvas.queryByText(/\d+ of \d+ rules/)).toBeNull();
    await expect(canvasElement.querySelector("form .h-1\\.5")).toBeNull();

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

    await expect(canvas.queryByText("Meets the rule")).toBeNull();

    onChangePassword.mockClear();

    await userEvent.click(submit);

    await expect(onChangePassword).toHaveBeenCalledWith(
      "temporary-pass-1!",
      "Abcdefghij1!xy"
    );
  },
};

export const ForcedChangeDark: Story = {
  ...ForcedChangeMeter,
  globals: { theme: "dark" },
};

export const ForcedChangeWhyAmIHere: Story = {
  args: { step: "change-password" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const help = canvas.getByRole("button", { name: "Why am I here?" });

    // Under the subtitle and above the fields, not a footer line (helper-text rule, buv3.17).
    await expect(
      canvas
        .getByText(
          "Your temporary password must be replaced before you continue."
        )
        .compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await expect(
      help.compareDocumentPosition(canvas.getByLabelText("Current password")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await expect(
      canvas.queryByText(/every other page brings you back here/)
    ).toBeNull();

    await userEvent.click(help);

    const callout = within(
      await screen.findByRole("group", { name: "Why am I here?" })
    );

    await expect(callout.getByText(SETUP_HELP)).toBeInTheDocument();
    // Closed again, so axe after the play function reads no focus guards.
    await userEvent.click(callout.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Why am I here?" })).toBeNull()
    );
  },
};

export const Enrollment: Story = {
  args: { step: "authenticator-enroll", enrollment: FIXTURE_ENROLLMENT },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stack = canvasElement.querySelector("[data-sign-in-stack]");

    // The QR code and the manual key fit the 320 px stack on a phone.
    await expect(stack).not.toBeNull();
    await expect(stack?.scrollWidth).toBeLessThanOrEqual(
      stack?.clientWidth ?? 0
    );
    await expect(
      canvas.getByRole("button", { name: "Why am I here?" })
    ).toBeInTheDocument();

    await expect(
      canvas.getByLabelText("QR code for the authenticator app")
    ).toBeInTheDocument();
    await expect(canvas.getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();

    await expect(
      heightOf(canvas.getByRole("button", { name: "Copy key" }))
    ).toBeGreaterThanOrEqual(40);

    onConfirmEnrollment.mockClear();

    await userEvent.type(canvas.getByLabelText("Digit 1 of 6"), "123456");

    await userEvent.click(
      canvas.getByRole("button", { name: "Confirm and open the console" })
    );

    await expect(onConfirmEnrollment).toHaveBeenCalledWith("123456");
  },
};

export const EnrollmentDark: Story = {
  ...Enrollment,
  globals: { theme: "dark", viewport: { value: "phone390", isRotated: false } },
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

export const RateLimitedChangePassword: Story = {
  args: {
    step: "change-password",
    tooManyAttempts: true,
    retryAfterMinutes: 9,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The neutral notice names the minutes; the fields and the button are disabled (R-21).
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Try again in 9 minutes."
    );
    await expect(canvas.getByLabelText("Current password")).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Set password and continue" })
    ).toBeDisabled();
  },
};

export const RateLimitedEnrollment: Story = {
  args: {
    step: "authenticator-enroll",
    enrollment: null,
    tooManyAttempts: true,
    retryAfterMinutes: 4,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Try again in 4 minutes."
    );
    await expect(
      canvas.getByLabelText("Confirm your password to add an authenticator")
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Start enrollment" })
    ).toBeDisabled();
  },
};
