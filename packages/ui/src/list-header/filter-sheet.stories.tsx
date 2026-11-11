import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import {
  BUILT_IN_CONTROLS,
  FilterSheet,
  useListState,
  type ListDefinition,
} from "../index.ts";
import {
  docsState,
  invoicesLike,
  param,
  resetAddress,
} from "./list-fixtures.ts";

const counts = {
  "all": 36,
  "open": 12,
  "overdue": 3,
  "no-due-date": 0,
  "paid": 21,
};

function Live(props: { readonly definition: ListDefinition }) {
  const state = useListState(props.definition);

  return (
    <FilterSheet
      definition={props.definition}
      state={state}
      controls={BUILT_IN_CONTROLS}
      counts={counts}
      resultCount={6}
      anchorDay="2026-11-03"
    />
  );
}

const meta = {
  title: "UI/List header/FilterSheet",
  component: FilterSheet,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The phone Filters sheet of a list (variant C): the status as radios with counts, then each filter but the search. Each pick writes the address at once. Show closes the sheet, and focus returns to Filters. A count of 0 shows no number.",
      },
    },
  },
  args: {
    definition: invoicesLike,
    state: docsState,
    controls: BUILT_IN_CONTROLS,
    counts,
    resultCount: 6,
  },
  beforeEach: resetAddress,
  render: (args) => <Live definition={args.definition} />,
  globals: { viewport: { value: "mobile1", isRotated: false } },
} satisfies Meta<typeof FilterSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** S3: a status radio writes the address at once, and Show closes the sheet and returns focus. */
export const AppliesAtOnce: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));

    const sheet = await screen.findByRole("dialog", { name: "Filters" });

    await expect(
      screen.getByRole("radio", { name: "No due date" })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Overdue 3" }));
    await waitFor(() => expect(param("status")).toBe("overdue"));
    // The sheet fades in from opacity 0; it stays open after the pick.
    await waitFor(() => expect(sheet).toBeVisible());

    await userEvent.click(
      screen.getByRole("button", { name: "Show 6 invoices" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );

    const filters = canvas.getByRole("button", { name: "Filters 1 set" });

    await waitFor(() => expect(filters).toHaveFocus());
    await expect(filters.getBoundingClientRect().height).toBe(44);
  },
};

/** Clear all is off with nothing set, and resets the status to the resting tab. */
export const ClearAll: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));

    const clear = await screen.findByRole("button", { name: "Clear all" });

    await expect(clear).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Paid 21" }));
    await waitFor(() => expect(clear).toBeEnabled());
    await userEvent.click(clear);
    await waitFor(() => expect(param("status")).toBeNull());
    await expect(screen.getByRole("radio", { name: "All 36" })).toBeChecked();
    // 6wz1.98: Clear all disables itself, so the focus moves to Show, not the body.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Show 6 invoices" })
      ).toHaveFocus()
    );
    await userEvent.keyboard("{Escape}");
  },
};
