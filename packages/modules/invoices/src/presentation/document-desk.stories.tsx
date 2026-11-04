import { Badge } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import { DESK_FIELDS_0903, DESK_PEEK_0903 } from "./__fixtures__/desk.ts";
import { DocumentDesk } from "./document-desk.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const PINNED = ["customer", "number", "date", "dueDate", "amount"] as const;

const refreshUrl = fn(async () => DEMO_PDF.history0903);

const meta = {
  title: "Modules/Invoices/Document desk",
  component: DocumentDesk,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The record page with its document in the page (Spec 7 R-38a, prototype invoice record variant C). From 1280 px the page sits on a canvas with each read field pinned beside its source line by a leader line, and the links and history in a drawer. A field with no quote, or with a quote that the page does not hold (a scan), gets a card and no pin. Below 1280 px the page comes first, and the record opens in a bottom sheet that peeks with its status and amount. A record entered by hand shows its fields in place of the page; a page that does not load offers Download and Try again, each with a fresh file link.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    kind: "invoice",
    label: "INV-2026-09-03",
    documentUrl: DEMO_PDF.history0903,
    refreshUrl,
    fields: DESK_FIELDS_0903,
    header: (
      <h1 className="mb-4 text-2xl font-semibold tabular-nums">
        INV-2026-09-03
      </h1>
    ),
    figures: <p>Outstanding SGD 2,200.00 of SGD 7,200.00</p>,
    peek: {
      status: <Badge variant="danger">{DESK_PEEK_0903.status}</Badge>,
      caption: DESK_PEEK_0903.caption,
      amount: DESK_PEEK_0903.amount,
    },
    side: (place) => (
      <section aria-label={`Payments (${place})`}>
        <h2 className="text-base font-semibold">Payments</h2>
        <p>TXN-PAY-2026-026, SGD 2,000.00</p>
      </section>
    ),
  },
} satisfies Meta<typeof DocumentDesk>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The page has drawn: its canvas has the width react-pdf gave it. */
async function pageDrawn(root: HTMLElement): Promise<HTMLCanvasElement> {
  return waitFor(
    () => {
      const canvas = root.querySelector<HTMLCanvasElement>(
        "[data-document-viewer] canvas"
      );

      if (canvas === null || canvas.style.width === "") {
        throw new Error("The page has not drawn yet.");
      }

      return canvas;
    },
    { timeout: 10000 }
  );
}

const middle = (box: DOMRect) => (box.top + box.bottom) / 2;

/** Each pinned key's dot sits within 2 px of the middle of its marks. */
async function dotsOnTheirMarks(root: HTMLElement): Promise<void> {
  await waitFor(() => {
    for (const key of PINNED) {
      const dot = root.querySelector(`[data-pin-dot="${key}"]`);

      const marks = Array.from(
        root.querySelectorAll(`mark[data-highlight="${key}"]`)
      ).map((mark) => mark.getBoundingClientRect());

      if (dot === null || marks.length === 0) {
        throw new Error(`No dot or no mark for ${key}.`);
      }

      const markMiddle =
        (Math.min(...marks.map((box) => box.top)) +
          Math.max(...marks.map((box) => box.bottom))) /
        2;

      expect(
        Math.abs(middle(dot.getBoundingClientRect()) - markMiddle),
        key
      ).toBeLessThanOrEqual(2);
    }
  });
}

// D9: five fields pin to their lines; a field with no quote or no mark gets a card and no dot.
export const Desktop: Story = {
  args: {
    // A scan answers no text layer, so its quote finds no mark.
    fields: DESK_FIELDS_0903.map((field) =>
      field.key === "description"
        ? { ...field, source: { page: 1, quote: "Printed only as an image" } }
        : field
    ),
  },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await pageDrawn(canvasElement);
    await dotsOnTheirMarks(canvasElement);

    const page = canvas
      .getByRole("region", { name: "Source document of INV-2026-09-03" })
      .getBoundingClientRect();

    const cardLeft = (key: string) =>
      canvasElement
        .querySelector(`[data-pin="${key}"]`)
        ?.getBoundingClientRect().left ?? 0;

    await expect(PINNED.filter((key) => cardLeft(key) <= page.right)).toEqual(
      []
    );

    const unpinned = ["paymentTerms", "description"];

    await expect(
      unpinned.filter((key) =>
        canvasElement.querySelector(`[data-pin="${key}"]`)?.checkVisibility()
      )
    ).toEqual(unpinned);
    await expect(
      unpinned.filter(
        (key) => canvasElement.querySelector(`[data-pin-dot="${key}"]`) !== null
      )
    ).toEqual([]);

    await userEvent.click(
      canvas.getByRole("button", { name: "Hide payments and history" })
    );
    await expect(
      canvas.queryByRole("complementary", { name: "Payments and history" })
    ).toBeNull();

    const reopen = within(
      canvas.getByRole("toolbar", { name: "Document" })
    ).getByRole("button", { name: "Payments and history" });

    await expect(reopen).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(reopen);
    await expect(
      canvas.getByRole("complementary", { name: "Payments and history" })
    ).toBeVisible();
  },
};

// D10: Zoom in draws the page 25% wider and the pins follow their lines.
export const Zoom: Story = {
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    const before = (await pageDrawn(canvasElement)).getBoundingClientRect()
      .width;

    await dotsOnTheirMarks(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
    await expect(canvas.getByText("125%")).toBeVisible();
    await waitFor(() =>
      expect(
        Math.abs(
          (canvasElement
            .querySelector("[data-document-viewer] canvas")
            ?.getBoundingClientRect().width ?? 0) -
            before * 1.25
        )
      ).toBeLessThanOrEqual(2)
    );
    await dotsOnTheirMarks(canvasElement);
  },
};

// D11: a page that does not load keeps the fields, and Download and Try again ask for a fresh link.
export const PreviewFailed: Story = {
  args: { documentUrl: "/demo-pack/missing.pdf" },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    refreshUrl.mockClear();

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent("The preview could not load");
    await expect(alert).toHaveTextContent(
      "The file is stored and unchanged. Download it to read it, or try the preview again."
    );
    await expect(canvas.getByText("Read from the document")).toBeVisible();

    await userEvent.click(
      within(alert).getByRole("button", { name: "Download the PDF" })
    );
    await waitFor(() => expect(refreshUrl).toHaveBeenCalledTimes(1));

    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" })
    );
    await waitFor(() => expect(refreshUrl).toHaveBeenCalledTimes(2));
    await pageDrawn(canvasElement);
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

// D12: a record entered by hand loads no viewer and shows its fields as entered by you.
export const HandEntered: Story = {
  args: {
    documentUrl: null,
    fields: DESK_FIELDS_0903.map((field) => ({
      ...field,
      tag: "entered" as const,
      source: null,
    })),
  },
  globals: desktop,
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("region", {
        name: "Source document of INV-2026-09-03",
      })
    ).toBeNull();
    await expect(canvas.getByText("No document")).toBeVisible();
    await expect(
      canvas.getByText("This invoice was entered by hand.")
    ).toBeVisible();
    await expect(canvas.getByText("Entered by hand")).toBeVisible();
    await expect(
      canvas
        .getAllByText("Entered by you")
        .filter((tag) => tag.checkVisibility())
    ).toHaveLength(DESK_FIELDS_0903.length);
  },
};

// D13: on a phone the page comes first, and the sheet peeks, opens, and never covers its last line.
export const Phone: Story = {
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await pageDrawn(canvasElement);

    const sheet = canvas.getByRole("region", {
      name: "Details of INV-2026-09-03",
    });

    const closedHeight = sheet.getBoundingClientRect().height;

    const content = canvasElement.querySelector<HTMLElement>(
      "[data-desk-content]"
    );

    await expect(canvasElement.querySelector("[data-pin-dot]")).toBeNull();
    await expect(within(sheet).getByText("Overdue · 40 days")).toBeVisible();
    await expect(within(sheet).getByText("SGD 2,200.00")).toBeVisible();
    await expect(
      Number.parseFloat(getComputedStyle(content ?? sheet).paddingBottom)
    ).toBeGreaterThanOrEqual(closedHeight);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );

    const details = within(sheet).getByRole("button", { name: "Details" });

    await userEvent.click(details);
    await expect(details).toHaveAttribute("aria-expanded", "true");
    await expect(
      within(sheet).getByRole("region", { name: "Fields" })
    ).toBeVisible();
  },
};
