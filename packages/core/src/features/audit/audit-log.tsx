"use client";

import {
  Button,
  CategoryChip,
  Checkbox,
  DataTable,
  Field,
  FieldLabel,
  FilterDisclosure,
  focusRing,
  HelpDisclosure,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@genie/ui";
import { useId, useState } from "react";
import type { JSX, ReactNode } from "react";

import { NoMatch } from "../admin/no-match.tsx";
import { AuditEventSheet } from "./audit-event-sheet.tsx";
import {
  countActiveFilters,
  eventCategory,
  fmtDateTime,
  fmtExact,
  humanize,
  initials,
  actionGroup,
  RANGE_LABEL,
  RANGE_ORDER,
  relativeTime,
} from "./helpers.ts";
import { CloseIcon, SystemIcon } from "./icons.tsx";
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
        className={`flex shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground text-muted-foreground border-muted-foreground ${box}`}
      >
        <SystemIcon className="size-4" />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
        props.actor.anonymized
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-foreground"
      } ${box}`}
    >
      {props.actor.anonymized ? "?" : initials(props.actor.name)}
    </span>
  );
}

/** The action key as its category chip; an operator row keeps the neutral fill. */
function ActionPill(props: {
  readonly action: string;
  readonly wrap?: boolean;
}): JSX.Element {
  return (
    <CategoryChip category={eventCategory(props.action)} wrap={props.wrap}>
      {props.action}
    </CategoryChip>
  );
}

type FilterItem = { readonly value: string; readonly label: string };

function optionNodes(items: readonly FilterItem[]): JSX.Element[] {
  return items.map((item) => (
    <SelectItem key={item.value} value={item.value}>
      {item.label}
    </SelectItem>
  ));
}

/** One labelled filter select; `items` makes the trigger show the label, not the stored value. */
function FilterSelect(props: {
  readonly label: string;
  readonly value: string;
  readonly items: readonly FilterItem[];
  readonly onChange: (value: string) => void;
  readonly children?: ReactNode;
}): JSX.Element {
  const id = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Select
        items={props.items}
        value={props.value}
        onValueChange={(value) => props.onChange(value ?? props.value)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.children ?? optionNodes(props.items)}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** The Audit log's one help disclosure, icon only in the toolbar (tokens.md). */
function HelpNote(): JSX.Element {
  return (
    <HelpDisclosure label="Why a row can look incomplete" iconOnly>
      <p>
        An event is never edited and never deleted. It keeps the words that were
        true when it was written, so an old row can name something that has
        since changed.
      </p>
      <p>
        A target opens only while the record still exists and its module returns
        a path. A target that no longer exists shows without a link and reads
        Removed.
      </p>
      <p>
        A person an operator erased appears under an anonymized name. Their
        earlier events stay where they are.
      </p>
    </HelpDisclosure>
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
          // The after: element grows the 32 px chip to a 44 px hit area.
          className={`relative inline-flex h-8 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1.5 text-xs font-medium text-foreground after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-muted ${focusRing}`}
        >
          {chip.label}
          <CloseIcon className="size-4" />
        </button>
      ))}
      <Button
        variant="link"
        size="sm"
        onClick={() => props.onChange(EMPTY_AUDIT_FILTERS)}
      >
        Clear all
      </Button>
    </div>
  );
}

const RANGE_ITEMS: readonly FilterItem[] = RANGE_ORDER.map((range) => ({
  value: range,
  label: RANGE_LABEL[range],
}));

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

  const actorItems: FilterItem[] = [
    { value: "all", label: "All actors" },
    { value: "system", label: "System" },
    ...props.filterOptions.actors.map((actor) => ({
      value: actor.id,
      label: actor.name,
    })),
  ];

  const actionItems: FilterItem[] = [
    { value: "all", label: "All actions" },
    ...props.filterOptions.actions.map((action) => ({
      value: action,
      label: action,
    })),
  ];

  const targetItems: FilterItem[] = [
    { value: "all", label: "All targets" },
    ...props.filterOptions.targetTypes.map((type) => ({
      value: type,
      label: humanize(type),
    })),
  ];

  // The shared panel names the group and stacks these controls.
  return (
    <>
      <FilterSelect
        label="Actor"
        value={filters.actorId}
        items={actorItems}
        onChange={(value) => props.onChange({ ...filters, actorId: value })}
      />

      <FilterSelect
        label="Action"
        value={filters.action}
        items={actionItems}
        onChange={(value) => props.onChange({ ...filters, action: value })}
      >
        <SelectItem value="all">All actions</SelectItem>
        {[...groups.entries()].map(([group, actions]) => (
          <SelectGroup key={group}>
            <SelectLabel>{humanize(group)}</SelectLabel>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>
                {action}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Target type"
        value={filters.targetType}
        items={targetItems}
        onChange={(value) => props.onChange({ ...filters, targetType: value })}
      />

      <FilterSelect
        label="Date range"
        value={filters.range}
        items={RANGE_ITEMS}
        onChange={(value) =>
          props.onChange({
            ...filters,
            // SAFETY: this select's only options are the RANGE_LABEL keys, so the value is one.
            range: value as DateRangePreset,
            from: null,
            to: null,
          })
        }
      />

      {filters.range === "custom" ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="From"
            value={filters.from ?? ""}
            max={filters.to ?? undefined}
            onChange={(event) =>
              props.onChange({ ...filters, from: event.target.value || null })
            }
          />
          <span className="shrink-0 text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            value={filters.to ?? ""}
            min={filters.from ?? undefined}
            onChange={(event) =>
              props.onChange({ ...filters, to: event.target.value || null })
            }
          />
        </div>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
        <Checkbox
          checked={filters.operatorOnly}
          onCheckedChange={(checked) =>
            props.onChange({ ...filters, operatorOnly: checked })
          }
        />
        Operator rows only
      </label>
    </>
  );
}

function actorCell(event: AuditEvent): JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar actor={event.actor} size="sm" />
      <span className="truncate font-medium text-foreground">
        {event.actor?.name ?? "System"}
      </span>
    </span>
  );
}

/** The target. The table and the card mark a removed one; the sheet carries the link. */
function TargetCell(props: { readonly event: AuditEvent }): JSX.Element {
  if (props.event.targetType === "") {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="wrap-anywhere">
      {props.event.targetLabel}
      {props.event.targetExists ? null : (
        <span className="ml-1.5 text-xs font-medium text-muted-foreground">
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

  const relative = (event: AuditEvent) => (
    <span title={fmtExact(event.occurredAt, props.viewer.timeZone)}>
      {relativeTime(event.occurredAt, now, props.viewer.timeZone)}
    </span>
  );

  const when = (event: AuditEvent) => (
    <>
      {relative(event)}
      <span className="block text-xs text-muted-foreground">
        {fmtDateTime(event.occurredAt, props.viewer.timeZone)}
      </span>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-1 md:max-w-md">
          <Input
            value={props.filters.query}
            onChange={(event) =>
              change({ ...props.filters, query: event.target.value })
            }
            aria-label="Search summary or target"
            placeholder="Search summary or target"
            className="min-w-48 flex-1"
          />
          <HelpNote />
        </div>
        <span className="inline-flex shrink-0">
          <FilterDisclosure
            count={count}
            onClear={() => change(EMPTY_AUDIT_FILTERS)}
          >
            <FilterPanel
              filters={props.filters}
              filterOptions={props.filterOptions}
              onChange={change}
            />
          </FilterDisclosure>
        </span>
      </div>

      <FilterChips
        filters={props.filters}
        filterOptions={props.filterOptions}
        onChange={change}
      />

      <section>
        {props.events.length === 0 ? (
          <NoMatch
            copy={props.noMatch}
            onClear={() => change(EMPTY_AUDIT_FILTERS)}
          />
        ) : (
          <>
            <DataTable
              label="Audit events"
              rows={props.events}
              rowKey={(event) => event.id}
              rowLabel={(event) => event.summary}
              identityColumn="summary"
              onOpenRow={(event) => setOpenId(event.id)}
              columns={[
                { id: "when", header: "When", cell: when },
                { id: "actor", header: "Actor", cell: actorCell },
                {
                  id: "action",
                  header: "Action",
                  cell: (event) => <ActionPill action={event.action} wrap />,
                },
                {
                  id: "target",
                  header: "Target",
                  cell: (event) => (
                    <>
                      <span className="block text-xs text-muted-foreground">
                        {humanize(event.targetType)}
                      </span>
                      <TargetCell event={event} />
                    </>
                  ),
                },
                {
                  id: "summary",
                  header: "Summary",
                  cell: (event) => event.summary,
                },
              ]}
              facts={(event) => [
                <span key="actor" className="flex flex-wrap items-center gap-2">
                  {actorCell(event)}
                  {relative(event)}
                </span>,
                <span
                  key="action"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <ActionPill action={event.action} />
                  <span className="text-xs">
                    {event.targetType === "" ? null : (
                      <span className="text-muted-foreground">
                        {humanize(event.targetType)}
                      </span>
                    )}{" "}
                    <TargetCell event={event} />
                  </span>
                </span>,
              ]}
            />

            <div className="flex flex-col items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:flex-row sm:justify-between text-muted-foreground">
              {props.refreshing === true ? (
                // The rows above are the previous filter's; no count or Load more claims them.
                <span role="status">Loading the audit log…</span>
              ) : (
                <span>
                  Showing {props.events.length.toLocaleString("en-GB")} of{" "}
                  {props.total.toLocaleString("en-GB")}
                </span>
              )}
              {props.hasMore && props.refreshing !== true ? (
                <Button
                  variant="secondary"
                  disabled={props.loading}
                  aria-busy={props.loading === true}
                  onClick={() => props.onLoadMoreAuditEvents?.()}
                >
                  Load more
                </Button>
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
