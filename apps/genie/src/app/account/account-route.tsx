"use client";

import { AccountPage } from "@genie/core/features/account";
import type { AccountSession } from "@genie/core/features/account";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

/** The two sign-out requests this route sends, named rather than an open `unknown` body. */
type SessionRequest =
  | { readonly sessionId: string }
  | { readonly allOthers: true };

async function postSession(
  url: string,
  body: SessionRequest
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * The browser half of the account page (R-18). The server has already read the three blocks and
 * refused an unauthenticated visitor before this mounts; the client owns only the two sign-outs
 * and the refresh their success earns.
 */
export function AccountRoute(props: {
  readonly profile: { readonly name: string; readonly email: string };
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
    readonly source: "idp" | "local";
  }[];
  readonly sessions: readonly AccountSession[];
  readonly roleGrants: readonly {
    readonly roleName: string;
    readonly moduleName: string | null;
    readonly permissionCount: number;
    readonly scopeLabel: string;
    readonly via: string | null;
  }[];
  readonly accountManagementUrl: string | null;
  readonly timeZone: string;
  readonly nowIso: string;
}) {
  const router = useRouter();

  const [sessions, setSessions] = useState(props.sessions);

  const [notice, setNotice] = useState<string | null>(null);

  async function revokeOne(sessionId: string): Promise<void> {
    const response = await postSession("/api/session/revoke", { sessionId });

    if (response.ok) {
      setSessions((current) =>
        current.filter((session) => session.id !== sessionId)
      );
      setNotice("That session was signed out.");
      router.refresh();

      return;
    }

    setNotice(
      response.status === 401
        ? "Your own session expired. Sign in again."
        : "That session could not be signed out. Try again."
    );

    if (response.status === 401) {
      window.location.assign("/sign-in?error=session_expired");
    }
  }

  async function revokeOthers(): Promise<void> {
    const response = await postSession("/api/session/revoke-others", {
      allOthers: true,
    });

    if (response.ok) {
      setSessions((current) => current.filter((session) => session.isCurrent));
      setNotice("Every other session was signed out.");
      router.refresh();

      return;
    }

    setNotice(
      response.status === 401
        ? "Your own session expired. Sign in again."
        : "The other sessions could not be signed out. Try again."
    );

    if (response.status === 401) {
      window.location.assign("/sign-in?error=session_expired");
    }
  }

  return (
    <>
      {notice === null ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <AccountPage
        profile={props.profile}
        groups={props.groups}
        sessions={sessions}
        roleGrants={props.roleGrants}
        accountManagementUrl={props.accountManagementUrl}
        timeZone={props.timeZone}
        nowIso={props.nowIso}
        onRevokeSession={(sessionId) => {
          void revokeOne(sessionId);
        }}
        onRevokeOtherSessions={() => {
          void revokeOthers();
        }}
      />
    </>
  );
}
