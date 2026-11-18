import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

import {
  BUILT_IN_CONTROLS,
  Button,
  FilterBar,
  formatDayRange,
  useListState,
  type ListDefinition,
  type ListFilterControlProps,
} from "../index.ts";
import {
  customers,
  docsState,
  invoicesLike,
  param,
  resetAddress,
} from "./list-fixtures.ts";

function Bar(props: {
  readonly definition: ListDefinition;
  readonly anchorDay?: string;
}) {
  const state = useListState(props.definition);

  return (
    <div className="rounded-xl border border-border">
      <FilterBar
        definition={props.definition}
        state={state}
        controls={BUILT_IN_CONTROLS}
        anchorDay={props.anchorDay}
      />
    </div>
  );
}

const meta = {
  title: "UI/List header/FilterBar",
  component: FilterBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The filter bar of a list card (Spec 7 R-37a, variant A of czjw.102). Each control has a fixed width and the field height. A trigger shows its label muted and its value semibold, and a set value tints it. Clear filters shows only while a filter is set. The controls that do not fit move into More filters, in definition order. Every change writes the page address at once.",
      },
    },
  },
  args: {
    definition: invoicesLike,
    state: docsState,
    controls: BUILT_IN_CONTROLS,
    anchorDay: "2026-11-03",
  },
  beforeEach: resetAddress,
  render: (args) => <Bar definition={args.definition} anchorDay="2026-11-03" />,
  globals: { viewport: { value: "desktop1440", isRotated: false } },
} satisfies Meta<typeof FilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * S1: in the bar a muted label and a semibold value (variant A, czjw.102), a set value tints the
 * control, and the placeholder item clears it.
 */
export const OptionPlaceholderAndSet: Story = {
  play: async ({ canvas }) => {
    const empty = canvas.getByLabelText("Customer: All customers");
    const label = within(empty).getByText("Customer");

    await expect(label).toHaveClass("text-muted-foreground");
    await expect(getComputedStyle(label).fontWeight).toBe("400");
    await expect(
      getComputedStyle(within(empty).getByText("All customers")).fontWeight
    ).toBe("600");

    const emptyFill = getComputedStyle(empty).backgroundColor;

    await userEvent.click(empty);
    await userEvent.click(
      await screen.findByRole("option", { name: "Northwind Traders" })
    );
    await waitFor(() => expect(param("customer")).toBe("c-2"));
    // The closed list fades out before it unmounts; until then its options also match.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

    const set = canvas.getByLabelText("Customer: Northwind Traders");

    await expect(getComputedStyle(set).fontWeight).toBe("600");
    await expect(getComputedStyle(set).backgroundColor).not.toBe(emptyFill);

    await userEvent.click(set);
    await userEvent.click(
      await screen.findByRole("option", { name: "All customers" })
    );
    await waitFor(() => expect(param("customer")).toBeNull());
    await expect(
      canvas.getByLabelText("Customer: All customers")
    ).toBeInTheDocument();
  },
};

/** S2: a quick range sets the address and the trigger text (LH25). */
export const QuickRangeApplies: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByLabelText("Invoice date: Any invoice date")
    );

    const quick = await screen.findByRole("group", { name: "Quick ranges" });

    await expect(within(quick).getAllByRole("button")).toHaveLength(5);
    await userEvent.click(
      within(quick).getByRole("button", { name: "Last month" })
    );
    await waitFor(() => expect(param("date")).toBe("2026-10-01..2026-10-31"));
    await expect(
      within(quick).getByRole("button", { name: "Last month" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.getByLabelText(
        `Invoice date: ${formatDayRange("2026-10-01", "2026-10-31")}`
      )
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};

/** S4: past the bar's width the date range sits in More filters, and still writes the address. */
export const MoreFiltersWhenNarrow: Story = {
  render: (args) => (
    <div className="w-130">
      <Bar definition={args.definition} anchorDay="2026-11-03" />
    </div>
  ),
  play: async ({ canvas }) => {
    const more = await canvas.findByRole("button", { name: "More filters" });

    await expect(
      canvas.queryByLabelText("Invoice date: Any invoice date")
    ).toBeNull();
    await expect(canvas.getByLabelText("Search invoices")).toBeVisible();

    await userEvent.click(more);
    await userEvent.click(
      await screen.findByLabelText("Invoice date: Any invoice date")
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "This month" })
    );
    await waitFor(() => expect(param("date")).toBe("2026-11-01..2026-11-30"));
    await userEvent.keyboard("{Escape}");
  },
};

const multi: ListDefinition = {
  ...invoicesLike,
  filters: [
    {
      id: "customer",
      kind: "multi-option",
      label: "Customer",
      placeholder: "All customers",
      options: customers,
    },
  ],
};

/** S5: two picks write `a,b`, and the trigger counts them. */
export const MultiOptionCounts: Story = {
  args: { definition: multi },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Customer: All customers"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Harbor Freight" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Blue Fin Foods" })
    );
    await waitFor(() => expect(param("customer")).toBe("c-1,c-3"));
    await userEvent.keyboard("{Escape}");
    await expect(
      canvas.getByLabelText("Customer: 2 customers")
    ).toBeInTheDocument();
  },
};

/** A search still waiting for its 300 ms pause does not come back after Clear filters. */
export const ClearBeatsPendingSearch: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Customer: All customers"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Harbor Freight" })
    );
    await waitFor(() => expect(param("customer")).toBe("c-1"));

    await userEvent.type(canvas.getByLabelText("Search invoices"), "north", {
      delay: null,
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear filters" })
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    await expect(param("q")).toBeNull();
    await expect(param("customer")).toBeNull();
    await expect(canvas.getByLabelText("Search invoices")).toHaveValue("");
  },
};

/**
 * Clear filters shows only while something is set, right after the last control (variant A,
 * czjw.102), and clears the filters and the search.
 */
export const ClearFilters: Story = {
  play: async ({ canvas }) => {
    const clearButton = () =>
      canvas.queryByRole("button", { name: "Clear filters" });

    await expect(clearButton()).toBeNull();
    await userEvent.type(canvas.getByLabelText("Search invoices"), "harbor");
    await waitFor(() => expect(param("q")).toBe("harbor"));

    const clear = await canvas.findByRole("button", { name: "Clear filters" });
    const last = canvas.getByLabelText("Invoice date: Any invoice date");

    await expect(
      clear.getBoundingClientRect().left - last.getBoundingClientRect().right
    ).toBeLessThanOrEqual(10);
    clear.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(param("q")).toBeNull());
    await expect(canvas.getByLabelText("Search invoices")).toHaveValue("");
    await waitFor(() => expect(clearButton()).toBeNull());
    await expect(canvas.getByLabelText("Search invoices")).toHaveFocus();
  },
};

/** A registered kind that draws a 200 px control, as the Overview's Person or group filter does. */
function Probe(props: ListFilterControlProps) {
  return (
    <Button variant="secondary" size="filter" className="w-50 shrink-0">
      {props.filter.label}
    </Button>
  );
}

const narrow: ListDefinition = {
  ...invoicesLike,
  filters: [
    {
      id: "q",
      kind: "search",
      label: "Search invoices",
      placeholder: "Search",
    },
    {
      id: "customer",
      kind: "option",
      label: "Customer",
      placeholder: "All customers",
      options: customers,
      barWidth: 200,
    },
    {
      id: "payer",
      kind: "option",
      label: "Payer",
      placeholder: "All payers",
      options: customers,
      barWidth: 200,
    },
    {
      id: "owner",
      kind: "probe",
      label: "Owner",
      placeholder: "Anyone",
      barWidth: 200,
    },
  ],
};

function NarrowBar() {
  const state = useListState(narrow);

  return (
    // 1136 px: the list card of the Access Overview at 1440 (P12-12).
    <div className="w-284 rounded-xl border border-border">
      <FilterBar
        definition={narrow}
        state={state}
        controls={{ ...BUILT_IN_CONTROLS, probe: Probe }}
      />
    </div>
  );
}

/** T7-j (P12-12): a search and three 200 px filters fit a 1136 px bar, with no More filters. */
export const NarrowRegisteredFilters: Story = {
  render: () => <NarrowBar />,
  play: async ({ canvas }) => {
    // The bar measures itself after the first paint; give its observer time to answer.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(
      canvas.queryByRole("button", { name: "More filters" })
    ).toBeNull();
    await expect(canvas.getByRole("button", { name: "Owner" })).toBeVisible();

    await Promise.all(
      ["Customer: All customers", "Payer: All payers"].map((name) =>
        expect(canvas.getByLabelText(name).getBoundingClientRect().width).toBe(
          200
        )
      )
    );
  },
};
