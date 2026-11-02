"use client";

import { AgentPanel } from "@genie/core/features/agent";
import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableAction,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  InfoNote,
  Input,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { z } from "zod";

import { deckTitle, type DeckSummary, slidesContract } from "../contract.ts";
import { describedBy, issueOf } from "./slide-editor.tsx";
import { decksQueryKey } from "./use-deck.ts";
import type { DeckListView } from "./views.ts";

const newDeckSchema = z.object({ title: deckTitle });

/** The New deck dialog's form, with the contract's title schema (CLAUDE.md, Forms). */
function NewDeckForm(props: {
  readonly saving: boolean;
  readonly failure: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (title: string) => void;
}) {
  const titleId = useId();
  const helpId = useId();
  const errorId = useId();
  const [attempted, setAttempted] = useState(false);

  const form = useForm({
    defaultValues: { title: "" },
    validators: {
      onMount: newDeckSchema,
      onChange: newDeckSchema,
      onSubmit: newDeckSchema,
    },
    onSubmitInvalid: () => setAttempted(true),
    // The validator does not hand back the trimmed value, so the title is trimmed here.
    onSubmit: ({ value }) => props.onSubmit(value.title.trim()),
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="title">
        {(field) => {
          const issue = issueOf(field.state.meta.errors);

          const show =
            issue !== undefined && (attempted || field.state.meta.isTouched);

          return (
            <Field>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                id={titleId}
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                aria-invalid={show ? true : undefined}
                aria-describedby={describedBy(
                  helpId,
                  show ? errorId : undefined
                )}
              />
              <FieldDescription id={helpId}>
                Up to 80 characters.
              </FieldDescription>
              {show ? <FieldError id={errorId}>{issue}</FieldError> : null}
            </Field>
          );
        }}
      </form.Field>
      {props.failure === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {props.failure}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={props.saving}>
          Create
        </Button>
      </DialogFooter>
    </form>
  );
}

const slideText = (count: number) =>
  `${count} ${count === 1 ? "slide" : "slides"}`;

const hrefOf = (id: string) => `/m/slides/decks/${id}`;

export type DeckListProps = {
  readonly view: DeckListView;
};

/**
 * The Slides list: the owner's own decks, with create and delete (R-52), and the chat that creates
 * decks beside it (R-46, D12). Delete is the inverse of a chat create.
 */
export function DeckList(props: DeckListProps) {
  const { view } = props;
  const slides = useModuleClient(slidesContract);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(
    null
  );

  const decks = useQuery({
    queryKey: decksQueryKey(),
    queryFn: () => slides.listDecks(),
    initialData: [...view.decks],
  });

  const create = useMutation({
    mutationFn: (title: string) => slides.createDeck({ title }),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: decksQueryKey() });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => slides.deleteDeck({ id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: decksQueryKey() }),
  });

  const columns: readonly DataTableColumn<DeckSummary>[] = [
    {
      id: "title",
      header: "Title",
      cell: (row) => <PageLink href={hrefOf(row.id)}>{row.title}</PageLink>,
    },
    {
      id: "slides",
      header: "Slides",
      cell: (row) => slideText(row.slideCount),
      align: "end",
    },
  ];

  const actions = view.canWrite
    ? (row: DeckSummary): readonly DataTableAction[] => [
        {
          label: "Delete",
          danger: true,
          onSelect: () => setConfirm({ id: row.id, title: row.title }),
        },
      ]
    : undefined;

  return (
    <main>
      <PageHeader
        title="Slides"
        description="Your own decks of slides. Only you can open them."
        actions={
          view.canWrite ? (
            <Button
              onClick={() => {
                create.reset();
                setCreating(true);
              }}
            >
              New deck
            </Button>
          ) : undefined
        }
      />

      {/* From lg the chat is a 22rem column (w-88) right of the list; below lg it follows it. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:flex-1">
          {remove.error === null ? null : (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {remove.error.message === ""
                ? "The deck was not deleted."
                : remove.error.message}
            </p>
          )}

          {decks.data.length === 0 ? (
            <EmptyState
              variant="framed"
              title="No decks yet"
              description="Create a deck by chat beside this list, or start one with New deck."
            />
          ) : (
            <DataTable
              label="Decks"
              rows={decks.data}
              rowKey={(row) => row.id}
              rowLabel={(row) => row.title}
              columns={columns}
              card={{
                title: (row) => (
                  <PageLink href={hrefOf(row.id)}>{row.title}</PageLink>
                ),
                facts: (row) => [slideText(row.slideCount)],
              }}
              {...(actions === undefined ? {} : { actions })}
            />
          )}
        </div>
        {view.chat.kind === "on" ? (
          <aside
            aria-label="Chat about your decks"
            // The bottom space lets the composer scroll clear of the fixed phone bar and the bubble.
            className="min-w-0 max-lg:pb-20 lg:w-88 lg:shrink-0 lg:pb-0"
          >
            <AgentPanel
              models={view.chat.models}
              labels={view.chat.labels}
              suggestions={view.chat.suggestions}
              timeZone={view.timeZone}
              newChatHref="/m/slides/decks"
              // A chat create adds a deck; the list reads it at once.
              onFinished={() =>
                void queryClient.invalidateQueries({
                  queryKey: decksQueryKey(),
                })
              }
            />
          </aside>
        ) : null}
        {view.chat.kind === "off" ? (
          <div className="lg:w-88 lg:shrink-0">
            <InfoNote size="md" role="status">
              {view.canWrite
                ? "Chat is off. You can still make a deck with New deck."
                : "Chat is off."}
            </InfoNote>
          </div>
        ) : null}
      </div>

      <Dialog
        open={creating}
        onOpenChange={(next) => {
          setCreating(next);

          if (!next) create.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New deck</DialogTitle>
          </DialogHeader>
          <NewDeckForm
            saving={create.isPending}
            failure={create.error?.message ?? null}
            onClose={() => setCreating(false)}
            onSubmit={(title) => create.mutate(title)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        title={`Delete ${confirm?.title ?? ""}?`}
        description="The deck, its images and its export are removed for good. Undo cannot bring them back."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirm !== null) remove.mutate(confirm.id);

          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </main>
  );
}
