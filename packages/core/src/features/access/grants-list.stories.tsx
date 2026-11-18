import { useListState } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import type { RecipientRow } from "../../services/roles/recipients.ts";
import { FIXTURE_RECIPIENTS, fixtureRecipient } from "./__fixtures__/access.ts";
import { GrantsList, type GrantsListPage } from "./grants-list.tsx";
import { GRANTS_LIST } from "./grants-view.ts";

type Args = {
  readonly page: GrantsListPage | undefined;
  readonly paging: boolean;
  readonly onPage: (step: -1 | 1) => void;
  readonly onOpen: (row: RecipientRow) => void;
};

/** Holds the address the way the route does, so each story starts from its own filters. */
function Harness(args: Args) {
  const state = useListState(GRANTS_LIST);

  return (
    <GrantsList
      state={state}
      page={args.page}
      onPage={args.onPage}
      paging={args.paging}
      onOpen={args.onOpen}
    />
  );
}

/** The story's address: only `q` and `show`, so a story starts from its own filters. */
const address = () => () => {
  const url = new URL(window.location.href);

  for (const name of ["q", "show"]) url.searchParams.delete(name);

  window.history.replaceState(null, "", url);
};

const meta = {
  title: "Core/Access/GrantsList",
  component: Harness,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Grants with no recipient chosen (P12-17): every group, then every person, 25 to a page, searched and filtered by Show on the server. Open <name> in Grants opens that recipient's editor.",
      },
    },
    a11y: { test: "error" },
  },
  beforeEach: address(),
  args: {
    page: {
      rows: FIXTURE_RECIPIENTS,
      from: 1,
      total: 317,
      hasPrevious: false,
      hasNext: true,
    },
    onPage: fn(),
    paging: false,
    onOpen: fn(),
  },
} satisfies Meta<typeof Harness>;

export default meta;

type Story = StoryObj<typeof meta>;

/** P12-17: Next pages and the row's button opens that recipient. */
export const Default: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(args.onPage).toHaveBeenCalledWith(1);

    await userEvent.click(
      canvas.getByRole("button", { name: "Open Jamie Chen in Grants" })
    );
    await expect(args.onOpen).toHaveBeenCalledWith(fixtureRecipient("p-jamie"));
  },
};

/** The phone list: the search and the Show filter in sheet form, and nothing overflows sideways. */
export const GroupsAndPeopleOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("searchbox", { name: "Search groups and people" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: /^Show:/ })
    ).toBeVisible();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
  },
};

/** A page still loading says so, and shows no empty state. */
export const Loading: Story = {
  args: { page: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading groups and people")).toBeVisible();
    await expect(canvas.queryByText("No group or person matches")).toBeNull();
  },
};

/** An unfiltered list with no rows shows the empty state and no Clear button. */
export const NoMatch: Story = {
  args: {
    page: { rows: [], from: 1, total: 0, hasPrevious: false, hasNext: false },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "No group or person matches" })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Clear search and filter" })
    ).toBeNull();
  },
};
