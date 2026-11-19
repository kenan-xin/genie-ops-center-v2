"use client";

import {
  BUILT_IN_CONTROLS,
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  type ListState,
  StatusPill,
} from "@genie/ui";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { RecipientRow } from "../../services/roles/recipients.ts";
import { recipientDetail } from "./assignment-words.ts";
import { GRANTS_LIST } from "./grants-view.ts";
import { RangePager } from "./range-pager.tsx";
import { RecipientMark } from "./recipient-mark.tsx";

export type GrantsListPage = {
  readonly rows: readonly RecipientRow[];
  /** The number of the page's first row, from 1. */
  readonly from: number;
  readonly total: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
};

export type GrantsListProps = {
  /** `useListState(GRANTS_LIST)`: `q` and `show` in the address. */
  readonly state: ListState;
  /** Undefined while the page loads. */
  readonly page: GrantsListPage | undefined;
  readonly onPage: (step: -1 | 1) => void;
  /** Another page loads: the pager buttons wait. */
  readonly paging: boolean;
  readonly onOpen: (row: RecipientRow) => void;
};

const COUNT = new Intl.NumberFormat("en-GB");

const SearchControl = BUILT_IN_CONTROLS.search;

const ShowControl = BUILT_IN_CONTROLS.option;

const [SEARCH, SHOW] = GRANTS_LIST.filters;

const rolesOf = (row: RecipientRow) =>
  row.assignedRoles === 0 ? "None" : COUNT.format(row.assignedRoles);

const archivedPill = (row: RecipientRow) =>
  row.type === "group" && row.archived ? (
    <StatusPill tone="neutral">Archived</StatusPill>
  ) : null;

/**
 * Grants with no recipient chosen (P12-17, `grants-1440`, `grants-390`): every group, then every
 * person, 25 to a page, searched and filtered on the server. A row opens that recipient's editor.
 */
export function GrantsList(props: GrantsListProps): ReactNode {
  const { state, page } = props;

  const columns: readonly DataTableColumn<RecipientRow>[] = [
    {
      id: "who",
      header: "Group or person",
      cell: (row) => (
        <span className="flex items-start gap-3">
          <RecipientMark type={row.type} name={row.name} />
          {/* 6 px down, so the 32 px mark's center sits on the 20 px first line's center (6wz1.113). */}
          <span className="flex min-w-0 flex-col pt-1.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-5">
              <span className="font-medium">{row.name}</span>
              {archivedPill(row)}
            </span>
            <span className="text-xs text-muted-foreground">
              {recipientDetail(row)}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "roles",
      header: "Assigned roles",
      cell: (row) => <span className="tabular-nums">{rolesOf(row)}</span>,
    },
  ];

  const filtered = Object.keys(state.params).length > 0;

  const body =
    page === undefined ? (
      <p
        role="status"
        className="px-4 py-6 text-sm text-muted-foreground md:px-5"
      >
        Loading groups and people
      </p>
    ) : page.rows.length === 0 ? (
      <div className="px-4 py-6 md:px-5">
        <EmptyState
          headingLevel="h2"
          title="No group or person matches"
          description="Clear the search and the filter to see every group and person."
          action={
            filtered ? (
              <Button variant="secondary" onClick={state.clear}>
                Clear search and filter
              </Button>
            ) : undefined
          }
        />
      </div>
    ) : (
      <DataTable<RecipientRow>
        verticalAlign="top"
        label={GRANTS_LIST.label}
        rows={page.rows}
        rowKey={(row) => `${row.type}:${row.id}`}
        rowLabel={(row) => row.name}
        columns={columns}
        framed={false}
        rowAction={(row) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${row.name} in Grants`}
            onClick={() => props.onOpen(row)}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        )}
        card={{
          media: (row) => <RecipientMark type={row.type} name={row.name} />,
          title: (row) => row.name,
          badge: archivedPill,
          detail: recipientDetail,
          content: (row) => (
            // oxlint-disable-next-line shadcn/no-arbitrary-values -- the design capture's label column takes the label's width, not a fraction
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <dt className="text-muted-foreground">Assigned roles</dt>
              <dd className="tabular-nums">{rolesOf(row)}</dd>
            </dl>
          ),
        }}
        footer={
          <RangePager
            from={page.from}
            to={page.from + page.rows.length - 1}
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
    <section
      aria-label="Groups and people"
      className="rounded-xl border border-border bg-card"
    >
      <div className="flex flex-col gap-1 px-4 pt-4 md:px-5 md:pt-5">
        <h2 className="text-base font-semibold">Groups and people</h2>
        <p className="text-sm text-muted-foreground">
          Open one to change several of its modules at once.
        </p>
      </div>
      <div className="hidden md:block">
        <FilterBar
          definition={GRANTS_LIST}
          state={state}
          controls={BUILT_IN_CONTROLS}
        />
      </div>
      <div className="grid gap-3 border-b border-border px-4 pt-3 pb-3 md:hidden">
        {SEARCH === undefined ? null : (
          <SearchControl
            filter={SEARCH}
            value={state.params[SEARCH.id]}
            onChange={(value) => state.set({ [SEARCH.id]: value })}
            place="sheet"
          />
        )}
        {SHOW === undefined ? null : (
          <ShowControl
            filter={SHOW}
            value={state.params[SHOW.id]}
            onChange={(value) => state.set({ [SHOW.id]: value })}
            place="sheet"
          />
        )}
      </div>
      {body}
    </section>
  );
}
