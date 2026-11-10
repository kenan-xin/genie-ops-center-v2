import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { viewsDashboardPage } from "./__fixtures__/dashboards.ts";
import { ViewMenu } from "./view-menu.tsx";

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const { views } = viewsDashboardPage.dashboard;

const meta = {
  title: "Modules/Analytics/Dashboard view menu",
  component: ViewMenu,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The view switcher at the start of the dashboard filter bar, variant A (Spec 7 R-49a, S7-47). "View: <name>" opens the views ("Dashboard filters" and each saved view, the default one with a Default badge), then the actions on the selected view: Make default (or the disabled "Default view" line), Remove view, Save as view and Save as default. Without a view only Save as view shows. A menu from 768 px; the same content in a bottom sheet on a phone.',
      },
    },
    a11y: { test: "error" },
  },
  args: {
    views,
    defaultViewId: "v1",
    viewId: "v1",
    onSelect: fn(),
    onMakeDefault: fn(),
    onRemove: fn(),
    onSaveAsView: fn(),
    onSaveAsDefault: fn(),
  },
} satisfies Meta<typeof ViewMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

// Capture `default-view`: the default view is selected, so Make default reads as the disabled line.
export const DefaultView: Story = {
  name: "Default view selected",
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
      menu.getByRole("menuitem", { name: /^Default view/ })
    ).toHaveAttribute("aria-disabled", "true");

    // "Dashboard filters" is the empty radio value; it must still reach the page as no view.
    await userEvent.click(
      menu.getByRole("menuitemradio", { name: /^Dashboard filters/ })
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

// With no view only Save as view is offered; the bar carries Save as default.
export const NoView: Story = {
  name: "No view selected",
  globals: desktop,
  args: { viewId: null },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "View: Dashboard filters" })
    );

    const menu = within(await screen.findByRole("menu"));

    await waitFor(() =>
      expect(
        menu.getByRole("menuitem", { name: /^Save as view/ })
      ).toBeVisible()
    );
    await expect(
      menu.queryByRole("menuitem", { name: /^Remove view/ })
    ).toBeNull();
    await expect(
      menu.queryByRole("menuitem", { name: /^Save as default/ })
    ).toBeNull();
  },
};

// Capture `views-390`: the same content in the bottom sheet, which closes on an action.
export const OnPhone: Story = {
  name: "On a phone",
  globals: phone,
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "View: Month end" })
    );

    const sheet = within(await screen.findByRole("dialog", { name: "Views" }));

    await userEvent.click(sheet.getByRole("button", { name: /^Remove view/ }));

    await expect(args.onRemove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};
