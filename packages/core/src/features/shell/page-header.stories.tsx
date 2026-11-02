import { Button } from "@genie/ui";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { PageHeader } from "./page-header.tsx";
import { PageTrailProvider } from "./page-trail.tsx";
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
  <ShellContext.Provider value={{ chrome: "admin", backTo: "Back to {page}" }}>
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

const rolesTrail = {
  parent: { label: "Roles", href: "/admin/roles" },
  current: "Tenant administrator",
};

/** The trail and its record label on desktop. */
const playBreadcrumbDesktop: Story["play"] = async ({ canvas }) => {
  const trail = within(canvas.getByRole("navigation", { name: "breadcrumb" }));

  const parent = trail.getByRole("link", { name: "Roles" });

  await expect(parent).toBeVisible();
  await expect(parent).toHaveAttribute("href", "/admin/roles");
  await expect(trail.getByText("Tenant administrator")).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(
    trail.queryByRole("link", { name: "Tenant administrator" })
  ).not.toHaveAttribute("href");
  await expect(
    parent.compareDocumentPosition(
      canvas.getByRole("heading", { level: 1, name: "Roles" })
    ) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
};

/** A page under a list shows the trail above its title (tokens.md, Breadcrumbs). */
export const BreadcrumbDesktop: Story = {
  decorators: [inShell],
  args: { title: "Roles", breadcrumb: rolesTrail },
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async (context) => {
    await playBreadcrumbDesktop(context);
    // The phone bar's back link stays hidden beside the trail.
    await expect(
      context.canvas
        .queryAllByRole("link", { name: "Back to Roles" })
        .filter((link) => link.checkVisibility())
    ).toEqual([]);
  },
};

/** A module page passes no trail: core gives the header the trail of its route (R-1a). */
export const BreadcrumbFromTheRoute: Story = {
  decorators: [
    (Story) => (
      <PageTrailProvider value={rolesTrail}>
        <Story />
      </PageTrailProvider>
    ),
    inShell,
  ],
  args: { title: "Roles" },
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: playBreadcrumbDesktop,
};

/**
 * Below 1024 px a child page gets its own top bar: a back link to the parent and the record's
 * name (design review 2.1). The trail hides; the title stays for a screen reader.
 */
export const BreadcrumbPhone: Story = {
  decorators: [inShell],
  args: { title: "Roles", breadcrumb: rolesTrail },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const bar = region(canvasElement, "[data-page-top-bar]");
    const back = bar.getByRole("link", { name: "Back to Roles" });

    await expect(back).toBeVisible();
    await expect(bar.getByText("Tenant administrator")).toBeVisible();
    await expect(
      canvas
        .queryAllByRole("link", { name: "Roles" })
        .filter((link) => link.checkVisibility())
    ).toEqual([]);
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Roles" })
    ).toBeInTheDocument();

    await expect(back).toHaveAttribute("href", "/admin/roles");
    const box = back.getBoundingClientRect();

    await expect(box.height).toBeGreaterThanOrEqual(44);
    // A tap lands on it: an `sr-only` header keeps its box but clips it away.
    await expect(
      back.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      )
    ).toBe(true);
    await expect(
      canvasElement.querySelector('[data-slot="breadcrumb"]')
    ).not.toBeVisible();
  },
};

/** A long record label keeps one line and carries its full text in `title`. */
export const BreadcrumbLongLabel: Story = {
  decorators: [
    inShell,
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "Roles",
    breadcrumb: {
      ...rolesTrail,
      current:
        "Regional claims review supervisors for the northern and western districts",
    },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    const label = within(
      canvas.getByRole("navigation", { name: "breadcrumb" })
    ).getByText(/^Regional claims review/);

    await expect(label).toHaveAttribute("title", label.textContent);
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    await expect(label.getBoundingClientRect().height).toBeLessThan(24);
  },
};

/**
 * A record on a phone: the meta line and the secondary actions stay in the header, and the main
 * action moves to the bottom bar.
 */
export const MetaAndSecondaryActionsPhone: Story = {
  decorators: [inShell],
  args: {
    title: "INV-0042",
    meta: "Acme Pte Ltd · Issued 1 Oct 2026",
    secondaryActions: <Button variant="secondary">Open the PDF</Button>,
    actions: <Button>Record a payment</Button>,
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => {
    const header = region(canvasElement, "[data-shell-page-header]");

    await expect(
      header.getByText("Acme Pte Ltd · Issued 1 Oct 2026")
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Open the PDF" })
    ).toBeVisible();
    await expect(header.getByText("Record a payment")).not.toBeVisible();
    await expect(
      region(canvasElement, "[data-shell-bottom-bar]").getByRole("button", {
        name: "Record a payment",
      })
    ).toBeVisible();
  },
};

export const Dark: Story = {
  decorators: [inShell],
  args: { actions: <Button>Add person</Button> },
  globals: { theme: "dark" },
};
