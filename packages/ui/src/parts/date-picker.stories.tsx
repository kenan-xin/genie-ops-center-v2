import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, so that the stories prove what an app can import.
import { DatePicker, Field, FieldLabel } from "../index.ts";

/** The field holds its own text, as a form field does, and reports each change. */
function DueDate(props: {
  readonly initial: string;
  readonly onValueChange: (text: string) => void;
}) {
  const [text, setText] = useState(props.initial);

  return (
    <Field>
      <FieldLabel htmlFor="due-date">Due date</FieldLabel>
      <DatePicker
        id="due-date"
        placeholder="25 Nov 2026"
        pickLabel="Choose the due date"
        value={text}
        onValueChange={(next) => {
          setText(next);
          props.onValueChange(next);
        }}
      />
    </Field>
  );
}

const meta = {
  title: "UI/DatePicker",
  component: DueDate,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One date field (owner I8): a text field with a calendar button. The person types the app format (\"25 Nov 2026\", any case, a whole or cut month) or an ISO day, and leaving the field rewrites a readable day in the app format. Text that does not read stays as typed, so the form can refuse it. ArrowDown or the button opens a calendar on the field's month, Monday first. A pick writes the day, closes the calendar and returns focus to the field. The value is the field's text.",
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
  args: { initial: "", onValueChange: fn() },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [
    (Story) => (
      <div className="max-w-xs p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DueDate>;

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

export const PickWritesTheDay: Story = {
  args: { initial: "1 Nov 2026" },
  play: async ({ args, canvas }) => {
    const field = canvas.getByLabelText("Due date");

    await userEvent.click(
      canvas.getByRole("button", { name: "Choose the due date" })
    );
    await userEvent.click(await dayButton("2026-11-25"));

    await expect(args.onValueChange).toHaveBeenLastCalledWith("25 Nov 2026");
    await expect(field).toHaveValue("25 Nov 2026");
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    await waitFor(() => expect(field).toHaveFocus());
  },
};

export const TypedDayOpensOnItsMonth: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByLabelText("Due date");

    await userEvent.type(field, "2026-02-14");
    await userEvent.tab();
    await expect(field).toHaveValue("14 Feb 2026");

    await userEvent.click(
      canvas.getByRole("button", { name: "Choose the due date" })
    );

    await expect(await dayButton("2026-02-14")).toHaveAttribute(
      "data-selected-single",
      "true"
    );
  },
};

export const ArrowDownOpens: Story = {
  args: { initial: "1 Nov 2026" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Due date"));
    await userEvent.keyboard("{ArrowDown}");

    await expect(await dayButton("2026-11-01")).toHaveFocus();
  },
};

/** WCAG 2.5.3 (axe `label-content-name-mismatch`): a day's name holds the number it shows. */
export const DayNamesHoldTheShownNumber: Story = {
  args: { initial: "1 Nov 2026" },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Choose the due date" })
    );
    await dayButton("2026-11-01");

    const mismatched = [
      ...document.querySelectorAll("button[data-day]"),
    ].filter(
      (button) =>
        !new RegExp(`(^|\\s)${button.textContent}(\\s|$)`, "u").test(
          button.getAttribute("aria-label") ?? ""
        )
    );

    await expect(mismatched).toEqual([]);

    await expect(
      (await dayButton("2026-11-01")).getAttribute("aria-label")
    ).toBe("Sunday 1 November 2026, selected");
  },
};

export const PhoneTouchTargets: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Choose the due date" })
    );

    const day = await dayButton("2026-11-04").catch(() =>
      document.querySelector<HTMLButtonElement>("button[data-day]")
    );

    await expect(day?.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44
    );

    const grid = screen.getByRole("grid").getBoundingClientRect();

    await expect(grid.left).toBeGreaterThanOrEqual(0);
    await expect(grid.right).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

function popupBox() {
  const rect = document
    .querySelector("[data-slot=popover-content]")
    ?.getBoundingClientRect();

  return { left: Math.round(rect?.left ?? -1), top: rect?.top ?? -1 };
}

/** czjw.101: the calendar opens under the whole field, its left edge on the field's left edge. */
async function calendarSitsUnderTheField(canvas: {
  getByRole: typeof screen.getByRole;
}) {
  const button = canvas.getByRole("button", { name: "Choose the due date" });
  const field = button.closest("[data-slot=input-group]");

  await userEvent.click(button);
  await dayButton("2026-11-01");

  const fieldBox = field?.getBoundingClientRect();

  await waitFor(() =>
    expect(popupBox().left).toBe(Math.round(fieldBox?.left ?? 0))
  );

  await expect(popupBox().top).toBeGreaterThanOrEqual(fieldBox?.bottom ?? 0);
}

export const CalendarUnderTheField: Story = {
  args: { initial: "1 Nov 2026" },
  play: async ({ canvas }) => calendarSitsUnderTheField(canvas),
};

export const CalendarUnderTheFieldPhone: Story = {
  args: { initial: "1 Nov 2026" },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => calendarSitsUnderTheField(canvas),
};

export const UnreadableTextStays: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByLabelText("Due date");

    await userEvent.type(field, "31 Feb 2026");
    await userEvent.tab();

    await expect(field).toHaveValue("31 Feb 2026");
  },
};

export const Dark: Story = {
  args: { initial: "25 Nov 2026" },
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Choose the due date" })
    );
    await dayButton("2026-11-25");
  },
};
