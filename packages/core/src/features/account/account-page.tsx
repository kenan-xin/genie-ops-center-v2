import { Button, ConfirmDialog, DataTable, focusRing } from "@genie/ui";
import { useState } from "react";
import type { JSX, ReactNode } from "react";

import { PageHeader } from "../shell/page-header.tsx";
import type {
  AccountGroup,
  AccountPageProps,
  AccountSession,
} from "./types.ts";

/**
 * The Account page's three Section 2 blocks (R-18): Profile, Sessions with per-session sign-out
 * and sign out everywhere, and the read-only Roles and access. One column of stacked blocks with
 * a block title and a one-line description each, max reading width, no tabs. Sessions is the shared
 * DataTable: a card list on a phone, a table from `md`, and the per-session sign-out in each row's
 * overflow menu (R-23).
 *
 * Every write on this page is a sign-out, and both sign-outs open the shared confirm dialog
 * before the callback fires. The Roles and access block edits nothing: its note says who to ask.
 */

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
        <h2 className="text-lg font-bold text-foreground">{props.title}</h2>
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
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-base font-bold text-foreground"
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
              className={`w-fit text-sm font-medium text-primary dark:text-brand-on-dark hover:underline ${focusRing}`}
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

function currentChip(): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
      THIS DEVICE
    </span>
  );
}

function SessionsBlock(props: {
  readonly sessions: readonly AccountSession[];
  readonly timeZone: string;
  readonly revoking?: boolean | undefined;
  readonly onAskRevoke: (session: AccountSession) => void;
  readonly onAskRevokeOthers: () => void;
}) {
  const others = props.sessions.filter((session) => !session.isCurrent);
  const instant = (value: string) => formatInstant(value, props.timeZone);

  return (
    <Block
      title="Sessions"
      description="Where you are signed in, and how to end a session you do not recognize."
    >
      {others.length === 0 ? null : (
        <div>
          <Button
            variant="secondary"
            loading={props.revoking}
            onClick={props.onAskRevokeOthers}
          >
            Sign out all other sessions
          </Button>
        </div>
      )}

      <DataTable
        label="Sessions"
        rows={props.sessions}
        rowKey={(session) => session.id}
        rowLabel={(session) => session.device}
        columns={[
          {
            id: "device",
            header: "Device",
            cell: (session) => (
              <span className="flex flex-col">
                <span>{session.device}</span>
                <span className="font-normal text-muted-foreground">
                  {session.browser}
                </span>
              </span>
            ),
          },
          {
            id: "ipAddress",
            header: "IP address",
            cell: (session) => session.ipAddress,
          },
          {
            id: "signedInAt",
            header: "Signed in",
            cell: (session) => instant(session.signedInAt),
          },
          {
            id: "lastActiveAt",
            header: "Last active",
            cell: (session) => instant(session.lastActiveAt),
          },
        ]}
        status={(session) => (session.isCurrent ? currentChip() : null)}
        // One fact keeps the card at the height of the earlier hand-built card: the identity
        // already shows the browser, and the table keeps the sign-in time.
        facts={(session) => [
          `${session.ipAddress} · last active ${instant(session.lastActiveAt)}`,
        ]}
        actions={(session) => {
          if (session.isCurrent) return [];

          const signOut = {
            label: "Sign out",
            onSelect: () => props.onAskRevoke(session),
            danger: true,
          };

          // DR-17: a menu item has no loading state, so it refuses a second sign-out.
          return props.revoking === true
            ? [{ ...signOut, refusal: "A sign-out is running." }]
            : [signOut];
        }}
      />
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
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
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

  // Kept after close, so that the title does not blank while the dialog fades out.
  const [last, setLast] = useState(pending);

  if (pending !== null && pending !== last) setLast(pending);

  const title =
    last === null
      ? ""
      : last.kind === "one"
        ? `Sign out ${last.session.device}?`
        : `Sign out ${last.count} other ${
            last.count === 1 ? "session" : "sessions"
          }?`;

  const description =
    last?.kind === "one"
      ? "That device will have to sign in again to reach this service."
      : "Every other device will have to sign in again to reach this service.";

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8"
      data-testid="account-page"
    >
      <PageHeader title="Account" />

      <ProfileBlock
        profile={props.profile}
        groups={props.groups}
        accountManagementUrl={props.accountManagementUrl}
      />

      <SessionsBlock
        sessions={props.sessions}
        timeZone={props.timeZone}
        revoking={props.revoking}
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

      <ConfirmDialog
        open={pending !== null}
        title={title}
        description={description}
        confirmLabel="Sign out"
        danger
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind === "one")
            props.onRevokeSession?.(pending.session.id);
          else if (pending?.kind === "others") props.onRevokeOtherSessions?.();

          setPending(null);
        }}
      />
    </main>
  );
}
