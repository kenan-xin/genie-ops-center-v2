"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Textarea,
} from "@genie/ui";
import { useDebouncer } from "@tanstack/react-pacer";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";

import { NOTES_CHARACTERS, NOTES_MESSAGES } from "../contract.ts";
import type { ShownSlide } from "./views.ts";

export const NOTES_PAUSE_MS = 800;

export type NotesFieldProps = {
  readonly slide: ShownSlide;
  /** Saves one notes step (null clears); the deck page owns the hash. A refusal throws. */
  readonly onSaveNotes: (
    slideId: string,
    notes: string | null
  ) => Promise<void>;
  /** Pause before a save; stories pass a short one. */
  readonly waitMs?: number | undefined;
};

const count = new Intl.NumberFormat("en-US");

/** The speaker notes of one slide: one save per pause, one at a time (S7-45). */
export function NotesField(props: NotesFieldProps): ReactElement {
  const { slide, onSaveNotes } = props;
  const id = useId();
  const helpId = useId();
  const countId = useId();
  const errorId = useId();
  const incoming = slide.notes ?? "";
  const [text, setText] = useState(incoming);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [writing, setWriting] = useState(0);
  // The value this field last sent, so its own answer never reads as an outside change.
  const lastSaved = useRef(incoming);
  // Each save waits for the one before it, so it reads the hash that one answered.
  const previous = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  // Queues the save and returns at once: an async debouncer would drop a pause queued while an
  // earlier save runs, because its finished run clears the shared pending arguments.
  function save(slideId: string, value: string): void {
    if (mounted.current) setWriting((n) => n + 1);

    previous.current = previous.current.then(async () => {
      const blank = value.trim() === "";
      const sent = blank ? "" : value;
      const before = lastSaved.current;

      if (sent === before) return;

      lastSaved.current = sent;

      try {
        await onSaveNotes(slideId, blank ? null : value);

        if (mounted.current) {
          setSaved(true);
          setFailure(null);
        }
      } catch (error) {
        lastSaved.current = before;

        if (mounted.current) {
          setSaved(false);
          setFailure(
            `The notes were not saved. ${error instanceof Error ? error.message : ""}`.trim()
          );
        }
      } finally {
        if (mounted.current) setWriting((n) => n - 1);
      }
    });
  }

  const debouncer = useDebouncer<typeof save, { isPending: boolean }>(
    save,
    // A slide switch or a closed sheet still saves the pending text, to the slide it was typed on.
    { wait: props.waitMs ?? NOTES_PAUSE_MS, onUnmount: (d) => d.flush() },
    (state) => ({ isPending: state.isPending })
  );

  const saving = debouncer.state.isPending || writing > 0;

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  // Undo, the agent or another tab changed the notes: show theirs, unless the person is mid-save.
  useEffect(() => {
    if (saving || incoming === lastSaved.current) return;

    lastSaved.current = incoming;
    setText(incoming);
    setSaved(false);
    setFailure(null);
  }, [incoming, saving]);

  const atCap = text.length >= NOTES_CHARACTERS;

  let status = "";

  if (saving) status = "Saving…";
  else if (saved) status = "Saved";

  return (
    <Field>
      <FieldLabel htmlFor={id}>Speaker notes</FieldLabel>
      <Textarea
        id={id}
        rows={5}
        maxLength={NOTES_CHARACTERS}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          debouncer.maybeExecute(slide.id, event.target.value);
        }}
        aria-invalid={failure === null ? undefined : true}
        aria-describedby={[helpId, countId, failure === null ? "" : errorId]
          .join(" ")
          .trim()}
      />
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span role="status">
          {atCap ? (
            <span className="font-semibold text-destructive">
              {NOTES_MESSAGES.cap}
            </span>
          ) : (
            status
          )}
        </span>
        <span id={countId} className="tabular-nums">
          {count.format(text.length)} / {count.format(NOTES_CHARACTERS)}
        </span>
      </div>
      <FieldDescription id={helpId}>
        Only you see these, in the presenter window. They go into the PowerPoint
        export.
      </FieldDescription>
      {failure === null ? null : (
        <FieldError id={errorId}>{failure}</FieldError>
      )}
    </Field>
  );
}
