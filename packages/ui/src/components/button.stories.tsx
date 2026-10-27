import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

// The package entry, not ./button.tsx, so that the stories prove what an app
// can import.
import { Button } from "../index.ts";

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Button on the Base UI primitive (`@base-ui/react/button`), fitted to the tokens.md scale: sm 32 px, md 40 px, lg 44 px, five variants, one focus ring. It renders a native button, so a pointer, Enter and Space activate it. `disabled` leaves the tab order; `focusableWhenDisabled` keeps it there. `loading` keeps the label and the width and drops a press.",
      },
    },
  },
  args: {
    children: "Save changes",
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save changes" });

    await expect(button.getBoundingClientRect().height).toBe(40);

    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const ActivatesFromTheKeyboard: Story = {
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save changes" });

    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(getComputedStyle(button).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save changes" });

    await expect(button).toBeDisabled();

    await userEvent.tab();
    await expect(button).not.toHaveFocus();

    // pointer-events: none on a disabled button makes userEvent refuse the
    // click, so the check is skipped to prove the handler stays silent.
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const FocusableWhenDisabled: Story = {
  args: {
    disabled: true,
    focusableWhenDisabled: true,
    title: "Nothing to save yet",
  },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save changes" });

    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(button).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Button {...args}>
        <svg data-icon="inline-start" aria-hidden="true" viewBox="0 0 16 16" />
        Save changes
      </Button>
      <Button {...args} loading>
        <svg data-icon="inline-start" aria-hidden="true" viewBox="0 0 16 16" />
        Save changes
      </Button>
    </div>
  ),
  play: async ({ args, canvas }) => {
    const idle = canvas.getAllByRole("button", { name: "Save changes" }).at(0);
    const busy = canvas.getAllByRole("button", { name: "Save changes" }).at(1);

    if (!idle || !busy) {
      throw new Error("Loading renders two buttons");
    }

    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy).toHaveTextContent("Save changes");
    await expect(busy.getBoundingClientRect().width).toBe(
      idle.getBoundingClientRect().width
    );

    await userEvent.click(busy);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const LoadingWithoutIcon: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Button {...args}>Save changes</Button>
      <Button {...args} loading>
        Save changes
      </Button>
    </div>
  ),
  play: async ({ args, canvas }) => {
    const [idle, busy] = canvas.getAllByRole("button", {
      name: "Save changes",
    });

    if (!idle || !busy) {
      throw new Error("LoadingWithoutIcon renders two buttons");
    }

    // tokens.md "Buttons": the control keeps its width with no leading icon to replace.
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy.querySelector("svg")).toBeVisible();
    await expect(busy.getBoundingClientRect().width).toBe(
      idle.getBoundingClientRect().width
    );

    await userEvent.click(busy);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const LoadingSubmitDoesNotSubmit: Story = {
  render: (args) => (
    <form onSubmit={(event) => event.preventDefault()}>
      <Button {...args} type="submit" loading onClick={undefined}>
        Save changes
      </Button>
    </form>
  ),
  play: async ({ canvas, canvasElement }) => {
    const onSubmit = fn();
    canvasElement.querySelector("form")?.addEventListener("submit", onSubmit);

    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(onSubmit).not.toHaveBeenCalled();
  },
};

// 6wz1.21: focusableWhenDisabled drops the native disabled attribute, so Enter in a
// field still clicks the button as the form's default; neither path may submit.
export const FocusableWhenDisabledSubmitDoesNotSubmit: Story = {
  args: { disabled: true, focusableWhenDisabled: true },
  render: (args) => (
    <form>
      <input aria-label="Name" />
      <Button {...args} type="submit">
        Save changes
      </Button>
    </form>
  ),
  play: async ({ canvas, canvasElement }) => {
    const onSubmit = fn((event: Event) => event.preventDefault());
    canvasElement.querySelector("form")?.addEventListener("submit", onSubmit);
    const button = canvas.getByRole("button", { name: "Save changes" });

    await userEvent.click(button, { pointerEventsCheck: 0 });
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Name" }),
      "Ada{Enter}"
    );
    await expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.tab();
    await expect(button).toHaveFocus();
  },
};

export const Sizes: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  render: (args) => (
    <div className="flex items-center gap-4">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
      <Button {...args} size="icon" aria-label="Icon">
        <svg aria-hidden="true" viewBox="0 0 16 16" />
      </Button>
      <Button {...args} size="icon-sm" aria-label="Small icon">
        <svg aria-hidden="true" viewBox="0 0 16 16" />
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = canvas
      .getAllByRole("button")
      .map((b) => b.getBoundingClientRect().height);

    await expect(heights).toEqual([32, 40, 44, 40, 32]);
  },
};

export const SmallHitArea: Story = {
  args: { size: "sm" },
  // Room above the button, so that a point 4 px over its edge is on the page.
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: "Save changes" });
    const rect = button.getBoundingClientRect();

    // The 32 px control owns the 44 px around it: 4 px above its edge is still it.
    await expect(
      document.elementFromPoint(rect.left + rect.width / 2, rect.top - 4)
    ).toBe(button);
  },
};

const variants = ["primary", "secondary", "danger", "ghost", "link"] as const;

export const Variants: Story = {
  render: (args) => (
    <div className="flex items-center gap-4">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
      <span data-testid="border-input-probe" className="border border-input" />
    </div>
  ),
  play: async ({ canvas }) => {
    // PD-11: the secondary boundary is border-input, not the base border-transparent.
    const secondary = canvas.getByRole("button", { name: "secondary" });
    const probe = canvas.getByTestId("border-input-probe");

    await expect(getComputedStyle(secondary).borderTopColor).toBe(
      getComputedStyle(probe).borderTopColor
    );
    await expect(getComputedStyle(secondary).borderTopColor).not.toBe(
      "rgba(0, 0, 0, 0)"
    );
  },
};

export const Dark: Story = {
  ...Variants,
  globals: { theme: "dark" },
};
