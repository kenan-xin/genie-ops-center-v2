import { useEffect, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";

import { btnSecondary, focusRing } from "../audit/helpers.ts";
import type {
  AccountGroup,
  AccountPageProps,
  AccountSession,
} from "./types.ts";

/**
 * The Account page's three Section 2 blocks (R-18): Profile, Sessions with per-session sign-out
 * and sign out everywhere, and the read-only Roles and access. One column of stacked blocks with
 * a block title and a one-line description each, max reading width, no tabs. The phone layout is
 * the base and the desktop table joins at `md`; both are in the tree, hidden by the breakpoint.
 *
 * Every write on this page is a sign-out, and both sign-outs open the shared confirm dialog
 * before the callback fires. The Roles and access block edits nothing: its note says who to ask.
 */

const btnDanger = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-destructive px-3 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "");

  return initials.join("") || "?";
}

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
}) {
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

function sourceLabel(source: AccountGroup["source"]): string {
  return source === "idp" ? "Directory" : "Local";
}

function ProfileBlock(props: {
  readonly profile: AccountPageProps["profile"];
  readonly groups: readonly AccountGroup[];
  readonly accountManagementUrl: string | null;
}) {
  return (
    <Block
      title="Profile"
      description="Your identity as synced from the company directory."
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary"
        >
          {initialsOf(props.profile.name)}
        </span>
        <div className="flex flex-col gap-2">
          <p className="text-base font-semibold text-foreground">
            {props.profile.name}
          </p>
          <p className="text-sm text-muted-foreground">{props.profile.email}</p>
          {props.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Groups">
              {props.groups.map((group) => (
                <li
                  key={group.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-input bg-white px-2.5 py-1 text-xs text-foreground dark:bg-card"
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-muted-foreground">
                    {sourceLabel(group.source)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Name, email, and groups come from the company directory; changes are
            made in the company directory, not in Genie.
          </p>
          {props.accountManagementUrl === null ? null : (
            <a
              className={`w-fit text-sm font-medium text-primary hover:underline ${focusRing}`}
              href={props.accountManagementUrl}
              target="_blank"
              rel="noreferrer"
            >
              Change password
            </a>
          )}
        </div>
      </div>
    </Block>
  );
}

/** The shared confirm dialog both sign-outs open: Cancel focused, danger confirm (R-18). */
function ConfirmSignOutDialog(props: {
  readonly title: string;
  readonly consequence: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-lg dark:bg-card">
        <h3
          id="account-confirm-title"
          className="text-base font-semibold text-foreground"
        >
          {props.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {props.consequence}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            className={btnSecondary}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button type="button" className={btnDanger} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const tableHeading =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const tableCell = "px-3 py-3 text-sm text-foreground align-middle";

function currentChip(): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
      THIS DEVICE
    </span>
  );
}

function SessionRows(props: {
  readonly sessions: readonly AccountSession[];
  readonly timeZone: string;
  readonly onAskRevoke: (session: AccountSession) => void;
}) {
  return (
    <>
      {props.sessions.map((session) => (
        <tr key={session.id} data-session-id={session.id}>
          <td className={tableCell}>
            <span className="flex flex-col">
              <span className="font-medium">{session.device}</span>
              <span className="text-muted-foreground">{session.browser}</span>
            </span>
          </td>
          <td className={tableCell}>{session.ipAddress}</td>
          <td className={tableCell}>
            {formatInstant(session.signedInAt, props.timeZone)}
          </td>
          <td className={tableCell}>
            {formatInstant(session.lastActiveAt, props.timeZone)}
          </td>
          <td className={`${tableCell} text-right`}>
            {session.isCurrent ? (
              currentChip()
            ) : (
              <button
                type="button"
                className={`${btnSecondary} h-8`}
                onClick={() => props.onAskRevoke(session)}
              >
                Sign out
              </button>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function SessionsBlock(props: {
  readonly sessions: readonly AccountSession[];
  readonly timeZone: string;
  readonly onAskRevoke: (session: AccountSession) => void;
  readonly onAskRevokeOthers: () => void;
}) {
  const others = props.sessions.filter((session) => !session.isCurrent);

  return (
    <Block
      title="Sessions"
      description="Where you are signed in, and how to end a session you do not recognize."
    >
      {others.length === 0 ? null : (
        <button
          type="button"
          className={`${btnSecondary} w-fit`}
          onClick={props.onAskRevokeOthers}
        >
          Sign out all other sessions
        </button>
      )}

      {/* The phone card list; the desktop table joins at the md breakpoint. */}
      <ul className="flex flex-col gap-3 md:hidden" aria-label="Sessions">
        {props.sessions.map((session) => (
          <li
            key={session.id}
            data-session-id={session.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 dark:bg-card"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-medium text-foreground">
                {session.device}
              </span>
              {session.isCurrent ? (
                currentChip()
              ) : (
                <button
                  type="button"
                  className={`${btnSecondary} h-8`}
                  onClick={() => props.onAskRevoke(session)}
                >
                  Sign out
                </button>
              )}
            </span>
            <span className="text-sm text-muted-foreground">
              {session.browser} · {session.ipAddress}
            </span>
            <span className="text-sm text-muted-foreground">
              Signed in {formatInstant(session.signedInAt, props.timeZone)}
            </span>
            <span className="text-sm text-muted-foreground">
              Last active {formatInstant(session.lastActiveAt, props.timeZone)}
            </span>
          </li>
        ))}
      </ul>

      <table className="hidden w-full border-collapse overflow-hidden rounded-xl border border-border bg-white text-left md:table dark:bg-card">
        <thead>
          <tr className="border-b border-border">
            <th className={tableHeading}>Device</th>
            <th className={tableHeading}>IP address</th>
            <th className={tableHeading}>Signed in</th>
            <th className={tableHeading}>Last active</th>
            <th className={tableHeading}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <SessionRows
            sessions={props.sessions}
            timeZone={props.timeZone}
            onAskRevoke={props.onAskRevoke}
          />
        </tbody>
      </table>
    </Block>
  );
}

function RolesBlock(props: {
  readonly roleGrants: AccountPageProps["roleGrants"];
}) {
  return (
    <Block
      title="Roles and access"
      description="What you hold, where it applies, and how it arrived."
    >
      {props.roleGrants.length === 0 ? (
        <p className="text-sm text-muted-foreground">You hold no roles yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-white dark:bg-card">
          {props.roleGrants.map((grant) => (
            <li
              key={`${grant.roleName}\u0000${grant.scopeLabel}\u0000${grant.via ?? ""}`}
              className="flex flex-col gap-1 px-4 py-3"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {grant.roleName}
                </span>
                <span className="text-sm text-muted-foreground">
                  {grant.permissionCount}{" "}
                  {grant.permissionCount === 1 ? "permission" : "permissions"}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {grant.scopeLabel}
                </span>
                <span className="text-muted-foreground">
                  {grant.via === null ? "Direct" : `Through ${grant.via}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        Roles are assigned by administrators; contact an administrator for
        changes.
      </p>
    </Block>
  );
}

export function AccountPage(props: AccountPageProps): JSX.Element {
  const [pending, setPending] = useState<
    | { readonly kind: "one"; readonly session: AccountSession }
    | { readonly kind: "others"; readonly count: number }
    | null
  >(null);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8"
      data-testid="account-page"
    >
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Account
      </h1>

      <ProfileBlock
        profile={props.profile}
        groups={props.groups}
        accountManagementUrl={props.accountManagementUrl}
      />

      <SessionsBlock
        sessions={props.sessions}
        timeZone={props.timeZone}
        onAskRevoke={(session) => setPending({ kind: "one", session })}
        onAskRevokeOthers={() =>
          setPending({
            kind: "others",
            count: props.sessions.filter((session) => !session.isCurrent)
              .length,
          })
        }
      />

      <RolesBlock roleGrants={props.roleGrants} />

      {pending === null ? null : (
        <ConfirmSignOutDialog
          title={
            pending.kind === "one"
              ? `Sign out ${pending.session.device}?`
              : `Sign out ${pending.count} other ${
                  pending.count === 1 ? "session" : "sessions"
                }?`
          }
          consequence={
            pending.kind === "one"
              ? "That device will have to sign in again to reach this service."
              : "Every other device will have to sign in again to reach this service."
          }
          confirmLabel="Sign out"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (pending.kind === "one")
              props.onRevokeSession?.(pending.session.id);
            else props.onRevokeOtherSessions?.();

            setPending(null);
          }}
        />
      )}
    </main>
  );
}
