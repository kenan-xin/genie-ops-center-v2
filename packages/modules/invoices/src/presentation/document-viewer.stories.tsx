import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import { DocumentViewer } from "./document-viewer.tsx";

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

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

// B1.7: a file that does not load shows the reason and the link to the PDF.
export const LoadFailed: Story = {
  args: { url: "/demo-pack/missing.pdf" },
  globals: desktop,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("The document could not be shown.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open the PDF" })
    ).toHaveAttribute("href", "/demo-pack/missing.pdf");
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
