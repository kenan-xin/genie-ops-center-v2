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
    blockedReason: "Analytics is switched off for this deployment.",
    pills: <StatusPill tone="warning">Inactive</StatusPill>,
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
    note: "Also through Finance team",
  },
  {
    id: "ask",
    label: "Ask",
    control: roleControl("Ask"),
    description: "The agent chat on every page.",
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
    <div className={layout === "roster" ? "flex h-[40rem] flex-col" : ""}>
      <TransferList
        items={rows}
        granted={granted}
        layout={layout}
        availableLabel="Catalog"
        grantedLabel="Granted"
        emptyAvailable="Nothing left to add."
        emptyGranted="Nothing granted yet."
        searchLabel="Search modules"
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
    </div>
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
          'The transfer list (tokens.md, "Transfer list"): rows move between an available bucket and a granted bucket. `panes` shows the two buckets side by side, for a container of about 900 px. `roster` shows one list with one search, granted first, for a narrow container. The list owns its ticks and its search; the caller owns `granted` and applies `onMove`. A row with `blockedReason` cannot be added, but it can still be removed. `control` sits on granted rows only.',
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
      "agent"
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

/** T4: the phone form is one list with one search, Granted first, and moves both ways. */
export const Roster: Story = {
  args: { layout: "roster" },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getAllByRole("textbox")).toHaveLength(1);
    await expect(
      canvas.getByRole("textbox", { name: "Search modules" })
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("checkbox", { name: /^Select all/ })
    ).toHaveLength(1);
    await expect(
      canvas
        .getAllByRole("group", { name: /^(Granted|Catalog)$/ })
        .map((group) => group.getAttribute("aria-label"))
    ).toEqual(["Granted", "Catalog"]);

    await userEvent.click(canvas.getByRole("checkbox", { name: "Slides" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Invoices" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add 1" }));
    await expect(args.onMove).toHaveBeenLastCalledWith(["invoices"], "granted");

    await userEvent.click(canvas.getByRole("button", { name: "Remove 1" }));
    await expect(args.onMove).toHaveBeenLastCalledWith(["slides"], "available");
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
  },
};

/** A3: the phone roster counts and selects the same way. */
export const ReadOnlyRowsRoster: Story = {
  args: {
    layout: "roster",
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
      canvas.getByRole("checkbox", { name: "Select all shown" })
    );
    await expect(
      canvas.getByRole("button", { name: "Remove 1" })
    ).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
