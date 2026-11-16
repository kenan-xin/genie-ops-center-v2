import { CORE_ERROR_MESSAGES } from "@genie/core/errors";
import {
  AgentButton,
  AgentPanelHost,
  resetAgentPanel,
} from "@genie/core/features/agent/panel";
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

/** `agent.start`, which makes the deck and its run when chat is on (S7-48). */
const start = fn();

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
          agent: { chart, start, messages: async () => [] },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

/** The shell's agent panel and its button beside the page, as the app mounts them. */
function withAgentPanel(Story: () => ReactNode) {
  return (
    <>
      <AgentButton />
      <Story />
      <AgentPanelHost
        person="person-1"
        models={null}
        labels={{ steps: {}, datasets: {}, fields: {} }}
        suggestions={[]}
        inbox={[]}
        timeZone="UTC"
      />
    </>
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
          "The Slides list at `/m/slides/decks` (Spec 7 R-52). It shows only the signed-in person's own decks, the last changed first. With chat on, New deck opens a composer under the header that starts the agent on a new deck from a description (S7-48); with chat off it asks for a title. Delete asks first, because a deleted deck and its images cannot be undone. Beside the list, a person who may ask gets a chat that creates decks (R-46, D12): from 1024 px a 22rem column on the right, below that after the list. With AI off a note takes its place.",
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
  resetAgentPanel();
  listDecks.mockReset().mockResolvedValue([...view.decks]);
  createDeck.mockReset();
  deleteDeck.mockReset().mockResolvedValue({ id: "deck-1" });
  // A start that answers would leave the story for the deck page, so it never answers here.
  start.mockReset().mockImplementation(() => new Promise(() => {}));
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

/** The panel opens with the list's own suggestions and the page name as its page line (R-46, D12). */
const chatOnPlay: Story["play"] = async ({ canvas }) => {
  await expect(screen.queryByRole("region", { name: "Ask" })).toBeNull();
  await userEvent.click(canvas.getByRole("button", { name: "Ask" }));

  const chat = await screen.findByRole("region", { name: "Ask" });

  // The sheet slides in on a phone, so the chip shows once its opening transition ends.
  await waitFor(() =>
    expect(
      within(chat).getByRole("button", {
        name: "Make a deck of this month's figures",
      })
    ).toBeVisible()
  );
  await expect(chat).toHaveTextContent("This page: Slides");
};

/**
 * The shell's agent panel beside the list, for a person who may ask while AI is on (R-46, D12).
 * It starts closed; the Agent button opens it. No message is sent here; `slides.spec.ts` proves a
 * chat create and the list refetch in a browser.
 */
export const ChatOn: Story = {
  name: "Chat on",
  globals: desktop,
  decorators: [withAgentPanel],
  beforeEach: () => serve(deckList),
  play: chatOnPlay,
};

export const ChatOnPhone: Story = {
  name: "Chat on a phone",
  globals: phone,
  decorators: [withAgentPanel],
  beforeEach: () => serve(deckList),
  play: chatOnPlay,
};

const chatOffPlay: Story["play"] = async ({ canvas }) => {
  await expect(
    canvas.getByText("AI is off. You can still make a deck with New deck.")
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
    await expect(canvas.getByRole("status")).toHaveTextContent(/^AI is off\.$/);
  },
};

const noChatPlay: Story["play"] = async ({ canvas }) => {
  await expect(canvas.queryByRole("complementary")).toBeNull();
  await expect(canvas.queryByText(/AI is off/)).toBeNull();
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

const describeBox = (
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]
) => canvas.getByRole("textbox", { name: "What is the deck about?" });

/** Opens the composer: it takes New deck's place and holds the focus. */
async function openComposer(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]
) {
  await userEvent.click(canvas.getByRole("button", { name: "New deck" }));
  await expect(canvas.getByRole("region", { name: "New deck" })).toBeVisible();
  await expect(canvas.queryByRole("button", { name: "New deck" })).toBeNull();
  await expect(describeBox(canvas)).toHaveFocus();
}

// Bug caught: two quick Enter presses or a double click start two decks.
const newDeckPlay: Story["play"] = async ({ canvas }) => {
  await openComposer(canvas);
  await userEvent.type(describeBox(canvas), "Board update");
  await userEvent.keyboard("{Enter}{Enter}");
  await userEvent.dblClick(canvas.getByRole("button", { name: "Create deck" }));

  await expect(start).toHaveBeenCalledOnce();
  await expect(start).toHaveBeenCalledWith({
    surface: "slides",
    description: "Board update",
  });
  await expect(createDeck).not.toHaveBeenCalled();
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

// Bug caught: Cancel leaves the focus on the page body, so a keyboard user starts over from the top.
export const CancelRestoresNewDeck: Story = {
  name: "Cancel restores New deck",
  globals: desktop,
  beforeEach: () => serve(deckList),
  play: async ({ canvas }) => {
    await openComposer(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));

    await expect(canvas.queryByRole("region", { name: "New deck" })).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "New deck" })
    ).toHaveFocus();
  },
};

const REFUSAL = CORE_ERROR_MESSAGES["agent-run-limit"];

// Bug caught: a refused start is silent, Enter stays dead after the same refusal, or its message stays after Cancel.
export const NewDeckRefused: Story = {
  name: "New deck refused",
  globals: desktop,
  beforeEach: () => {
    serve(deckList);
    start.mockRejectedValue(new Error(REFUSAL));
  },
  play: async ({ canvas }) => {
    await openComposer(canvas);
    await userEvent.type(describeBox(canvas), "Board update{Enter}");

    await expect(await canvas.findByRole("alert")).toHaveTextContent(REFUSAL);
    await expect(describeBox(canvas)).toHaveValue("Board update");

    // The same message again, so a reset that waits for a new message fails here.
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(REFUSAL);

    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await openComposer(canvas);
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

// Bug caught: a person without chat loses New deck. The title dialog and createDeck stay.
const newDeckChatOffPlay: Story["play"] = async ({ canvas }) => {
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
  await expect(start).not.toHaveBeenCalled();
};

export const NewDeckChatOff: Story = {
  name: "New deck, chat off",
  args: { view: chatOffDeckList },
  globals: desktop,
  beforeEach: () => serve(chatOffDeckList),
  play: newDeckChatOffPlay,
};

export const NewDeckChatOffOnPhone: Story = {
  name: "New deck, chat off, on a phone",
  args: { view: chatOffDeckList },
  globals: phone,
  beforeEach: () => serve(chatOffDeckList),
  play: newDeckChatOffPlay,
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
