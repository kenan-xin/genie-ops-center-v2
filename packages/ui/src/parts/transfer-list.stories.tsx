import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

// The package entry, so that the stories prove what an app can import.
import { Button, StatusPill, TransferList } from "../index.ts";
import type { TransferItem, TransferListProps } from "../index.ts";

const roleControl = (label: string) => (
  <Button size="sm" variant="secondary">
    Role of {label}
  </Button>
);

const items: readonly TransferItem[] = [
  {
    id: "analytics",
    label: "Analytics",
    control: roleControl("Analytics"),
    description: "Dashboards and saved questions.",
    group: "Modules",
    blockedReason: "Analytics is off for this deployment.",
    pills: <StatusPill tone="warning">Paused: Module off</StatusPill>,
  },
  {
    id: "invoices",
    label: "Invoices",
    control: roleControl("Invoices"),
    description: "Bills, payments and approvals.",
    group: "Modules",
  },
  {
    id: "placeholder",
    label: "Placeholder",
    control: roleControl("Placeholder"),
    description: "The sample module.",
    group: "Modules",
  },
  {
    id: "slides",
    label: "Slides",
    control: roleControl("Slides"),
    description: "Decks built from records.",
    group: "Modules",
    note: "Also assigned via Finance team",
  },
  {
    id: "ask",
    label: "Ask",
    control: roleControl("Ask"),
    description: "Ask on every page.",
    group: "Core",
  },
];

/** An editable row and a read-only path to the same module, which count once. */
const readOnlyItems = (onNote: () => void): readonly TransferItem[] => [
  {
    id: "fixture",
    label: "Fixture",
    description: "The test module.",
    group: "Modules",
  },
  {
    id: "fixture-finance",
    label: "Fixture",
    description: "The test module.",
    group: "Modules",
    readOnly: true,
    countKey: "fixture",
    note: (
      <>
        Through{" "}
        <button type="button" className="underline" onClick={onNote}>
          Finance team
        </button>
      </>
    ),
  },
  {
    id: "other",
    label: "Other",
    description: "Another module.",
    group: "Modules",
  },
];

type Args = Pick<TransferListProps, "layout" | "onMove"> & {
  readonly initial: readonly string[];
  readonly items?: readonly TransferItem[];
  readonly onNote?: () => void;
};

/** Holds `granted` the way a screen does, so a move shows on the other side. */
function Harness({ layout, onMove, initial, items: rows = items }: Args) {
  const [granted, setGranted] = React.useState<ReadonlySet<string>>(
    () => new Set(initial)
  );

  return (
    <TransferList
      items={rows}
      granted={granted}
      layout={layout}
      availableLabel="Catalog"
      grantedLabel="Granted"
      emptyAvailable="Nothing left to add."
      emptyGranted="Nothing granted yet."
      onMove={(ids, to) => {
        onMove(ids, to);
        setGranted((current) => {
          const next = new Set(current);

          for (const id of ids) {
            if (to === "granted") next.add(id);
            else next.delete(id);
          }

          return next;
        });
      }}
    />
  );
}

const meta = {
  title: "UI/TransferList",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The transfer list (tokens.md, "Transfer list"): rows move between an available bucket and a granted bucket. `panes` shows the two buckets side by side, for a container of about 900 px. `stacked` shows Catalog above Granted, each with its own search and quick action, for a container under 1280 px. The list owns its ticks and its search; the caller owns `granted` and applies `onMove`. A row with `blockedReason` cannot be added, but it can still be removed. `control` sits on granted rows only.',
      },
    },
    a11y: { test: "error" },
  },
  args: { layout: "panes", onMove: fn(), initial: ["slides"] },
  globals: { viewport: { value: "desktop", isRotated: false } },
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

const bucket = (canvas: HTMLElement, name: string) =>
  within(within(canvas).getByRole("group", { name }));

/**
 * C12-2 (C11-14): in the panes of a 1440 px screen a long control, such as an inherited route line,
 * wraps inside half the row, so the row's name keeps one line.
 */
export const PanesLongControlKeepsTheName: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  args: {
    initial: ["invoices"],
    items: [
      {
        id: "invoices",
        label: "Invoices and Payments",
        description:
          "Customers, invoices, payments and their allocations, with the datasets that answer questions about them.",
        group: "Modules",
        control: (
          <span className="text-xs text-muted-foreground">
            Invoices and Payments editor · Assigned via Capture Finance Team
          </span>
        ),
      },
    ],
  },
  // The card body of the Grants tab at 1440 px.
  render: (args) => (
    <div className="w-272">
      <Harness {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const name = bucket(canvasElement, "Granted").getByText(
      "Invoices and Payments"
    );

    const line = Number.parseFloat(getComputedStyle(name).lineHeight);

    await expect(name.getBoundingClientRect().height).toBeLessThanOrEqual(
      line + 1
    );
  },
};

/** T1: one press moves every ticked row, once, and clears the ticks. */
export const Panes: Story = {
  play: async ({ args, canvasElement }) => {
    const catalog = bucket(canvasElement, "Catalog");

    await userEvent.click(catalog.getByRole("checkbox", { name: "Invoices" }));
    await userEvent.click(
      catalog.getByRole("checkbox", { name: "Placeholder" })
    );
    await userEvent.click(catalog.getByRole("button", { name: "Add 2" }));

    await expect(args.onMove).toHaveBeenCalledTimes(1);
    await expect(args.onMove).toHaveBeenCalledWith(
      ["invoices", "placeholder"],
      "granted"
    );

    const granted = bucket(canvasElement, "Granted");

    await expect(
      granted.getByRole("checkbox", { name: "Invoices" })
    ).not.toBeChecked();
    await expect(
      within(canvasElement).queryByRole("button", { name: /^(Add|Remove) \d/ })
    ).toBeNull();
    // The role control shows on granted rows only.
    await expect(
      granted.getByRole("button", { name: "Role of Invoices" })
    ).toBeVisible();
    await expect(
      catalog.queryByRole("button", { name: "Role of Ask" })
    ).toBeNull();
  },
};

/** T3: the search narrows a side, an empty caption goes, and the quick action moves shown rows only. */
export const Search: Story = {
  play: async ({ args, canvasElement }) => {
    const catalog = bucket(canvasElement, "Catalog");

    await userEvent.type(
      catalog.getByRole("textbox", { name: "Search Catalog" }),
      "every page"
    );

    await expect(
      catalog.queryByRole("checkbox", { name: "Invoices" })
    ).toBeNull();
    await expect(catalog.queryByText(/^Modules ·/)).toBeNull();
    await expect(catalog.getByText("Core · 1")).toBeVisible();

    await userEvent.click(
      catalog.getByRole("button", { name: "Add all shown" })
    );
    await expect(args.onMove).toHaveBeenCalledWith(["ask"], "granted");
  },
};

/** G7: a blocked row cannot be added, and "Add all shown" skips it. */
export const BlockedRow: Story = {
  args: { initial: [] },
  play: async ({ args, canvasElement }) => {
    const catalog = bucket(canvasElement, "Catalog");

    const analytics = catalog.getByRole("checkbox", { name: "Analytics" });

    // Base UI draws the box as a span, so the state is aria-disabled, not `disabled`.
    await expect(analytics).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(analytics);
    await expect(analytics).not.toBeChecked();

    await userEvent.click(
      catalog.getByRole("button", { name: "Add all shown" })
    );
    await expect(args.onMove).toHaveBeenCalledWith(
      ["invoices", "placeholder", "slides", "ask"],
      "granted"
    );
  },
};

/** G7: select-all skips a blocked row, and the same row can still be removed from Granted. */
export const BlockedRowGranted: Story = {
  args: { initial: ["analytics", "slides"] },
  play: async ({ args, canvasElement }) => {
    const granted = bucket(canvasElement, "Granted");

    await userEvent.click(granted.getByRole("checkbox", { name: "Analytics" }));
    await userEvent.click(granted.getByRole("button", { name: "Remove 1" }));
    await expect(args.onMove).toHaveBeenLastCalledWith(
      ["analytics"],
      "available"
    );

    const catalog = bucket(canvasElement, "Catalog");

    await userEvent.click(
      catalog.getByRole("checkbox", { name: "Select all shown in Catalog" })
    );
    await userEvent.click(catalog.getByRole("button", { name: "Add 3" }));
    await expect(args.onMove).toHaveBeenLastCalledWith(
      ["invoices", "placeholder", "ask"],
      "granted"
    );
  },
};

/** R-5: on desktop, a press beside the 16 px select-all box still ticks it. */
export const SelectAllHitArea: Story = {
  play: async ({ canvasElement }) => {
    // Under lg the box's own 44 px touch area would catch the press and prove nothing.
    await expect(window.innerWidth).toBeGreaterThanOrEqual(1024);

    const box = bucket(canvasElement, "Catalog").getByRole("checkbox", {
      name: "Select all shown in Catalog",
    });

    const rect = box.getBoundingClientRect();

    // userEvent does no hit-testing, so find what a press 6 px right of the box lands on.
    const target = canvasElement.ownerDocument.elementFromPoint(
      rect.right + 6,
      rect.top + rect.height / 2
    );

    if (target === null) throw new Error("Nothing is beside the box.");

    await userEvent.click(target);
    await expect(box).toBeChecked();
  },
};

/** T4-a, T4-b: the panes wear the Access design's band, link and row rules. */
export const PaneLook: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const catalog = canvas.getByRole("group", { name: "Catalog" });
    const band = catalog.firstElementChild;

    if (band === null) throw new Error("The Catalog pane has no band.");

    // The band is gray-50, so the caption and quick action sit on it.
    await expect(window.getComputedStyle(band).backgroundColor).toBe(
      "rgb(249, 250, 251)"
    );

    const quick = (name: string) =>
      window.getComputedStyle(canvas.getByRole("button", { name }));

    // The quick action is semibold brand text, not a bordered button.
    await expect(quick("Add all shown").fontWeight).toBe("600");
    await expect(quick("Add all shown").color).toBe("rgb(37, 99, 235)");
    await expect(quick("Remove all shown").fontWeight).toBe("600");
    await expect(quick("Remove all shown").color).toBe("rgb(37, 99, 235)");

    const row = (label: string) => {
      const li = canvas.getByRole("checkbox", { name: label }).closest("li");

      if (li === null) throw new Error(`The ${label} row is missing.`);

      return li;
    };

    // No hairline under a caption, one between rows.
    await expect(window.getComputedStyle(row("Analytics")).borderTopWidth).toBe(
      "0px"
    );
    await expect(window.getComputedStyle(row("Invoices")).borderTopWidth).toBe(
      "1px"
    );
    // A row with its description keeps at least 56 px.
    await expect(
      row("Invoices").getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(56);

    // C08-5: a blocked row keeps the medium name, and an editable row is semibold.
    await expect(
      getComputedStyle(within(row("Analytics")).getByText("Analytics"))
        .fontWeight
    ).toBe("500");
    await expect(
      getComputedStyle(within(row("Invoices")).getByText("Invoices")).fontWeight
    ).toBe("600");

    // C08-1: a panes-layout pane clamps its rows to the rounded border, so a row cut off at the
    // pane's bottom edge cannot show a square hover fill past the 8 px radius.
    for (const name of ["Catalog", "Granted"]) {
      const flow = getComputedStyle(canvas.getByRole("group", { name }));

      // oxlint-disable-next-line no-await-in-loop -- each pane is measured on its own.
      await expect([flow.overflowX, flow.overflowY]).toEqual(["clip", "clip"]);
    }
  },
};

/** T4: the narrow form stacks Catalog above Granted, each with its own search, and moves both ways. */
export const Stacked: Story = {
  args: { layout: "stacked" },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const catalog = canvas.getByRole("group", { name: "Catalog" });
    const granted = canvas.getByRole("group", { name: "Granted" });

    await expect(
      canvas
        .getAllByRole("group", { name: /^(Granted|Catalog)$/ })
        .map((group) => group.getAttribute("aria-label"))
    ).toEqual(["Catalog", "Granted"]);
    await expect(catalog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      granted.getBoundingClientRect().top
    );
    await expect(
      canvas.getByRole("textbox", { name: "Search Catalog" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Search Granted" })
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("checkbox", { name: "Slides" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Invoices" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add 1" }));
    await expect(args.onMove).toHaveBeenLastCalledWith(["invoices"], "granted");

    await userEvent.click(canvas.getByRole("button", { name: "Remove 1" }));
    await expect(args.onMove).toHaveBeenLastCalledWith(["slides"], "available");
  },
};

/** C08-1: every box reaches its 44 px touch area on a phone, and the panes keep their round corners. */
export const StackedTouchAreasOnPhone: Story = {
  args: { layout: "stacked" },
  // Every screen pads the list; with no page edge, the area's left 2 px falls off the viewport.
  render: (args) => (
    <div className="p-4">
      <Harness {...args} />
    </div>
  ),
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The touch check's probe: the outermost whole pixel of the area's left and right edge, at the middle.
    const short = canvas.getAllByRole("checkbox").flatMap((box) => {
      box.scrollIntoView({ block: "center", behavior: "instant" });

      const rect = box.getBoundingClientRect();
      const middle = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      return [
        [Math.ceil(middle - 22), "left"],
        [Math.floor(middle + 22) - 1, "right"],
      ].flatMap(([x, side]) =>
        box.contains(document.elementFromPoint(Number(x), y))
          ? []
          : [`${box.getAttribute("aria-label")} (${side})`]
      );
    });

    await expect(short).toEqual([]);

    // Without the pane's clip, the band and the last row round themselves (no square hover corner).
    for (const name of ["Catalog", "Granted"]) {
      const pane = canvas.getByRole("group", { name });
      const band = pane.firstElementChild;
      const last = pane.querySelector("ul > li:last-child");

      if (band === null || last === null)
        throw new Error(`${name} has no band or row.`);

      // oxlint-disable-next-line no-await-in-loop -- each pane is measured on its own.
      await expect(getComputedStyle(band).borderTopLeftRadius).toBe("8px");
      // oxlint-disable-next-line no-await-in-loop -- each pane is measured on its own.
      await expect(getComputedStyle(last).borderBottomLeftRadius).toBe("8px");
    }
  },
};

/** A1, A2: a read-only row has no checkbox, never moves, and shares its module's count. */
export const ReadOnlyRowsAndOneCountPerKey: Story = {
  args: { initial: ["fixture", "fixture-finance"], onNote: fn() },
  render: (args) => (
    <Harness {...args} items={readOnlyItems(args.onNote ?? (() => {}))} />
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const granted = bucket(canvasElement, "Granted");

    await expect(
      canvas.getByRole("heading", { name: "Granted · 1" })
    ).toBeVisible();
    await expect(granted.getByText("Modules · 1")).toBeVisible();
    await expect(
      granted.getAllByRole("checkbox", { name: "Fixture" })
    ).toHaveLength(1);

    await userEvent.click(
      granted.getByRole("checkbox", { name: "Select all shown in Granted" })
    );
    await expect(
      canvas.getByRole("button", { name: "Remove 1" })
    ).toBeVisible();
    await userEvent.click(
      granted.getByRole("button", { name: "Remove all shown" })
    );
    await expect(args.onMove).toHaveBeenCalledWith(["fixture"], "available");

    await userEvent.click(
      bucket(canvasElement, "Granted").getByRole("button", {
        name: "Finance team",
      })
    );
    await expect(args.onNote).toHaveBeenCalledOnce();

    // C08-5: a read-only row keeps the semibold name; only a blocked row drops to medium.
    const readOnlyName = granted
      .getAllByText("Fixture", { selector: "span" })
      .find(
        (span) =>
          span.closest("li")?.querySelector('[role="checkbox"]') === null
      );

    if (readOnlyName === undefined)
      throw new Error("The read-only Fixture row is missing.");

    await expect(getComputedStyle(readOnlyName).fontWeight).toBe("600");
  },
};

/** A3: the stacked form counts and selects the same way. */
export const ReadOnlyRowsStacked: Story = {
  args: {
    layout: "stacked",
    initial: ["fixture", "fixture-finance"],
    onNote: fn(),
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: (args) => (
    <Harness {...args} items={readOnlyItems(args.onNote ?? (() => {}))} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "Granted · 1" })
    ).toBeVisible();
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Granted" })).getByRole(
        "checkbox",
        { name: "Select all shown in Granted" }
      )
    );
    await expect(
      canvas.getByRole("button", { name: "Remove 1" })
    ).toBeVisible();
  },
};

/** T5-d: a stacked pane grows with its rows instead of scrolling inside (Review Focus 3). */
export const StackedLongList: Story = {
  args: {
    layout: "stacked",
    initial: [],
    items: Array.from({ length: 12 }, (_, index) => ({
      id: `m${index + 1}`,
      label: `Module ${index + 1}`,
      group: "Modules",
    })),
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const catalog = canvas.getByRole("group", { name: "Catalog" });

    const last = within(catalog)
      .getByRole("checkbox", { name: "Module 12" })
      .closest("li");

    if (last === null) throw new Error("The 12th row is missing.");

    await expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      catalog.getBoundingClientRect().bottom
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
