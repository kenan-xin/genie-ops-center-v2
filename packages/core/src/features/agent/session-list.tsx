"use client";

import { focusRing } from "@genie/ui";
import type { ReactNode } from "react";

import type { AgentSessionSummary } from "../../services/agent/index.ts";
import { fmtDate } from "../audit/helpers.ts";

function sessionClass(current: boolean): string {
  return `grid gap-0.5 rounded-md px-2.5 py-2 ${
    current ? "bg-muted" : "hover:bg-muted"
  } ${focusRing}`;
}

/**
 * The person's chats as Ask and the bubble list them (design review 5.6): each title on up to two
 * lines, with the day of its last message in the tenant's zone.
 */
export function SessionList(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId?: string | undefined;
  readonly sessionHref: (id: string) => string;
  readonly timeZone: string;
}): ReactNode {
  if (props.sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No chats yet.</p>;
  }

  return (
    <nav aria-label="Chats">
      <ul className="grid gap-0.5">
        {props.sessions.map((session) => {
          const current = session.id === props.currentId;

          return (
            <li key={session.id}>
              <a
                href={props.sessionHref(session.id)}
                aria-current={current ? "page" : undefined}
                className={sessionClass(current)}
              >
                <span className="line-clamp-2 text-sm font-semibold text-foreground">
                  {session.title}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDate(session.updatedAt, props.timeZone)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
