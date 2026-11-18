import { ModuleClientProvider } from "@genie/core/rpc/client";
import { controlHeightsPx } from "@genie/ui/tokens";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { SLIDE_RULE_MESSAGES } from "../contract.ts";
import {
  chartWithImageSlide,
  deckPage,
  longestSlide,
  textOnlySlide,
  textWithChartSlide,
  textWithTableSlide,
  twoFiguresSlide,
} from "./__fixtures__/decks.ts";
import { BLUE_THEME } from "./__fixtures__/themes.ts";
import { EditSlideSheet } from "./edit-slide-sheet.tsx";
import { SlideEditor } from "./slide-editor.tsx";
import { useDeckChange } from "./use-deck.ts";
import type { ShownSlide } from "./views.ts";

const readDeck = fn();

const changeDeck = fn();

const uploadDeckImage = fn();

const save = fn();

const close = fn();

const upload = fn();

const ask = fn();

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

/** What the deck page passes the sheet for its live preview. */
const canvas = {
  figuresAsOf: deckPage.deck.figuresAsOf,
  timeZone: deckPage.timeZone,
  place: { index: 1, count: 5 },
  theme: BLUE_THEME,
  logoUrl: null,
  images: deckPage.deck.images,
};

/** The sheet as the deck page opens it on slide 2 of 5. */
const frame = {
  target: { slide: textWithChartSlide, number: 2 },
  count: 5,
  deckTitle: "Receivables at a glance",
  failure: null,
  canvas,
};

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
    canvas,
    onSave: save,
    onClose: close,
    onUpload: upload,
  },
  render: ({ slide, ...args }) => (
    <EditSlideSheet
      {...args}
      target={{ slide, number: 2 }}
      count={5}
      deckTitle="Receivables at a glance"
      failure={null}
    />
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
  ask.mockReset();
}

async function editor() {
  return within(await screen.findByRole("dialog", { name: "Edit slide 2" }));
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
      /^The finding of this slide, in one sentence\./
    );
    await expect(sheet.getByRole("textbox", { name: "Text" })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Save slide" })
    ).toBeVisible();
  },
};

// 6wz1.128: the filling grid must not spread the fields; the Title hint and the Text label stay 20 px apart.
export const FieldsStayTogether: Story = {
  name: "The title and text fields stay together",
  args: { slide: textOnlySlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    const hint = sheet.getByText("The finding of this slide, in one sentence.");

    const label = sheet.getByText("Text", {
      exact: true,
      selector: "[data-slot=field-label]",
    });

    const gap =
      label.getBoundingClientRect().top - hint.getBoundingClientRect().bottom;

    await expect(
      Math.abs(gap - 20) <= 1
        ? ""
        : `title hint bottom to text label top: ${gap} px`
    ).toBe("");
  },
};

export const ChartSlide: Story = {
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    // The hidden preview draws the chart title too; the row of the form is the one a person reads.
    await expect(
      sheet.getByText("Invoiced by month", { ignore: "[aria-hidden=true] *" })
    ).toBeVisible();
    // Remove text and Remove of the chart's one row.
    await expect(
      sheet.getAllByRole("button", { name: /^Remove / })
    ).toHaveLength(2);
    await expect(
      sheet.getByRole("button", { name: "Remove Invoiced by month" })
    ).toBeVisible();
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
    <EditSlideSheet
      {...frame}
      saving={change.isPending}
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

    const answer = Promise.withResolvers<typeof deckPage.deck>();

    changeDeck.mockReturnValue(answer.promise);
    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));

    // R13-2: a Cancel during the save would close the sheet the save's refusal lands on.
    await waitFor(() =>
      expect(sheet.getByRole("button", { name: "Cancel" })).toBeDisabled()
    );
    answer.resolve(deckPage.deck);

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
    <EditSlideSheet
      {...frame}
      saving={change.isPending}
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

    await userEvent.click(sheet.getByRole("button", { name: "Add a bullet" }));
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

// C06-3: a sheet form is not a dense place, so Remove bullet takes the md height of its field.
export const BulletRowLinesUp: Story = {
  name: "Each bullet field and its Remove are 36 px on one top edge",
  args: { slide: styledBulletsSlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    const off = [1, 2]
      .flatMap((n) => {
        const a = sheet
          .getByRole("textbox", { name: `Bullet ${n}` })
          .getBoundingClientRect();

        const b = sheet
          .getByRole("button", { name: `Remove bullet ${n}` })
          .getBoundingClientRect();

        return a.height === 36 && b.height === 36 && a.top === b.top
          ? []
          : [
              `Bullet ${n}: ${a.height} px at ${a.top}, Remove ${b.height} px at ${b.top}`,
            ];
      })
      .join("; ");

    await expect(off).toBe("");
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

/** Each line that is off: the label with the measured value. */
function within1(lines: readonly (readonly [string, number, number])[]) {
  return lines
    .flatMap(([label, got, want]) =>
      Math.abs(got - want) > 1 ? [`${label}: ${got} px, want ${want}`] : []
    )
    .join("; ");
}

// czjw.180: from 768 px the sheet is the 440 px right sheet; the preview leads, the actions end the footer.
export const EditSlideOnDesktop: Story = {
  name: "Edit slide sheet on a desktop",
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Edit slide 2" });
    const sheet = within(dialog);

    await expect(dialog).toHaveAccessibleDescription(
      "Slide 2 of 5 · Receivables at a glance"
    );
    await expect(dialog).toHaveAttribute("data-side", "right");

    const preview = dialog
      .querySelector("[data-slide-canvas]")!
      .getBoundingClientRect();

    const title = sheet
      .getByRole("textbox", { name: "Title" })
      .getBoundingClientRect();

    const cancel = sheet
      .getByRole("button", { name: "Cancel" })
      .getBoundingClientRect();

    const saveButton = sheet
      .getByRole("button", { name: "Save slide" })
      .getBoundingClientRect();

    const footer = dialog
      .querySelector("[data-slot=sheet-footer]")!
      .getBoundingClientRect();

    await expect(
      within1([
        ["sheet width", dialog.getBoundingClientRect().width, 440],
        ["Cancel top to Save slide top", cancel.top, saveButton.top],
      ])
    ).toBe("");
    await expect(preview.bottom <= title.top).toBe(true);
    await expect(cancel.right <= saveButton.left).toBe(true);
    await expect(cancel.left > footer.left + footer.width / 2).toBe(true);
  },
};

// czjw.180: below 768 px the sheet rises from the bottom, 24 px under the top, with a grab handle.
export const EditSlideOnPhone: Story = {
  name: "Edit slide sheet on a phone",
  globals: phone,
  beforeEach: reset,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Edit slide 2" });
    const sheet = within(dialog);

    await expect(dialog).toHaveAttribute("data-side", "bottom");
    await expect(dialog.querySelector("[data-sheet-grab]")).not.toBeNull();

    const cancel = sheet
      .getByRole("button", { name: "Cancel" })
      .getBoundingClientRect();

    const saveButton = sheet
      .getByRole("button", { name: "Save slide" })
      .getBoundingClientRect();

    await waitFor(async () =>
      expect(
        within1([
          ["sheet top", dialog.getBoundingClientRect().top, 24],
          ["Cancel width", cancel.width, saveButton.width],
          ["Cancel top", cancel.top, saveButton.top],
        ])
      ).toBe("")
    );
  },
};

export const TitleCountsAndPreviews: Story = {
  name: "The title counts its characters and shows in the preview",
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Edit slide 2" });
    const title = within(dialog).getByRole("textbox", { name: "Title" });

    await userEvent.clear(title);
    await userEvent.type(title, "Sales rose.");

    await expect(within(dialog).getByText("11 / 90")).toBeVisible();
    await expect(
      dialog.querySelector("[data-slide-canvas]")?.textContent
    ).toContain("Sales rose.");
    expect(save).not.toHaveBeenCalled();
  },
};

export const TitleStaysOneLine: Story = {
  name: "A line break in the title becomes a space",
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();
    const title = sheet.getByRole("textbox", { name: "Title" });

    await userEvent.clear(title);
    await userEvent.type(title, "Sales{Enter}rose.");
    await expect(title).toHaveValue("Sales rose.");

    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await expect(save.mock.calls[0]?.[0].elements[0].text).toBe("Sales rose.");
  },
};

export const CancelClosesWithoutSaving: Story = {
  name: "Cancel closes the sheet without saving",
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await userEvent.type(
      sheet.getByRole("textbox", { name: "Title" }),
      " today"
    );
    await userEvent.click(sheet.getByRole("button", { name: "Cancel" }));

    await expect(close).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  },
};

const discard = { name: "Discard your changes to this slide?" };

export const UseBulletsKeepsTheWords: Story = {
  name: "Use bullets, then Use text, keeps the words",
  args: { slide: textOnlySlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();
    const [title, text] = textOnlySlide.elements;

    if (title?.kind !== "title" || text?.kind !== "text") {
      throw new Error("the text slide fixture lost its elements");
    }

    await userEvent.click(sheet.getByRole("button", { name: "Use bullets" }));
    await expect(sheet.getByRole("textbox", { name: "Bullet 1" })).toHaveValue(
      text.text
    );

    await userEvent.click(sheet.getByRole("button", { name: "Use text" }));
    await expect(sheet.getByRole("textbox", { name: "Text" })).toHaveValue(
      text.text
    );

    await userEvent.click(sheet.getByRole("button", { name: "Save slide" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await expect(save.mock.calls[0]?.[0].elements).toEqual([
      { kind: "title", text: title.text },
      { kind: "text", text: text.text },
    ]);
  },
};

export const RemoveTextOffersBoth: Story = {
  name: "Remove text offers Add text and Add bullets",
  args: { slide: textOnlySlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await userEvent.click(sheet.getByRole("button", { name: "Remove text" }));

    await expect(
      sheet.getByText(
        "This slide has no text yet. A slide holds one text or one bullet list."
      )
    ).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Add text" })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Add bullets" })
    ).toBeVisible();
    // C13-4: both are the sheet's secondary size, as tall as Add image.
    await expect(
      ["Add text", "Add bullets"].map(
        (name) =>
          sheet.getByRole("button", { name }).getBoundingClientRect().height
      )
    ).toEqual([controlHeightsPx.md.desktop, controlHeightsPx.md.desktop]);
  },
};

export const FullSlideSaysWhy: Story = {
  name: "On a full slide, Add image says why it is off",
  args: { slide: twoFiguresSlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();
    const add = sheet.getByRole("button", { name: "Add image" });

    await expect(add).toHaveAttribute("aria-disabled", "true");
    add.focus();
    await expect(add).toHaveFocus();
    await expect(add).toHaveAccessibleDescription(SLIDE_RULE_MESSAGES.visual);
  },
};

export const TableRuleSaysWhy: Story = {
  name: "Beside a text and a table, Add image gives the table rule",
  args: { slide: textWithTableSlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();
    const add = sheet.getByRole("button", { name: "Add image" });

    await expect(add).toHaveAttribute("aria-disabled", "true");
    await expect(add).toHaveAccessibleDescription(SLIDE_RULE_MESSAGES.table);
  },
};

export const RemoveOneVisual: Story = {
  name: "Remove takes out one chart or image",
  args: { slide: chartWithImageSlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await expect(sheet.getByText("2 of 2")).toBeVisible();
    await userEvent.click(
      sheet.getByRole("button", { name: "Remove Invoiced by month" })
    );

    await expect(sheet.getByText("1 of 2")).toBeVisible();
    await expect(
      sheet.queryByRole("button", { name: "Remove Invoiced by month" })
    ).toBeNull();
    await expect(sheet.getByRole("textbox", { name: "Alt text" })).toHaveValue(
      "A photograph of the finance team meeting at a table."
    );
  },
};

export const AskWithChangesAsksToDiscard: Story = {
  name: "open Ask with a typed change asks to discard first",
  args: { onAsk: ask },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();
    const title = sheet.getByRole("textbox", { name: "Title" });

    await userEvent.type(title, " today");
    await userEvent.click(sheet.getByRole("button", { name: "open Ask" }));

    const dialog = await screen.findByRole("dialog", discard);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", discard)).toBeNull()
    );
    await expect(title).toHaveValue(
      "Collections narrowed the gap to the plan line today"
    );
    expect(ask).not.toHaveBeenCalled();

    await userEvent.click(sheet.getByRole("button", { name: "open Ask" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", discard)).getByRole("button", {
        name: "Discard",
      })
    );
    await expect(ask).toHaveBeenCalledTimes(1);
  },
};

export const AskWithoutChangesOpensAsk: Story = {
  name: "open Ask with no change opens Ask at once",
  args: { onAsk: ask },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await userEvent.click(sheet.getByRole("button", { name: "open Ask" }));

    await expect(ask).toHaveBeenCalledTimes(1);
    await expect(screen.queryByRole("dialog", discard)).toBeNull();
  },
};

export const NoAskNoLink: Story = {
  name: "Without Ask, the charts note has no link",
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await expect(
      sheet.getByText("Charts and figures come from your data.")
    ).toBeVisible();
    await expect(sheet.queryByRole("button", { name: "open Ask" })).toBeNull();
  },
};

// P13-23: the switch keeps every word, so a long text makes a long bullet; its limit shows at once.
export const UseBulletsShowsTheLimit: Story = {
  name: "Use bullets on a long text shows the bullet limit at once",
  args: { slide: textOnlySlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await userEvent.click(sheet.getByRole("button", { name: "Use bullets" }));

    const bullet = sheet.getByRole("textbox", { name: "Bullet 1" });

    await expect(bullet).toHaveAttribute("aria-invalid", "true");
    await expect(bullet).toHaveAccessibleDescription(/80/);
    expect(save).not.toHaveBeenCalled();
  },
};

// P13-23: five long bullets join to more than 280 characters; the text limit shows at once.
export const UseTextShowsTheLimit: Story = {
  name: "Use text on long bullets shows the text limit at once",
  args: { slide: longestSlide },
  globals: desktop,
  beforeEach: reset,
  play: async () => {
    const sheet = await editor();

    await userEvent.click(sheet.getByRole("button", { name: "Use text" }));

    const text = sheet.getByRole("textbox", { name: "Text" });

    await expect(text).toHaveAttribute("aria-invalid", "true");
    await expect(text).toHaveAccessibleDescription(/280/);
    expect(save).not.toHaveBeenCalled();
  },
};
