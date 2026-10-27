import { Button } from "@genie/ui";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { PageHeader } from "./page-header.tsx";
import { ShellContext } from "./shell-context.ts";

/**
 * The page header slot (R-37, R-40) a page renders inside its own `<main>`. Inside a shell the
 * title hides below `lg` (the top bar shows it), the search slot stays empty, and below `md` the
 * actions move into a fixed bottom bar unless the page gives its own.
 */
const meta = {
  title: "Core/Shell/Page header",
  component: PageHeader,
  tags: ["autodocs"],
  args: {
    title: "People",
    description: "Everyone who can sign in.",
  },
} satisfies Meta<typeof PageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

const inShell: Decorator = (Story) => (
  <ShellContext.Provider value={{ chrome: "admin" }}>
    <Story />
  </ShellContext.Provider>
);

function region(canvasElement: HTMLElement, selector: string) {
  const element = canvasElement.querySelector<HTMLElement>(selector);

  if (element === null) throw new Error(`${selector} is missing`);

  return within(element);
}

export const Standalone: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "People" })
    ).toBeVisible();
    await expect(canvasElement.querySelector("[data-shell-slot]")).toBeNull();
    await expect(
      canvasElement.querySelector("[data-shell-bottom-bar]")
    ).toBeNull();
  },
};

export const InShellDesktop: Story = {
  decorators: [inShell],
  args: { actions: <Button>Add person</Button> },
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "People" })
    ).toBeVisible();
    const search = canvasElement.querySelector('[data-shell-slot="search"]');
    await expect(search).not.toBeNull();
    await expect(search).toBeEmptyDOMElement();
    await expect(
      region(canvasElement, "[data-shell-page-header]").getByRole("button", {
        name: "Add person",
      })
    ).toBeVisible();
    await expect(
      canvasElement.querySelector("[data-shell-bottom-bar]")
    ).not.toBeVisible();
  },
};

export const InShellPhoneActionsMoveToBottomBar: Story = {
  decorators: [inShell],
  args: { actions: <Button>Add person</Button> },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      region(canvasElement, "[data-shell-page-header]").getByText("Add person")
    ).not.toBeVisible();
    await expect(
      region(canvasElement, "[data-shell-bottom-bar]").getByRole("button", {
        name: "Add person",
      })
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { level: 1, name: "People" })
    ).toBeInTheDocument();
  },
};

export const InShellPhoneTakesNoRoom: Story = {
  decorators: [
    inShell,
    (Story) => (
      <div data-testid="page" className="flex flex-col gap-10">
        <Story />
        <p>First section</p>
      </div>
    ),
  ],
  args: { actions: <Button>Add person</Button> },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const pageTop = canvas.getByTestId("page").getBoundingClientRect().top;
    await expect(
      canvas.getByText("First section").getBoundingClientRect().top
    ).toBe(pageTop);
    await expect(
      canvas.getByRole("heading", { level: 1, name: "People" })
    ).toBeInTheDocument();
  },
};

/** A page renders its toolbar straight after the header, so the header owns the gap (UI-1 People 3). */
export const InShellDesktopKeepsTheToolbarClear: Story = {
  decorators: [
    inShell,
    (Story) => (
      <main>
        <Story />
        <p>Toolbar</p>
      </main>
    ),
  ],
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const header = canvasElement.querySelector("[data-shell-page-header]");

    if (header === null) throw new Error("the page header is missing");

    await expect(
      canvas.getByText("Toolbar").getBoundingClientRect().top -
        header.getBoundingClientRect().bottom
    ).toBeGreaterThanOrEqual(24);
  },
};

export const InShellPhoneOwnBottomBar: Story = {
  decorators: [inShell],
  args: {
    actions: <Button>Preview</Button>,
    bottomBar: <Button>Publish</Button>,
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const bar = region(canvasElement, "[data-shell-bottom-bar]");
    await expect(bar.getByRole("button", { name: "Publish" })).toBeVisible();
    await expect(bar.queryByText("Preview")).toBeNull();
  },
};

export const Dark: Story = {
  decorators: [inShell],
  args: { actions: <Button>Add person</Button> },
  globals: { theme: "dark" },
};
