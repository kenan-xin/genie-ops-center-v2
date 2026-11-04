import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, so that the stories prove what an app can import.
import { DateRangePicker, FilterDisclosure, type DayRange } from "../index.ts";

// A range carries a thin space (U+2009) each side of its dash, so the names match it with \s.
/** The filter holds the range, as a list's filter state does, and reports each change. */
function Dates(props: {
  readonly initial: DayRange;
  readonly onChange: (range: DayRange) => void;
}) {
  const [range, setRange] = useState(props.initial);

  return (
    <DateRangePicker
      label="Dates"
      placeholder="Any date"
      value={range}
      onChange={(next) => {
        setRange(next);
        props.onChange(next);
      }}
    />
  );
}

const meta = {
  title: "UI/DateRangePicker",
  component: Dates,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'One date range filter (owner I8, list filter prototype C): a button with a calendar icon, the range or the placeholder, and a chevron. Its name is "<label>: <range>". The popover holds a range calendar, two months from `md` and one below, a footer line with the day count, Clear and Done. The first pick starts a range, the second ends it, in day order. Each pick calls `onChange`, and Done closes and returns focus to the button.',
      },
    },
    a11y: {
      test: "error",
      // Base UI's focus guards are aria-hidden on purpose (they hand focus on).
      config: {
        rules: [
          {
            id: "aria-hidden-focus",
            selector: '[aria-hidden="true"]:not([data-base-ui-focus-guard])',
          },
        ],
      },
    },
  },
  args: {
    initial: { from: "2026-10-05", to: "2026-10-09" },
    onChange: fn(),
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Dates>;

export default meta;

type Story = StoryObj<typeof meta>;

const dayButton = (day: string) =>
  waitFor(() => {
    const button = document.querySelector<HTMLButtonElement>(
      `button[data-day="${day}"]`
    );

    if (button === null) throw new Error(`no day ${day}`);

    return button;
  });

/** The live footer line under the calendar. */
const footer = () => document.querySelector('p[aria-live="polite"]');

export const PicksARange: Story = {
  play: async ({ args, canvas }) => {
    const trigger = canvas.getByRole("button", {
      name: /^Dates: 5\s–\s9 Oct 2026$/u,
    });

    await userEvent.click(trigger);
    await waitFor(() => expect(screen.getAllByRole("grid")).toHaveLength(2));

    await userEvent.click(await dayButton("2026-10-01"));
    await expect(footer()).toHaveTextContent(
      "From 1 Oct 2026 · pick the end date"
    );

    await userEvent.click(await dayButton("2026-11-03"));
    await expect(args.onChange).toHaveBeenLastCalledWith({
      from: "2026-10-01",
      to: "2026-11-03",
    });
    await expect(footer()).toHaveTextContent(
      /^1 Oct\s–\s3 Nov 2026 · 34 days$/u
    );

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    await waitFor(() =>
      expect(
        canvas.getByRole("button", {
          name: /^Dates: 1 Oct\s–\s3 Nov 2026$/u,
        })
      ).toHaveFocus()
    );
  },
};

// A stored filter can hold only an end day, for example from a list address; it must still show.
export const EndOnlyShows: Story = {
  args: { initial: { to: "2026-11-03" } },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Dates: Until 3 Nov 2026" })
    );
    await expect(footer()).toHaveTextContent(
      "Until 3 Nov 2026 · pick the start date"
    );
    await expect(await dayButton("2026-11-03")).toHaveAttribute(
      "data-range-end",
      "true"
    );
  },
};

export const ClearEmptiesBoth: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Dates:/u }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));

    await expect(args.onChange).toHaveBeenLastCalledWith({});
    await expect(
      canvas.getByRole("button", { name: "Dates: Any date" })
    ).toBeVisible();
  },
};

export const OneMonthOnAPhone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Dates:/u }));
    await waitFor(() => expect(screen.getAllByRole("grid")).toHaveLength(1));

    const done = screen
      .getByRole("button", { name: "Done" })
      .getBoundingClientRect();

    await expect(done.right).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
    await expect(done.bottom).toBeLessThanOrEqual(
      document.documentElement.clientHeight
    );
  },
};

function InFilters(props: { readonly onChange: (range: DayRange) => void }) {
  const [range, setRange] = useState<DayRange>({});

  return (
    <FilterDisclosure count={0} onClear={() => setRange({})}>
      <DateRangePicker
        label="Invoice date"
        placeholder="Any invoice date"
        value={range}
        onChange={(next) => {
          setRange(next);
          props.onChange(next);
        }}
      />
    </FilterDisclosure>
  );
}

export const InsideThePhoneFilters: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: (args) => <InFilters onChange={args.onChange} />,
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Invoice date: Any invoice date",
      })
    );
    await userEvent.click(await dayButton("2026-11-02"));
    await userEvent.click(await dayButton("2026-11-06"));

    await expect(args.onChange).toHaveBeenLastCalledWith({
      from: "2026-11-02",
      to: "2026-11-06",
    });
    await expect(screen.getByRole("group", { name: "Filters" })).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Dates:/u }));
    await dayButton("2026-10-05");
  },
};
