"use client";

import { cn } from "cn";
import { SearchIcon } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";

import { infoTint } from "../components/alert.tsx";
import { Button } from "../components/button.tsx";
import { Checkbox } from "../components/checkbox.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "../components/input-group.tsx";

export type TransferItem = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** The caption the item sits under, for example "Modules". Captions keep the order of first use. */
  readonly group?: string;
  /** A third line, for example "Also through Finance team". */
  readonly note?: string;
  /** Why the item cannot be added now. It stays readable in muted text, and it can still be removed. */
  readonly blockedReason?: string;
  /** Pills at the end of the row, for example Inactive and Pending. */
  readonly pills?: ReactNode;
  /** The granted side only: beside the pills in the panes form, on its own line in the roster. */
  readonly control?: ReactNode;
};

export type TransferListProps = {
  readonly items: readonly TransferItem[];
  readonly granted: ReadonlySet<string>;
  readonly onMove: (
    ids: readonly string[],
    to: "granted" | "available"
  ) => void;
  readonly layout: "panes" | "roster";
  readonly availableLabel: string;
  readonly grantedLabel: string;
  readonly emptyAvailable: string;
  readonly emptyGranted: string;
  /** The accessible name of the roster's one search field. */
  readonly searchLabel: string;
};

type Side = "available" | "granted";

const captionClass =
  "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

const matches = (item: TransferItem, query: string) =>
  query === "" ||
  item.label.toLowerCase().includes(query) ||
  (item.description?.toLowerCase().includes(query) ?? false);

/** A blocked row stops only an add: on the granted side it can always be removed. */
const blocked = (item: TransferItem, side: Side) =>
  side === "available" && item.blockedReason !== undefined;

function SearchField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        aria-label={props.label}
        placeholder="Search"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <InputGroupAddon>
        <InputGroupText>
          <SearchIcon aria-hidden="true" />
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** The rows of one bucket, under their captions, or the empty line. */
function Rows(props: {
  readonly items: readonly TransferItem[];
  readonly side: Side;
  readonly layout: TransferListProps["layout"];
  readonly searching: boolean;
  readonly empty: string;
  readonly ticked: ReadonlySet<string>;
  readonly onTick: (id: string) => void;
}) {
  if (props.items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {props.searching ? "No row matches the search." : props.empty}
      </p>
    );
  }

  const captions = Map.groupBy(props.items, (item) => item.group ?? "");

  return (
    <ul>
      {[...captions].map(([caption, rows]) => (
        <Fragment key={caption}>
          {caption === "" ? null : (
            <li className={cn(captionClass, "px-3 pt-3 pb-1")}>
              {caption} · {rows.length}
            </li>
          )}
          {rows.map((item) => {
            const stop = blocked(item, props.side);
            const on = props.ticked.has(item.id);

            return (
              <li
                key={item.id}
                className={cn(
                  "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm motion-safe:transition-colors",
                  on ? infoTint : !stop && "hover:bg-muted"
                )}
              >
                <label
                  title={stop ? item.blockedReason : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3",
                    stop
                      ? "cursor-not-allowed text-muted-foreground"
                      : "cursor-pointer"
                  )}
                >
                  <Checkbox
                    aria-label={item.label}
                    checked={on}
                    disabled={stop}
                    onCheckedChange={() => props.onTick(item.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">
                      {item.label}
                    </span>
                    {item.description === undefined ? null : (
                      <span
                        title={item.description}
                        className="line-clamp-2 text-xs text-muted-foreground"
                      >
                        {item.description}
                      </span>
                    )}
                    {item.note === undefined ? null : (
                      <span className="block text-xs font-medium">
                        {item.note}
                      </span>
                    )}
                  </span>
                </label>
                {item.pills}
                {props.side === "granted" && item.control !== undefined ? (
                  <div
                    className={
                      props.layout === "roster" ? "basis-full pl-7" : ""
                    }
                  >
                    {item.control}
                  </div>
                ) : null}
              </li>
            );
          })}
        </Fragment>
      ))}
    </ul>
  );
}

/**
 * The transfer list (tokens.md, "Transfer list"). One pattern in two forms: `panes` puts the
 * available bucket beside the granted one, and `roster` is one list with the granted bucket
 * first. The list owns its ticks and its search terms; the caller owns `granted`.
 */
export function TransferList(props: TransferListProps) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState({ available: "", granted: "" });

  const sideOf = (item: TransferItem): Side =>
    props.granted.has(item.id) ? "granted" : "available";

  const label = {
    available: props.availableLabel,
    granted: props.grantedLabel,
  };

  const empty = {
    available: props.emptyAvailable,
    granted: props.emptyGranted,
  };

  // The roster has one search, kept under `available`.
  const termOf = (side: Side) =>
    (props.layout === "roster" ? query.available : query[side])
      .trim()
      .toLowerCase();

  const all = (side: Side) =>
    props.items.filter((item) => sideOf(item) === side);

  const shown = (side: Side) =>
    all(side).filter((item) => matches(item, termOf(side)));

  const movable = (side: Side) =>
    shown(side).filter((item) => !blocked(item, side));

  // Ticks are read against `granted` at each render, so a tick that a caller moved cannot move twice.
  const tickedOn = (side: Side) =>
    props.items
      .filter((item) => ticked.has(item.id) && sideOf(item) === side)
      .map((item) => item.id);

  const move = (ids: readonly string[], from: Side) => {
    if (ids.length === 0) return;

    setTicked((current) => {
      const next = new Set(current);

      for (const id of ids) next.delete(id);

      return next;
    });
    props.onMove(ids, from === "available" ? "granted" : "available");
  };

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });

  const selectAll = (rows: readonly TransferItem[]) => {
    const on = rows.length > 0 && rows.every((item) => ticked.has(item.id));

    return {
      checked: on,
      disabled: rows.length === 0,
      onCheckedChange: () =>
        setTicked((current) => {
          const next = new Set(current);

          for (const item of rows) {
            if (on) next.delete(item.id);
            else next.add(item.id);
          }

          return next;
        }),
    };
  };

  const moveButton = (side: Side, full: boolean) => {
    const ids = tickedOn(side);

    if (ids.length === 0) return null;

    return (
      <Button
        variant={side === "available" ? "primary" : "danger-outline"}
        className={full ? "w-full" : ""}
        onClick={() => move(ids, side)}
      >
        {side === "available" ? "Add" : "Remove"} {ids.length}
      </Button>
    );
  };

  const rows = (side: Side) => (
    <Rows
      items={shown(side)}
      side={side}
      layout={props.layout}
      searching={termOf(side) !== ""}
      empty={empty[side]}
      ticked={ticked}
      onTick={toggle}
    />
  );

  if (props.layout === "roster") {
    const both = [...movable("granted"), ...movable("available")];

    const add = moveButton("available", false);

    const remove = moveButton("granted", false);

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-4 pb-1">
          <SearchField
            label={props.searchLabel}
            value={query.available}
            onChange={(value) => setQuery({ ...query, available: value })}
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-xs font-medium">
            <Checkbox aria-label="Select all shown" {...selectAll(both)} />
            Select all shown
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {(["granted", "available"] as const).map((side) => (
            <section key={side} role="group" aria-label={label[side]}>
              <h3
                className={cn(
                  captionClass,
                  "sticky top-0 z-10 border-b border-border bg-muted px-4 py-2"
                )}
              >
                {label[side]} · {all(side).length}
              </h3>
              {rows(side)}
            </section>
          ))}
        </div>
        {add === null && remove === null ? null : (
          <div className="flex items-center gap-2 border-t border-border px-4 py-3">
            {add}
            {remove}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
      {(["available", "granted"] as const).map((side) => {
        const quick = movable(side);

        const button = moveButton(side, true);

        return (
          <section
            key={side}
            role="group"
            aria-label={label[side]}
            className="flex min-h-0 min-w-0 flex-col rounded-lg border border-border"
          >
            <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3">
              <h3 className={captionClass}>
                {label[side]} · {all(side).length}
              </h3>
              {quick.length > 0 ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() =>
                    move(
                      quick.map((item) => item.id),
                      side
                    )
                  }
                >
                  {side === "available" ? "Add all shown" : "Remove all shown"}
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-3 border-b border-border px-3 py-2">
              <Checkbox
                aria-label={`Select all shown in ${label[side]}`}
                {...selectAll(quick)}
              />
              <SearchField
                label={`Search ${label[side]}`}
                value={query[side]}
                onChange={(value) => setQuery({ ...query, [side]: value })}
              />
            </div>
            <div className="max-h-88 min-h-0 flex-1 overflow-y-auto">
              {rows(side)}
            </div>
            {button === null ? null : (
              <div className="border-t border-border p-2">{button}</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
