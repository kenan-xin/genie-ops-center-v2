"use client";

import {
  buttonVariants,
  focusRing,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@genie/ui";
import { SearchIcon, SquarePenIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type {
  AgentSessionSummary,
  InboxLink,
} from "../../services/agent/index.ts";
import { InboxLines } from "./chat-parts.tsx";
import { sessionGroups } from "./session-groups.ts";

function sessionClass(current: boolean): string {
  return `block min-h-11 truncate rounded-md px-2.5 py-2.5 text-sm lg:min-h-9 lg:py-2 ${
    current ? "bg-muted font-semibold text-foreground" : "hover:bg-muted"
  } ${focusRing}`;
}

/**
 * Ask's chat history (R-42a, AG22): New chat, a search over the listed titles, the chats grouped
 * into Today and Earlier in the tenant's zone, and where documents go in. Ask's column and its
 * phone sheet both hold it; the frame gives the heading.
 */
export function ChatHistory(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  readonly sessionHref: (id: string) => string;
  readonly newChatHref: string;
  readonly inbox: readonly InboxLink[];
  readonly timeZone: string;
}): ReactNode {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLocaleLowerCase();

  const matches = props.sessions.filter((session) =>
    session.title.toLocaleLowerCase().includes(needle)
  );

  const groups = sessionGroups(matches, props.timeZone, new Date());

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid gap-2 px-3">
        <a
          href={props.newChatHref}
          className={buttonVariants({
            variant: "ghost",
            className: "justify-start",
          })}
        >
          <SquarePenIcon aria-hidden="true" strokeWidth={1.75} />
          New chat
        </a>
        <InputGroup>
          <InputGroupInput
            type="search"
            value={query}
            aria-label="Search chats"
            placeholder="Search chats"
            onChange={(event) => setQuery(event.target.value)}
          />
          <InputGroupAddon>
            <InputGroupText>
              <SearchIcon aria-hidden="true" />
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </div>

      <nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto px-3">
        {props.sessions.length === 0 ? (
          <p className="px-2.5 text-sm text-muted-foreground">No chats yet.</p>
        ) : groups.length === 0 ? (
          <p className="px-2.5 text-sm text-muted-foreground">
            No chats match.
          </p>
        ) : (
          groups.map((group) => (
            <section
              key={group.label}
              aria-label={group.label}
              className="grid gap-0.5 pb-3"
            >
              <h3 className="px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {group.label}
              </h3>
              <ul className="grid gap-0.5">
                {group.sessions.map((session) => {
                  const current = session.id === props.currentId;

                  return (
                    <li key={session.id}>
                      <a
                        href={props.sessionHref(session.id)}
                        title={session.title}
                        aria-current={current ? "page" : undefined}
                        className={sessionClass(current)}
                      >
                        {session.title}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>

      {props.inbox.length === 0 ? null : (
        <div className="grid gap-1 border-t border-border px-5 py-3">
          <InboxLines inbox={props.inbox} />
        </div>
      )}
    </div>
  );
}
