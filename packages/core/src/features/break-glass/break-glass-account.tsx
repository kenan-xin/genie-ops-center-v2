import { useState } from "react";
import type { JSX, ReactNode } from "react";

import type { AccountSession } from "../account/types.ts";
import { BreakGlassPasswordForm } from "./break-glass-sign-in.tsx";
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

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
        <h2 className="font-heading text-lg font-bold text-foreground">
          {props.title}
        </h2>
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
        <button
          type="button"
          onClick={() => props.onRevokeOtherSessions?.()}
          className={`h-10 w-fit rounded-lg border border-input px-3 text-sm font-semibold text-foreground hover:bg-muted ${focusRing}`}
        >
          Sign out all other sessions
        </button>
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
                <button
                  type="button"
                  onClick={() => props.onRevokeSession?.(session.id)}
                  className={`h-8 rounded-lg border border-input px-2.5 text-sm font-semibold hover:bg-muted ${focusRing}`}
                >
                  Sign out
                </button>
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reenroll-code" className="text-sm font-semibold">
            Code from the app
          </label>
          <input
            id="reenroll-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className={`h-11 w-40 rounded-lg border border-input bg-background px-3 font-mono text-lg tracking-widest ${focusRing}`}
          />
        </div>
        <button
          type="button"
          onClick={() => props.onConfirm(code)}
          disabled={code.length !== 6 || props.pending}
          className={`h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
        >
          Confirm
        </button>
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
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reenroll-password"
              className="text-sm font-semibold"
            >
              Confirm your password
            </label>
            <input
              id="reenroll-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`h-11 w-64 rounded-lg border border-input bg-background px-3 ${focusRing}`}
            />
          </div>
          <button
            type="button"
            onClick={() => props.onStartReenroll?.(password)}
            disabled={password === "" || props.pending}
            className={`h-11 rounded-lg border border-input px-4 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            Start re-enroll
          </button>
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
          <button
            type="button"
            onClick={() => setReenrolling(true)}
            className={`h-10 shrink-0 rounded-lg border border-input px-3 text-sm font-semibold hover:bg-muted ${focusRing}`}
          >
            Re-enroll
          </button>
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
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Account
      </h1>

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
