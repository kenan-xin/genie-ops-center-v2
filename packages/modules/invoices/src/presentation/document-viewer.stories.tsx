import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import { DocumentViewer, type MarkPlace } from "./document-viewer.tsx";

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const desktop1440 = { viewport: { value: "desktop1440", isRotated: false } };

const INVOICE = DEMO_PDF.invoice01;

const meta = {
  title: "Modules/Invoices/Document viewer",
  component: DocumentViewer,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The document of the review screen at both widths (Spec 7 R-38, decisions 1 and 2). Each page draws at the width of its container and keeps its text layer, so a quote of the selected field marks its source text. Document text is escaped and never runs as markup. A file that does not load offers the PDF itself.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    url: INVOICE,
    label: "Invoice 01 (missing due date)",
    highlights: [{ page: 1, quote: "TOTAL (SGD) 5,000.00" }],
  },
} satisfies Meta<typeof DocumentViewer>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every mark on the page as one string without whitespace, whichever text items they came from. */
function marksText(element: HTMLElement): string {
  return Array.from(element.querySelectorAll("mark"))
    .map((mark) => mark.textContent ?? "")
    .join("")
    .replaceAll(/\s+/gu, "");
}

// B1.6: the demo invoice draws its text layer and the marks hold exactly its quote.
export const Highlighted: Story = {
  globals: desktop,
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(marksText(canvasElement)).toBe("TOTAL(SGD)5,000.00")
    );
  },
};

const reportPlaces = fn<(places: readonly MarkPlace[]) => void>();

// D7: the desk reads where each keyed mark sits, measured after the text layer draws.
export const Places: Story = {
  args: {
    url: DEMO_PDF.history0903,
    label: "INV-2026-09-03",
    highlights: [
      {
        page: 1,
        quote: "Invoice number INV-2026-09-03",
        key: "number",
        tinted: false,
      },
      { page: 1, quote: "TOTAL (SGD) 7,200.00", key: "total", tinted: false },
    ],
    onPlaces: reportPlaces,
  },
  globals: desktop1440,
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>(
      "[data-document-viewer]"
    );

    await waitFor(() => {
      const reported = reportPlaces.mock.lastCall?.[0] ?? [];

      expect(reported.map((place) => place.key).toSorted()).toEqual([
        "number",
        "total",
      ]);

      for (const place of reported) {
        const marks = Array.from(
          canvasElement.querySelectorAll(`mark[data-highlight="${place.key}"]`)
        ).map((mark) => mark.getBoundingClientRect());

        const origin = region?.getBoundingClientRect().top ?? 0;
        const top = Math.min(...marks.map((box) => box.top)) - origin;
        const bottom = Math.max(...marks.map((box) => box.bottom)) - origin;

        expect(
          Math.abs((place.top + place.bottom) / 2 - (top + bottom) / 2)
        ).toBeLessThanOrEqual(2);
      }
    });

    await expect(
      Array.from(
        canvasElement.querySelectorAll("mark"),
        (mark) => getComputedStyle(mark).backgroundColor
      ).filter((color) => color !== "rgba(0, 0, 0, 0)")
    ).toEqual([]);
  },
};

// B1.7: a file that does not load shows the reason and the link to the PDF.
// D8: and tells the page, which shows its own failure state.
export const LoadFailed: Story = {
  args: { url: "/demo-pack/missing.pdf", onLoadError: fn() },
  globals: desktop,
  play: async ({ args, canvas }) => {
    await expect(
      await canvas.findByText("The document could not be shown.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open the PDF" })
    ).toHaveAttribute("href", "/demo-pack/missing.pdf");
    await waitFor(() => expect(args.onLoadError).toHaveBeenCalledOnce());
  },
};

// B1.8: at 390 px the page fits its column and nothing scrolls sideways.
export const Phone: Story = {
  globals: phone,
  play: async ({ canvasElement }) => {
    const drawn = await waitFor(() => {
      const canvas = canvasElement.querySelector("canvas");
      const container = canvasElement.querySelector("[data-document-viewer]");

      // react-pdf sets the canvas style width only when the page has drawn.
      if (canvas === null || container === null || canvas.style.width === "") {
        throw new Error("The page has not drawn yet.");
      }

      return { canvas, container };
    });

    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
    await expect(
      drawn.canvas.getBoundingClientRect().width
    ).toBeLessThanOrEqual(drawn.container.getBoundingClientRect().width);
  },
};
