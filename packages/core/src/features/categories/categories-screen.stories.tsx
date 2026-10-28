import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  expect,
  fireEvent,
  fn,
  screen,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

import { FIXTURE_ASSIGNABLE, FIXTURE_LIST } from "./__fixtures__/categories.ts";
import { CategoriesScreen } from "./categories-screen.tsx";
import type { CategoriesScreenProps } from "./types.ts";

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * The Categories page (R-87 to R-91a). Create, rename, reorder and delete categories, and file
 * whole modules under them. Counts are module-only; a category never grants access.
 */
const meta = {
  title: "Core/Categories",
  component: CategoriesScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Categories page. The host owns the list and the writes; the screen owns the edit, the delete confirm and the Assign items filters.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    list: FIXTURE_LIST,
    modules: FIXTURE_ASSIGNABLE,
    onCreate: fn(),
    onRename: fn(),
    onReorder: fn(),
    onDelete: fn(),
    onAssign: fn(),
    onRetry: fn(),
  } satisfies CategoriesScreenProps,
} satisfies Meta<typeof CategoriesScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

type Play = NonNullable<Story["play"]>;

type Canvas = Parameters<Play>[0]["canvas"];

const categoryRow = (canvas: Canvas, name: string) =>
  within(
    within(canvas.getByRole("list", { name: "Categories" })).getByRole(
      "listitem",
      { name }
    )
  );

const pick = async (canvas: Canvas, module: string, option: string) => {
  await userEvent.click(
    canvas.getByRole("combobox", { name: `Category for ${module}` })
  );
  await userEvent.click(await screen.findByRole("option", { name: option }));
  // The popup's focus guards stay until it has closed; axe runs after the play function.
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
};

const overview: Play = async ({ canvas }) => {
  await expect(
    canvas.getByText(
      "A category groups what people already see. It never grants access. Who can open a module is set in Roles."
    )
  ).toBeInTheDocument();

  const rows = within(
    canvas.getByRole("list", { name: "Categories" })
  ).getAllByRole("listitem");

  // In the server's order, with Other fixed last.
  await expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
    "Operations",
    "Finance",
    "Legal",
    "Other",
  ]);
  await expect(
    categoryRow(canvas, "Finance").getByText("2 modules")
  ).toBeInTheDocument();
  await expect(
    categoryRow(canvas, "Operations").getByText("1 module")
  ).toBeInTheDocument();

  const other = categoryRow(canvas, "Other");

  await expect(other.getByText("3 modules")).toBeInTheDocument();
  // Other cannot be renamed, moved or deleted.
  await expect(other.queryAllByRole("button")).toEqual([]);
  // Counts are module-only (R-88).
  await expect(canvas.queryByText(/\d+ solutions?/)).toBeNull();

  await expect(canvas.getByText("3 uncategorized")).toBeInTheDocument();
  // A deleted category reads as no category (R-91).
  await expect(
    canvas.getByRole("combobox", { name: "Category for Asset register" })
  ).toHaveTextContent("No category");
};

/** The same page at 390 px: the card list of Assign items leads each module with a tile. */
const overviewOnPhone: Play = async (context) => {
  await overview(context);

  const files = within(
    context.canvas.getByRole("list", { name: "Modules to file" })
  );

  await expect(
    files.getAllByRole("listitem")[0]!.querySelector("[data-slot=icon-tile]")
  ).not.toBeNull();
};

export const Default: Story = { play: overview };

export const DefaultOnPhone: Story = { globals: phone, play: overviewOnPhone };

export const Dark: Story = { globals: { theme: "dark" } };

/** The cards in the dark theme, so axe reads the dark pairs at the phone width too. */
export const PhoneDark: Story = {
  globals: { theme: "dark", viewport: phone.viewport },
};

const createRenameReorder: Play = async ({ args, canvas }) => {
  const input = canvas.getByRole("textbox", { name: "New category name" });

  input.focus();
  await userEvent.keyboard("   {Enter}");
  await expect(args.onCreate).not.toHaveBeenCalled();
  await userEvent.keyboard("  Planning  {Enter}");
  await expect(args.onCreate).toHaveBeenCalledWith("Planning");
  await expect(input).toHaveValue("");

  canvas.getByRole("button", { name: "Rename Finance" }).focus();
  await userEvent.keyboard("{Enter}");

  const name = canvas.getByRole("textbox", { name: "Category name" });

  await expect(name).toHaveFocus();
  await userEvent.keyboard("{Control>}a{/Control}Money{Enter}");
  await expect(args.onRename).toHaveBeenCalledTimes(1);
  await expect(args.onRename).toHaveBeenCalledWith("c-fin", "Money");

  // Escape leaves the name as it was.
  canvas.getByRole("button", { name: "Rename Legal" }).focus();
  await userEvent.keyboard("{Enter}{Control>}a{/Control}Law{Escape}");
  await expect(args.onRename).toHaveBeenCalledTimes(1);

  await expect(
    categoryRow(canvas, "Operations").getByRole("button", {
      name: "Move Operations up",
    })
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    categoryRow(canvas, "Legal").getByRole("button", {
      name: "Move Legal down",
    })
  ).toHaveAttribute("aria-disabled", "true");

  canvas.getByRole("button", { name: "Move Finance up" }).focus();
  await userEvent.keyboard("{Enter}");
  await expect(args.onReorder).toHaveBeenLastCalledWith([
    "c-fin",
    "c-ops",
    "c-legal",
  ]);

  canvas.getByRole("button", { name: "Move Finance down" }).focus();
  await userEvent.keyboard(" ");
  await expect(args.onReorder).toHaveBeenLastCalledWith([
    "c-ops",
    "c-legal",
    "c-fin",
  ]);
};

export const CreateRenameReorder: Story = { play: createRenameReorder };

export const CreateRenameReorderOnPhone: Story = {
  globals: phone,
  play: createRenameReorder,
};

/** A host that applies each reorder, so the list rerenders in the new order as the page does. */
function ReorderingHost(args: CategoriesScreenProps) {
  const [list, setList] = useState(args.list);

  return (
    <CategoriesScreen
      {...args}
      list={list}
      onReorder={(orderedIds) => {
        args.onReorder(orderedIds);
        setList((current) => ({
          ...current,
          categories: orderedIds.flatMap((id) =>
            current.categories.filter((category) => category.id === id)
          ),
        }));
      }}
    />
  );
}

/** A move that takes a row to the end keeps keyboard focus on that row's arrow. */
export const ReorderKeepsFocus: Story = {
  render: (args) => <ReorderingHost {...args} />,
  play: async ({ args, canvas }) => {
    const down = () =>
      canvas.getByRole("button", { name: "Move Finance down" });

    down().focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onReorder).toHaveBeenCalledWith([
      "c-ops",
      "c-legal",
      "c-fin",
    ]);

    // Finance is last now: its down arrow says so, keeps focus and does nothing.
    await waitFor(() => expect(down()).toHaveFocus());
    await expect(down()).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    await expect(args.onReorder).toHaveBeenCalledTimes(1);

    canvas.getByRole("button", { name: "Move Operations up" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onReorder).toHaveBeenCalledTimes(1);
  },
};

/** While a list write saves, the arrows refuse, so a second move cannot race the first. */
export const ReorderWhileSaving: Story = {
  args: { reordering: true },
  play: async ({ args, canvas }) => {
    const up = canvas.getByRole("button", { name: "Move Finance up" });

    await expect(up).toHaveAttribute("aria-disabled", "true");
    up.focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onReorder).not.toHaveBeenCalled();
  },
};

/** The pointer path of R-87. Phones reorder with the arrows above. */
export const ReorderByDrag: Story = {
  play: async ({ args, canvas }) => {
    const list = within(canvas.getByRole("list", { name: "Categories" }));
    const dataTransfer = new DataTransfer();

    fireEvent.dragStart(list.getByRole("listitem", { name: "Legal" }), {
      dataTransfer,
    });
    fireEvent.dragOver(list.getByRole("listitem", { name: "Operations" }), {
      dataTransfer,
    });
    fireEvent.drop(list.getByRole("listitem", { name: "Operations" }), {
      dataTransfer,
    });

    await expect(args.onReorder).toHaveBeenCalledTimes(1);
    await expect(args.onReorder).toHaveBeenCalledWith([
      "c-legal",
      "c-ops",
      "c-fin",
    ]);

    // Other is not a drop target.
    fireEvent.dragStart(list.getByRole("listitem", { name: "Finance" }), {
      dataTransfer,
    });
    fireEvent.drop(list.getByRole("listitem", { name: "Other" }), {
      dataTransfer,
    });
    fireEvent.dragEnd(list.getByRole("listitem", { name: "Finance" }), {
      dataTransfer,
    });
    await expect(args.onReorder).toHaveBeenCalledTimes(1);
  },
};

const deleteConfirm: Play = async ({ args, canvas }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete Finance" }));

  let dialog = within(
    await screen.findByRole("dialog", { name: "Delete Finance?" })
  );

  await expect(
    dialog.getByText(
      "2 modules become ungrouped, and solutions in this category lose their heading. Nothing is deleted with it."
    )
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus()
  );
  await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await expect(args.onDelete).not.toHaveBeenCalled();

  await userEvent.click(
    canvas.getByRole("button", { name: "Delete Operations" })
  );
  dialog = within(
    await screen.findByRole("dialog", { name: "Delete Operations?" })
  );
  await expect(
    dialog.getByText(/^1 module becomes ungrouped,/)
  ).toBeInTheDocument();
  await userEvent.click(dialog.getByRole("button", { name: "Delete" }));

  await expect(args.onDelete).toHaveBeenCalledTimes(1);
  await expect(args.onDelete).toHaveBeenCalledWith("c-ops");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

export const DeleteConfirm: Story = { play: deleteConfirm };

export const DeleteConfirmOnPhone: Story = {
  globals: phone,
  play: deleteConfirm,
};

const assignWholeModule: Play = async ({ args, canvas }) => {
  const search = canvas.getByRole("searchbox", { name: "Search modules" });

  await userEvent.type(search, "contr");
  await expect(
    canvas.getByRole("combobox", { name: "Category for Contracts" })
  ).toBeInTheDocument();
  await expect(
    canvas.queryByRole("combobox", { name: "Category for Fixture" })
  ).toBeNull();

  await userEvent.type(search, "zzz");
  await expect(canvas.getByText("No module matches.")).toBeInTheDocument();
  await userEvent.clear(search);

  await userEvent.click(
    canvas.getByRole("switch", { name: "Uncategorized only" })
  );
  await expect(
    canvas.queryByRole("combobox", { name: "Category for Contracts" })
  ).toBeNull();
  // A stale category id counts as uncategorized (R-91).
  await expect(
    canvas.getByRole("combobox", { name: "Category for Asset register" })
  ).toBeInTheDocument();

  await pick(canvas, "Service requests", "Legal");
  await expect(args.onAssign).toHaveBeenCalledWith("requests", "c-legal");

  await userEvent.click(
    canvas.getByRole("switch", { name: "Uncategorized only" })
  );
  await pick(canvas, "Fixture", "No category");
  await expect(args.onAssign).toHaveBeenLastCalledWith("fixture", null);
};

export const AssignWholeModule: Story = { play: assignWholeModule };

export const AssignWholeModuleOnPhone: Story = {
  globals: phone,
  play: assignWholeModule,
};

const assignSwitchedOff: Play = async ({ args, canvas }) => {
  await userEvent.click(
    canvas.getByRole("switch", { name: "Uncategorized only" })
  );
  // A switched-off module stays listed and placeable (R-91a).
  await expect(
    canvas.getAllByText("Off").filter((pill) => pill.checkVisibility())
  ).toHaveLength(1);
  await pick(canvas, "Dormant", "Finance");
  await expect(args.onAssign).toHaveBeenCalledWith("dormant", "c-fin");
};

export const AssignSwitchedOffModule: Story = { play: assignSwitchedOff };

export const AssignSwitchedOffModuleOnPhone: Story = {
  globals: phone,
  play: assignSwitchedOff,
};

const assignFailed: Play = async ({ args, canvas }) => {
  const alert = within(canvas.getByRole("alert"));

  await expect(alert.getByText(/Not saved\./)).toBeInTheDocument();
  await expect(
    alert.getByText(/The category no longer exists\./)
  ).toBeInTheDocument();
  // The picker shows what the server still holds, never the attempted value.
  await expect(
    canvas.getByRole("combobox", { name: "Category for Contracts" })
  ).toHaveTextContent("Finance");
  await expect(
    canvas.queryByText(/Saved\. Written to the audit log\./)
  ).toBeNull();

  await userEvent.click(alert.getByRole("button", { name: "Retry" }));
  await expect(args.onRetry).toHaveBeenCalledTimes(1);

  // A search or the Uncategorized only filter never hides the refused row and its Retry.
  await userEvent.type(
    canvas.getByRole("searchbox", { name: "Search modules" }),
    "zzz"
  );
  await userEvent.click(
    canvas.getByRole("switch", { name: "Uncategorized only" })
  );
  await expect(
    canvas.getByRole("combobox", { name: "Category for Contracts" })
  ).toBeInTheDocument();
  await expect(canvas.getByRole("alert")).toHaveTextContent(/Not saved\./);
};

const failedArgs = {
  failed: { moduleId: "contracts", message: "The category no longer exists." },
} satisfies Partial<CategoriesScreenProps>;

export const AssignFailed: Story = { args: failedArgs, play: assignFailed };

export const AssignFailedOnPhone: Story = {
  args: failedArgs,
  globals: phone,
  play: assignFailed,
};

const unread = {
  list: { categories: [], ungroupedCount: 0 },
  modules: [],
} satisfies Partial<CategoriesScreenProps>;

/** The host is still reading: no Other row and no empty Assign items yet. */
export const LoadingList: Story = {
  args: { ...unread, loading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading categories"
    );
    await expect(canvas.queryByRole("list", { name: "Categories" })).toBeNull();
    await expect(canvas.queryByText(/Nothing to file yet/)).toBeNull();
  },
};

/** The read failed: the host's text replaces the rows, so nothing reads as empty. */
export const ListReadFailed: Story = {
  args: { ...unread, error: "The categories could not be read." },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "The categories could not be read."
    );
    await expect(canvas.queryByRole("list", { name: "Categories" })).toBeNull();
    await expect(canvas.queryByText(/Nothing to file yet/)).toBeNull();
  },
};
