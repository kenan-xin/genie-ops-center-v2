"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../components/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "../components/tabs.tsx";
import { DataTable, type DataTableProps } from "../parts/data-table.tsx";
import { EmptyState } from "../parts/empty-state.tsx";
import type { Figure } from "../parts/figure-strip.tsx";
import { CountPill } from "../parts/pills.tsx";
import type { ListDefinition, ListSort, ListSortKind } from "./definitions.ts";
import { FilterBar, FilterSlot } from "./filter-bar.tsx";
import {
  BUILT_IN_CONTROLS,
  type ListFilterControl,
} from "./filter-controls.tsx";
import { FilterSheet } from "./filter-sheet.tsx";
import { ListFigures } from "./list-figures.tsx";
import { sortParam, type ListState } from "./list-state.ts";

export type ListHeaderProps<Row> = {
  readonly definition: ListDefinition;
  readonly state: ListState;
  /** The rows of each tab value, counted under the filters but never under the tab. */
  readonly counts?: Readonly<Record<string, number>> | undefined;
  /** One card per currency. */
  readonly figures?:
    | readonly {
        readonly label: string;
        readonly figures: readonly Figure[];
      }[]
    | undefined;
  /** Merged over `BUILT_IN_CONTROLS`, so a page adds a filter kind without changing the header. */
  readonly controls?: Readonly<Record<string, ListFilterControl>> | undefined;
  /** The ISO day that the quick ranges count from. */
  readonly anchorDay?: string | undefined;
  /** At the end of the bar, and beside Filters on a phone. */
  readonly actions?: ReactNode | undefined;
  readonly table: Omit<
    DataTableProps<Row>,
    "label" | "sort" | "footer" | "onEndReached" | "framed"
  >;
  readonly page: {
    readonly loaded: number;
    readonly more: boolean;
    readonly loading: boolean;
    readonly failed: boolean;
    readonly onMore: () => void;
  };
  readonly empty: { readonly title: string; readonly description: string };
};

const SORT_WORDS: Readonly<
  Record<ListSortKind, { readonly desc: string; readonly asc: string }>
> = {
  date: { desc: "newest", asc: "oldest" },
  number: { desc: "highest", asc: "lowest" },
  text: { desc: "Z to A", asc: "A to Z" },
};

/** The phone sort control (LH28): the current column, and a tap reverses it. */
function PhoneSort(props: {
  readonly header: string;
  readonly kind: ListSortKind;
  readonly sort: ListSort;
  readonly onChange: (sort: ListSort) => void;
}) {
  const words = SORT_WORDS[props.kind][props.sort.direction];
  const Icon = props.sort.direction === "desc" ? ArrowDownIcon : ArrowUpIcon;

  return (
    <Button
      variant="ghost"
      size="filter"
      aria-label={`Sort: ${props.header}, ${words} first`}
      onClick={() =>
        props.onChange({
          column: props.sort.column,
          direction: props.sort.direction === "desc" ? "asc" : "desc",
        })
      }
    >
      <Icon aria-hidden="true" />
      {`${props.header}, ${words}`}
    </Button>
  );
}

/**
 * The one configurable header of a module list (Spec 7 R-37a, variant C): figure cards, then one
 * card with the status tabs on its top edge, the filter bar and the table. Every part but the
 * table is optional and comes from data, so a list is a configuration, never code in here.
 */
export function ListHeader<Row>(props: ListHeaderProps<Row>) {
  const { definition, state, page } = props;
  const controls = { ...BUILT_IN_CONTROLS, ...props.controls };
  const tabs = definition.tabs;
  const [one, many] = definition.noun;
  const tabCount = props.counts?.[state.tab];
  const activeTab = tabs?.items.find((item) => item.value === state.tab);

  const countText = page.more
    ? tabCount === undefined
      ? `Showing ${page.loaded} ${many}`
      : `Showing ${page.loaded} of ${tabCount} ${many}`
    : `${page.loaded} ${page.loaded === 1 ? one : many}`;

  const setSort = (sort: ListSort) =>
    state.set({ sort: sortParam(definition, sort) });

  const sortColumn = props.table.columns.find(
    (column) => column.id === state.sort.column
  );

  const sortKind = definition.sorts.find(
    (sort) => sort.column === state.sort.column
  )?.kind;

  const search = definition.filters.find((filter) => filter.kind === "search");

  const readMore = () => {
    if (page.more && !page.loading && !page.failed) page.onMore();
  };

  return (
    <div className="grid gap-4">
      {props.figures?.map((group) => (
        <ListFigures
          key={group.label}
          label={group.label}
          figures={group.figures}
        />
      ))}
      <div className="rounded-xl border border-border bg-card">
        {tabs === undefined ? null : (
          <Tabs
            value={state.tab}
            onValueChange={(value) =>
              state.set({
                [tabs.param]:
                  value === tabs.items[0]?.value ? undefined : String(value),
              })
            }
            className="hidden md:flex"
          >
            <TabsList
              aria-label={`${definition.label} by status`}
              variant="card-top"
              className="w-full"
            >
              {tabs.items.map((item) => {
                const n = props.counts?.[item.value] ?? 0;

                return (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                    {n === 0 ? null : (
                      <CountPill tone={item.tone ?? "neutral"}>{n}</CountPill>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}
        <div className="hidden md:block">
          <FilterBar
            definition={definition}
            state={state}
            controls={controls}
            anchorDay={props.anchorDay}
            actions={props.actions}
          />
        </div>
        <div className="grid gap-3 border-b border-border px-4 pt-2.5 pb-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {activeTab === undefined || activeTab.value === "all"
                ? `All ${many}`
                : activeTab.label}
              {/* The space sits outside the span, so the name reads "All invoices 36". */}
              {tabCount === undefined || tabCount === 0 ? null : (
                <>
                  {" "}
                  <span className="font-medium text-muted-foreground tabular-nums">
                    {tabCount}
                  </span>
                </>
              )}
            </h2>
            <span className="flex items-center gap-2">
              {props.actions}
              <FilterSheet
                definition={definition}
                state={state}
                controls={controls}
                counts={props.counts}
                resultCount={tabCount}
                anchorDay={props.anchorDay}
              />
            </span>
          </div>
          {search === undefined ? null : (
            <FilterSlot
              filter={search}
              state={state}
              controls={controls}
              place="sheet"
            />
          )}
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">{countText}</span>
            {sortColumn === undefined || sortKind === undefined ? null : (
              <PhoneSort
                header={sortColumn.header}
                kind={sortKind}
                sort={state.sort}
                onChange={setSort}
              />
            )}
          </div>
        </div>
        {page.loaded === 0 && !page.loading ? (
          <EmptyState
            headingLevel="h2"
            title={props.empty.title}
            description={props.empty.description}
          />
        ) : (
          <DataTable
            {...props.table}
            label={definition.label}
            framed={false}
            sort={{ by: state.sort, onChange: setSort }}
            onEndReached={readMore}
            footer={
              <>
                {/* A phone shows the count once, in the line above the cards (czjw.102). */}
                <span
                  data-wide-only=""
                  className="hidden tabular-nums md:inline"
                >
                  {countText}
                </span>
                {page.failed ? (
                  <span role="alert" className="text-destructive">
                    {`More ${many} could not be read. Try Show more again.`}
                  </span>
                ) : null}
                {page.more ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page.loading}
                    onClick={page.onMore}
                  >
                    Show more
                  </Button>
                ) : null}
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
