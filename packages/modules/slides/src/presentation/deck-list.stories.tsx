import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  chatOffDeckList,
  deckList,
  emptyDeckList,
  noChatDeckList,
  readOnlyDeckList,
} from "./__fixtures__/decks.ts";
import { DeckList } from "./deck-list.tsx";
import type { DeckListView } from "./views.ts";

const listDecks = fn();

const createDeck = fn();

const deleteDeck = fn();

/** The chat's chart gate; these stories send no message, so it never runs. */
const chart = fn();

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
        client={{
          slides: { listDecks, createDeck, deleteDeck },
          agent: { chart },
        }}
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
          "The Slides list at `/m/slides/decks` (Spec 7 R-52). It shows only the signed-in person's own decks, the last changed first. New deck asks for a title; Delete asks first, because a deleted deck and its images cannot be undone. Beside the list, a person who may ask gets a chat that creates decks (R-46, D12): from 1024 px a 22rem column on the right, below that after the list. With AI off a note takes its place.",
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

/**
 * The chat beside the list, for a person who may ask while AI is on. No message is sent here; Plan
 * task 9 proves a chat create and the list refetch in a browser. At desktop the list keeps its
 * text unclipped beside the 22rem column.
 */
export const ChatOn: Story = {
  name: "Chat on",
  globals: desktop,
  beforeEach: () => serve(deckList),
  play: async ({ canvas }) => {
    const aside = canvas.getByRole("complementary", {
      name: "Chat about your decks",
    });

    await expect(aside.getBoundingClientRect().width).toBe(352);
    await expect(
      within(aside).getByRole("button", { name: "Send" })
    ).toBeVisible();

    const table = canvas.getByRole("table", { name: "Decks" });
    const column = table.parentElement;

    await expect(column?.scrollWidth).toBe(column?.clientWidth);
    await expect(
      table.getBoundingClientRect().right <= aside.getBoundingClientRect().left
    ).toBe(true);
  },
};

/**
 * Below 1024 px the chat follows the list. Its bottom space lets Send scroll clear of the shell's
 * fixed phone bar and the Ask bubble (S7-12 Task 9), so Send is the element at its own center.
 */
export const ChatOnPhone: Story = {
  name: "Chat on a phone",
  globals: phone,
  beforeEach: () => serve(deckList),
  play: async ({ canvas }) => {
    const aside = canvas.getByRole("complementary", {
      name: "Chat about your decks",
    });

    const send = within(aside).getByRole("button", { name: "Send" });

    await expect(
      Number.parseFloat(getComputedStyle(aside).paddingBottom)
    ).toBeGreaterThanOrEqual(80);

    send.scrollIntoView({ block: "center" });

    const box = send.getBoundingClientRect();

    await expect(window.innerWidth).toBe(390);
    await expect(
      send.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      )
    ).toBe(true);
  },
};

const chatOffPlay: Story["play"] = async ({ canvas }) => {
  await expect(
    canvas.getByText("Chat is off. You can still make a deck with New deck.")
  ).toBeVisible();
  await expect(canvas.queryByRole("complementary")).toBeNull();
};

/** AI is off for the deployment: a note in place of the chat, and New deck still works. */
export const ChatOff: Story = {
  name: "Chat off",
  args: { view: chatOffDeckList },
  globals: desktop,
  beforeEach: () => serve(chatOffDeckList),
  play: chatOffPlay,
};

export const ChatOffOnPhone: Story = {
  name: "Chat off on a phone",
  args: { view: chatOffDeckList },
  globals: phone,
  beforeEach: () => serve(chatOffDeckList),
  play: chatOffPlay,
};

const chatOffReader = { ...chatOffDeckList, canWrite: false };

// A person without slides:write has no New deck, so the note names none.
export const ChatOffReadOnly: Story = {
  name: "Chat off, read only",
  args: { view: chatOffReader },
  globals: desktop,
  beforeEach: () => serve(chatOffReader),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      /^Chat is off\.$/
    );
  },
};

const noChatPlay: Story["play"] = async ({ canvas }) => {
  await expect(canvas.queryByRole("complementary")).toBeNull();
  await expect(canvas.queryByText(/Chat is off/)).toBeNull();
};

/** A person who may not ask (no `core:ask:use`): no chat and no note. */
export const NoChat: Story = {
  name: "No chat",
  args: { view: noChatDeckList },
  globals: desktop,
  beforeEach: () => serve(noChatDeckList),
  play: noChatPlay,
};

export const NoChatOnPhone: Story = {
  name: "No chat on a phone",
  args: { view: noChatDeckList },
  globals: phone,
  beforeEach: () => serve(noChatDeckList),
  play: noChatPlay,
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

  const title = dialog.getByRole("textbox", { name: "Title" });

  // The form checks the contract's title schema: a blank title names its error, helper first.
  await userEvent.click(dialog.getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(title).toHaveAccessibleDescription(
      "Up to 80 characters. Give the deck a title."
    )
  );
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(createDeck).not.toHaveBeenCalled();

  await userEvent.type(title, "  Quarter review  ");
  await userEvent.click(dialog.getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(createDeck).toHaveBeenCalledWith({ title: "Quarter review" })
  );
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
