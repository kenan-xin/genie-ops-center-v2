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
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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

const DASHBOARD_FILTERS = "Dashboard filters";

/** The menu's value for "Dashboard filters"; a view id is `v<n>`, so it cannot clash. */
const NONE = "";

type Action = {
  readonly label: string;
  readonly line: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
};

export type ViewMenuProps = {
  readonly views: readonly SavedView[];
  readonly defaultViewId: string | null;
  readonly viewId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly onMakeDefault: () => void;
  readonly onRemove: () => void;
  readonly onSaveAsView: () => void;
  readonly onSaveAsDefault: () => void;
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
 * The view switcher at the start of the filter bar, variant A (R-49a, S7-47): the views, then the
 * actions on the selected one. A menu from 768 px, the same content in a bottom sheet below it.
 */
export function ViewMenu(props: ViewMenuProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected = props.views.find((view) => view.id === props.viewId);

  const isDefault =
    selected !== undefined && selected.id === props.defaultViewId;

  const actions: readonly Action[] = [
    ...(selected === undefined
      ? []
      : [
          isDefault
            ? {
                label: "Default view",
                line: `The dashboard opens with ${selected.name}`,
                icon: StarIcon,
                onSelect: props.onMakeDefault,
                disabled: true,
              }
            : {
                label: "Make default",
                line: `Open the dashboard with ${selected.name}`,
                icon: StarIcon,
                onSelect: props.onMakeDefault,
              },
          {
            label: "Remove view",
            line: "Undo restores it",
            icon: Trash2Icon,
            onSelect: props.onRemove,
            destructive: true,
          },
        ]),
    {
      label: "Save as view",
      line: "Keeps the current filters under a name",
      icon: PlusIcon,
      onSelect: props.onSaveAsView,
    },
    // Without a view the bar carries Save as default beside "Not saved as default".
    ...(selected === undefined
      ? []
      : [
          {
            label: "Save as default",
            line: "Stores these filters as the dashboard filters and clears the default view",
            icon: SaveIcon,
            onSelect: props.onSaveAsDefault,
          },
        ]),
  ];

  const choices = [
    {
      id: NONE,
      name: DASHBOARD_FILTERS,
      line: "The filters saved with Save as default",
    },
    ...props.views.map((view) => ({
      id: view.id,
      name: view.name,
      line: undefined,
    })),
  ];

  const trigger = (
    <>
      <span className="text-muted-foreground">View:</span>
      <span className="truncate font-semibold">
        {selected?.name ?? DASHBOARD_FILTERS}
      </span>
      <ChevronDownIcon aria-hidden="true" />
    </>
  );

  /** A sheet row runs its action and closes the sheet, as a menu item closes the menu. */
  const inSheet = (run: () => void) => () => {
    setSheetOpen(false);
    run();
  };

  return (
    <>
      <div className="hidden md:contents">
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
                    {choice.id === props.defaultViewId ? (
                      <DefaultBadge />
                    ) : null}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                disabled={action.disabled}
                variant={
                  action.destructive === true ? "destructive" : "default"
                }
                className="items-start"
                onClick={action.onSelect}
              >
                <action.icon aria-hidden="true" className="mt-0.5" />
                <Lines name={action.label} line={action.line} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span aria-hidden="true" className="h-6 w-px bg-border" />
      </div>

      <div className="contents md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button variant="secondary" size="filter" className="min-w-0" />
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
                        className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={inSheet(() =>
                          props.onSelect(choice.id === NONE ? null : choice.id)
                        )}
                      >
                        <CheckIcon
                          aria-hidden="true"
                          className={`size-4 shrink-0 ${current ? "" : "invisible"}`}
                        />
                        <Lines name={choice.name} line={choice.line} />
                        {choice.id === props.defaultViewId ? (
                          <DefaultBadge />
                        ) : null}
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
                      disabled={action.disabled}
                      className={`flex min-h-11 w-full items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:hover:bg-transparent ${action.destructive === true ? "text-destructive" : ""}`}
                      onClick={inSheet(action.onSelect)}
                    >
                      <action.icon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <Lines name={action.label} line={action.line} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

/**
 * The Name dialog of Save as view and Save as new view; the refusal shows inside it. Mounted only
 * while open, so each opening starts empty.
 */
export function ViewNameDialog(props: {
  readonly title: string;
  readonly views: readonly SavedView[];
  readonly saving: boolean;
  /** A refused save, shown in the dialog. */
  readonly refusal: ReactNode;
  readonly onSave: (name: string) => void;
  readonly onClose: () => void;
}) {
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const trimmed = name.trim();

  // The server refuses this too (P15-17); asking here keeps the person in the dialog with the reason.
  const taken = props.views.some(
    (view) => view.name.trim().toLowerCase() === trimmed.toLowerCase()
  );

  const [shown, setShown] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShown(true);

    if (trimmed !== "" && !taken) props.onSave(trimmed);
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
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <Input
              id={nameId}
              value={name}
              maxLength={40}
              autoComplete="off"
              aria-invalid={shown && taken ? true : undefined}
              aria-describedby={shown && taken ? errorId : undefined}
              onValueChange={(value) => {
                setName(value);
                setShown(false);
              }}
            />
            {shown && taken ? (
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
            <Button
              type="submit"
              disabled={trimmed === ""}
              loading={props.saving}
            >
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
