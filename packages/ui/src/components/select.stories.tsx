import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, not ./select.tsx, so that the stories prove what an app
// can import.
import {
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../index.ts";

const items = [
  { value: "r-reader", label: "Reader" },
  { value: "r-admin", label: "Administrator" },
];

const meta = {
  title: "UI/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Select on the Base UI primitive (`@base-ui/react/select`). Pass `items` so that the trigger shows the label, not the stored value. The trigger shares the Input boundary and the sm 32, md 40 and lg 44 px heights; the popup is a `rounded-md` card with a shadow and no motion beyond a fade. Enter or Space opens it, arrows move, Enter picks.",
      },
    },
  },
  args: {
    items,
    onValueChange: fn(),
  },
  render: (args) => (
    <Field>
      <FieldLabel id="role-label">Role</FieldLabel>
      <Select {...args}>
        <SelectTrigger aria-labelledby="role-label">
          <SelectValue placeholder="Pick a role" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  ),
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Role" });

    await expect(trigger.getBoundingClientRect().height).toBe(40);

    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(getComputedStyle(trigger).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );

    await userEvent.keyboard("{Enter}");
    await userEvent.click(
      await screen.findByRole("option", { name: "Reader" })
    );
    await expect(args.onValueChange).toHaveBeenCalledWith(
      "r-reader",
      expect.anything()
    );
    // The popup fades out; the a11y check must not catch it half unmounted.
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    );
  },
};

export const ShowsTheLabel: Story = {
  args: { defaultValue: "r-admin" },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Role" });

    await expect(trigger).toHaveTextContent("Administrator");
    await expect(trigger).not.toHaveTextContent("r-admin");
  },
};

export const Multiple: Story = {
  args: { multiple: true, defaultValue: [] },
  play: async ({ args, canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Role" });

    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("option", { name: "Reader" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Administrator" })
    );

    await expect(args.onValueChange).toHaveBeenLastCalledWith(
      ["r-reader", "r-admin"],
      expect.anything()
    );
    await waitFor(() => expect(trigger).toHaveTextContent("Reader"));
    await expect(trigger).toHaveTextContent("Administrator");
  },
};

export const Dark: Story = {
  ...ShowsTheLabel,
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    // Open, so that the a11y addon measures the popup contrast as well.
    await userEvent.click(canvas.getByRole("combobox", { name: "Role" }));
    const option = await screen.findByRole("option", { name: "Reader" });

    // The popup fades in, so wait until it paints.
    await waitFor(() => expect(option).toBeVisible());
  },
};
