"use client";

import { FieldError, focusRing, Input } from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { Pencil } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { z } from "zod";

import { deckTitle } from "../contract.ts";
import { describedBy, issueOf } from "./slide-editor.tsx";

const renameFormSchema = z.object({ title: deckTitle });

export type DeckTitleProps = {
  readonly title: string;
  /** False while the agent drafts: it may still rename the deck (design, 2026-11-13). */
  readonly editable: boolean;
  /** The page owns it, so the hash a rename sends is the one it held when the input opened. */
  readonly editing: boolean;
  readonly saving: boolean;
  /** A refused save, such as the deck-changed line with its Reload; the input stays open. */
  readonly failure: ReactNode | null;
  readonly onEditingChange: (editing: boolean) => void;
  readonly onSave: (title: string) => void;
};

/** The text box in place of the title; it mounts on open, so it starts from the saved title. */
function TitleInput(props: DeckTitleProps) {
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const failureBox = useRef<HTMLDivElement>(null);
  // Escape unmounts the input, and its blur must not save what Escape dropped.
  const cancelled = useRef(false);
  // Safari and iOS do not focus a pressed button, so a blur toward Reload has no `relatedTarget`.
  const pressingFailure = useRef(false);

  const form = useForm({
    defaultValues: { title: props.title },
    validators: { onChange: renameFormSchema, onSubmit: renameFormSchema },
    onSubmit: ({ value }) => {
      const trimmed = value.title.trim();

      // A title that changes nothing spends no save and no Undo entry.
      if (trimmed === props.title) props.onEditingChange(false);
      else props.onSave(trimmed);
    },
  });

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      props.onEditingChange(false);
    } else if (event.key === "Enter") {
      event.preventDefault();

      if (!props.saving) void form.handleSubmit();
    }
  }

  /**
   * Leaving the input saves, as Enter does, so a phone without Escape can leave it (design). Focus
   * that moves into the refusal, such as onto Reload, does not resend the refused save.
   */
  function onBlur(event: FocusEvent<HTMLInputElement>) {
    if (cancelled.current || props.saving) return;

    const towardFailure =
      pressingFailure.current ||
      failureBox.current?.contains(event.relatedTarget) === true;

    pressingFailure.current = false;

    if (towardFailure) return;

    void form.handleSubmit();
  }

  return (
    <div className="grid w-md max-w-full gap-1">
      <form.Field name="title">
        {(field) => {
          const issue = issueOf(field.state.meta.errors);
          const show = issue !== undefined && field.state.meta.isTouched;

          return (
            <>
              {/* The input stays inside the page's one heading while the person types. */}
              <h1>
                <Input
                  ref={input}
                  aria-label="Deck title"
                  enterKeyHint="done"
                  readOnly={props.saving}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onKeyDown={onKeyDown}
                  onFocus={() => {
                    // A press in the refusal that blurred nothing must not skip a later blur.
                    pressingFailure.current = false;
                  }}
                  onBlur={(event) => {
                    field.handleBlur();
                    onBlur(event);
                  }}
                  aria-invalid={show ? true : undefined}
                  aria-describedby={describedBy(show ? errorId : undefined)}
                  size="lg"
                />
              </h1>
              {show ? <FieldError id={errorId}>{issue}</FieldError> : null}
            </>
          );
        }}
      </form.Field>
      <div
        ref={failureBox}
        onPointerDown={() => {
          pressingFailure.current = true;
        }}
      >
        {props.failure}
      </div>
    </div>
  );
}

/** The deck page's title, renamed in place (new deck flow, step 3). */
export function DeckTitle(props: DeckTitleProps): ReactNode {
  const button = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(props.editing);

  // A closed input hands focus back to the title, so the keyboard stays where it was. After a blur
  // the person already put focus elsewhere, and it stays there.
  useEffect(() => {
    const lost =
      document.activeElement === null ||
      document.activeElement === document.body;

    if (wasEditing.current && !props.editing && lost) button.current?.focus();

    wasEditing.current = props.editing;
  }, [props.editing]);

  if (!props.editable) {
    return <h1 className="text-xl font-bold">{props.title}</h1>;
  }

  if (props.editing) return <TitleInput {...props} />;

  return (
    <h1 className="text-xl font-bold">
      <button
        ref={button}
        type="button"
        aria-label={`Rename deck, ${props.title}`}
        onClick={() => props.onEditingChange(true)}
        className={`group -ml-1.5 cursor-text rounded-md px-1.5 py-0.5 text-left hover:bg-hover max-md:min-h-11 ${focusRing}`}
      >
        {props.title}
        <Pencil
          aria-hidden="true"
          strokeWidth={1.75}
          className="ml-1.5 inline size-4 align-middle text-muted-foreground group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:transition-opacity md:opacity-0"
        />
      </button>
    </h1>
  );
}
