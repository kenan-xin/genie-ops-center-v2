import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { fixturePath } from "./__fixtures__/access.ts";
import { RemoveAccessDialog } from "./remove-access-dialog.tsx";

const jamie = { type: "user", id: "p-jamie", name: "Jamie Chen" } as const;

const sam = { type: "user", id: "p-sam", name: "Sam Rivera" } as const;

const operations = { type: "group", id: "g-ops", name: "Operations" } as const;

const financeTeam = {
  type: "group",
  id: "g-finance",
  name: "Finance team",
} as const;

const viewer = { id: "r-invoices-viewer", name: "Viewer" };

const finance = { id: "r-invoices-finance", name: "Finance" };

const slidesEditor = { id: "r-slides-editor", name: "Slides editor" };

/** Jamie holds Invoices directly, and also through Finance team. */
const jamieInvoices = {
  rowName: "Invoices",
  rolesThatGo: [
    fixturePath({
      id: "a-1",
      holder: jamie,
      role: viewer,
      moduleId: "invoices",
    }),
  ],
  pathsThatStay: [
    fixturePath({
      id: "a-2",
      holder: financeTeam,
      role: finance,
      moduleId: "invoices",
    }),
  ],
};

const meta = {
  title: "Core/Access/RemoveAccessDialog",
  component: RemoveAccessDialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The confirmation that every Remove on the Grants tab opens before Save (R-37a). It names each direct role that goes and each path that keeps the module, so an administrator sees when a person still reaches it through a group.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    open: true,
    recipient: jamie,
    removals: [jamieInvoices],
    onConfirm: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof RemoveAccessDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

const dialog = async (name: string) => {
  const element = await screen.findByRole("dialog", { name });

  await waitFor(() => expect(element).toBeVisible());

  return within(element);
};

/** T10: the role that goes, the group path that stays, and Cancel focused. */
export const PathsStay: Story = {
  play: async ({ args }) => {
    const body = await dialog("Remove Invoices from Jamie Chen?");

    await expect(
      body.getByText(
        "The direct role goes. Access continues through the paths that stay."
      )
    ).toBeVisible();

    const goes = within(body.getByRole("list", { name: "Roles that go" }));

    await expect(goes.getByRole("listitem")).toHaveTextContent(
      "ViewerDirect assignment"
    );

    const stays = within(body.getByRole("list", { name: "Paths that stay" }));

    await expect(stays.getByRole("listitem")).toHaveTextContent(
      "FinanceThrough Finance team"
    );
    // The dialog moves its first focus a frame after it shows.
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Cancel" })).toHaveFocus()
    );

    await userEvent.click(
      body.getByRole("button", { name: "Remove and save" })
    );
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};

export const PathsStayPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async () => {
    await dialog("Remove Invoices from Jamie Chen?");

    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

/** T11: no path stays for a person, so the dialog says the module goes and names no path. */
export const NoPathPerson: Story = {
  args: {
    recipient: sam,
    removals: [
      {
        rowName: "Slides",
        rolesThatGo: [
          fixturePath({
            id: "a-3",
            holder: sam,
            role: slidesEditor,
            moduleId: "slides",
          }),
        ],
        pathsThatStay: [],
      },
    ],
  },
  play: async () => {
    const body = await dialog("Remove Slides from Sam Rivera?");

    await expect(
      body.getByText(
        "Sam Rivera holds no other role of Slides. After you save, Sam Rivera no longer reaches Slides."
      )
    ).toBeVisible();
    await expect(body.queryByText("Paths that stay")).toBeNull();
  },
};

export const NoPathGroup: Story = {
  args: {
    recipient: financeTeam,
    removals: [
      {
        rowName: "Invoices",
        rolesThatGo: [
          fixturePath({
            id: "a-2",
            holder: financeTeam,
            role: finance,
            moduleId: "invoices",
          }),
          fixturePath({
            id: "a-4",
            holder: financeTeam,
            role: viewer,
            moduleId: "invoices",
            scope: { type: "invoice", id: "inv-1042" },
          }),
        ],
        pathsThatStay: [],
      },
    ],
  },
};

/** T12: a batch Remove confirms every module, one section each. */
export const TwoModules: Story = {
  args: {
    recipient: operations,
    removals: [
      {
        rowName: "Invoices",
        rolesThatGo: [
          fixturePath({
            id: "a-5",
            holder: operations,
            role: viewer,
            moduleId: "invoices",
          }),
        ],
        pathsThatStay: [],
      },
      {
        rowName: "Slides",
        rolesThatGo: [
          fixturePath({
            id: "a-6",
            holder: operations,
            role: slidesEditor,
            moduleId: "slides",
          }),
        ],
        pathsThatStay: [],
      },
    ],
  },
  play: async () => {
    const body = await dialog("Remove 2 modules from Operations?");

    await expect(
      body
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Invoices", "Slides"]);
    await expect(
      body.getAllByRole("list", { name: "Roles that go" })
    ).toHaveLength(2);
  },
};
