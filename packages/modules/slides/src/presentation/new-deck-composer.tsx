"use client";

import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  focusRing,
  Textarea,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { z } from "zod";

/** The agent's message limit (`AGENT_LIMITS.messageCharacters`), which `agent.start` checks. */
const DESCRIPTION_LIMIT = 4000;

const descriptionSchema = z.object({
  description: z.string().trim().min(1).max(DESCRIPTION_LIMIT),
});

/** Starters that name no dataset: the module does not know which ones the deployment has. */
export const CHAT_SUGGESTIONS = [
  "Make a deck of this month's figures",
  "Make a deck of the latest records",
] as const;

// The agent panel's starter pill, without its arrow: a chip fills the box and sends nothing.
const chipClass = `inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3 text-start text-sm text-muted-foreground hover:border-input hover:bg-muted hover:text-foreground lg:min-h-8 ${focusRing}`;

/**
 * The inline New deck composer of the Slides list (S7-48): a description, two starters, Cancel and
 * Create deck. Enter creates and Shift and Enter start a new line, as in the agent composer. It
 * takes the focus when it opens.
 */
export function NewDeckComposer(props: {
  readonly saving: boolean;
  readonly failure: string | null;
  readonly onCancel: () => void;
  readonly onSubmit: (description: string) => void;
}): ReactNode {
  const boxId = useId();
  const helpId = useId();
  const hintId = useId();
  const box = useRef<HTMLTextAreaElement>(null);

  // `saving` arrives a render after the press, so a second quick press would start a second deck.
  const sent = useRef(false);

  useEffect(() => box.current?.focus(), []);

  // A refusal lets the person try again: the latch opens when saving ends or a failure shows,
  // also when a second refusal repeats the first one's message.
  useEffect(() => {
    if (!props.saving) sent.current = false;
  }, [props.saving, props.failure]);

  const form = useForm({
    defaultValues: { description: "" },
    validators: { onMount: descriptionSchema, onChange: descriptionSchema },
    // The validator does not hand back the trimmed value, so the description is trimmed here.
    onSubmit: ({ value }) => {
      sent.current = true;
      props.onSubmit(value.description.trim());
    },
  });

  const submit = () => {
    if (!props.saving && !sent.current) void form.handleSubmit();
  };

  return (
    <section
      aria-label="New deck"
      className="mb-4 rounded-xl border border-border bg-background p-4 md:px-5"
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <form.Field name="description">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={boxId}>What is the deck about?</FieldLabel>
              <Textarea
                ref={box}
                id={boxId}
                rows={4}
                maxLength={DESCRIPTION_LIMIT}
                placeholder="For example: a five-slide update on this month's collections for the finance team"
                aria-describedby={`${helpId} ${hintId}`}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;

                  event.preventDefault();
                  submit();
                }}
              />
              <FieldDescription id={helpId}>
                Ask names the deck and drafts the slides from your records. You
                can rename it and change any slide after.
              </FieldDescription>
              <div
                role="group"
                aria-label="Starters"
                className="flex flex-wrap gap-2"
              >
                {CHAT_SUGGESTIONS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={chipClass}
                    onClick={() => {
                      field.handleChange(chip);
                      box.current?.focus();
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </form.Field>
        {props.failure === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {props.failure}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* On a phone the hint stays the box's description only, as in the design. */}
          <p
            id={hintId}
            className="me-auto hidden text-xs text-muted-foreground md:block"
          >
            Enter creates. Shift and Enter start a new line.
          </p>
          {/* The page opens the deck once it exists, so a Cancel while it is created changes nothing. */}
          <Button
            type="button"
            variant="ghost"
            className="max-md:flex-1"
            disabled={props.saving}
            onClick={props.onCancel}
          >
            Cancel
          </Button>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                loading={props.saving}
                disabled={!canSubmit && !props.saving}
                className="max-md:flex-1"
              >
                Create deck
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </section>
  );
}
