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
  FieldLabel,
  InfoNote,
  Input,
} from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { type DeckSummary, slidesContract } from "../contract.ts";
import { decksQueryKey } from "./use-deck.ts";
import type { DeckListView } from "./views.ts";

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
  const titleId = useId();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(
    null
  );

  const decks = useQuery({
    queryKey: decksQueryKey(),
    queryFn: () => slides.listDecks(),
    initialData: [...view.decks],
  });

  const create = useMutation({
    mutationFn: (deckTitle: string) => slides.createDeck({ title: deckTitle }),
    onSuccess: () => {
      setCreating(false);
      setTitle("");
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
                setTitle("");
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
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();

              const trimmed = title.trim();

              if (trimmed !== "") create.mutate(trimmed);
            }}
          >
            <Field>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                id={titleId}
                value={title}
                maxLength={80}
                onValueChange={setTitle}
              />
            </Field>
            {create.error === null ? null : (
              <p role="alert" className="text-sm text-destructive">
                {create.error.message}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={title.trim() === ""}
                loading={create.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </form>
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
