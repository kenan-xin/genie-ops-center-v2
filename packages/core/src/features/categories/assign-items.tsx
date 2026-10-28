"use client";

import {
  Button,
  CountPill,
  DataTable,
  IconTile,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  SwitchField,
} from "@genie/ui";
import { FolderIcon } from "lucide-react";
import { useState } from "react";

import type { AssignableModuleView, CategoriesScreenProps } from "./types.ts";

type AssignItemsProps = Pick<
  CategoriesScreenProps,
  "list" | "modules" | "onAssign" | "failed" | "onRetry"
>;

/** The pill a switched-off module carries, in the table's cell and on the card. */
function offPill(module: AssignableModuleView) {
  return module.enabled ? null : <StatusPill tone="neutral">Off</StatusPill>;
}

/**
 * Files whole modules under a category, one picker per module (Decision 7). Module rows only:
 * record rows from module providers arrive in Section 4. Filing never changes access.
 */
export function AssignItems(props: AssignItemsProps) {
  const [query, setQuery] = useState("");
  const [onlyLoose, setOnlyLoose] = useState(false);

  const known = new Set(props.list.categories.map((category) => category.id));

  // A category id that no longer exists reads as no category (R-91).
  const categoryOf = (module: AssignableModuleView) =>
    module.categoryId !== null && known.has(module.categoryId)
      ? module.categoryId
      : null;

  const loose = props.modules.filter(
    (module) => categoryOf(module) === null
  ).length;

  const needle = query.trim().toLowerCase();

  // The refused row stays in view whatever the filters say, so its Retry cannot be hidden.
  const shown = props.modules.filter(
    (module) =>
      module.id === props.failed?.moduleId ||
      (!(onlyLoose && categoryOf(module) !== null) &&
        (module.displayName.toLowerCase().includes(needle) ||
          module.id.includes(needle)))
  );

  const items = [
    { value: null, label: "No category" },
    ...props.list.categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  const picker = (module: AssignableModuleView) => {
    const current = categoryOf(module);

    return (
      <div className="grid gap-1">
        <Select
          items={items}
          value={current}
          onValueChange={(value) => props.onAssign(module.id, value)}
        >
          <SelectTrigger
            aria-label={`Category for ${module.displayName}`}
            className="w-56 max-w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value ?? ""} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {props.failed?.moduleId === module.id ? (
          // The picker keeps the server's value, so a refused write never reads as saved.
          <p
            role="alert"
            className="flex flex-wrap items-center gap-x-1.5 text-xs text-destructive dark:text-destructive-on-dark"
          >
            Not saved. {props.failed.message} The row still reads{" "}
            {items.find((item) => item.value === current)?.label}.
            {props.onRetry ? (
              <Button variant="link" size="sm" onClick={props.onRetry}>
                Retry
              </Button>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <section
      aria-labelledby="assign-items"
      className="grid gap-3 rounded-xl border border-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="assign-items" className="text-base font-semibold">
          Assign items
        </h2>
        <CountPill>{loose} uncategorized</CountPill>
      </div>
      <p className="text-sm text-muted-foreground">
        Pick the category each module sits under. A module without one stands
        under Other. Filing a module never changes who can open it.
      </p>
      <div className="grid gap-2 sm:flex sm:items-center">
        <Input
          type="search"
          aria-label="Search modules"
          placeholder="Search modules"
          value={query}
          onValueChange={setQuery}
          className="sm:max-w-xs"
        />
        <div className="sm:w-56">
          <SwitchField
            label="Uncategorized only"
            checked={onlyLoose}
            onCheckedChange={setOnlyLoose}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {props.modules.length === 0
            ? "Nothing to file yet. A module with a workspace entry appears here."
            : "No module matches."}
        </p>
      ) : (
        <DataTable
          label="Modules to file"
          rows={shown}
          rowKey={(module) => module.id}
          rowLabel={(module) => module.displayName}
          columns={[
            {
              id: "module",
              header: "Module",
              cell: (module) => (
                <span className="flex flex-wrap items-center gap-2">
                  {module.displayName}
                  {offPill(module)}
                </span>
              ),
            },
            { id: "category", header: "Category", cell: picker },
          ]}
          card={{
            media: () => (
              <IconTile>
                <FolderIcon />
              </IconTile>
            ),
            title: (module) => module.displayName,
            badge: (module) => offPill(module),
            content: (module) => picker(module),
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">
        A module with no workspace entry is not listed, because it has nothing
        to place. A switched-off module can still be filed.
      </p>
    </section>
  );
}
