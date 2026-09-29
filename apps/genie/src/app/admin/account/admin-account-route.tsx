"use client";

import type { AccountSession } from "@genie/core/features/account";
import {
  BreakGlassAccount,
  type BreakGlassEnrollment,
} from "@genie/core/features/break-glass";
import { useRouter } from "next/navigation.js";
import { useState } from "react";
import { z } from "zod";
/* oxlint-disable anti-slop/require-readable-spacing -- request handlers keep the guard and the write together. */

/**
 * The browser half of `/admin/account` (R-66). Change password, re-enroll the authenticator and
 * the two session sign-outs. Every write goes to a member-guarded endpoint; no rule is re-written.
 */

/** The Better Auth refusal body, and the enable response's TOTP URI, parsed at this boundary. */
const refusal = z.object({ message: z.string().min(1) });

const enrollmentBody = z.object({ totpURI: z.string().min(1) });

const postBody = z.record(z.string(), z.union([z.string(), z.boolean()]));

async function refusalMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const parsed = refusal.safeParse(
    await response.json().catch(() => undefined)
  );

  return parsed.success ? parsed.data.message : fallback;
}

function manualKeyOf(otpauthUri: string): string {
  const secret = new URL(otpauthUri).searchParams.get("secret") ?? "";

  return secret.replace(/(.{4})/g, "$1 ").trim();
}

async function postJson(
  url: string,
  body: Readonly<Record<string, string | boolean>>
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(postBody.parse(body)),
  });
}

export function AdminAccountRoute(props: {
  readonly name: string;
  readonly email: string;
  readonly productName: string;
  readonly authenticatorEnrolledAt: string | null;
  readonly sessions: readonly AccountSession[];
  readonly timeZone: string;
  readonly passwordNotice: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [enrollment, setEnrollment] = useState<BreakGlassEnrollment | null>(
    null
  );

  async function startReenroll(password: string): Promise<void> {
    const response = await postJson("/api/auth/two-factor/enable", {
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

  return (
    <BreakGlassAccount
      name={props.name}
      email={props.email}
      authenticatorEnrolledAt={props.authenticatorEnrolledAt}
      sessions={props.sessions}
      timeZone={props.timeZone}
      enrollment={enrollment}
      pending={pending}
      error={error ?? props.passwordNotice}
      onChangePassword={(currentPassword, newPassword) => {
        setPending(true);
        void postJson("/api/auth/change-password", {
          currentPassword,
          newPassword,
        })
          .then(async (response) => {
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
            router.refresh();
          })
          .finally(() => setPending(false));
      }}
      onStartReenroll={(password) => {
        setPending(true);
        void startReenroll(password).finally(() => setPending(false));
      }}
      onConfirmReenroll={(code) => {
        setPending(true);
        void postJson("/api/auth/two-factor/verify-totp", { code })
          .then(async (response) => {
            if (!response.ok) {
              setError(
                await refusalMessage(response, "That code was not accepted.")
              );
              return;
            }

            setEnrollment(null);
            setError(null);
            router.refresh();
          })
          .finally(() => setPending(false));
      }}
      onRevokeSession={(sessionId) => {
        void postJson("/api/session/revoke", { sessionId }).then(() =>
          router.refresh()
        );
      }}
      onRevokeOtherSessions={() => {
        void postJson("/api/session/revoke-others", { allOthers: true }).then(
          () => router.refresh()
        );
      }}
    />
  );
}
