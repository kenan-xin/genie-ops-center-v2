import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { toast as sonner } from "sonner";
import { expect, screen, userEvent, waitFor } from "storybook/test";

// The package entry, not ./toast.tsx, so that the stories prove what an app
// can import.
import { Button, Toaster, toast } from "../index.ts";

// Sonner keeps its toasts in a module store, so a story clears them when it unmounts.
const useClearToasts = () =>
  React.useEffect(() => () => void sonner.dismiss(), []);

const Page = ({
  titles = ["Changes saved"],
}: {
  readonly titles?: readonly string[];
}) => {
  useClearToasts();

  return (
    <>
      <Button
        onClick={() =>
          titles.forEach((title) =>
            toast({ title, description: "Alex Morgan was updated." })
          )
        }
      >
        Save
      </Button>
      <Toaster />
    </>
  );
};

const meta = {
  title: "UI/Toast",
  component: Page,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          '`toast()` reports a completed action. Each toast is a card with `role="status"`, because Sonner gives a toast no role. One `Toaster` sits in the root layout. Toasts stack bottom right from 768 px and bottom center below it, show three at a time and leave after 4 s. A refusal stays inline in its screen.',
      },
    },
    viewport: {
      options: {
        between: {
          name: "Between breakpoints",
          styles: { width: "700px", height: "900px" },
          type: "tablet",
        },
      },
    },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta<typeof Page>;

export default meta;

type Story = StoryObj<typeof meta>;

const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save" }));

const cards = () => screen.findAllByRole("status");

const centerOffset = async () => {
  const [card] = await cards();
  const box = card!.getBoundingClientRect();

  return Math.abs(box.left + box.width / 2 - window.innerWidth / 2);
};

export const Default: Story = {
  play: async () => {
    await save();

    const card = await screen.findByRole("status");
    await expect(card).toHaveTextContent("Changes saved");

    const close = screen.getByRole("button", { name: "Close" });
    // Sonner makes the toast itself a tab stop, so Close is the second one.
    await userEvent.tab();
    await userEvent.tab();
    await expect(close).toHaveFocus();
    await expect(getComputedStyle(close).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );

    await userEvent.click(close);
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );
  },
};

export const LeavesAfterFourSeconds: Story = {
  play: async () => {
    await save();
    await screen.findByRole("status");

    await new Promise((resolve) => setTimeout(resolve, 3000));
    await expect(screen.getByRole("status")).toBeVisible();

    await waitFor(
      () => expect(screen.queryByRole("status")).not.toBeInTheDocument(),
      { timeout: 2000 }
    );
  },
};

export const StacksThree: Story = {
  render: () => <Page titles={["One", "Two", "Three", "Four"]} />,
  play: async () => {
    await save();

    await waitFor(async () => {
      const visible = (await cards()).filter(
        (card) => card.closest("li")?.dataset.visible === "true"
      );

      const text = visible.map((card) => card.textContent ?? "").join(" ");

      await expect(visible).toHaveLength(3);
      await expect(text).toContain("Four");
      await expect(text).not.toContain("One");
    });
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async () => {
    await save();
    await waitFor(async () =>
      expect(await centerOffset()).toBeLessThanOrEqual(2)
    );
  },
};

export const BetweenBreakpoints: Story = {
  globals: { viewport: { value: "between", isRotated: false } },
  play: async () => {
    await save();
    await waitFor(async () =>
      expect(await centerOffset()).toBeLessThanOrEqual(2)
    );
  },
};

export const Desktop: Story = {
  play: async () => {
    await save();

    const [card] = await cards();
    await expect(card!.getBoundingClientRect().left).toBeGreaterThan(
      window.innerWidth / 2
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  render: () => {
    useClearToasts();

    return (
      <>
        <Button
          onClick={() => {
            toast({ tone: "success", title: "Person added" });
            toast({ tone: "error", title: "Sign-out failed" });
          }}
        >
          Show
        </Button>
        <Toaster />
      </>
    );
  },
  play: async () => {
    await userEvent.click(screen.getByRole("button", { name: "Show" }));

    await waitFor(async () => {
      const visible = (await cards()).filter(
        (card) => card.closest("li")?.dataset.visible === "true"
      );

      await expect(visible).toHaveLength(2);
    });
  },
};
