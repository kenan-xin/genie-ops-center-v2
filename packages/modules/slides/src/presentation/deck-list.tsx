"use client";

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

/** The Slides list: the owner's own decks, with create and delete (R-52). */
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
