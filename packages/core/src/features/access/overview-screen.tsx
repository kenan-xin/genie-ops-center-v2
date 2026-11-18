"use client";

import {
  BUILT_IN_CONTROLS,
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  type FilterChip,
  FilterBar,
  FilterChips,
  FilterSheet,
  focusRing,
  type ListDefinition,
  type ListFilterControl,
  type ListFilterControlProps,
  type ListState,
  StatusPill,
} from "@genie/ui";
import { createContext, type ReactNode, useContext, useState } from "react";

import type {
  AccessHolder,
  AccessPath,
  AssignmentFilters,
} from "../../services/roles/effective-access.ts";
import type { GrantRow } from "../../services/roles/grants.ts";
import type {
  RecipientPage,
  RecipientRow,
} from "../../services/roles/recipients.ts";
import { fmtDate } from "../audit/helpers.ts";
import { PageLink } from "../shell/page-link.tsx";
import { AccessHelp } from "./access-help.tsx";
import { assignedOn } from "./assignment-words.ts";
import {
  type OverviewRow,
  overviewRows,
  pausedLabel,
  reachLine,
  whoParam,
} from "./overview-view.ts";
import { RangePager } from "./range-pager.tsx";
import { RecipientField } from "./recipient-field.tsx";
import { RecipientMark } from "./recipient-mark.tsx";

export type OverviewPage = {
  /** The shown page, newest first. */
  readonly paths: readonly AccessPath[];
  /** `AccessPage.memberCounts` of the shown page. */
  readonly memberCounts: Readonly<Record<string, number>>;
  /** The number of the page's first row, from 1. */
  readonly from: number;
  /** Every assignment that the filters and the search keep. */
  readonly total: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
};

export type OverviewScreenProps = {
  /** `overviewDefinition(catalogue, roles)`. */
  readonly definition: ListDefinition;
  /** `useListState(definition)`: q, who, module and role in the address (P12-8). */
  readonly state: ListState;
  readonly catalogue: readonly GrantRow[] | undefined;
  /** The filters in effect, from `readFilters`. */
  readonly filters: AssignmentFilters;
  /** The person or group of `filters.recipient`; null with no recipient filter. */
  readonly who: RecipientRow | null | undefined;
  /** The Person or group filter's search: `roles.recipients` with `limit: 10`. */
  readonly searchRecipients: (query: string) => Promise<RecipientPage>;
  /** Undefined while the first page loads. */
  readonly page: OverviewPage | undefined;
  readonly onPage: (step: -1 | 1) => void;
  /** A next page loads: the pager buttons wait. */
  readonly paging: boolean;
  /** Every path of the filtered person, for the reach line and "also assigned via" (O4). */
  readonly personPaths: readonly AccessPath[] | undefined;
  /** Record labels by `scopeKey`, only for records the viewer can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
  /** The tenant's default time zone (O11). */
  readonly timeZone: string;
  /** Each given only to a viewer who may open that screen (P12-20). */
  readonly roleHref?: ((roleId: string) => string) | undefined;
  readonly personHref?: ((personId: string) => string) | undefined;
  readonly groupHref?: ((groupId: string) => string) | undefined;
  readonly error?: string | undefined;
};

const COUNT = new Intl.NumberFormat("en-GB");

type Who = {
  readonly value: RecipientRow | null;
  readonly search: (query: string) => Promise<RecipientPage>;
  readonly pick: (row: RecipientRow) => void;
};

// A registered control is a component type, so the picker reaches the screen's state through context.
const WhoContext = createContext<Who | null>(null);

/** The Person or group filter (`access-recipient`): one pick, cleared by Clear filters or its chip. */
function WhoFilter(props: ListFilterControlProps): ReactNode {
  const who = useContext(WhoContext);

  if (who === null) return null;

  return (
    <div className={props.place === "bar" ? "w-50 shrink-0" : "w-full"}>
      <RecipientField
        label={props.filter.label}
        placeholder={props.filter.placeholder}
        multiple={false}
        value={who.value === null ? [] : [who.value]}
        onChange={(rows) => {
          const [row] = rows;

          if (row !== undefined) who.pick(row);
        }}
        search={who.search}
        look={props.place === "bar" ? "filter" : "field"}
      />
    </div>
  );
}

const CONTROLS = {
  ...BUILT_IN_CONTROLS,
  "access-recipient": WhoFilter,
} satisfies Readonly<Record<string, ListFilterControl>>;

const SearchControl = BUILT_IN_CONTROLS.search;

const Paused = (props: { readonly row: OverviewRow }) =>
  props.row.notInEffect.length === 0 ? null : (
    <span className="flex flex-wrap gap-1">
      {props.row.notInEffect.map((reason) => (
        <StatusPill key={reason} tone="warning">
          {pausedLabel(reason)}
        </StatusPill>
      ))}
    </span>
  );

/** "Invoices and Payments · Custom role"; with the Module filter set, only "Custom role" or nothing (ADM-14b). */
const moduleLine = (row: OverviewRow, moduleSet: boolean) =>
  moduleSet
    ? row.custom
      ? "Custom role"
      : null
    : row.custom
      ? `${row.module} · Custom role`
      : row.module;

/** "by Priya Nair", "at setup" (P12-11), or nothing for a break-glass row (R-39). */
const addedLine = (row: OverviewRow) =>
  row.addedBy !== null
    ? `by ${row.addedBy}`
    : row.addedAtSetup
      ? "at setup"
      : null;

const Name = (props: {
  readonly text: string;
  readonly href: string | undefined;
}) =>
  props.href === undefined ? (
    props.text
  ) : (
    <PageLink
      href={props.href}
      className={`font-medium text-foreground underline ${focusRing}`}
    >
      {props.text}
    </PageLink>
  );

/**
 * The Overview tab of Access (d8l5.62, access-start b): every assignment, newest first, 25 to a
 * page, filtered on the server by Person or group, Module and Role, and searched. It writes nothing.
 */
export function OverviewScreen(props: OverviewScreenProps): ReactNode {
  const { state, page } = props;

  // A pick shows its name at once, before the route's lookup of the new address answers.
  const [picked, setPicked] = useState<RecipientRow | null>(null);

  const asked = state.params["who"];

  const applied =
    props.filters.recipient === undefined ? null : (props.who ?? null);

  const shownWho =
    picked !== null && asked === whoParam(picked) ? picked : applied;

  const person = applied?.type === "user" ? applied : null;

  // With a person in Person or group, Assigned to names that person on every row (filtered-1440).
  const personWho = shownWho?.type === "user" ? shownWho : null;

  const moduleSet = props.filters.moduleId !== undefined;

  const rows =
    page === undefined
      ? []
      : overviewRows({
          subject: applied,
          paths: page.paths,
          personPaths: props.personPaths,
          catalogue: props.catalogue ?? [],
          memberCounts: page.memberCounts,
          recordLabels: props.recordLabels,
        });

  const holderHref = (holder: AccessHolder) =>
    holder.type === "user"
      ? props.personHref?.(holder.id)
      : props.groupHref?.(holder.id);

  // With the person filter every user row is that person: Direct; a group row names the group.
  const via = (row: OverviewRow) =>
    row.holder.type === "user" ? (
      "Direct"
    ) : (
      <>
        <Name text={row.holder.name} href={props.groupHref?.(row.holder.id)} />
        <span className="text-muted-foreground"> (group)</span>
      </>
    );

  const columns: readonly DataTableColumn<OverviewRow>[] = [
    {
      id: "role",
      header: "Role",
      cell: (row) => (
        <span className="flex flex-col gap-1">
          <span className="flex flex-col">
            <Name text={row.role} href={props.roleHref?.(row.roleId)} />
            <span className="text-xs text-muted-foreground">
              {moduleLine(row, false)}
            </span>
          </span>
          <Paused row={row} />
        </span>
      ),
    },
    {
      id: "to",
      header: "Assigned to",
      cell: (row) => {
        const name = personWho?.name ?? row.holder.name;

        const href =
          personWho === null
            ? holderHref(row.holder)
            : props.personHref?.(personWho.id);

        return (
          <span className="flex items-start gap-3">
            <RecipientMark
              type={personWho === null ? row.holder.type : "user"}
              name={name}
            />
            {/* 8 px down, so the 32 px mark's center sits on the first line's center (6wz1.113). */}
            <span className="flex min-w-0 flex-col pt-2">
              <Name text={name} href={href} />
              <span className="text-xs text-muted-foreground">
                {personWho === null ? row.kind : "Person"}
              </span>
            </span>
          </span>
        );
      },
    },
    {
      id: "scope",
      header: "Scope",
      cell: (row) =>
        row.record ?? <span className="whitespace-nowrap">All records</span>,
    },
    ...(person === null
      ? []
      : [{ id: "via", header: "Assigned via", cell: via }]),
    {
      id: "added",
      header: "Assigned",
      cell: (row) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums">
            {fmtDate(row.addedAt, props.timeZone)}
          </span>
          {addedLine(row) === null ? null : (
            <span className="text-xs text-muted-foreground">
              {addedLine(row)}
            </span>
          )}
        </span>
      ),
    },
  ];

  const optionLabel = (id: string, value: string) =>
    props.definition.filters
      .find((filter) => filter.id === id)
      ?.options?.find((option) => option.value === value)?.label ?? value;

  const chip = (id: string, label: string, value: string): FilterChip => ({
    id,
    label: `${label}: ${value}`,
    set: true,
    remove: {
      name: `Remove the ${label} filter`,
      onRemove: () => state.set({ [id]: undefined }),
    },
  });

  const chips: readonly FilterChip[] = [
    ...(shownWho === null
      ? []
      : [chip("who", "Person or group", shownWho.name)]),
    ...(props.filters.moduleId === undefined
      ? []
      : [
          chip(
            "module",
            "Module",
            optionLabel("module", props.filters.moduleId)
          ),
        ]),
    ...(props.filters.roleId === undefined
      ? []
      : [chip("role", "Role", optionLabel("role", props.filters.roleId))]),
  ];

  const search = props.definition.filters.find(
    (filter) => filter.kind === "search"
  );

  // Any list parameter in the address, also one that reads as no filter.
  const filtered = Object.keys(state.params).length > 0;

  const body =
    page === undefined ? (
      props.error === undefined ? (
        <p
          role="status"
          className="px-4 py-6 text-sm text-muted-foreground md:px-5"
        >
          Loading assignments
        </p>
      ) : null
    ) : rows.length === 0 ? (
      <div className="px-4 py-6 md:px-5">
        {filtered ? (
          <EmptyState
            headingLevel="h2"
            title="No assignments match"
            description="Clear the search and the filters to see every assignment."
            action={
              <Button variant="secondary" onClick={state.clear}>
                Clear search and filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            headingLevel="h2"
            title="No assignments"
            description="No person or group has a role yet."
          />
        )}
      </div>
    ) : (
      <DataTable<OverviewRow>
        label={props.definition.label}
        rows={rows}
        rowKey={(row) => row.key}
        rowLabel={(row) => `${row.role}, ${row.holder.name}`}
        columns={columns}
        framed={false}
        // One order, newest first, and no control (P12-19): the header says it, no button changes it.
        sort={{
          by: { column: "added", direction: "desc" },
          onChange: () => undefined,
        }}
        card={{
          title: (row) => (
            <Name text={row.role} href={props.roleHref?.(row.roleId)} />
          ),
          badge: (row) =>
            row.notInEffect.length === 0 ? null : <Paused row={row} />,
          detail: (row) => moduleLine(row, moduleSet),
          content: (row) => (
            // oxlint-disable-next-line shadcn/no-arbitrary-values -- the design capture's label column takes the label's width, not a fraction
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {applied === null ? (
                <>
                  <dt className="text-muted-foreground">Assigned to</dt>
                  <dd className="min-w-0 wrap-anywhere">
                    {row.holder.name}
                    {row.holder.type === "group" ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {row.kind}
                      </span>
                    ) : null}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Scope</dt>
              <dd className="min-w-0 wrap-anywhere">
                {row.record ?? "All records"}
              </dd>
              {person === null ? null : (
                <>
                  <dt className="text-muted-foreground">Assigned via</dt>
                  <dd className="min-w-0 wrap-anywhere">{via(row)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Assigned</dt>
              <dd className="min-w-0">{assignedOn(row, props.timeZone)}</dd>
            </dl>
          ),
        }}
        footer={
          <RangePager
            from={page.from}
            to={page.from + page.paths.length - 1}
            total={page.total}
            hasPrevious={page.hasPrevious}
            hasNext={page.hasNext}
            busy={props.paging}
            onPage={props.onPage}
          />
        }
      />
    );

  return (
    <WhoContext.Provider
      value={{
        value: shownWho,
        search: props.searchRecipients,
        pick: (row) => {
          setPicked(row);
          state.set({ who: whoParam(row) });
        },
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        {props.error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {props.error}
          </p>
        )}
        <section
          aria-label="Assignments"
          className="rounded-xl border border-border bg-card"
        >
          <div className="hidden md:block">
            <FilterBar
              definition={props.definition}
              state={state}
              controls={CONTROLS}
              actions={<AccessHelp align="end" iconOnly />}
            />
          </div>
          <div className="grid gap-3 border-b border-border px-4 pt-2.5 pb-3 md:hidden">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                Assignments
                {page === undefined ? null : (
                  <>
                    {" "}
                    <span className="font-medium text-muted-foreground tabular-nums">
                      {COUNT.format(page.total)}
                    </span>
                  </>
                )}
              </h2>
              <FilterSheet
                definition={props.definition}
                state={state}
                controls={CONTROLS}
                resultCount={page?.total}
              />
            </div>
            {search === undefined ? null : (
              <SearchControl
                filter={search}
                value={state.params[search.id]}
                onChange={(value) => state.set({ [search.id]: value })}
                place="sheet"
              />
            )}
            {chips.length === 0 ? null : (
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <FilterChips label="Filters" chips={chips} />
                </div>
                <Button variant="link" size="filter" onClick={state.clear}>
                  Clear filters
                </Button>
              </div>
            )}
          </div>
          {person === null || props.personPaths === undefined ? null : (
            <p
              role="status"
              className="border-b border-border px-4 py-2.5 text-sm md:px-5"
            >
              {reachLine(person.name, props.personPaths)}
            </p>
          )}
          {body}
        </section>
      </div>
    </WhoContext.Provider>
  );
}
