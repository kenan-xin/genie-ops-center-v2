import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ArrowLeftRightIcon,
  EllipsisIcon,
  LogOutIcon,
  PencilIcon,
  ShareIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";

/**
 * Every row kind of the menu in one open popup, so the icon check (6wz1.113, T8-a) measures each
 * leading icon against its group label at 390 and 1440.
 */
function EveryRow() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="secondary" />}>
        Chart actions
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Chart</DropdownMenuLabel>
          <DropdownMenuItem>
            <PencilIcon aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ShareIcon aria-hidden="true" />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>
            Show legend
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Finance</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem variant="destructive">
            <Trash2Icon aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Alex Morgan</DropdownMenuLabel>
          <DropdownMenuItem size="lg">
            <UserRoundIcon aria-hidden="true" />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem size="lg">
            <ArrowLeftRightIcon aria-hidden="true" />
            Administration
          </DropdownMenuItem>
          <DropdownMenuItem size="lg">
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A refused item stays, disabled, and shows its reason under its label. The reason is visible text
 * and the item's description, not part of its name (R-21, 6wz1.141).
 */
function Refused() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<Button variant="secondary" />}>
        Dashboard actions
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuItem
          variant="destructive"
          reason="Only the owner can delete this dashboard."
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The popup takes its rows' width, not its trigger's: an icon button opens a menu that holds
 * "Rename dashboard" on one line and stops at 320 px (6wz1.140, C08-6).
 */
function FromIcon() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Dashboard actions" />
        }
      >
        <EllipsisIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Edit</DropdownMenuItem>
        <DropdownMenuItem>Rename dashboard</DropdownMenuItem>
        <DropdownMenuItem>
          Move this dashboard to a category that holds the finance reports
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta = {
  title: "UI/DropdownMenu",
  component: EveryRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A menu of actions under a button. Group labels name the groups; an item may lead with an icon, and the `lg` size is the user menu's row. An item refused for the viewer takes a `reason`: it stays, disabled, and shows the reason as text under its label, where it is the item's description rather than part of its name.",
      },
    },
  },
} satisfies Meta<typeof EveryRow>;

export default meta;

type Story = StoryObj<typeof meta>;

async function openMenu(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getByRole("button", { name: "Chart actions" }));

  const menu = await within(document.body).findByRole("menu");

  // The popup fades in, so it shows once its starting style is gone.
  await waitFor(() => expect(menu).toBeVisible());
  await expect(
    within(menu).getByRole("menuitem", { name: "Rename" })
  ).toBeVisible();

  // 6wz1.136: one icon-to-label gap in every row, default and lg: the prototypes' 10 px, measured 11 (rounded ink edge).
  const gaps = within(menu)
    .getAllByRole("menuitem")
    .flatMap((item) => {
      // The leading icon only: a sub-menu trigger ends with a chevron.
      const icon =
        item.firstChild instanceof SVGElement ? item.firstChild : null;

      const text = [...item.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );

      if (icon === null || text === undefined) return [];

      const range = document.createRange();

      range.selectNodeContents(text);

      return [
        Math.round(
          range.getBoundingClientRect().left -
            icon.getBoundingClientRect().right
        ),
      ];
    });

  await expect(gaps).toHaveLength(6);
  await expect([...new Set(gaps)]).toEqual([11]);
}

export const Open: Story = {
  play: async ({ canvasElement }) => openMenu(within(canvasElement)),
};

export const OpenOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => openMenu(within(canvasElement)),
};

/**
 * `reason` marks an item refused: it keeps its place, disabled, with the reason under its label.
 * The reason is the item's description, not its name, so a screen reader hears "Delete" and then
 * the reason.
 */
export const RefusedItem: Story = {
  render: () => <Refused />,
};

/**
 * An icon-button trigger opens a popup as wide as its widest row, not as narrow as its trigger.
 */
export const FromIconTrigger: Story = {
  render: () => <FromIcon />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Dashboard actions" })
    );

    const menu = await within(document.body).findByRole("menu");

    await waitFor(() => expect(menu).toBeVisible());

    const rowHeight = (name: string) =>
      Math.round(
        within(menu).getByRole("menuitem", { name }).getBoundingClientRect()
          .height
      );

    // The icon trigger does not squeeze the rows: "Rename dashboard" holds one line.
    await expect(rowHeight("Rename dashboard")).toBe(rowHeight("Edit"));

    // Nor does a long row widen the popup past 320 px: that row wraps instead.
    await expect(
      Math.round(menu.getBoundingClientRect().width)
    ).toBeLessThanOrEqual(320);
    await expect(
      rowHeight(
        "Move this dashboard to a category that holds the finance reports"
      )
    ).toBeGreaterThan(rowHeight("Rename dashboard"));
  },
};
