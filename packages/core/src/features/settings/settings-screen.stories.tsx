import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  FIXTURE_PLACEHOLDER,
  FIXTURE_SETTINGS,
} from "./__fixtures__/settings.ts";
import { TenantSettingsScreen } from "./settings-screen.tsx";
import type { TenantSettingsScreenProps } from "./types.ts";

const phone = { viewport: { value: "mobile1", isRotated: false } };

const saved = () => fn(async () => {});

/**
 * Tenant settings (R-72 to R-80): a section navigator with the core sections and one section per
 * module that declares settings. One section shows at a time and saves on its own.
 */
const meta = {
  title: "Core/TenantSettings",
  component: TenantSettingsScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Tenant settings as a section navigator. The host owns the read, the writes and the address; the screen owns the open section's form, the dirty-navigation confirm and the save failure line. Saving here never switches a module on.",
      },
    },
    a11y: { test: "error" },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: {
    settings: FIXTURE_SETTINGS,
    target: {},
    timeZone: "UTC",
    modulesHref: "/admin/modules",
    onSaveSignIn: saved(),
    onSaveSessions: saved(),
    onSaveModule: saved(),
    onTargetChange: fn(),
  } satisfies TenantSettingsScreenProps,
  // The host writes the opened section into the address; the stories keep it in state.
  render: function Render(args) {
    const [target, setTarget] = useState(args.target);

    return (
      <TenantSettingsScreen
        {...args}
        target={target}
        onTargetChange={(next) => {
          args.onTargetChange(next);
          setTarget(next);
        }}
      />
    );
  },
} satisfies Meta<typeof TenantSettingsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const nav = within(
      canvas.getByRole("navigation", { name: "Settings sections" })
    );

    await expect(nav.getByRole("heading", { name: "Tenant" })).toBeVisible();
    await expect(nav.getByRole("heading", { name: "Modules" })).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Sign-in & accounts" })
    ).toHaveAttribute("aria-current", "true");
    await expect(
      nav.getByRole("button", { name: "Placeholder" })
    ).toBeVisible();
    await expect(
      canvas.getByText("Last changed by Ada Lovelace · 20 Oct 2026, 09:30")
    ).toBeVisible();

    await userEvent.click(nav.getByRole("button", { name: "Sessions" }));
    await expect(
      canvas.getByRole("spinbutton", { name: "Idle timeout" })
    ).toHaveValue(15);
    await expect(
      canvas.getByText(/5 to 480 minutes, default 15\. Applies to new sessions/)
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};

export const SignInSaves: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Just-in-time/ }));
    await userEvent.click(
      canvas.getByRole("switch", { name: "Allow local accounts" })
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(args.onSaveSignIn).toHaveBeenCalledWith({
        onboardingMode: "jit",
        localAccountsEnabled: true,
      })
    );
  },
};

export const IdleOutOfRange: Story = {
  args: { target: { section: "sessions" } },
  play: async ({ args, canvas }) => {
    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });
    const save = canvas.getByRole("button", { name: "Save" });

    const enter = async (value: string) => {
      await userEvent.clear(idle);
      await userEvent.type(idle, value);
      await userEvent.tab();
    };

    const refused = async () => {
      await expect(await canvas.findByRole("alert")).toHaveTextContent(
        "Enter a whole number from 5 to 480."
      );
      await expect(save).toBeDisabled();
    };

    const accepted = async () => {
      await waitFor(() => expect(canvas.queryByRole("alert")).toBeNull());
      await expect(save).toBeEnabled();
    };

    await enter("4");
    await refused();
    await enter("481");
    await refused();
    await enter("5");
    await accepted();
    await enter("480");
    await accepted();

    await userEvent.click(save);
    await waitFor(() =>
      expect(args.onSaveSessions).toHaveBeenCalledWith({
        sessionIdleMinutes: 480,
      })
    );
  },
};

export const BrokeredOnly: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: { ...FIXTURE_SETTINGS.core, realmSupportsLocalAccounts: false },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("switch", { name: "Allow local accounts" })
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      canvas.getByText(
        "The tenant realm is brokered only. Ask your Genie operator to add local accounts to the realm."
      )
    ).toBeVisible();
  },
};

export const ModuleSection: Story = {
  args: { target: { section: "placeholder" } },
  play: async ({ args, canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Placeholder", level: 2 })
    ).toBeVisible();
    await expect(canvas.getByText("Never changed")).toBeVisible();

    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "40");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(args.onSaveModule).toHaveBeenCalledWith(
        "placeholder",
        expect.objectContaining({ pageSize: 40 })
      )
    );
  },
};

const disabledModule = {
  target: { section: "placeholder" },
  settings: {
    ...FIXTURE_SETTINGS,
    modules: [{ ...FIXTURE_PLACEHOLDER, enabled: false }],
  },
};

export const DisabledModule: Story = {
  args: disabledModule,
  play: async ({ canvas }) => {
    const nav = within(
      canvas.getByRole("navigation", { name: "Settings sections" })
    );

    await expect(nav.getByText("Disabled")).toBeVisible();
    await expect(
      canvas.getByText("Placeholder is switched off.")
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Modules" })).toHaveAttribute(
      "href",
      "/admin/modules"
    );
    // Its settings stay editable.
    await expect(canvas.getByRole("textbox", { name: "Title" })).toBeEnabled();
  },
};

/** The Modules link in the switched-off note leaves the page, so an edited section asks first. */
export const ModulesLinkConfirmsWhenDirty: Story = {
  args: disabledModule,
  play: async ({ canvas }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Title" }),
      " edited"
    );
    await userEvent.click(canvas.getByRole("link", { name: "Modules" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Discard the changes in Placeholder?",
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Placeholder edited"
    );
  },
};

export const DirtyNavigationConfirms: Story = {
  args: { target: { section: "sessions" } },
  play: async ({ args, canvas }) => {
    const nav = within(
      canvas.getByRole("navigation", { name: "Settings sections" })
    );

    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });

    await userEvent.clear(idle);
    await userEvent.type(idle, "30");
    await expect(
      nav.getByRole("button", { name: "Sessions (unsaved)" })
    ).toBeVisible();

    await userEvent.click(nav.getByRole("button", { name: "Placeholder" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Discard the changes in Sessions?",
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(idle).toHaveValue(30);
    await expect(args.onTargetChange).not.toHaveBeenCalled();

    await userEvent.click(nav.getByRole("button", { name: "Placeholder" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Discard",
      })
    );
    await expect(args.onTargetChange).toHaveBeenCalledWith({
      section: "placeholder",
    });
    await expect(
      await canvas.findByRole("heading", { name: "Placeholder", level: 2 })
    ).toBeVisible();

    await userEvent.click(nav.getByRole("button", { name: "Sessions" }));
    await expect(
      canvas.getByRole("spinbutton", { name: "Idle timeout" })
    ).toHaveValue(15);
  },
};

export const PhoneListDetail: Story = {
  globals: phone,
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("heading", { name: "Sessions", level: 2 })
    ).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Sessions" }));
    await expect(
      canvas.getByRole("heading", { name: "Sessions", level: 2 })
    ).toBeVisible();
    await expect(
      canvas.queryByRole("navigation", { name: "Settings sections" })
    ).toBeNull();

    await userEvent.type(
      canvas.getByRole("spinbutton", { name: "Idle timeout" }),
      "0"
    );
    await userEvent.click(canvas.getByRole("button", { name: "All settings" }));
    await userEvent.click(
      within(
        await screen.findByRole("dialog", {
          name: "Discard the changes in Sessions?",
        })
      ).getByRole("button", { name: "Discard" })
    );

    await expect(
      await canvas.findByRole("navigation", { name: "Settings sections" })
    ).toBeVisible();
  },
};

export const SaveRefused: Story = {
  args: {
    target: { section: "sessions" },
    onSaveSessions: fn(async () => {
      throw { message: "Something went wrong." };
    }),
  },
  play: async ({ args, canvas }) => {
    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });

    await userEvent.clear(idle);
    await userEvent.type(idle, "30");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Not saved. Something went wrong. Your changes are still here."
    );
    await expect(idle).toHaveValue(30);

    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(args.onSaveSessions).toHaveBeenCalledTimes(2));
  },
};

export const StaleLink: Story = {
  args: { target: { section: "retired-module", field: "x" } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "That settings section does not exist, or you may not open it."
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Sign-in & accounts", level: 2 })
    ).toBeVisible();
  },
};

export const FocusField: Story = {
  args: { target: { section: "placeholder", field: "pageSize" } },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("spinbutton", { name: "Page size" })
      ).toHaveFocus()
    );
  },
};

export const FocusCoreField: Story = {
  args: { target: { section: "sessions", field: "sessionIdleMinutes" } },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("spinbutton", { name: "Idle timeout" })
      ).toHaveFocus()
    );
  },
};

export const UnknownFieldFocusesHeading: Story = {
  args: { target: { section: "placeholder", field: "retired" } },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("heading", { name: "Placeholder", level: 2 })
      ).toHaveFocus()
    );
  },
};

export const Loading: Story = {
  args: { settings: undefined, loading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading settings…"
    );
  },
};

export const ReadFailed: Story = {
  args: {
    settings: undefined,
    error: "The settings could not be read. Try again.",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "The settings could not be read. Try again."
    );
  },
};

export const Dark: Story = { ...DisabledModule, globals: { theme: "dark" } };
