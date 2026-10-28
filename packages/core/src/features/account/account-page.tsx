import {
  Button,
  ConfirmDialog,
  DataTable,
  focusRing,
  HelpDisclosure,
  MonoChip,
} from "@genie/ui";
import { useState } from "react";
import type { JSX } from "react";

import { relativeTime } from "../audit/helpers.ts";
import {
  AccountCard,
  AccountCardRow,
  AccountLayout,
} from "./account-layout.tsx";
import type {
  AccountGroup,
  AccountPageProps,
  AccountSession,
} from "./types.ts";

/**
 * The Account page's three Section 2 blocks (R-18): Profile, Sessions with per-session sign-out
 * and sign out everywhere, and the read-only Roles and access. One column of bordered cards with
 * a title and a one-line description each, max reading width, no tabs. Sessions is the shared
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

function sourceLabel(source: AccountGroup["source"]): string {
  return source === "idp" ? "Directory" : "Local";
}

function ProfileBlock(props: {
  readonly profile: AccountPageProps["profile"];
  readonly groups: readonly AccountGroup[];
  readonly accountManagementUrl: string | null;
}) {
  return (
    <AccountCard
      title="Profile"
      description="Synced from your company directory at each sign-in."
    >
      <AccountCardRow className="flex-row items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-base font-bold text-foreground"
        >
          {initialsOf(props.profile.name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="text-base font-semibold text-foreground">
            {props.profile.name}
          </p>
          <p className="text-sm wrap-anywhere text-muted-foreground">
            {props.profile.email}
          </p>
        </div>
      </AccountCardRow>
      <AccountCardRow>
        <p className="text-xs font-medium text-muted-foreground">Groups</p>
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
      </AccountCardRow>
      {/* Background, so it sits behind help (tokens.md, "What helper text stays visible"). */}
      <AccountCardRow className="md:flex-row md:items-center md:justify-between md:gap-4">
        <HelpDisclosure label="Where your profile comes from">
          <p>
            Name, email, and groups come from the company directory; changes are
            made in the company directory, not in Genie.
          </p>
        </HelpDisclosure>
        {props.accountManagementUrl === null ? null : (
          <a
            className={`w-fit shrink-0 text-sm font-medium text-primary dark:text-brand-on-dark hover:underline ${focusRing}`}
            href={props.accountManagementUrl}
            target="_blank"
            rel="noreferrer"
          >
            Change password
          </a>
        )}
      </AccountCardRow>
    </AccountCard>
  );
}

function SessionsBlock(props: {
  readonly sessions: readonly AccountSession[];
  readonly timeZone: string;
  readonly nowIso: string;
  readonly revoking?: boolean | undefined;
  readonly onAskRevoke: (session: AccountSession) => void;
  readonly onAskRevokeOthers: () => void;
}) {
  const others = props.sessions.filter((session) => !session.isCurrent);
  const instant = (value: string) => formatInstant(value, props.timeZone);

  // Last active reads against the injected clock, as the capture shows ("Now", "1 h ago").
  const ago = (value: string) =>
    relativeTime(value, new Date(props.nowIso), props.timeZone);

  return (
    <AccountCard
      title="Sessions"
      description="Where you are signed in right now."
      action={
        others.length === 0 ? undefined : (
          <Button
            variant="secondary"
            loading={props.revoking}
            onClick={props.onAskRevokeOthers}
          >
            Sign out all other sessions
          </Button>
        )
      }
    >
      {/* One child, so the card's divider does not draw a second line under the table. */}
      <div>
        <DataTable
          framed={false}
          label="Sessions"
          rows={props.sessions}
          rowKey={(session) => session.id}
          rowLabel={(session) => session.device}
          columns={[
            {
              id: "device",
              header: "Device",
              cell: (session) => (
                // The design puts the chip beside the device, so no Status column takes width, and
                // each fact keeps one line (fix list "Account page layout").
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="flex flex-col">
                    <span>{session.device}</span>
                    <span className="font-normal text-muted-foreground">
                      {session.browser}
                    </span>
                  </span>
                  {session.isCurrent ? <MonoChip>THIS DEVICE</MonoChip> : null}
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
              cell: (session) => (
                <span className="whitespace-nowrap">
                  {instant(session.signedInAt)}
                </span>
              ),
            },
            {
              id: "lastActiveAt",
              header: "Last active",
              cell: (session) => (
                <span className="whitespace-nowrap">
                  {ago(session.lastActiveAt)}
                </span>
              ),
            },
          ]}
          card={{
            title: (session) => session.device,
            badge: (session) =>
              session.isCurrent ? <MonoChip>THIS DEVICE</MonoChip> : null,
            // The mobile capture: browser and IP, then when it signed in and was last active.
            detail: (session) => `${session.browser} · ${session.ipAddress}`,
            facts: (session) => [
              `Signed in ${instant(session.signedInAt)} · active ${ago(session.lastActiveAt)}`,
            ],
          }}
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
      </div>
    </AccountCard>
  );
}

function RolesBlock(props: {
  readonly roleGrants: AccountPageProps["roleGrants"];
}) {
  return (
    <AccountCard
      title="Roles and access"
      description="What you hold, where it applies, and how it arrived."
    >
      {props.roleGrants.length === 0 ? (
        <AccountCardRow>
          <p className="text-sm text-muted-foreground">
            You hold no roles yet.
          </p>
        </AccountCardRow>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {props.roleGrants.map((grant) => (
            <li
              key={`${grant.roleName}\u0000${grant.scopeLabel}\u0000${grant.via ?? ""}`}
              className="flex flex-col gap-1 px-4 py-3 md:px-5"
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
      <AccountCardRow>
        <HelpDisclosure label="How your roles change">
          <p>
            Roles are assigned by administrators; contact an administrator for
            changes.
          </p>
        </HelpDisclosure>
      </AccountCardRow>
    </AccountCard>
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
      ? "That device is signed out at once and has to sign in again."
      : "Every device except this one is signed out at once and has to sign in again.";

  return (
    <AccountLayout
      testId="account-page"
      description="Your profile, sessions, and access."
    >
      <ProfileBlock
        profile={props.profile}
        groups={props.groups}
        accountManagementUrl={props.accountManagementUrl}
      />

      <SessionsBlock
        sessions={props.sessions}
        timeZone={props.timeZone}
        nowIso={props.nowIso}
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
    </AccountLayout>
  );
}
