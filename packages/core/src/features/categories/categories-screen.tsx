"use client";

import { Button, ConfirmDialog, CountPill, focusRing, Input } from "@genie/ui";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState } from "react";

import { AssignItems } from "./assign-items.tsx";
import type { CategoriesScreenProps, CategoryRowView } from "./types.ts";

const modules = (count: number) =>
  `${count} ${count === 1 ? "module" : "modules"}`;

function RenameField(props: {
  readonly category: CategoryRowView;
  readonly onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(props.category.name);
  // Enter or Escape ends the edit; the blur that follows the unmount must not end it twice.
  const ended = useRef(false);

  const end = (name: string | null) => {
    if (ended.current) return;
    ended.current = true;
    props.onDone(name);
  };

  const commit = () => {
    const name = value.trim();

    end(name === "" || name === props.category.name ? null : name);
  };

  return (
    <Input
      autoFocus
      aria-label="Category name"
      maxLength={80}
      value={value}
      onValueChange={setValue}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();

        if (event.key === "Escape") end(null);
      }}
      className="min-w-0 flex-1 sm:max-w-sm"
    />
  );
}

export function CategoriesScreen(props: CategoriesScreenProps) {
  const { categories } = props.list;
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // The dialog keeps its category while closed, so its title does not blank during the exit.
  const [confirm, setConfirm] = useState({ id: "", open: false });

  const confirming = categories.find((category) => category.id === confirm.id);

  const closeConfirm = () =>
    setConfirm((current) => ({ ...current, open: false }));

  const create = () => {
    const trimmed = name.trim();

    if (trimmed === "") return;
    props.onCreate(trimmed);
    setName("");
  };

  const move = (from: number, to: number) => {
    if (props.reordering || to < 0 || to >= categories.length || from === to)
      return;
    const ids = categories.map((category) => category.id);

    ids.splice(to, 0, ...ids.splice(from, 1));
    props.onReorder(ids);
  };

  const indexOf = (id: string) =>
    categories.findIndex((category) => category.id === id);

  return (
    <div className="grid gap-4">
      <p className="max-w-prose text-sm text-pretty text-muted-foreground">
        A category groups what people already see. It never grants access. Who
        can open a module is set in Roles.
      </p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <Input
          aria-label="New category name"
          placeholder="New category, for example Operations"
          maxLength={80}
          value={name}
          onValueChange={setName}
        />
        <Button type="submit" disabled={name.trim() === ""}>
          <PlusIcon aria-hidden="true" />
          Add
        </Button>
      </form>

      {props.error !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      ) : props.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading categories…
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-border">
            <ul aria-label="Categories" className="divide-y divide-border">
              {categories.map((category, index) => (
                <li
                  key={category.id}
                  aria-label={category.name}
                  draggable={editing !== category.id}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    // Firefox starts no drag without data.
                    event.dataTransfer.setData("text/plain", category.id);
                    setDragId(category.id);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();

                    if (dragId !== null) move(indexOf(dragId), index);
                    setDragId(null);
                  }}
                  onDragEnd={() => setDragId(null)}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:flex-nowrap ${dragId === category.id ? "opacity-40" : ""}`}
                >
                  <GripVerticalIcon
                    aria-hidden="true"
                    className="size-4 cursor-grab text-muted-foreground"
                  />
                  <span className="flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${category.name} up`}
                      // Focusable when disabled, so a move to the end does not drop focus to the page.
                      disabled={props.reordering || index === 0}
                      focusableWhenDisabled
                      onClick={() => move(index, index - 1)}
                    >
                      <ChevronUpIcon aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${category.name} down`}
                      disabled={
                        props.reordering || index === categories.length - 1
                      }
                      focusableWhenDisabled
                      onClick={() => move(index, index + 1)}
                    >
                      <ChevronDownIcon aria-hidden="true" />
                    </Button>
                  </span>
                  {editing === category.id ? (
                    <RenameField
                      category={category}
                      onDone={(next) => {
                        if (next !== null) props.onRename(category.id, next);
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditing(category.id)}
                      className={`min-h-11 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-sm font-semibold hover:bg-muted ${focusRing}`}
                    >
                      <span className="sr-only">Rename </span>
                      {category.name}
                    </button>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <CountPill>{modules(category.moduleCount)}</CountPill>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${category.name}`}
                      onClick={() =>
                        setConfirm({ id: category.id, open: true })
                      }
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              ))}
              {/* Fixed: it gathers every ungrouped module and cannot be renamed, moved or deleted. */}
              <li
                aria-label="Other"
                className="flex min-h-15 items-center gap-2 bg-muted/50 px-3 py-2"
              >
                <span className="flex-1 px-2 text-sm font-semibold text-muted-foreground sm:pl-26">
                  Other
                </span>
                <CountPill>{modules(props.list.ungroupedCount)}</CountPill>
                <span className="size-11 lg:size-10" />
              </li>
            </ul>
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              Drag or use the arrows to reorder. Select a name to rename it.
              Deleting a category leaves its modules under Other; nothing else
              is removed.
            </p>
          </div>

          <AssignItems
            list={props.list}
            modules={props.modules}
            onAssign={props.onAssign}
            failed={props.failed}
            onRetry={props.onRetry}
          />
        </>
      )}

      <ConfirmDialog
        open={confirm.open && confirming !== undefined}
        title={`Delete ${confirming?.name ?? ""}?`}
        description={`${modules(confirming?.moduleCount ?? 0)} ${confirming?.moduleCount === 1 ? "becomes" : "become"} ungrouped, and solutions in this category lose their heading. Nothing is deleted with it.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirming) props.onDelete(confirming.id);
          closeConfirm();
        }}
        onClose={closeConfirm}
      />
    </div>
  );
}
