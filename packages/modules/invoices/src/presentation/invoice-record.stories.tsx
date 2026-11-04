import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import {
  deskInvoiceRecord,
  laterInvoiceRecord,
  linkedInFullInvoiceRecord,
  noDueDateInvoiceRecord,
  partPaidInvoiceRecord,
  readOnlyInvoiceRecord,
} from "./__fixtures__/invoices.ts";
import { InvoiceRecord } from "./invoice-record.tsx";
import type { InvoiceRecordView } from "./views.ts";

const getInvoiceRecord = fn();

const unlinkAllocation = fn();

const changeAllocation = fn();

const correctInvoiceTotal = fn();

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const [automatic, byAPerson] = partPaidInvoiceRecord.allocations;

let releaseUnlink: (() => void) | null = null;

/** Below 1280 px the links sit in the record's sheet, so a phone story opens it first. */
async function openDetails(canvas: ReturnType<typeof within>) {
  const details = canvas.queryByRole("button", { name: "Details" });

  if (details !== null) await userEvent.click(details);
}

/** The page has drawn: react-pdf gave its canvas a width. */
async function pageDrawn(root: HTMLElement) {
  await waitFor(
    () => {
      const canvas = root.querySelector<HTMLCanvasElement>(
        "[data-document-viewer] canvas"
      );

      if (canvas === null || canvas.style.width === "") {
        throw new Error("The page has not drawn yet.");
      }
    },
    { timeout: 10000 }
  );
}

function serve(view: InvoiceRecordView) {
  releaseUnlink = null;
  getInvoiceRecord.mockReset().mockResolvedValue(view);
  unlinkAllocation.mockReset().mockResolvedValue({ unlinkedCents: 150_000 });
  changeAllocation
    .mockReset()
    .mockResolvedValue({ allocationId: automatic?.id ?? "" });
  correctInvoiceTotal.mockReset().mockResolvedValue({ outcome: "corrected" });
}

/** True when the record was read again after the last call of `mutation`. */
function refetchedAfter(mutation: typeof unlinkAllocation): boolean {
  const changed = mutation.mock.invocationCallOrder.at(-1) ?? Infinity;

  return getInvoiceRecord.mock.invocationCallOrder.some(
    (order) => order > changed
  );
}

/** A fresh query cache per story, with no retries so a refused call reports at once. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider
        client={{
          invoices: {
            getInvoiceRecord,
            unlinkAllocation,
            changeAllocation,
            correctInvoiceTotal,
          },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Invoices/Invoice record",
  component: InvoiceRecord,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One invoice at `/m/invoices/invoices/:id`, read as of the reporting date, on the document desk (Spec 7 R-9, R-32, R-38a, R-59, R-60, decisions 4 and 9). The page header holds the customer and Correct the total. The Figures strip leads with Outstanding and its status, then Total with its origin, Paid with the count of linked payments, and the due date with where it came from. From 1280 px the PDF shows in the page with each read field pinned beside its line, and the payments and their history sit in a drawer, as cards. Below 1280 px the page comes first and the record opens in a bottom sheet. A writer of the invoice gets Undo on an automatic link, without a confirmation, and Change amount and Remove link on every link; Remove link asks first. A writer also gets Correct the total; a new total below the links answers `choose-links`, and the dialog asks for the new amount of each link and sends the lowered ones (R-32, decision 13). A refusal stays inside the open dialog. After each change the page reads the invoice again, and the page does not load again. An invoice dated after the reporting date shows a note instead of a balance.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  beforeEach: () => serve(partPaidInvoiceRecord),
  args: { view: partPaidInvoiceRecord },
} satisfies Meta<typeof InvoiceRecord>;

export default meta;

type Story = StoryObj<typeof meta>;

// D18: the desk shows the PDF in the page, the figures of R-38a, and the payments and history in the drawer.
export const Default: Story = {
  globals: desktop,
  args: { view: deskInvoiceRecord },
  beforeEach: () => serve(deskInvoiceRecord),
  play: async ({ canvas, canvasElement }) => {
    const figures = canvas.getByRole("region", { name: "Figures" });

    await expect(
      within(figures)
        .getAllByRole("term")
        .map((term) => term.textContent)
    ).toEqual(["Outstanding", "Total", "Paid", "Due date"]);
    await expect(within(figures).getByText(/^Overdue/)).toBeVisible();
    await expect(within(figures).getByText("2 payments linked")).toBeVisible();

    const drawer = canvas.getByRole("complementary", {
      name: "Payments and history",
    });

    await expect(
      within(within(drawer).getByRole("list", { name: "Payments" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      expect.stringContaining("TXN-PAY-2026-026"),
      expect.stringContaining("HF-SEP-FINAL-PART"),
    ]);
    const history = within(drawer).getByRole("list", { name: "History" });

    await expect(history).toBeVisible();

    // The drawer is narrow, so each change shows its time above its sentence (variant C).
    const [change] = within(history).getAllByRole("listitem");

    const time = change?.querySelector("time")?.getBoundingClientRect();

    const sentence = change
      ?.querySelector("time + span")
      ?.getBoundingClientRect();

    await expect(time?.bottom).toBeLessThanOrEqual(sentence?.top ?? 0);
    await pageDrawn(canvasElement);
    await expect(
      canvas.queryByRole("link", { name: /Open the PDF/ })
    ).toBeNull();

    const header = canvas
      .getByRole("heading", { level: 1, name: "INV-2026-09-03" })
      .closest("header");

    if (header === null) throw new Error("The title is outside a header.");

    await expect(
      within(header).getByRole("button", {
        name: "Correct the total",
      })
    ).toBeVisible();
  },
};

/** The record again after a link change: the same invoice, with a fresh file link. */
const refreshedDeskInvoice: InvoiceRecordView = {
  ...deskInvoiceRecord,
  documentUrl: `${DEMO_PDF.history0903}?fresh=1`,
};

// D20: Undo reads the record again with a new file link, and the page keeps the first one.
export const UndoKeepsThePage: Story = {
  name: "Undo keeps the page",
  globals: desktop,
  args: { view: deskInvoiceRecord },
  beforeEach: () => serve(refreshedDeskInvoice),
  play: async ({ canvas, canvasElement }) => {
    await pageDrawn(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Undo the automatic link to HF-SEP-FINAL-PART",
      })
    );
    await waitFor(() => expect(refetchedAfter(unlinkAllocation)).toBe(true));
    await expect(
      canvasElement.querySelector("[data-document-viewer]")
    ).toHaveAttribute("data-document-url", DEMO_PDF.history0903);
  },
};

// The paid state of the desk at both widths, for the captures; its figures follow Default's rule.
export const Paid: Story = {
  globals: desktop,
  args: { view: linkedInFullInvoiceRecord },
  beforeEach: () => serve(linkedInFullInvoiceRecord),
};

export const PaidOnPhone: Story = {
  name: "Paid on a phone",
  globals: phone,
  args: { view: linkedInFullInvoiceRecord },
  beforeEach: () => serve(linkedInFullInvoiceRecord),
};

const META = "Harbor Foods · Balances as of 27 Oct 2026, the reporting date.";

// A phone shows the page first (variant C): the meta line and Correct the total wait in the sheet.
export const PageFirstOnPhone: Story = {
  name: "Page first on a phone",
  globals: phone,
  args: { view: deskInvoiceRecord },
  beforeEach: () => serve(deskInvoiceRecord),
  play: async ({ canvas, canvasElement }) => {
    await pageDrawn(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Correct the total" })
    ).toBeNull();

    await expect(
      canvas.getAllByText(META).some((line) => line.checkVisibility())
    ).toBe(false);

    await openDetails(canvas);

    const sheet = canvas.getByRole("region", {
      name: "Details of INV-2026-09-03",
    });

    await expect(within(sheet).getByText(META)).toBeVisible();
    await expect(
      within(sheet).getByRole("button", { name: "Correct the total" })
    ).toBeVisible();
  },
};

export const NoDueDate: Story = {
  name: "No due date",
  args: { view: noDueDateInvoiceRecord },
  beforeEach: () => serve(noDueDateInvoiceRecord),
};

export const AfterReportingDate: Story = {
  name: "After the reporting date",
  args: { view: laterInvoiceRecord },
};

// B7.2: only the automatic link shows Undo, which unlinks that link once with no dialog, then reads again.
export const AutomaticLink: Story = {
  globals: desktop,
  beforeEach: () => {
    serve(partPaidInvoiceRecord);
    unlinkAllocation.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseUnlink = () => resolve({ unlinkedCents: 150_000 });
        })
    );
  },
  play: async ({ canvas }) => {
    const undo = canvas.getAllByRole("button", { name: /^Undo/ });

    await expect(
      undo.map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Undo the automatic link to TRF-0921-118"]);
    await expect(
      within(canvas.getByRole("list", { name: "Payments" })).getByText(
        /By a person/
      )
    ).toBeVisible();

    // A double click while the first unlink runs sends one call, so no refusal shows beside the success.
    await userEvent.dblClick(
      canvas.getByRole("button", {
        name: "Undo the automatic link to TRF-0921-118",
      })
    );

    await waitFor(() =>
      expect(unlinkAllocation).toHaveBeenCalledWith({ id: automatic?.id })
    );
    await expect(screen.queryByRole("dialog")).toBeNull();
    releaseUnlink?.();
    await waitFor(() => expect(refetchedAfter(unlinkAllocation)).toBe(true));
    await expect(unlinkAllocation).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(getInvoiceRecord).toHaveBeenLastCalledWith({
      id: partPaidInvoiceRecord.invoice.id,
    });
  },
};

// B7.2 at 390: the card of the automatic link holds its Undo.
export const AutomaticLinkOnPhone: Story = {
  name: "Automatic link on a phone",
  globals: phone,
  play: async ({ canvas }) => {
    await openDetails(canvas);

    const list = canvas.getByRole("list", { name: "Payments" });

    await expect(
      within(list).getAllByRole("button", { name: /^Undo/ })
    ).toHaveLength(1);

    await userEvent.click(
      within(list).getByRole("button", {
        name: "Undo the automatic link to TRF-0921-118",
      })
    );

    await waitFor(() =>
      expect(unlinkAllocation).toHaveBeenCalledWith({ id: automatic?.id })
    );
  },
};

/** Opens Remove link for the person's link, and answers the open confirmation with Cancel focused. */
async function openRemove(canvas: ReturnType<typeof within>) {
  await openDetails(canvas);
  await userEvent.click(
    canvas.getByRole("button", { name: "Actions for TRF-0930-140" })
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Remove link" })
  );

  const dialog = await screen.findByRole("dialog");

  // Inside waitFor: the dialog fades in, and an opacity of 0 is not visible yet.
  await waitFor(() =>
    expect(
      within(dialog).getByRole("heading", {
        name: "Remove the link to TRF-0930-140?",
      })
    ).toBeVisible()
  );
  await expect(
    within(dialog).getByText(
      "SGD 500.00 returns to the payment as unallocated."
    )
  ).toBeVisible();
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus()
  );

  return dialog;
}

// B7.4: Remove link asks with Cancel focused; Cancel removes nothing and Confirm unlinks.
export const RemoveLink: Story = {
  globals: desktop,
  play: async ({ canvas }) => {
    const first = await openRemove(canvas);

    await userEvent.click(
      within(first).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(unlinkAllocation).not.toHaveBeenCalled();
    // The closing dialog kept its words to the end, never "Remove the link to ?".
    // The node is detached now, so the check reads the text it last held.
    await expect(
      within(first).queryByText("Remove the link to TRF-0930-140?")
    ).not.toBeNull();

    const second = await openRemove(canvas);

    await userEvent.click(
      within(second).getByRole("button", { name: "Remove link" })
    );

    await waitFor(() =>
      expect(unlinkAllocation).toHaveBeenCalledWith({ id: byAPerson?.id })
    );
    await waitFor(() => expect(refetchedAfter(unlinkAllocation)).toBe(true));
  },
};

// B7.4, ending open: axe scans the open confirmation at 1440.
export const RemoveLinkOpen: Story = {
  name: "Remove link, asking",
  globals: desktop,
  play: async ({ canvas }) => {
    await openRemove(canvas);
  },
};

// B7.4 at 390, ending open: the card menu opens the confirmation, and axe scans it.
export const RemoveLinkOpenOnPhone: Story = {
  name: "Remove link, asking, on a phone",
  globals: phone,
  play: async ({ canvas }) => {
    await openRemove(canvas);
  },
};

/** Opens Correct the total, checks the filled total, and saves `total`. */
async function saveTotal(
  canvas: ReturnType<typeof within>,
  current: string,
  total: string
) {
  await openDetails(canvas);
  await userEvent.click(
    canvas.getByRole("button", { name: "Correct the total" })
  );

  const dialog = await screen.findByRole("dialog");

  // Inside waitFor: the dialog fades in, and an opacity of 0 is not visible yet.
  await waitFor(() =>
    expect(
      within(dialog).getByRole("heading", {
        name: "Correct the total of INV-2026-09-03",
      })
    ).toBeVisible()
  );

  const field = within(dialog).getByRole("textbox", { name: "Total" });

  await expect(field).toHaveValue(current);
  await userEvent.clear(field);
  await userEvent.type(field, total);
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  return dialog;
}

// B8.2: a total above the links is sent once with no reduction, and the dialog closes.
export const CorrectTotal: Story = {
  name: "Correct the total",
  globals: desktop,
  play: async ({ canvas }) => {
    await saveTotal(canvas, "5000.00", "4800.00");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(correctInvoiceTotal).toHaveBeenCalledTimes(1);
    await expect(correctInvoiceTotal).toHaveBeenCalledWith({
      id: partPaidInvoiceRecord.invoice.id,
      totalCents: 480_000,
      reductions: [],
    });
    await waitFor(() => expect(refetchedAfter(correctInvoiceTotal)).toBe(true));
  },
};

const [first, second] = linkedInFullInvoiceRecord.allocations;

const INSUFFICIENT =
  "The reduced links still exceed the new total. Reduce more.";

/** The first answer asks which of the two links, of 3,000.00 and 2,000.00, to lower. */
function askForLinks() {
  serve(linkedInFullInvoiceRecord);
  correctInvoiceTotal.mockResolvedValueOnce({
    outcome: "choose-links",
    excessCents: 50_000,
    allocations: [
      {
        allocationId: first?.id,
        paymentId: first?.paymentId,
        amountCents: 300_000,
      },
      {
        allocationId: second?.id,
        paymentId: second?.paymentId,
        amountCents: 200_000,
      },
    ],
  });
}

/** Saves 4500.00, answers the choice with one input per link, and lowers the first to `amount`. */
async function lowerFirstLink(
  canvas: ReturnType<typeof within>,
  amount: string,
  amountCents: number
) {
  const dialog = await saveTotal(canvas, "5000.00", "4500.00");

  await expect(
    await within(dialog).findByText(
      "The links add up to SGD 500.00 more than the new total. Lower one or more links."
    )
  ).toBeVisible();

  const lowered = within(dialog).getByRole("textbox", {
    name: "New amount for TRF-0921-118",
  });

  await expect(lowered).toHaveValue("3000.00");
  await expect(
    within(dialog).getByRole("textbox", { name: "New amount for TRF-0930-140" })
  ).toHaveValue("2000.00");
  await userEvent.clear(lowered);
  await userEvent.type(lowered, amount);
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(correctInvoiceTotal).toHaveBeenCalledTimes(2));
  await expect(correctInvoiceTotal).toHaveBeenLastCalledWith({
    id: linkedInFullInvoiceRecord.invoice.id,
    totalCents: 450_000,
    reductions: [{ allocationId: first?.id, amountCents }],
  });

  return dialog;
}

// B8.3: below its links, the total asks for one input per link and sends the lowered one in cents.
export const CorrectTotalBelowLinks: Story = {
  name: "Correct the total below its links",
  globals: desktop,
  args: { view: linkedInFullInvoiceRecord },
  beforeEach: askForLinks,
  play: async ({ canvas }) => {
    await lowerFirstLink(canvas, "2500.00", 250_000);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(refetchedAfter(correctInvoiceTotal)).toBe(true));
  },
};

function refuseReductions() {
  askForLinks();
  correctInvoiceTotal.mockRejectedValueOnce(new Error(INSUFFICIENT));
}

/** Lowers the first link too little, and answers the dialog that shows the refusal. */
async function lowerTooLittle(canvas: ReturnType<typeof within>) {
  const dialog = await lowerFirstLink(canvas, "2800.00", 280_000);

  await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    INSUFFICIENT
  );
  await expect(dialog).toBeVisible();
  await expect(refetchedAfter(correctInvoiceTotal)).toBe(false);
}

// B8.4, ending with the refusal in the open dialog: axe scans the warning, the inputs and the alert at 1440.
export const CorrectTotalRefused: Story = {
  name: "Correct the total, refused",
  globals: desktop,
  args: { view: linkedInFullInvoiceRecord },
  beforeEach: refuseReductions,
  play: async ({ canvas }) => {
    await lowerTooLittle(canvas);
  },
};

// B8.4 at 390, ending with the refusal in the open dialog for axe.
export const CorrectTotalRefusedOnPhone: Story = {
  name: "Correct the total, refused, on a phone",
  globals: phone,
  args: { view: linkedInFullInvoiceRecord },
  beforeEach: refuseReductions,
  play: async ({ canvas }) => {
    await lowerTooLittle(canvas);
  },
};

// B7.5 and B8.5: a reader without write sees the links, and no Undo, no action and no correction.
export const ReadOnly: Story = {
  name: "Read only",
  globals: desktop,
  args: { view: readOnlyInvoiceRecord },
  beforeEach: () => serve(readOnlyInvoiceRecord),
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("list", { name: "Payments" })).getByText(
        /Automatic/
      )
    ).toBeVisible();
    await expect(canvas.queryAllByRole("button", { name: /Undo/ })).toEqual([]);
    await expect(
      canvas.queryAllByRole("button", { name: /^Actions for/ })
    ).toEqual([]);
    await expect(
      canvas.queryByRole("button", { name: "Correct the total" })
    ).toBeNull();
  },
};
