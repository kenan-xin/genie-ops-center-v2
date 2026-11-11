import { ModuleClientProvider } from "@genie/core/rpc/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  deckPage,
  textOnlySlide,
  textWithChartSlide,
} from "./__fixtures__/decks.ts";
import { SlideEditor } from "./slide-editor.tsx";
import { useDeckChange } from "./use-deck.ts";
import type { ShownSlide } from "./views.ts";

const readDeck = fn();

const changeDeck = fn();

const uploadDeckImage = fn();

const save = fn();

const close = fn();

const upload = fn();

const saveNotes = fn();

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
        client={{ slides: { readDeck, changeDeck, uploadDeckImage } }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

/** The sheet the deck page puts the editor in. */
function SheetFrame(props: { readonly children: ReactNode }) {
  return (
    <Sheet open>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Edit slide</SheetTitle>
          <SheetDescription>
            Change the words of this slide. Its stored figures stay as they are.
          </SheetDescription>
        </SheetHeader>
        {props.children}
      </SheetContent>
    </Sheet>
  );
}

const meta = {
  title: "Modules/Slides/Slide editor",
  component: SlideEditor,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The hand edit of one slide, in a sheet from the deck page (Spec 7 R-52, R-53, R-54). The title is the slide's one claim. A data element keeps the chart and data the deck froze; the editor never reads a figure again. An image is uploaded to the deck first, then it needs alt text.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: {
    slide: textWithChartSlide,
    onSave: save,
    onClose: close,
    onUpload: upload,
    onSaveNotes: saveNotes,
  },
  render: (args) => (
    <SheetFrame>
      <SlideEditor {...args} />
    </SheetFrame>
  ),
} satisfies Meta<typeof SlideEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

const FILE_ID = "9f1c2f7e-6a1e-4b8a-9d2f-3c4b5a6d7e8f";

function reset() {
  readDeck.mockReset().mockResolvedValue(deckPage.deck);
  changeDeck.mockReset().mockResolvedValue(deckPage.deck);
  uploadDeckImage.mockReset().mockResolvedValue({ fileId: FILE_ID });
  save.mockReset();
  close.mockReset();
  upload.mockReset().mockResolvedValue(FILE_ID);
}

async function editor() {
  return within(await screen.findByRole("dialog", { name: "Edit slide" }));
}

export const TextSlide: Story = {
  args: { slide: textOnlySlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await expect(sheet.getByRole("textbox", { name: "Title" })).toBeVisible();
    await expect(
      sheet.getByRole("textbox", { name: "Title" })
    ).toHaveAccessibleDescription(
      "State the finding of this slide in one sentence."
    );
    await expect(sheet.getByRole("textbox", { name: "Text" })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Save slide" })
    ).toBeVisible();
  },
};

export const ChartSlide: Story = {
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await expect(sheet.getByText("Invoiced by month")).toBeVisible();
    await expect(sheet.getAllByRole("button", { name: "Remove" })).toHaveLength(
      1
    );
  },
};

export const ChartSlideOnPhone: Story = {
  name: "Chart slide on a phone",
  globals: phone,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await expect(
      sheet.getByRole("button", { name: "Save slide" })
    ).toBeVisible();
  },
};

/** The deck page's real save path, at the fixture's shown hash (R-53). */
function ChangeHarness(props: {
  readonly onUpload: (file: File) => Promise<string>;
}) {
  const change = useDeckChange(deckPage.deck);

  return (
    <SheetFrame>
      <SlideEditor
        slide={textWithChartSlide}
        saving={change.isPending}
        onSaveNotes={saveNotes}
        onClose={close}
        onUpload={props.onUpload}
        onSave={(slide) =>
          change.mutate({
            expectedHash: deckPage.deck.contentHash,
            changes: [
              { op: "change-slide", slideId: textWithChartSlide.id, slide },
            ],
          })
        }
      />
    </SheetFrame>
  );
}

const HASH = deckPage.deck.contentHash;

/** The hand save states every element's box and style, `null` where it has none (czjw.157). */
const unplaced = { box: null, style: null };

const titleElement = textWithChartSlide.elements[0];

const textElement = textWithChartSlide.elements[1];

const chartElement = textWithChartSlide.elements[2];

if (
  titleElement?.kind !== "title" ||
  textElement?.kind !== "text" ||
  chartElement === undefined ||
  !("chart" in chartElement)
) {
  throw new Error("the chart slide fixture lost its elements");
}

// B6.1: editing only the title sends one change-slide, the stored chart unchanged, at the shown
// hash. An extra `data` on the chart fails the exact call assertion.
export const SaveKeepsChart: Story = {
  name: "Save keeps the chart",
  globals: desktop,
  beforeEach: reset,
  render: () => (
    <ChangeHarness onUpload={async () => Promise.resolve(FILE_ID)} />
  ),
  play: async () => {
    const sheet = await editor();
    const title = sheet.getByRole("textbox", { name: "Title" });

    await userEvent.clear(title);
    await userEvent.type(title, "Collections beat the plan line");
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
      changes: [
        {
          op: "change-slide",
          slideId: "s2",
          slide: {
            elements: [
              {
                kind: "title",
                text: "Collections beat the plan line",
                ...unplaced,
              },
              { kind: "text", text: textElement.text, ...unplaced },
              { kind: "chart", chart: chartElement.chart, ...unplaced },
            ],
          },
        },
      ],
    });
  },
};

function UploadHarness() {
  const change = useDeckChange(deckPage.deck);

  return (
    <SheetFrame>
      <SlideEditor
        slide={textWithChartSlide}
        saving={change.isPending}
        onSaveNotes={saveNotes}
        onClose={close}
        onUpload={async (file) => {
          const { fileId } = await uploadDeckImage({ id: "deck-1", file });

          return fileId;
        }}
        onSave={(slide) =>
          change.mutate({
            expectedHash: deckPage.deck.contentHash,
            changes: [
              { op: "change-slide", slideId: textWithChartSlide.id, slide },
            ],
          })
        }
      />
    </SheetFrame>
  );
}

const PDF = new File(["%PDF-1.4"], "report.pdf", { type: "application/pdf" });

const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "chart.png", {
  type: "image/png",
});

// B6.6: a PDF is refused; a PNG needs alt text before Save sends its uploaded id.
export const UploadImage: Story = {
  name: "Upload an image",
  globals: desktop,
  beforeEach: reset,
  render: () => <UploadHarness />,
  play: async () => {
    const sheet = await editor();
    const picker = sheet.getByLabelText("Add image");

    await userEvent.upload(picker, PDF, { applyAccept: false });
    await expect(
      await sheet.findByText("Upload a PNG or JPEG image.")
    ).toBeVisible();
    expect(uploadDeckImage).not.toHaveBeenCalled();
    expect(changeDeck).not.toHaveBeenCalled();

    await userEvent.upload(picker, PNG);

    await waitFor(() =>
      expect(uploadDeckImage).toHaveBeenCalledWith({
        id: "deck-1",
        file: PNG,
      })
    );

    const alt = sheet.getByRole("textbox", { name: "Alt text" });

    await expect(alt).toHaveAccessibleDescription(
      "Describe the image for people who cannot see it."
    );
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));
    await expect(
      await sheet.findByText("Add alt text for this image.")
    ).toBeVisible();
    await expect(alt).toHaveAccessibleDescription(
      /Add alt text for this image/
    );
    expect(changeDeck).not.toHaveBeenCalled();

    await userEvent.type(alt, "A bar chart of invoiced sales by month.");
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(changeDeck).toHaveBeenCalledTimes(1));
    await expect(changeDeck).toHaveBeenCalledWith({
      id: "deck-1",
      expectedHash: HASH,
      changes: [
        {
          op: "change-slide",
          slideId: "s2",
          slide: {
            elements: [
              { kind: "title", text: titleElement.text, ...unplaced },
              { kind: "text", text: textElement.text, ...unplaced },
              { kind: "chart", chart: chartElement.chart, ...unplaced },
              {
                kind: "image",
                fileId: FILE_ID,
                alt: "A bar chart of invoiced sales by month.",
                ...unplaced,
              },
            ],
          },
        },
      ],
    });
  },
};

const styledBulletsSlide: ShownSlide = {
  id: "s3",
  background: "#1E3A8A",
  elements: [
    {
      kind: "title",
      text: "Three calls cut the overdue total.",
      style: { color: "#FFFFFF" },
    },
    {
      kind: "bullets",
      items: ["Call each customer", "Send the statement"],
      box: { x: 40, y: 136, w: 440, h: 300 },
      style: { color: "#FFFFFF", fontSize: 24 },
    },
  ],
};

// czjw.128: a bullet edit replaces only the items; dropping the white style fails the save on dark blue.
export const BulletEditKeepsPlacement: Story = {
  name: "A bullet edit keeps the list's box and style",
  args: { slide: styledBulletsSlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await userEvent.click(sheet.getByRole("button", { name: "Add bullet" }));
    await userEvent.type(
      sheet.getByRole("textbox", { name: "Bullet 3" }),
      "Close the account"
    );
    await userEvent.click(
      sheet.getByRole("button", { name: "Remove bullet 1" })
    );
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await expect(save).toHaveBeenCalledWith({
      background: "#1E3A8A",
      elements: [
        {
          kind: "title",
          text: "Three calls cut the overdue total.",
          style: { color: "#FFFFFF" },
        },
        {
          kind: "bullets",
          items: ["Send the statement", "Close the account"],
          box: { x: 40, y: 136, w: 440, h: 300 },
          style: { color: "#FFFFFF", fontSize: 24 },
        },
      ],
    });
  },
};

// B6.7: at 390 x 844 the centre of Save slide is the button itself, not a fixed bar or bubble.
export const SaveOnPhone: Story = {
  name: "Save slide on a phone",
  globals: phone,
  beforeEach: reset,
  play: async () => {
    const button = await screen.findByRole("button", { name: "Save slide" });
    const box = button.getBoundingClientRect();

    expect(
      document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      )
    ).toBe(button);
  },
};
