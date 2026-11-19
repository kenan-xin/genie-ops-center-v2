"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  iconLead,
  iconLeadPx,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  minTouchHeight,
} from "@genie/ui";
import {
  CheckIcon,
  ChevronDownIcon,
  type LucideIcon,
  PlusIcon,
  SaveIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import type { SavedView } from "../contract.ts";

const ORIGINAL = "Original";

/** The menu's value for Original; a view id is `v<n>`, so it cannot clash. */
const NONE = "";

/** One name rule for views: case and outer spaces do not count (P15-17). */
export const sameViewName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

type Action = {
  readonly label: string;
  readonly line: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
};

export type ViewMenuProps = {
  /** The menu, from 768 px, or the bottom sheet, on a phone. */
  readonly place: "bar" | "sheet";
  readonly views: readonly SavedView[];
  readonly defaultViewId: string | null;
  readonly viewId: string | null;
  readonly onSelect: (id: string | null) => void;
  /** Makes the selected row the default, Original included (czjw.192). */
  readonly onMakeDefault: () => void;
  readonly onRemove: () => void;
  /** Opens the Name dialog of Save view. */
  readonly onSaveView: () => void;
  /** Stores the current filters as Original: given only in edit mode, when they differ (czjw.192). */
  readonly onSaveAsOriginal?: (() => void) | undefined;
};

/** Two lines of a row: the name, and its explanation in muted text. */
function Lines(props: {
  readonly name: ReactNode;
  readonly line?: string | undefined;
}) {
  return (
    <span className="grid min-w-0 flex-1 text-left">
      <span>{props.name}</span>
      {props.line === undefined ? null : (
        <span className="text-xs text-muted-foreground">{props.line}</span>
      )}
    </span>
  );
}

const DefaultBadge = () => <Badge variant="success">Default</Badge>;

/**
 * The view switcher at the start of the filter bar, variant A (R-49a, S7-47, czjw.192): Original
 * and the saved views, then the actions on the selected one. A menu in the bar, the same content in
 * a bottom sheet on a phone.
 */
export function ViewMenu(props: ViewMenuProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected = props.views.find((view) => view.id === props.viewId);

  const name = selected?.name ?? ORIGINAL;

  // One default per person: Original when no view is (czjw.192).
  const defaultId = props.defaultViewId ?? NONE;
  const isDefault = (selected?.id ?? NONE) === defaultId;

  const actions: readonly Action[] = [
    ...(isDefault
      ? []
      : [
          {
            label: "Make default",
            line: `Open the dashboard with ${name}`,
            icon: StarIcon,
            onSelect: props.onMakeDefault,
          },
        ]),
    ...(selected === undefined
      ? []
      : [
          {
            label: "Delete view",
            line: "Undo restores it",
            icon: Trash2Icon,
            onSelect: props.onRemove,
            destructive: true,
          },
        ]),
    {
      label: "Save view",
      line: "Keeps the current filters under a name",
      icon: PlusIcon,
      onSelect: props.onSaveView,
    },
    ...(props.onSaveAsOriginal === undefined
      ? []
      : [
          {
            label: "Save as original",
            line: "Stores the current filters as Original",
            icon: SaveIcon,
            onSelect: props.onSaveAsOriginal,
          },
        ]),
  ];

  const choices = [
    { id: NONE, name: ORIGINAL, line: "The dashboard's own filters" },
    ...props.views.map((view) => ({
      id: view.id,
      name: view.name,
      line: undefined,
    })),
  ];

  const trigger = (
    <>
      <span className="text-muted-foreground">View:</span>
      <span className="truncate font-semibold">{name}</span>
      <ChevronDownIcon aria-hidden="true" />
    </>
  );

  /** A sheet row runs its action and closes the sheet, as a menu item closes the menu. */
  const inSheet = (run: () => void) => () => {
    setSheetOpen(false);
    run();
  };

  if (props.place === "bar") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="secondary" size="filter" className="max-w-64" />
            }
          >
            {trigger}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Views</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={props.viewId ?? NONE}
                onValueChange={(value: string) =>
                  props.onSelect(value === NONE ? null : value)
                }
              >
                {choices.map((choice) => (
                  <DropdownMenuRadioItem key={choice.id} value={choice.id}>
                    <Lines name={choice.name} line={choice.line} />
                    {choice.id === defaultId ? <DefaultBadge /> : null}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                variant={
                  action.destructive === true ? "destructive" : "default"
                }
                className="items-start"
                onClick={action.onSelect}
              >
                <action.icon
                  aria-hidden="true"
                  className={
                    action.icon === PlusIcon ? iconLeadPx[3] : undefined
                  }
                />
                <Lines name={action.label} line={action.line} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span aria-hidden="true" className="h-6 w-px bg-border" />
      </>
    );
  }

  // No wrapper: the trigger is a direct child of the phone's button group, which joins its corners.
  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="filter"
            className="min-w-0 flex-1"
          />
        }
      >
        {trigger}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Views</SheetTitle>
        </SheetHeader>
        <div className="grid overflow-y-auto px-2 pb-4">
          <ul className="grid">
            {choices.map((choice) => {
              const current = (props.viewId ?? NONE) === choice.id;

              return (
                <li key={choice.id}>
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    className={`flex ${minTouchHeight} w-full items-center rounded-md px-2 py-2 text-sm hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
                    onClick={inSheet(() =>
                      props.onSelect(choice.id === NONE ? null : choice.id)
                    )}
                  >
                    {/* C19-2: the check at the row end on the first line, as the menu's radio item draws it (C19-4). */}
                    <span className="flex min-w-0 flex-1 items-start gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <Lines name={choice.name} line={choice.line} />
                        {choice.id === defaultId ? <DefaultBadge /> : null}
                      </span>
                      <span className="flex h-lh w-4 shrink-0 items-center justify-center">
                        {current ? (
                          <CheckIcon aria-hidden="true" className="size-4" />
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="my-2 h-px bg-border" />
          <ul className="grid">
            {actions.map((action) => (
              <li key={action.label}>
                <button
                  type="button"
                  className={`flex ${minTouchHeight} w-full items-start gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${action.destructive === true ? "text-destructive" : ""}`}
                  onClick={inSheet(action.onSelect)}
                >
                  <action.icon
                    aria-hidden="true"
                    className={`size-4 shrink-0 ${action.icon === PlusIcon ? iconLeadPx[3] : iconLead}`}
                  />
                  <Lines name={action.label} line={action.line} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The Name dialog of Save view; the refusal shows inside it. On a saved view the field starts with
 * its name, and saving under that name updates the view (czjw.192). Mounted only while open.
 */
export function ViewNameDialog(props: {
  readonly views: readonly SavedView[];
  /** The selected view, whose own name is not taken. */
  readonly current?: SavedView | undefined;
  readonly saving: boolean;
  /** A refused save, shown in the dialog. */
  readonly refusal: ReactNode;
  readonly onSave: (name: string) => void;
  readonly onClose: () => void;
}) {
  const nameId = useId();
  const errorId = useId();
  const hintId = useId();
  const [name, setName] = useState(props.current?.name ?? "");
  const trimmed = name.trim();

  // The server refuses this too (P15-17); asking here keeps the person in the dialog with the reason.
  const taken =
    !(
      props.current !== undefined && sameViewName(trimmed, props.current.name)
    ) && props.views.some((view) => sameViewName(view.name, trimmed));

  const [shown, setShown] = useState(false);

  // A blank name is the form's own error; a taken one comes from the list above it.
  const [missing, setMissing] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShown(true);

    if (trimmed === "") {
      setMissing(true);

      return;
    }

    setMissing(false);

    if (!taken) props.onSave(trimmed);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <Input
              id={nameId}
              value={name}
              maxLength={40}
              autoComplete="off"
              aria-invalid={shown && (taken || missing) ? true : undefined}
              aria-describedby={
                [
                  props.current === undefined ? null : hintId,
                  shown && (taken || missing) ? errorId : null,
                ]
                  .filter((id) => id !== null)
                  .join(" ") || undefined
              }
              onValueChange={(value) => {
                setName(value);
                setShown(false);
                setMissing(false);
              }}
            />
            {props.current === undefined ? null : (
              <FieldDescription id={hintId}>
                {`Keep the name to update ${props.current.name}, or type a new name to save another view.`}
              </FieldDescription>
            )}
            {!shown ? null : missing ? (
              <FieldError id={errorId}>Enter a name.</FieldError>
            ) : taken ? (
              <FieldError id={errorId}>
                A view with this name exists. Choose another name.
              </FieldError>
            ) : null}
          </Field>
          {props.refusal}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={props.saving}>
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
