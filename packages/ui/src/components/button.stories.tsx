import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent } from "storybook/test";

// The package entry, not ./button.tsx, so that the stories prove what an app
// can import.
import { Button, buttonVariants, focusRing, type ThemeName } from "../index.ts";

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Button on the Base UI primitive (`@base-ui/react/button`), fitted to the tokens.md scale: sm 32 px, md 36 px from `lg` and 40 px under it with a 44 px touch area, lg 44 px, five variants, one focus ring. It renders a native button, so a pointer, Enter and Space activate it. `disabled` leaves the tab order; `focusableWhenDisabled` keeps it there. `loading` keeps the label and the width and drops a press.",
      },
    },
  },
  args: {
    children: "Save",
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save" });

    await expect(button.getBoundingClientRect().height).toBe(36);

    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const ActivatesFromTheKeyboard: Story = {
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save" });

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
    const button = canvas.getByRole("button", { name: "Save" });

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
    const button = canvas.getByRole("button", { name: "Save" });

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
        Save
      </Button>
      <Button {...args} loading>
        <svg data-icon="inline-start" aria-hidden="true" viewBox="0 0 16 16" />
        Save
      </Button>
    </div>
  ),
  play: async ({ args, canvas }) => {
    const idle = canvas.getAllByRole("button", { name: "Save" }).at(0);
    const busy = canvas.getAllByRole("button", { name: "Save" }).at(1);

    if (!idle || !busy) {
      throw new Error("Loading renders two buttons");
    }

    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy).toHaveTextContent("Save");
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
      <Button {...args}>Save</Button>
      <Button {...args} loading>
        Save
      </Button>
    </div>
  ),
  play: async ({ args, canvas }) => {
    const [idle, busy] = canvas.getAllByRole("button", {
      name: "Save",
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
        Save
      </Button>
    </form>
  ),
  play: async ({ canvas, canvasElement }) => {
    const onSubmit = fn();
    canvasElement.querySelector("form")?.addEventListener("submit", onSubmit);

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
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
        Save
      </Button>
    </form>
  ),
  play: async ({ canvas, canvasElement }) => {
    const onSubmit = fn((event: Event) => event.preventDefault());
    canvasElement.querySelector("form")?.addEventListener("submit", onSubmit);
    const button = canvas.getByRole("button", { name: "Save" });

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

const sizes: Story["render"] = (args) => (
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
);

const heightsOf = (canvas: { getAllByRole: typeof screen.getAllByRole }) =>
  canvas.getAllByRole("button").map((b) => b.getBoundingClientRect().height);

// 6wz1.114 (T3-a): md and icon are 36 px from lg and 40 px under it; sm 32 px and lg 44 px at both.
export const Sizes: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  render: sizes,
  play: async ({ canvas }) => {
    await expect(heightsOf(canvas)).toEqual([32, 36, 44, 36, 32]);
  },
};

export const SizesOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: sizes,
  play: async ({ canvas }) => {
    await expect(heightsOf(canvas)).toEqual([32, 40, 44, 40, 32]);
  },
};

// 6wz1.114 (T3-b): under lg a 40 px md or icon button reaches 44 px, so a tap 1.5 px above or below
// it still lands on it. The 40 px wide icon button also reaches 44 px sideways; a labelled button
// is wider than 44 px already, so its own box is its area across.
export const TouchAreaOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: (args) => (
    // The gap and the padding keep each probe off the other button and inside the viewport.
    <div className="flex items-center gap-6 p-4">
      <Button {...args}>Save</Button>
      <Button {...args} size="icon" aria-label="More">
        <svg aria-hidden="true" viewBox="0 0 16 16" />
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const misses = ["Save", "More"].flatMap((name) => {
      const button = canvas.getByRole("button", { name });
      const { left, right, top, bottom } = button.getBoundingClientRect();
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;

      const probes: [string, number, number][] = [
        ["above", x, top - 1.5],
        ["below", x, bottom + 1.5],
      ];

      if (name === "More") {
        probes.push(["left", left - 1.5, y], ["right", right + 1.5, y]);
      }

      return probes.flatMap(([side, px, py]) =>
        document.elementFromPoint(px, py) === button ? [] : [`${name} ${side}`]
      );
    });

    await expect(misses).toEqual([]);
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
    const button = canvas.getByRole("button", { name: "Save" });
    const rect = button.getBoundingClientRect();

    // The 32 px control owns the 44 px around it: 4 px above its edge is still it.
    await expect(
      document.elementFromPoint(rect.left + rect.width / 2, rect.top - 4)
    ).toBe(button);
  },
};

const variants = [
  "primary",
  "secondary",
  "danger-outline",
  "danger",
  "ghost",
  "link",
] as const;

// Owner pick C (6wz1.99): the computed hairline and 1 px lift of an outlined button.
function outlineOf(theme: ThemeName): { border: string; lift: string } {
  return theme === "dark"
    ? { border: "rgb(31, 41, 55)", lift: "rgba(0, 0, 0, 0.5) 0px 1px 2px 0px" }
    : {
        border: "rgb(229, 231, 235)",
        lift: "rgba(17, 24, 39, 0.07) 0px 1px 2px 0px",
      };
}

export const Variants: Story = {
  render: (args) => (
    <div className="flex items-center gap-4">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
      <a
        href="/"
        className={`${buttonVariants({ variant: "secondary" })} ${focusRing}`}
      >
        Secondary link
      </a>
    </div>
  ),
  play: async ({ canvas, globals }) => {
    const { border, lift } = outlineOf(globals["theme"]);

    const secondary = getComputedStyle(
      canvas.getByRole("button", { name: "secondary" })
    );

    await expect(secondary.borderTopColor).toBe(border);
    await expect(secondary.fontWeight).toBe("600");
    await expect(secondary.boxShadow).toContain(lift);

    // A raw buttonVariants class list has no tailwind-merge, so the variant weight must win alone.
    await expect(
      getComputedStyle(canvas.getByRole("link", { name: "Secondary link" }))
        .fontWeight
    ).toBe("600");

    const dangerOutline = getComputedStyle(
      canvas.getByRole("button", { name: "danger-outline" })
    );

    await expect(dangerOutline.borderTopColor).toBe(border);
    await expect(dangerOutline.fontWeight).toBe("600");
    await expect(dangerOutline.boxShadow).toContain(lift);
  },
};

export const Dark: Story = {
  ...Variants,
  globals: { theme: "dark" },
};
