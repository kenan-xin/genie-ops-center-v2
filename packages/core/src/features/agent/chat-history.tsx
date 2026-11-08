"use client";

import {
  focusRing,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@genie/ui";
import { SearchIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AgentSessionSummary } from "../../services/agent/index.ts";
import { sessionGroups } from "./session-groups.ts";

function sessionClass(current: boolean): string {
  return `flex h-11 min-w-0 items-center rounded-lg px-3 text-sm lg:h-9 ${
    current
      ? "bg-background font-semibold text-foreground ring-1 ring-border ring-inset"
      : "text-muted-foreground hover:bg-tile hover:text-foreground"
  } ${focusRing}`;
}

/**
 * Ask's chat history (R-42a, AG22): a search over the listed titles and the chats grouped into
 * Today and Earlier in the tenant's zone. A long title ends with an ellipsis and keeps its full
 * text on hover (czjw.107). Ask's column and its phone sheet both hold it; the frame gives the
 * heading and New chat, and Ask's empty chat says where documents go in (czjw.120 item 20).
 */
export function ChatHistory(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  readonly sessionHref: (id: string) => string;
  readonly timeZone: string;
}): ReactNode {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLocaleLowerCase();

  const matches = props.sessions.filter((session) =>
    session.title.toLocaleLowerCase().includes(needle)
  );

  const groups = sessionGroups(matches, props.timeZone, new Date());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-3 mb-1">
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

      {/* Block and flex parents only: a grid track sized to the widest title kept the rail
          scrolling sideways (czjw.107). */}
      <nav
        aria-label="Chats"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3"
      >
        {props.sessions.length === 0 ? (
          <p className="px-3 pt-4 text-sm text-muted-foreground">
            No chats yet.
          </p>
        ) : groups.length === 0 ? (
          <p className="px-3 pt-4 text-sm text-muted-foreground">
            No chats match.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="px-3 pt-4 pb-1.5 text-xs font-semibold text-muted-foreground">
                {group.label}
              </h3>
              <ul className="flex flex-col gap-0.5">
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
                        <span className="min-w-0 truncate">
                          {session.title}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>
    </div>
  );
}
