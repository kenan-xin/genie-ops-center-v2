"use client";

import {
  focusRing,
  iconLead,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  rowHeight,
  Spinner,
} from "@genie/ui";
import {
  BotIcon,
  ChevronDownIcon,
  MessageCircleIcon,
  SearchIcon,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { ASK_SURFACE } from "../../lib/module-contract/agent-tools.ts";
import type {
  AgentHistoryEntry,
  AgentSessionSummary,
} from "../../services/agent/index.ts";
import type { SurfaceView } from "../../services/agent/surface-address.ts";
import { MODULE_ICONS } from "../shell/navigation-rail.tsx";
import {
  agentHistoryGroups,
  isWorking,
  type SessionGroup,
} from "./session-groups.ts";

function sessionClass(current: boolean): string {
  return `flex min-w-0 items-center gap-2 rounded-lg px-3 text-sm ${rowHeight} ${
    current
      ? "bg-background font-semibold text-foreground ring-1 ring-border ring-inset"
      : "text-muted-foreground hover:bg-hover hover:text-foreground"
  } ${focusRing}`;
}

/** The search over the listed titles, and the chats that match it. */
function SearchedChats<T extends AgentSessionSummary>(props: {
  readonly sessions: readonly T[];
  readonly children: (matches: readonly T[]) => ReactNode;
}): ReactNode {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLocaleLowerCase();

  const matches = props.sessions.filter((session) =>
    session.title.toLocaleLowerCase().includes(needle)
  );

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
        ) : matches.length === 0 ? (
          <p className="px-3 pt-4 text-sm text-muted-foreground">
            No chats match.
          </p>
        ) : (
          props.children(matches)
        )}
      </nav>
    </div>
  );
}

/**
 * A surface panel's chat list (R-42): a search over the listed titles and the chats in the panel's
 * groups. A long title ends with an ellipsis and keeps its full text on hover (czjw.107).
 */
export function ChatHistory(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  readonly groups: (
    sessions: readonly AgentSessionSummary[]
  ) => readonly SessionGroup[];
  readonly onPick: (session: AgentSessionSummary) => void;
}): ReactNode {
  return (
    <SearchedChats sessions={props.sessions}>
      {(matches) =>
        props.groups(matches).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="px-3 pt-4 pb-1.5 text-xs font-semibold text-muted-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {group.sessions.map((session) => {
                const current = session.id === props.currentId;

                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      title={session.title}
                      aria-current={current ? "true" : undefined}
                      className={`w-full ${sessionClass(current)}`}
                      onClick={() => props.onPick(session)}
                    >
                      <span className="min-w-0 truncate">{session.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      }
    </SearchedChats>
  );
}

function toggle(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);

  if (!next.delete(key)) next.add(key);

  return next;
}

/** How many chats an open group shows before Show more (DEC-57 item 11). */
const SHOWN = 3;

/** Ask's icon is the menu's; a surface's is the one it declares, else a generic agent icon. */
function AgentIcon(props: {
  readonly surface: string;
  readonly surfaces: readonly SurfaceView[];
}): ReactNode {
  const icon = props.surfaces.find(({ id }) => id === props.surface)?.icon;

  const Icon =
    props.surface === ASK_SURFACE
      ? MessageCircleIcon
      : icon === undefined
        ? BotIcon
        : MODULE_ICONS[icon];

  return (
    <Icon
      aria-hidden="true"
      className={`${iconLead} size-4 shrink-0`}
      strokeWidth={1.75}
    />
  );
}

/**
 * Ask's chat history, which is the run list (DEC-57 items 9 and 11): a search, the chats grouped by
 * agent, each group folding and showing its newest 3 before Show more, and Recents at the bottom
 * with each chat's agent icon. A working chat shows a spinner, a folded group keeps one, and a chat
 * whose run ended unseen shows a dot and a bold title. An Ask chat opens in Ask; a surface chat
 * links to its record page on that chat. It is read-only: no rename or delete here.
 */
export function AgentHistory(props: {
  readonly entries: readonly AgentHistoryEntry[];
  readonly surfaces: readonly SurfaceView[];
  readonly currentId: string | undefined;
  readonly askHref: (id: string) => string;
}): ReactNode {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [more, setMore] = useState<ReadonlySet<string>>(new Set());
  // Ask draws the history in its column and its phone sheet at once, so ids are per instance.
  const ids = useId();

  const labelOf = (surface: string) => {
    const view = props.surfaces.find(({ id }) => id === surface);

    return surface === ASK_SURFACE
      ? "Ask"
      : (view?.label ?? view?.name ?? surface);
  };

  const row = (entry: AgentHistoryEntry, withIcon: boolean) => {
    const current = entry.id === props.currentId;
    const working = isWorking(entry.run);

    const content = (
      <>
        {withIcon ? (
          <span
            role="img"
            aria-label={labelOf(entry.surface)}
            title={labelOf(entry.surface)}
            className="inline-flex shrink-0"
          >
            <AgentIcon surface={entry.surface} surfaces={props.surfaces} />
          </span>
        ) : null}
        <span
          className={`min-w-0 flex-1 truncate ${entry.unseen && !working ? "font-semibold text-foreground" : ""}`}
        >
          {entry.title}
        </span>
        {working ? (
          <Spinner
            role="img"
            aria-label="Working"
            label="Working"
            className="shrink-0"
          />
        ) : entry.unseen ? (
          <span
            role="img"
            aria-label="Finished, not opened yet"
            className="size-2 shrink-0 rounded-full bg-primary"
          />
        ) : null}
      </>
    );

    // A surface chat opens only on its record's page; one with no address (no record) has none, so
    // it is listed without a link, never sent to Ask.
    const href =
      entry.surface === ASK_SURFACE ? props.askHref(entry.id) : entry.address;

    return (
      <li key={entry.id}>
        {href === null ? (
          <span title={entry.title} className={sessionClass(false)}>
            {content}
          </span>
        ) : (
          <a
            href={href}
            title={entry.title}
            aria-current={current ? "page" : undefined}
            className={sessionClass(current)}
          >
            {content}
          </a>
        )}
      </li>
    );
  };

  return (
    <SearchedChats sessions={props.entries}>
      {(matches) => {
        const { groups, recents } = agentHistoryGroups(matches, props.surfaces);

        return (
          <>
            {groups.map((group) => {
              const open = !folded.has(group.key);
              const all = more.has(group.key);
              const id = `${ids}-${group.key}`;

              return (
                <section key={group.key}>
                  <h3>
                    <button
                      type="button"
                      data-slot="agent-group-header"
                      aria-expanded={open}
                      aria-controls={open ? id : undefined}
                      className={`group flex w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-hover ${rowHeight} ${focusRing}`}
                      onClick={() => setFolded(toggle(folded, group.key))}
                    >
                      <AgentIcon
                        surface={group.key}
                        surfaces={props.surfaces}
                      />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {group.label}
                      </span>
                      {/* No count: open, the rows show it; folded, only "is anything working". */}
                      {!open && group.working ? (
                        <Spinner
                          role="img"
                          aria-label="A chat is working"
                          label="A chat is working"
                          className="shrink-0"
                        />
                      ) : null}
                      <ChevronDownIcon
                        aria-hidden="true"
                        strokeWidth={1.75}
                        className={`size-4 shrink-0 text-muted-foreground motion-safe:transition-transform ${open ? "" : "-rotate-90"}`}
                      />
                    </button>
                  </h3>
                  {open ? (
                    <div
                      id={id}
                      role="group"
                      aria-label={`${group.label} chats`}
                      className="ps-6"
                    >
                      <ul className="flex flex-col gap-0.5">
                        {(all
                          ? group.entries
                          : group.entries.slice(0, SHOWN)
                        ).map((entry) => row(entry, false))}
                      </ul>
                      {!all && group.entries.length > SHOWN ? (
                        <button
                          type="button"
                          className={`flex h-11 w-full items-center rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-hover hover:text-foreground lg:h-8 ${focusRing}`}
                          onClick={() => setMore(toggle(more, group.key))}
                        >
                          Show more
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })}
            <section
              aria-labelledby={`${ids}-recents`}
              className="mt-2.5 border-t border-border"
            >
              <h3
                id={`${ids}-recents`}
                className="px-3 pt-3.5 pb-1.5 text-xs font-semibold text-muted-foreground"
              >
                Recents
              </h3>
              <ul className="flex flex-col gap-0.5">
                {recents.map((entry) => row(entry, true))}
              </ul>
            </section>
          </>
        );
      }}
    </SearchedChats>
  );
}
