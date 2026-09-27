"use client";

import { useId, useState } from "react";
import type { JSX, ReactNode } from "react";

import { AuditEventSheet } from "./audit-event-sheet.tsx";
import {
  btnSecondary,
  countActiveFilters,
  filterLabel,
  focusRing,
  fmtDateTime,
  fmtExact,
  humanize,
  inputClass,
  initials,
  actionGroup,
  RANGE_LABEL,
  RANGE_ORDER,
  relativeTime,
} from "./helpers.ts";
import {
  ChevronDownIcon,
  CloseIcon,
  FiltersIcon,
  HelpIcon,
  SearchIcon,
  SystemIcon,
} from "./icons.tsx";
import {
  EMPTY_AUDIT_FILTERS,
  type AuditActor,
  type AuditEvent,
  type AuditFilters,
  type AuditLogProps,
  type DateRangePreset,
} from "./types.ts";

function Avatar(props: {
  readonly actor: AuditActor | null;
  readonly size?: "sm" | "md";
}): JSX.Element {
  const size = props.size ?? "md";
  const box = size === "sm" ? "size-8 text-xs" : "size-9 text-xs";

  if (props.actor === null) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full border border-dashed border-gray-400 text-gray-500 dark:border-gray-600 ${box}`}
      >
        <SystemIcon className="size-4" />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
        props.actor.anonymized
          ? "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
      } ${box}`}
    >
      {props.actor.anonymized ? "?" : initials(props.actor.name)}
    </span>
  );
}

/** The action key as a fixed neutral pill; a long key wraps inside a table column. */
function ActionPill(props: {
  readonly action: string;
  readonly wrap?: boolean;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300 ${
        props.wrap
          ? "max-w-full whitespace-normal [overflow-wrap:anywhere]"
          : "whitespace-nowrap"
      }`}
    >
      {props.action}
    </span>
  );
}

function Select(props: {
  readonly ariaLabel: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <span className="relative block w-full">
      <select
        aria-label={props.ariaLabel}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={`h-10 w-full appearance-none rounded-lg border border-gray-500 bg-white pl-3 pr-9 text-sm text-gray-800 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-200 ${focusRing}`}
      >
        {props.children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
    </span>
  );
}

/** The contextual help disclosure: collapsed, opens on click, and closes on Escape. */
function HelpNote(): JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = "Why a row can look incomplete";

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 ${focusRing}`}
      >
        <HelpIcon className="size-5" />
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          role="group"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white p-4 text-left text-xs leading-relaxed text-gray-700 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <p>
            An event is never edited and never deleted. It keeps the words that
            were true when it was written, so an old row can name something that
            has since changed.
          </p>
          <p className="mt-2">
            A target opens only while the record still exists and its module
            returns a path. A target that no longer exists shows without a link
            and reads Removed.
          </p>
          <p className="mt-2">
            A person an operator erased appears under an anonymized name. Their
            earlier events stay where they are.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`mt-3 rounded text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}
          >
            Close
          </button>
        </div>
      ) : null}
    </span>
  );
}

/** One removable chip per active filter, so nothing the panel holds is hidden state. */
function FilterChips(props: {
  readonly filters: AuditFilters;
  readonly filterOptions: AuditLogProps["filterOptions"];
  readonly onChange: (filters: AuditFilters) => void;
}): JSX.Element | null {
  const { filters } = props;
  const chips: { readonly label: string; readonly next: AuditFilters }[] = [];

  if (filters.query.trim() !== "") {
    chips.push({
      label: `“${filters.query.trim()}”`,
      next: { ...filters, query: "" },
    });
  }

  if (filters.actorId !== "all") {
    const name =
      filters.actorId === "system"
        ? "System"
        : (props.filterOptions.actors.find(
            (actor) => actor.id === filters.actorId
          )?.name ?? filters.actorId);

    chips.push({ label: name, next: { ...filters, actorId: "all" } });
  }

  if (filters.action !== "all") {
    chips.push({ label: filters.action, next: { ...filters, action: "all" } });
  }

  if (filters.targetType !== "all") {
    chips.push({
      label: humanize(filters.targetType),
      next: { ...filters, targetType: "all" },
    });
  }

  if (filters.range !== "30d") {
    const label =
      filters.range === "custom"
        ? `${filters.from ?? "…"} to ${filters.to ?? "…"}`
        : RANGE_LABEL[filters.range];

    chips.push({
      label,
      next: { ...filters, range: "30d", from: null, to: null },
    });
  }

  if (filters.operatorOnly) {
    chips.push({
      label: "Operator rows",
      next: { ...filters, operatorOnly: false },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => props.onChange(chip.next)}
          className={`inline-flex h-8 items-center gap-1 rounded-full bg-gray-100 pl-2.5 pr-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 ${focusRing}`}
        >
          {chip.label}
          <CloseIcon className="size-4" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => props.onChange(EMPTY_AUDIT_FILTERS)}
        className={`h-8 rounded-lg px-1.5 text-xs font-medium text-gray-600 underline-offset-2 hover:underline dark:text-gray-400 ${focusRing}`}
      >
        Clear all
      </button>
    </div>
  );
}

function FilterPanel(props: {
  readonly filters: AuditFilters;
  readonly filterOptions: AuditLogProps["filterOptions"];
  readonly onChange: (filters: AuditFilters) => void;
}): JSX.Element {
  const { filters } = props;
  const groups = new Map<string, string[]>();

  for (const action of props.filterOptions.actions) {
    const group = actionGroup(action);

    groups.set(group, [...(groups.get(group) ?? []), action]);
  }

  return (
    <div role="group" aria-label="Filters" className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className={filterLabel}>Actor</span>
        <Select
          ariaLabel="Actor"
          value={filters.actorId}
          onChange={(value) => props.onChange({ ...filters, actorId: value })}
        >
          <option value="all">All actors</option>
          <option value="system">System</option>
          {props.filterOptions.actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={filterLabel}>Action</span>
        <Select
          ariaLabel="Action"
          value={filters.action}
          onChange={(value) => props.onChange({ ...filters, action: value })}
        >
          <option value="all">All actions</option>
          {[...groups.entries()].map(([group, actions]) => (
            <optgroup key={group} label={humanize(group)}>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={filterLabel}>Target type</span>
        <Select
          ariaLabel="Target type"
          value={filters.targetType}
          onChange={(value) =>
            props.onChange({ ...filters, targetType: value })
          }
        >
          <option value="all">All targets</option>
          {props.filterOptions.targetTypes.map((type) => (
            <option key={type} value={type}>
              {humanize(type)}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={filterLabel}>Date range</span>
        <Select
          ariaLabel="Date range"
          value={filters.range}
          onChange={(value) =>
            props.onChange({
              ...filters,
              // SAFETY: this select's only options are the RANGE_LABEL keys, so the value is one.
              range: value as DateRangePreset,
              from: null,
              to: null,
            })
          }
        >
          {RANGE_ORDER.map((range) => (
            <option key={range} value={range}>
              {RANGE_LABEL[range]}
            </option>
          ))}
        </Select>
      </label>

      {filters.range === "custom" ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="From"
            value={filters.from ?? ""}
            max={filters.to ?? undefined}
            onChange={(event) =>
              props.onChange({ ...filters, from: event.target.value || null })
            }
            className={inputClass}
          />
          <span className="shrink-0 text-xs text-gray-500">to</span>
          <input
            type="date"
            aria-label="To"
            value={filters.to ?? ""}
            min={filters.from ?? undefined}
            onChange={(event) =>
              props.onChange({ ...filters, to: event.target.value || null })
            }
            className={inputClass}
          />
        </div>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
        <input
          type="checkbox"
          checked={filters.operatorOnly}
          onChange={(event) =>
            props.onChange({ ...filters, operatorOnly: event.target.checked })
          }
          className={`size-4 rounded border-gray-400 text-blue-600 ${focusRing}`}
        />
        Operator rows only
      </label>
    </div>
  );
}

function FilterButton(props: {
  readonly count: number;
  readonly filters: AuditFilters;
  readonly filterOptions: AuditLogProps["filterOptions"];
  readonly onChange: (filters: AuditFilters) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
        className={`${btnSecondary} ${
          props.count > 0
            ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400"
            : ""
        }`}
      >
        <FiltersIcon className="size-4" />
        Filters
        {props.count > 0 ? (
          <span className="rounded-full bg-blue-600 px-1.5 text-xs font-semibold tabular-nums text-white">
            {props.count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white p-4 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <FilterPanel
            filters={props.filters}
            filterOptions={props.filterOptions}
            onChange={props.onChange}
          />
          {props.count > 0 ? (
            <button
              type="button"
              onClick={() => props.onChange(EMPTY_AUDIT_FILTERS)}
              className={`mt-3 rounded text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`mt-3 ml-3 rounded text-xs font-semibold text-gray-600 hover:underline dark:text-gray-400 ${focusRing}`}
          >
            Close
          </button>
        </div>
      ) : null}
    </span>
  );
}

/** The target cell. The table names the record and marks a removed one; the sheet carries the link. */
function TargetCell(props: { readonly event: AuditEvent }): JSX.Element {
  if (props.event.targetType === "") {
    return <span className="block text-gray-500">—</span>;
  }

  return (
    <span className="block truncate">
      {props.event.targetLabel}
      {props.event.targetExists ? null : (
        <span className="ml-1.5 text-xs font-medium text-gray-500">
          (removed)
        </span>
      )}
    </span>
  );
}

/**
 * The Audit log screen (R-67 to R-69). It is controlled: the host owns the filters and the loaded
 * page, so filter changes reload from the first keyset page and Load more appends. It never edits
 * or deletes a row and offers no export.
 */
export function AuditLog(props: AuditLogProps): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const now = props.nowIso === undefined ? new Date() : new Date(props.nowIso);
  const open = props.events.find((event) => event.id === openId) ?? null;
  const count = countActiveFilters(props.filters);

  const change = (filters: AuditFilters) =>
    props.onChangeAuditFilters?.(filters);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-1 md:max-w-md">
          <label className="flex h-10 min-h-10 min-w-48 flex-1 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500 dark:border-gray-500 dark:bg-gray-950">
            <SearchIcon className="size-4 shrink-0 text-gray-500" />
            <input
              value={props.filters.query}
              onChange={(event) =>
                change({ ...props.filters, query: event.target.value })
              }
              aria-label="Search summary or target"
              placeholder="Search summary or target"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500"
            />
          </label>
          <HelpNote />
        </div>
        <FilterButton
          count={count}
          filters={props.filters}
          filterOptions={props.filterOptions}
          onChange={change}
        />
      </div>

      <FilterChips
        filters={props.filters}
        filterOptions={props.filterOptions}
        onChange={change}
      />

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {props.events.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold">No events match</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Widen the date range or remove a filter.
            </p>
            <button
              type="button"
              className={`${btnSecondary} mt-4`}
              onClick={() => change(EMPTY_AUDIT_FILTERS)}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
              {props.events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(event.id)}
                    className={`flex w-full flex-col gap-1.5 px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 ${focusRing}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar actor={event.actor} size="sm" />
                        <span className="truncate text-sm font-semibold">
                          {event.actor?.name ?? "System"}
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-xs text-gray-500"
                        title={fmtExact(
                          event.occurredAt,
                          props.viewer.timeZone
                        )}
                      >
                        {relativeTime(event.occurredAt, now)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ActionPill action={event.action} />
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {event.targetLabel}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-sm text-gray-700 dark:text-gray-300">
                      {event.summary}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full table-fixed md:table">
              <colgroup>
                <col className="w-[110px]" />
                <col className="w-[170px]" />
                <col className="w-[270px]" />
                <col className="w-[190px]" />
                <col />
              </colgroup>
              <thead className="border-b border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950/40">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 first:pl-5 dark:text-gray-400">
                    When
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Actor
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Action
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Target
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 last:pr-5 dark:text-gray-400">
                    Summary
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {props.events.map((event) => (
                  <tr
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenId(event.id)}
                    onKeyDown={(keyboard) => {
                      if (keyboard.key === "Enter" || keyboard.key === " ") {
                        keyboard.preventDefault();
                        setOpenId(event.id);
                      }
                    }}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
                    <td className="px-4 py-3 align-middle text-sm first:pl-5 text-gray-700 dark:text-gray-300">
                      <span
                        title={fmtExact(
                          event.occurredAt,
                          props.viewer.timeZone
                        )}
                      >
                        {relativeTime(event.occurredAt, now)}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {fmtDateTime(event.occurredAt, props.viewer.timeZone)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar actor={event.actor} size="sm" />
                        <span className="truncate font-medium">
                          {event.actor?.name ?? "System"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm">
                      <ActionPill action={event.action} wrap />
                    </td>
                    <td className="px-4 py-3 align-middle text-sm">
                      <span className="block text-xs text-gray-500">
                        {humanize(event.targetType)}
                      </span>
                      <TargetCell event={event} />
                    </td>
                    <td className="px-4 py-3 align-middle text-sm last:pr-5 text-gray-700 dark:text-gray-300">
                      <span className="block truncate">{event.summary}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-col items-center gap-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-600 sm:flex-row sm:justify-between dark:border-gray-800 dark:text-gray-400">
              <span>
                Showing {props.events.length.toLocaleString("en-GB")} of{" "}
                {props.total.toLocaleString("en-GB")}
              </span>
              {props.hasMore ? (
                <button
                  type="button"
                  disabled={props.loading}
                  aria-busy={props.loading === true}
                  className={btnSecondary}
                  onClick={() => props.onLoadMoreAuditEvents?.()}
                >
                  Load more
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>

      <AuditEventSheet
        event={open}
        timeZone={props.viewer.timeZone}
        now={now}
        onClose={() => setOpenId(null)}
        onOpenTarget={props.onOpenAuditTarget}
        onCopyEventId={props.onCopyEventId}
      />
    </div>
  );
}
