import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  deckList,
  emptyDeckList,
  readOnlyDeckList,
} from "./__fixtures__/decks.ts";
import { DeckList } from "./deck-list.tsx";
import type { DeckListView } from "./views.ts";

const listDecks = fn();

const createDeck = fn();

const deleteDeck = fn();

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** A fresh query cache per story, with no retries so a refusal reports at once. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider
        client={{ slides: { listDecks, createDeck, deleteDeck } }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Slides/Decks list",
  component: DeckList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Slides list at `/m/slides/decks` (Spec 7 R-52). It shows only the signed-in person's own decks, the last changed first. New deck asks for a title; Delete asks first, because a deleted deck and its images cannot be undone.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: deckList },
} satisfies Meta<typeof DeckList>;

export default meta;

type Story = StoryObj<typeof meta>;

function serve(view: DeckListView) {
  listDecks.mockReset().mockResolvedValue([...view.decks]);
  createDeck.mockReset();
  deleteDeck.mockReset().mockResolvedValue({ id: "deck-1" });
}

export const Default: Story = {
  globals: desktop,
  beforeEach: () => serve(deckList),
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Decks" }));

    await expect(
      table.getByRole("link", { name: "Receivables at a glance" })
    ).toBeVisible();
    await expect(table.getByRole("link", { name: "Cash in" })).toBeVisible();
  },
};

export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  beforeEach: () => serve(deckList),
  play: async ({ canvas }) => {
    const list = within(canvas.getByRole("list", { name: "Decks" }));

    await expect(
      list.getByRole("link", { name: "Receivables at a glance" })
    ).toBeVisible();
  },
};

export const Empty: Story = {
  args: { view: emptyDeckList },
  globals: desktop,
  beforeEach: () => serve(emptyDeckList),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No decks yet")).toBeVisible();
    await expect(
      canvas.getByText(
        "Create a deck by chat beside this list, or start one with New deck."
      )
    ).toBeVisible();
  },
};

export const EmptyOnPhone: Story = {
  name: "Empty on a phone",
  args: { view: emptyDeckList },
  globals: phone,
  beforeEach: () => serve(emptyDeckList),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No decks yet")).toBeVisible();
  },
};

// Without slides:write there is no New deck and no per-row menu.
export const ReadOnly: Story = {
  name: "Read only",
  args: { view: readOnlyDeckList },
  globals: desktop,
  beforeEach: () => serve(readOnlyDeckList),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "New deck" })).toBeNull();
    await expect(
      canvas.queryByRole("button", {
        name: "Actions for Receivables at a glance",
      })
    ).toBeNull();
  },
};

export const ReadOnlyOnPhone: Story = {
  name: "Read only on a phone",
  args: { view: readOnlyDeckList },
  globals: phone,
  beforeEach: () => serve(readOnlyDeckList),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "New deck" })).toBeNull();
  },
};

const newDeckPlay: Story["play"] = async ({ canvas }) => {
  await userEvent.click(canvas.getByRole("button", { name: "New deck" }));

  const dialog = within(
    await screen.findByRole("dialog", { name: "New deck" })
  );

  // The popup enters with a transition, so wait for the field it focuses.
  await waitFor(() =>
    expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible()
  );
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
};

export const NewDeck: Story = {
  name: "New deck",
  globals: desktop,
  beforeEach: () => serve(deckList),
  play: newDeckPlay,
};

export const NewDeckOnPhone: Story = {
  name: "New deck on a phone",
  globals: phone,
  beforeEach: () => serve(deckList),
  play: newDeckPlay,
};

// B4.6: Delete asks first and names the deck; Cancel keeps the row, Delete sends the call.
const deletePlay: Story["play"] = async ({ canvas }) => {
  await userEvent.click(
    canvas.getByRole("button", { name: "Actions for Receivables at a glance" })
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Delete" })
  );

  const confirm = within(
    await screen.findByRole("dialog", {
      name: "Delete Receivables at a glance?",
    })
  );

  await waitFor(() =>
    expect(confirm.getByText(/removed for good/)).toBeVisible()
  );
  await userEvent.click(confirm.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await expect(
    canvas.getByRole("link", { name: "Receivables at a glance" })
  ).toBeVisible();

  await userEvent.click(
    canvas.getByRole("button", { name: "Actions for Receivables at a glance" })
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Delete" })
  );
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Delete",
    })
  );

  await waitFor(() =>
    expect(
      canvas.queryByRole("link", { name: "Receivables at a glance" })
    ).toBeNull()
  );
  await expect(deleteDeck).toHaveBeenCalledWith({ id: "deck-1" });
};

export const Delete: Story = {
  globals: desktop,
  beforeEach: () => {
    serve(deckList);
    deleteDeck.mockImplementation(async ({ id }: { readonly id: string }) => {
      listDecks.mockResolvedValue(
        deckList.decks.filter((row) => row.id !== id)
      );

      return { id };
    });
  },
  play: deletePlay,
};

export const DeleteOnPhone: Story = {
  name: "Delete on a phone",
  globals: phone,
  beforeEach: () => {
    serve(deckList);
    deleteDeck.mockImplementation(async ({ id }: { readonly id: string }) => {
      listDecks.mockResolvedValue(
        deckList.decks.filter((row) => row.id !== id)
      );

      return { id };
    });
  },
  play: deletePlay,
};
