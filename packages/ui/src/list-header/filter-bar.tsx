"use client";

import { ListFilterIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover.tsx";
import type { ListDefinition, ListFilterDefinition } from "./definitions.ts";
import { barWidthOf, type ListFilterControl } from "./filter-controls.tsx";
import { setFilterCount, type ListState } from "./list-state.ts";

// The bar's padding, its gap, Clear filters and More filters, in px (LH27).
const PADDING = 24;

const GAP = 8;

const CLEAR = 120;

const MORE = 140;

/**
 * How many filters fit in a bar `width` px wide, in definition order. A search stays in the bar,
 * because a search behind a popover is hard to find.
 */
export function fittingCount(
  filters: readonly ListFilterDefinition[],
  width: number
): number {
  const fit = (room: number) => {
    let used = 0;

    return filters.findIndex((filter) => {
      used += barWidthOf(filter.kind) + GAP;

      return filter.kind !== "search" && used > room;
    });
  };

  const room = width - PADDING - CLEAR;
  const all = fit(room);

  if (all === -1) return filters.length;

  const some = fit(room - MORE - GAP);

  return some === -1 ? filters.length : some;
}

/** A filter in the place that it sits, with the address value and its writer. */
export function FilterSlot(props: {
  readonly filter: ListFilterDefinition;
  readonly state: ListState;
  readonly controls: Readonly<Record<string, ListFilterControl>>;
  readonly place: "bar" | "sheet";
  readonly anchorDay?: string | undefined;
}) {
  const Control = props.controls[props.filter.kind];

  if (Control === undefined) return null;

  return (
    <Control
      filter={props.filter}
      value={props.state.params[props.filter.id]}
      onChange={(value) => props.state.set({ [props.filter.id]: value })}
      place={props.place}
      anchorDay={props.anchorDay}
    />
  );
}

/**
 * The compact filter bar of the list card (variant C): the controls in definition order, each of a
 * fixed width, the ones that do not fit in More filters, then Clear filters and the actions.
 */
export function FilterBar(props: {
  readonly definition: ListDefinition;
  readonly state: ListState;
  readonly controls: Readonly<Record<string, ListFilterControl>>;
  readonly anchorDay?: string | undefined;
  readonly actions?: ReactNode;
}) {
  const { definition, state } = props;
  const bar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const element = bar.current;

    if (element === null) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.borderBoxSize[0]?.inlineSize);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const filters = definition.filters;

  // Before the first measure (and on the server) every control sits in the bar.
  const fit =
    width === undefined ? filters.length : fittingCount(filters, width);

  const more = filters.slice(fit);

  const search = filters.find((filter) => filter.kind === "search");

  const anySet =
    setFilterCount(definition, state.params) > 0 ||
    (search !== undefined && state.params[search.id] !== undefined);

  return (
    <div
      ref={bar}
      data-slot="filter-bar"
      className="flex items-center gap-2 border-b border-border px-3 py-2.5"
    >
      {filters.slice(0, fit).map((filter) => (
        <FilterSlot
          key={filter.id}
          filter={filter}
          state={state}
          controls={props.controls}
          place="bar"
          anchorDay={props.anchorDay}
        />
      ))}
      {more.length === 0 ? null : (
        <Popover>
          <PopoverTrigger render={<Button variant="secondary" size="filter" />}>
            <ListFilterIcon aria-hidden="true" />
            More filters
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label="More filters"
            className="w-72"
          >
            <div className="grid gap-3">
              {more.map((filter) => (
                <div key={filter.id} className="grid gap-1.5">
                  <span className="text-sm font-medium">{filter.label}</span>
                  <FilterSlot
                    filter={filter}
                    state={state}
                    controls={props.controls}
                    place="sheet"
                    anchorDay={props.anchorDay}
                  />
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      <span className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="filter"
          disabled={!anySet}
          onClick={state.clear}
        >
          Clear filters
        </Button>
        {props.actions}
      </span>
    </div>
  );
}
