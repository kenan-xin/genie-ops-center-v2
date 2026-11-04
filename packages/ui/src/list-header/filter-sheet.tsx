"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "../components/button.tsx";
import { FieldLabel } from "../components/field.tsx";
import { RadioGroup, RadioGroupItem } from "../components/radio-group.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/sheet.tsx";
import type { ListDefinition } from "./definitions.ts";
import { FilterSlot } from "./filter-bar.tsx";
import type { ListFilterControl } from "./filter-controls.tsx";
import { setFilterCount, type ListState } from "./list-state.ts";

/**
 * The phone Filters sheet (variant C): the status as radios with counts, then every filter but the
 * search, which stays on the card. Each pick writes the address at once, so the list behind it is
 * already filtered. "Show n" closes the sheet, and focus returns to Filters.
 */
export function FilterSheet(props: {
  readonly definition: ListDefinition;
  readonly state: ListState;
  readonly controls: Readonly<Record<string, ListFilterControl>>;
  /** The rows of each tab value. A count of 0 shows no number (LH21). */
  readonly counts?: Readonly<Record<string, number>> | undefined;
  /** The rows that the filters give, for "Show 6 invoices". */
  readonly resultCount: number | undefined;
  readonly anchorDay?: string | undefined;
}) {
  const { definition, state } = props;
  const statusId = useId();
  const count = setFilterCount(definition, state.params);
  const tabs = definition.tabs;
  const [one, many] = definition.noun;

  const show =
    props.resultCount === undefined
      ? "Show results"
      : `Show ${props.resultCount} ${props.resultCount === 1 ? one : many}`;

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="secondary" size="filter" />}>
        <SlidersHorizontalIcon aria-hidden="true" />
        Filters
        {count === 0 ? null : (
          <span
            aria-label={`${count} set`}
            className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
          >
            {count}
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="grid gap-5 overflow-y-auto px-4 pb-2">
          {tabs === undefined ? null : (
            <div className="grid gap-1.5">
              <span id={statusId} className="text-sm font-medium">
                Status
              </span>
              <RadioGroup
                value={state.tab}
                aria-labelledby={statusId}
                onValueChange={(value) =>
                  state.set({
                    [tabs.param]:
                      value === tabs.items[0]?.value
                        ? undefined
                        : String(value),
                  })
                }
              >
                {tabs.items.map((item) => {
                  const n = props.counts?.[item.value] ?? 0;

                  // A 44 px row per status, so each is a tap target.
                  return (
                    <div
                      key={item.value}
                      className="flex min-h-11 items-center"
                    >
                      <FieldLabel className="w-full items-center">
                        <RadioGroupItem value={item.value} />
                        {item.label}
                        {n === 0 ? null : (
                          <span className="ml-auto text-muted-foreground tabular-nums">
                            {n}
                          </span>
                        )}
                      </FieldLabel>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          )}
          {definition.filters
            .filter((filter) => filter.kind !== "search")
            .map((filter) => (
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
        <SheetFooter className="flex-row">
          <Button
            variant="secondary"
            size="lg"
            disabled={count === 0}
            onClick={state.clear}
          >
            Clear all
          </Button>
          <SheetClose render={<Button size="lg" className="flex-1" />}>
            {show}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
