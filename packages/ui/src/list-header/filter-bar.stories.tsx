import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

import {
  BUILT_IN_CONTROLS,
  FilterBar,
  formatDayRange,
  useListState,
  type ListDefinition,
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
          "The compact filter bar of a list card (Spec 7 R-37a, variant C). Each control has a fixed width and one height. A placeholder is muted and regular, a set value tinted and semibold. The controls that do not fit move into More filters, in definition order. Every change writes the page address at once.",
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

/** S1: a placeholder is muted and regular, a set value tinted and semibold, and the placeholder item clears it. */
export const OptionPlaceholderAndSet: Story = {
  play: async ({ canvas }) => {
    const empty = canvas.getByLabelText("Customer: All customers");
    const emptyText = within(empty).getByText("All customers");

    await expect(emptyText).toHaveClass("text-muted-foreground");
    await expect(getComputedStyle(emptyText).fontWeight).toBe("400");

    const emptyFill = getComputedStyle(empty).backgroundColor;

    await userEvent.click(empty);
    await userEvent.click(
      await screen.findByRole("option", { name: "Northwind Traders" })
    );
    await waitFor(() => expect(param("customer")).toBe("c-2"));

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

/** Clear filters stays off until something is set, and then clears the filters and the search. */
export const ClearFilters: Story = {
  play: async ({ canvas }) => {
    const clear = canvas.getByRole("button", { name: "Clear filters" });

    await expect(clear).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("Search invoices"), "harbor");
    await waitFor(() => expect(param("q")).toBe("harbor"));
    await waitFor(() => expect(clear).toBeEnabled());
    await userEvent.click(clear);
    await waitFor(() => expect(param("q")).toBeNull());
    await expect(canvas.getByLabelText("Search invoices")).toHaveValue("");
  },
};
