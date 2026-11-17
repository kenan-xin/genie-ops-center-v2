import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ArrowLeftRightIcon,
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

const meta = {
  title: "UI/DropdownMenu",
  component: EveryRow,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A menu of actions under a button. Group labels name the groups; an item may lead with an icon, and the `lg` size is the user menu's row.",
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

  // 6wz1.136: one icon-to-label gap in every row, default and lg (the prototypes' 10 px).
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
  await expect(new Set(gaps).size).toBe(1);
}

export const Open: Story = {
  play: async ({ canvasElement }) => openMenu(within(canvasElement)),
};

export const OpenOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvasElement }) => openMenu(within(canvasElement)),
};
