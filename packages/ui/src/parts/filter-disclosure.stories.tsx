import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, not ./filter-disclosure.tsx, so that the stories prove what an app can import.
import {
  FilterDisclosure,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../index.ts";

const statusItems = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
];

const onStatus = fn();

const meta = {
  title: "UI/FilterDisclosure",
  component: FilterDisclosure,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The filter disclosure (tokens.md, "Filter disclosure"). The secondary Filters button carries a sliders icon and a count pill of the filters narrowing the list. A press opens one 288 px panel that hangs from the left edge of the button and stacks one labelled control per filter. Clear filters shows at the foot while the count is above zero. Escape, a click outside, Close and the button close it, and focus returns to the button. Sort never goes in the panel, and every active filter stays visible as a chip under the toolbar.',
      },
    },
  },
  args: {
    count: 1,
    onClear: fn(),
    children: (
      <Field>
        <FieldLabel id="status-label">Status</FieldLabel>
        <Select items={statusItems} defaultValue="all" onValueChange={onStatus}>
          <SelectTrigger aria-labelledby="status-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    ),
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  // Room around the button, so the panel can line up with it rather than with a viewport gutter.
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterDisclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A story that ends with the panel open lets axe measure it. Base UI's focus guards are
 * `aria-hidden` on purpose (they hand focus on), so only they skip `aria-hidden-focus`.
 */
const OPEN_PANEL_A11Y = {
  a11y: {
    test: "error",
    config: {
      rules: [
        {
          id: "aria-hidden-focus",
          selector: '[aria-hidden="true"]:not([data-base-ui-focus-guard])',
        },
      ],
    },
  },
};

export const PanelUnderTheButton: Story = {
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Filters 1" });

    await expect(screen.queryByRole("group", { name: "Filters" })).toBeNull();

    await userEvent.click(button);

    const panel = await screen.findByRole("group", { name: "Filters" });

    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getBoundingClientRect().width).toBe(288);
    await expect(
      Math.abs(
        panel.getBoundingClientRect().left - button.getBoundingClientRect().left
      )
    ).toBeLessThanOrEqual(1);

    // Picking an option in a nested select leaves the panel open for the next filter.
    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Pending" })
    );
    await expect(onStatus).toHaveBeenCalledWith("pending", expect.anything());
    await expect(panel).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" })
    );
    await expect(args.onClear).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Filters" })).toBeNull()
    );
    await expect(button).toHaveFocus();
  },
};

export const NothingFiltered: Story = {
  args: { count: 0 },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await screen.findByRole("group", { name: "Filters" });

    await expect(
      screen.queryByRole("button", { name: "Clear filters" })
    ).toBeNull();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Filters" })).toBeNull()
    );
  },
};

// The button sits at the right edge of a phone toolbar; the panel still stays on screen.
export const PhoneAtTheRightEdge: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: OPEN_PANEL_A11Y,
  decorators: [
    (Story) => (
      <div className="flex justify-end">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters 1" }));

    const panel = await screen.findByRole("group", { name: "Filters" });
    const box = panel.getBoundingClientRect();

    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
