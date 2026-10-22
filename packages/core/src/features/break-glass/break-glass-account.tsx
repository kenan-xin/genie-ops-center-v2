import { Button, Field, FieldLabel, Input, focusRing } from "@genie/ui";
import { useState } from "react";
import type { JSX, ReactNode } from "react";

import type { AccountSession } from "../account/types.ts";
import {
  BreakGlassPasswordForm,
  RateLimitNotice,
} from "./break-glass-sign-in.tsx";
import type { BreakGlassEnrollment } from "./break-glass-sign-in.tsx";

/* oxlint-disable anti-slop/require-readable-spacing -- dense presentational markup keeps related lines together. */

/**
 * The `/admin/account` break-glass variant (R-66, design spec "account and inbox"): Profile,
 * Change password with the current password required, Authenticator with re-enroll, and Sessions.
 * It offers no Preferences and no Roles and access. The host owns every request.
 */
export type BreakGlassAccountProps = {
  readonly name: string;
  readonly email: string;
  readonly authenticatorEnrolledAt: string | null;
  readonly sessions: readonly AccountSession[];
  readonly timeZone: string;
  /** The pending enrollment once the host has started a re-enroll, else null. */
  readonly enrollment?: BreakGlassEnrollment | null;
  readonly pending?: boolean;
  readonly error?: string | null;
  /** The per-account password window refused the last attempt (R-19, R-21). */
  readonly rateLimited?: boolean;
  readonly retryAfterMinutes?: number;
  readonly onChangePassword?: (
    currentPassword: string,
    newPassword: string
  ) => void;
  /** Re-enroll: the current password that starts a fresh enrollment. */
  readonly onStartReenroll?: (password: string) => void;
  /** Re-enroll: the first code from the new app. */
  readonly onConfirmReenroll?: (code: string) => void;
  readonly onRevokeSession?: ((sessionId: string) => void) | undefined;
  readonly onRevokeOtherSessions?: (() => void) | undefined;
};

function formatInstant(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function Block(props: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-lg font-bold text-foreground">{props.title}</h2>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </header>
      {props.children}
    </section>
  );
}

function SessionsBlock(props: {
  readonly sessions: readonly AccountSession[];
  readonly timeZone: string;
  readonly onRevokeSession?: ((sessionId: string) => void) | undefined;
  readonly onRevokeOtherSessions?: (() => void) | undefined;
}): JSX.Element {
  const others = props.sessions.filter((session) => !session.isCurrent);

  return (
    <Block
      title="Sessions"
      description="Where this account is signed in, and how to end a session."
    >
      {others.length === 0 ? null : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => props.onRevokeOtherSessions?.()}
          className="w-fit"
        >
          Sign out all other sessions
        </Button>
      )}
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {props.sessions.map((session) => (
          <li
            key={session.id}
            data-session-id={session.id}
            className="flex flex-col gap-1 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {session.device} · {session.browser}
              </span>
              {session.isCurrent ? (
                <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                  THIS DEVICE
                </span>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onRevokeSession?.(session.id)}
                >
                  Sign out
                </Button>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {session.ipAddress} · signed in{" "}
              {formatInstant(session.signedInAt, props.timeZone)}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function EnrollmentPanel(props: {
  readonly enrollment: BreakGlassEnrollment;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onConfirm: (code: string) => void;
}): JSX.Element {
  const [code, setCode] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Add this key to your authenticator app, then confirm with one code.
        </span>
        <code
          data-testid="enrollment-manual-key"
          className="font-mono text-sm tracking-wider"
        >
          {props.enrollment.manualKey}
        </code>
        <span className="text-xs text-muted-foreground">
          Issuer {props.enrollment.issuer}
        </span>
      </div>
      {props.error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Field className="w-40">
          <FieldLabel htmlFor="reenroll-code">Code from the app</FieldLabel>
          <input
            id="reenroll-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className={`h-11 rounded-lg border border-input bg-background px-3 font-mono text-lg tracking-widest ${focusRing}`}
          />
        </Field>
        <Button
          type="button"
          size="lg"
          onClick={() => props.onConfirm(code)}
          disabled={code.length !== 6 || props.pending}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

function AuthenticatorBlock(props: {
  readonly enrolledAt: string | null;
  readonly timeZone: string;
  readonly enrollment: BreakGlassEnrollment | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly rateLimited: boolean;
  readonly retryAfterMinutes: number;
  readonly onStartReenroll?: ((password: string) => void) | undefined;
  readonly onConfirmReenroll?: ((code: string) => void) | undefined;
}): JSX.Element {
  const [password, setPassword] = useState("");
  const [reenrolling, setReenrolling] = useState(false);

  return (
    <Block
      title="Authenticator"
      description="Required at every sign-in. Re-enroll if you change phones."
    >
      {props.enrollment !== null ? (
        <EnrollmentPanel
          enrollment={props.enrollment}
          pending={props.pending}
          error={props.error ?? null}
          onConfirm={(code) => props.onConfirmReenroll?.(code)}
        />
      ) : reenrolling ? (
        <div className="flex flex-col gap-3">
          {props.rateLimited ? (
            <RateLimitNotice retryAfterMinutes={props.retryAfterMinutes} />
          ) : null}
          <div className="flex items-end gap-2">
            <Field className="w-64">
              <FieldLabel htmlFor="reenroll-password">
                Confirm your password
              </FieldLabel>
              <Input
                size="lg"
                id="reenroll-password"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={props.rateLimited}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => props.onStartReenroll?.(password)}
              disabled={password === "" || props.pending || props.rateLimited}
            >
              Start re-enroll
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <span className="text-sm">
            <span className="font-semibold">Authenticator app enrolled</span>
            <span className="block text-muted-foreground">
              {props.enrolledAt === null
                ? "Enrollment date unknown"
                : `Since ${formatInstant(props.enrolledAt, props.timeZone)}`}
              . Re-enrolling replaces the current app.
            </span>
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReenrolling(true)}
            className="shrink-0"
          >
            Re-enroll
          </Button>
        </div>
      )}
    </Block>
  );
}

export function BreakGlassAccount(props: BreakGlassAccountProps): JSX.Element {
  return (
    <main
      data-testid="break-glass-account"
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8"
    >
      <h1 className="text-2xl font-bold text-foreground">Account</h1>

      <Block
        title="Profile"
        description="Local administrator account. Password and authenticator are managed on this page."
      >
        <p className="text-base font-semibold text-foreground">{props.name}</p>
        <p className="text-sm text-muted-foreground">{props.email}</p>
        <p className="text-sm text-muted-foreground">
          Identity source: Genie (local password and authenticator)
        </p>
      </Block>

      <Block
        title="Change password"
        description="The shared rule applies. Your current password is required."
      >
        {props.error !== null && props.enrollment == null ? (
          <p role="alert" className="text-sm text-destructive">
            {props.error}
          </p>
        ) : null}
        <BreakGlassPasswordForm
          email={props.email}
          pending={props.pending === true}
          rateLimited={props.rateLimited === true}
          retryAfterMinutes={props.retryAfterMinutes ?? 15}
          onChangePassword={(current, next) =>
            props.onChangePassword?.(current, next)
          }
        />
      </Block>

      <AuthenticatorBlock
        enrolledAt={props.authenticatorEnrolledAt}
        timeZone={props.timeZone}
        enrollment={props.enrollment ?? null}
        pending={props.pending === true}
        error={props.error ?? null}
        rateLimited={props.rateLimited === true}
        retryAfterMinutes={props.retryAfterMinutes ?? 15}
        onStartReenroll={props.onStartReenroll}
        onConfirmReenroll={props.onConfirmReenroll}
      />

      <SessionsBlock
        sessions={props.sessions}
        timeZone={props.timeZone}
        onRevokeSession={props.onRevokeSession}
        onRevokeOtherSessions={props.onRevokeOtherSessions}
      />
    </main>
  );
}
