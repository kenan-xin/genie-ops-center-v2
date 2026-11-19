import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { viewsDashboardPage } from "./__fixtures__/dashboards.ts";
import { ViewMenu, ViewNameDialog } from "./view-menu.tsx";

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const { views } = viewsDashboardPage.dashboard;

const onSaveView = fn();

const meta = {
  title: "Modules/Analytics/Dashboard view menu",
  component: ViewMenu,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The view switcher at the start of the dashboard filter bar, variant A (Spec 7 R-49a, S7-47, czjw.192). "View: <name>" opens the views: Original, the dashboard\'s own filters, and each saved view. The default, Original or a view, carries a Default badge. Then the actions on the selected one: Make default when it is not the default, Delete view for a saved view, and Save view. A menu from 768 px; the same content in a bottom sheet on a phone.',
      },
    },
    // Base UI's focus guards are aria-hidden on purpose (they hand focus on), so only they skip
    // aria-hidden-focus, as in the audit log stories.
    a11y: {
      test: "error",
      config: {
        rules: [
          {
            id: "aria-hidden-focus",
            selector: '[aria-hidden="true"]:not([data-base-ui-focus-guard])',
          },
        ],
      },
    },
  },
  args: {
    place: "bar",
    views,
    defaultViewId: "v1",
    viewId: "v1",
    onSelect: fn(),
    onMakeDefault: fn(),
    onRemove: fn(),
    onSaveView: fn(),
  },
} satisfies Meta<typeof ViewMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

// Capture `default-view`: the default view is selected, so it offers no Make default (czjw.192).
export const DefaultView: Story = {
  name: "The default selected",
  globals: desktop,
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "View: Month end" })
    );

    const menu = within(await screen.findByRole("menu"));

    await expect(
      menu.getByRole("menuitemradio", { name: /^Month end/ })
    ).toHaveAttribute("aria-checked", "true");
    // The menu fades in.
    await waitFor(() => expect(menu.getByText("Default")).toBeVisible());
    await expect(
      menu.queryByRole("menuitem", { name: /^Make default/ })
    ).toBeNull();
    // czjw.192: no greyed "Default view" row either.
    await expect(
      menu.queryByRole("menuitem", { name: /^Default view/ })
    ).toBeNull();

    // "Original" is the empty radio value; it must still reach the page as no view.
    await userEvent.click(
      menu.getByRole("menuitemradio", { name: /^Original/ })
    );
    await expect(args.onSelect).toHaveBeenCalledWith(null);
  },
};

// Capture `views`: a view that is not the default offers Make default.
export const OtherView: Story = {
  name: "Another view selected",
  globals: desktop,
  args: { viewId: "v2" },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "View: North region" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /^Make default/ })
    );
    await expect(args.onMakeDefault).toHaveBeenCalledTimes(1);
  },
};

// Month end is the default here, so Original offers Make default; it has no Delete view.
export const NoView: Story = {
  name: "Original selected",
  globals: desktop,
  args: { viewId: null },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "View: Original" })
    );

    const menu = within(await screen.findByRole("menu"));

    await waitFor(() =>
      expect(menu.getByRole("menuitem", { name: /^Save view/ })).toBeVisible()
    );
    await expect(
      menu.queryByRole("menuitem", { name: /^Delete view/ })
    ).toBeNull();
    await userEvent.click(
      menu.getByRole("menuitem", { name: /^Make default/ })
    );
    await expect(args.onMakeDefault).toHaveBeenCalledTimes(1);
  },
};

// czjw.192: with no default view Original is the default, so it carries the one Default badge.
export const OriginalIsDefault: Story = {
  name: "Original is the default",
  globals: desktop,
  args: { viewId: null, defaultViewId: null },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "View: Original" })
    );

    const menu = within(await screen.findByRole("menu"));

    // The menu fades in.
    await waitFor(() =>
      expect(
        within(
          menu.getByRole("menuitemradio", { name: /^Original/ })
        ).getByText("Default")
      ).toBeVisible()
    );
    await expect(menu.getAllByText("Default")).toHaveLength(1);
    await expect(
      menu.queryByRole("menuitem", { name: /^Make default/ })
    ).toBeNull();
  },
};

// Bug caught: Save view was disabled with an empty name, so nothing said what is missing,
// and a press without the guard would save a blank name.
export const SaveViewEmptySaysWhy: Story = {
  globals: desktop,
  render: () => (
    <ViewNameDialog
      views={views}
      saving={false}
      refusal={null}
      onSave={onSaveView}
      onClose={fn()}
    />
  ),
  play: async () => {
    onSaveView.mockClear();

    const dialog = within(await screen.findByRole("dialog"));
    const input = dialog.getByRole("textbox", { name: "Name" });

    await userEvent.click(dialog.getByRole("button", { name: "Save view" }));

    // The dialog fades in, so its error turns visible after the transition.
    await waitFor(() =>
      expect(dialog.getByText("Enter a name.")).toBeVisible()
    );
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription("Enter a name.");
    await expect(onSaveView).not.toHaveBeenCalled();
  },
};

// czjw.192: on a view the name starts as its own, which updates it; another view's name is refused.
export const SaveViewOnAView: Story = {
  name: "Save view starts with the view's name",
  globals: desktop,
  render: () => (
    <ViewNameDialog
      views={views}
      current={views[0]}
      saving={false}
      refusal={null}
      onSave={onSaveView}
      onClose={fn()}
    />
  ),
  play: async () => {
    onSaveView.mockClear();

    const dialog = within(
      await screen.findByRole("dialog", { name: "Save view" })
    );

    const input = dialog.getByRole("textbox", { name: "Name" });

    await expect(input).toHaveValue("Month end");
    // The dialog fades in.
    await waitFor(() =>
      expect(
        dialog.getByText(
          "Keep the name to update Month end, or type a new name to save another view."
        )
      ).toBeVisible()
    );

    await userEvent.clear(input);
    await userEvent.type(input, "north REGION");
    await userEvent.click(dialog.getByRole("button", { name: "Save view" }));

    await expect(
      dialog.getByText("A view with this name exists. Choose another name.")
    ).toBeVisible();
    await expect(onSaveView).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "month END");
    await userEvent.click(dialog.getByRole("button", { name: "Save view" }));

    await expect(onSaveView).toHaveBeenCalledWith("month END");
  },
};

// Capture `views-390`: the same content in the bottom sheet, which closes on an action.
export const OnPhone: Story = {
  name: "On a phone",
  globals: phone,
  args: { place: "sheet" },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "View: Month end" })
    );

    const sheet = within(await screen.findByRole("dialog", { name: "Views" }));

    // 6wz1.139: a view row and an action row leave 10 px between the icon and its text.
    await expect(
      getComputedStyle(sheet.getByRole("button", { name: /^Month end/ }))
        .columnGap
    ).toBe("10px");
    await expect(
      getComputedStyle(sheet.getByRole("button", { name: /^Delete view/ }))
        .columnGap
    ).toBe("10px");

    await userEvent.click(sheet.getByRole("button", { name: /^Delete view/ }));

    await expect(args.onRemove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};
