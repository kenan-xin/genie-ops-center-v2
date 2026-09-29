"use client";

import {
  type BreakGlassEnrollment,
  type BreakGlassStep,
  BreakGlassSignIn,
} from "@genie/core/features/break-glass";
import { useRouter } from "next/navigation.js";
import { useState } from "react";
import { z } from "zod";
/* oxlint-disable anti-slop/require-readable-spacing -- request handlers keep the guard and the write together. */

/**
 * The browser half of the break-glass door (R-62 to R-65). The server decided the card to show and
 * passed the account facts; this owns the requests and the step changes. Every write goes to the
 * `/api/auth` allowlist the member guards, so no app-owned route re-implements a rule.
 */

/** The Better Auth refusal body, parsed at this boundary rather than trusted. */
const refusal = z.object({ message: z.string().min(1) });

const rateLimited = z.object({ retryAfterMinutes: z.number() });

const twoFactorRedirect = z.object({ twoFactorRedirect: z.literal(true) });

const enrollmentBody = z.object({ totpURI: z.string().min(1) });

/** Reads `{ message }` from a Better Auth error body, or the neutral fallback. */
async function refusalMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const parsed = refusal.safeParse(
    await response.json().catch(() => undefined)
  );

  return parsed.success ? parsed.data.message : fallback;
}

/** The manual key from an otpauth URI, grouped in fours (R-63). */
function manualKeyOf(otpauthUri: string): string {
  const secret = new URL(otpauthUri).searchParams.get("secret") ?? "";

  return secret.replace(/(.{4})/g, "$1 ").trim();
}

async function postAuth(
  path: string,
  body: Readonly<Record<string, string | boolean>>
): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function AdminLoginRoute(props: {
  readonly productName: string;
  readonly initialStep: BreakGlassStep;
  readonly initialSteps: readonly BreakGlassStep[];
  /** The signed-in account's email once a session exists, else empty. */
  readonly email: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<BreakGlassStep>(props.initialStep);
  const [steps, setSteps] = useState<readonly BreakGlassStep[]>(
    props.initialSteps
  );
  const [email, setEmail] = useState(props.email);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tooManyAttempts, setTooManyAttempts] = useState(false);
  const [retryAfterMinutes, setRetryAfterMinutes] = useState(15);
  const [enrollment, setEnrollment] = useState<BreakGlassEnrollment | null>(
    null
  );

  /** Starts enrollment; the account's current password is required by Better Auth (R-63). */
  async function startEnrollment(password: string): Promise<void> {
    const response = await postAuth("/two-factor/enable", {
      password,
      method: "totp",
      issuer: props.productName,
    });

    if (!response.ok) {
      setError(await refusalMessage(response, "Enrollment could not start."));
      return;
    }

    const parsed = enrollmentBody.safeParse(
      await response.json().catch(() => undefined)
    );

    if (!parsed.success) {
      setError("Enrollment could not start.");
      return;
    }

    setEnrollment({
      otpauthUri: parsed.data.totpURI,
      manualKey: manualKeyOf(parsed.data.totpURI),
      issuer: props.productName,
    });
    setError(null);
  }

  async function onSubmitCredentials(
    submittedEmail: string,
    password: string
  ): Promise<void> {
    setPending(true);
    setEmail(submittedEmail);

    try {
      const response = await postAuth("/sign-in/email", {
        email: submittedEmail,
        password,
      });

      if (response.status === 429) {
        const parsed = rateLimited.safeParse(
          await response.json().catch(() => undefined)
        );

        setRetryAfterMinutes(
          parsed.success ? parsed.data.retryAfterMinutes : 15
        );
        setTooManyAttempts(true);
        setError(null);
        return;
      }

      if (!response.ok) {
        setError(await refusalMessage(response, "Invalid email or password."));
        return;
      }

      const body = twoFactorRedirect.safeParse(
        await response.json().catch(() => undefined)
      );

      setError(null);

      if (body.success) {
        setSteps(["credentials", "authenticator-code"]);
        setStep("authenticator-code");
        return;
      }

      // The session now exists; the server decides the limited card from its flags (R-65).
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function onSubmitAuthenticatorCode(code: string): Promise<void> {
    setPending(true);

    try {
      const response = await postAuth("/two-factor/verify-totp", { code });

      if (!response.ok) {
        setError(await refusalMessage(response, "That code was not accepted."));
        return;
      }

      setError(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function onChangePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    setPending(true);

    try {
      const response = await postAuth("/change-password", {
        currentPassword,
        newPassword,
      });

      if (!response.ok) {
        setError(
          await refusalMessage(
            response,
            "The password could not be changed. Check the current password and the rule."
          )
        );
        return;
      }

      setError(null);
      // The forced step is done. Enrollment follows, and starts with the password just set.
      setSteps(["credentials", "change-password", "authenticator-enroll"]);
      setStep("authenticator-enroll");
      await startEnrollment(newPassword);
    } finally {
      setPending(false);
    }
  }

  async function onConfirmEnrollment(code: string): Promise<void> {
    setPending(true);

    try {
      const response = await postAuth("/two-factor/verify-totp", { code });

      if (!response.ok) {
        setError(await refusalMessage(response, "That code was not accepted."));
        return;
      }

      setError(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <BreakGlassSignIn
      productName={props.productName}
      step={step}
      steps={steps}
      email={email}
      error={error}
      pending={pending}
      tooManyAttempts={tooManyAttempts}
      retryAfterMinutes={retryAfterMinutes}
      enrollment={enrollment}
      onSubmitCredentials={(submittedEmail, password) => {
        void onSubmitCredentials(submittedEmail, password);
      }}
      onSubmitAuthenticatorCode={(code) => {
        void onSubmitAuthenticatorCode(code);
      }}
      onChangePassword={(current, next) => {
        void onChangePassword(current, next);
      }}
      onStartEnrollment={(password) => {
        setPending(true);
        void startEnrollment(password).finally(() => setPending(false));
      }}
      onConfirmEnrollment={(code) => {
        void onConfirmEnrollment(code);
      }}
      onUseDifferentAccount={() => {
        setStep("credentials");
        setSteps(["credentials", "authenticator-code"]);
        setError(null);
      }}
      onGoToMemberSignIn={() => router.push("/sign-in")}
    />
  );
}
