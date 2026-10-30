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

import {
  FIXTURE_PLACEHOLDER,
  FIXTURE_SETTINGS,
} from "./__fixtures__/settings.ts";
import { TenantSettingsScreen } from "./settings-screen.tsx";
import type { SettingsView, TenantSettingsScreenProps } from "./types.ts";

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
    localAccountsNotes: {
      managed:
        "The tenant realm is brokered only. Ask your Genie operator to add local accounts to the realm.",
      customer:
        "Local accounts are not available because sign-in uses the company's own realm.",
    },
    onSaveSignIn: saved(),
    onSaveSessions: saved(),
    onSaveReporting: saved(),
    onSaveModelKey: saved(),
    onRemoveModelKey: saved(),
    onSaveModels: saved(),
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
      canvas.getByText("5 to 480 minutes. Default 15.")
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
      core: {
        ...FIXTURE_SETTINGS.core,
        realmMode: "managed",
        realmSupportsLocalAccounts: false,
      },
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

/** A stored "on" in a realm without local accounts can still be switched off; only "on" is refused. */
export const BrokeredOnlyStoredOn: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: {
        ...FIXTURE_SETTINGS.core,
        localAccountsEnabled: true,
        realmSupportsLocalAccounts: false,
      },
    },
  },
  play: async ({ args, canvas }) => {
    const toggle = canvas.getByRole("switch", {
      name: "Allow local accounts",
    });

    await expect(toggle).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(toggle);
    await expect(toggle).not.toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    // Only the changed field is sent, so a stale form keeps another administrator's change (admin M-1).
    await waitFor(() =>
      expect(args.onSaveSignIn).toHaveBeenCalledWith({
        localAccountsEnabled: false,
      })
    );
  },
};

/** Client-only mode signs in through the company's own realm, so no local account exists (ADR 0010). */
export const ClientOnly: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: {
        ...FIXTURE_SETTINGS.core,
        realmMode: "customer",
        realmSupportsLocalAccounts: false,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("switch", { name: "Allow local accounts" })
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      canvas.getByText(
        "Local accounts are not available because sign-in uses the company's own realm."
      )
    ).toBeVisible();
    await expect(canvas.queryByText(/brokered only/)).toBeNull();
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
      expect(args.onSaveModule).toHaveBeenCalledWith("placeholder", {
        pageSize: 40,
      })
    );
  },
};

/** A refetch hands the screen a new object with the values the server still holds. */
const refetched = (
  values: SettingsView["modules"][number]["values"] = {}
): SettingsView => ({
  core: { ...FIXTURE_SETTINGS.core },
  modules: [
    {
      ...FIXTURE_PLACEHOLDER,
      values: { ...FIXTURE_PLACEHOLDER.values, ...values },
    },
  ],
});

/** Refetching outside the form must not reset an edit in progress (DR-20 S3-06). */
export const CoreEditSurvivesRefetch: Story = {
  args: { target: { section: "sessions" } },
  render: function Render(args) {
    const [settings, setSettings] = useState(args.settings);

    return (
      <>
        <button type="button" onClick={() => setSettings(refetched())}>
          Refetch
        </button>
        <TenantSettingsScreen {...args} settings={settings} />
      </>
    );
  },
  play: async ({ canvas }) => {
    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });

    await userEvent.clear(idle);
    await userEvent.type(idle, "30");
    await userEvent.click(canvas.getByRole("button", { name: "Refetch" }));

    await expect(idle).toHaveValue(30);
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

/** The same for a module section, whose ConfigForm owns its own form state. */
export const ModuleEditSurvivesRefetch: Story = {
  args: { target: { section: "placeholder" } },
  render: function Render(args) {
    const [settings, setSettings] = useState(args.settings);

    return (
      <>
        <button type="button" onClick={() => setSettings(refetched())}>
          Refetch
        </button>
        <TenantSettingsScreen {...args} settings={settings} />
      </>
    );
  },
  play: async ({ canvas }) => {
    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "40");
    await userEvent.click(canvas.getByRole("button", { name: "Refetch" }));

    await expect(pageSize).toHaveValue(40);
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

/** A refetch with saved values the form does not hold still becomes its clean state. */
export const ModuleRefetchWithSavedValuesResets: Story = {
  args: { target: { section: "placeholder" } },
  render: function Render(args) {
    const [settings, setSettings] = useState(args.settings);

    return (
      <>
        <button
          type="button"
          onClick={() => setSettings(refetched({ pageSize: 50 }))}
        >
          Refetch
        </button>
        <TenantSettingsScreen {...args} settings={settings} />
      </>
    );
  },
  play: async ({ canvas }) => {
    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "40");
    await userEvent.click(canvas.getByRole("button", { name: "Refetch" }));

    await expect(pageSize).toHaveValue(50);
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
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

const REFUSED =
  "The idle timeout was not saved. You do not have permission to make this change. Your change is kept.";

/** The host's whole failure copy shows as given, takes focus, and Save is the retry. */
export const SaveRefused: Story = {
  args: {
    target: { section: "sessions" },
    onSaveSessions: fn(async () => {
      throw { message: REFUSED };
    }),
  },
  play: async ({ args, canvas }) => {
    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });

    await userEvent.clear(idle);
    await userEvent.type(idle, "30");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    const alert = await canvas.findByRole("alert");

    await expect(alert).toHaveTextContent(REFUSED);
    await expect(alert).toHaveFocus();
    await expect(idle).toHaveValue(30);
    await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onSaveSessions).toHaveBeenCalledTimes(2));
  },
};

/** On a phone the failure line wraps, and the warning icon stays on the line it starts. */
export const SaveRefusedOnPhone: Story = {
  globals: phone,
  args: {
    target: { section: "sessions" },
    onSaveSessions: fn(async () => {
      throw { message: REFUSED };
    }),
  },
  play: async ({ canvas }) => {
    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });

    await userEvent.clear(idle);
    await userEvent.type(idle, "30");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    const alert = await canvas.findByRole("alert");
    const icon = alert.querySelector("svg");

    if (icon === null)
      throw new Error("The failure line shows no warning icon.");

    const text = document.createRange();

    text.selectNodeContents(alert);
    text.setStartAfter(icon);

    const iconTop = icon.getBoundingClientRect().top;
    const firstLineTop = text.getClientRects()[0]?.top ?? Number.NaN;

    await expect(Math.abs(iconTop - firstLineTop)).toBeLessThan(8);
  },
};

const TWO_LINE_FAILURE =
  "The idle timeout was not saved. The server could not be reached. Check your connection. Your change is kept.";

/**
 * On a phone a failure that wraps to two lines overlaps nothing: no button, grown by its 4 px focus
 * ring, touches a line of the text (fix list, "Save failures").
 */
export const TwoLineFailureOnPhone: Story = {
  globals: phone,
  args: {
    target: { section: "sessions" },
    onSaveSessions: fn(async () => {
      throw { message: TWO_LINE_FAILURE };
    }),
  },
  play: async ({ canvas }) => {
    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });

    await userEvent.clear(idle);
    await userEvent.type(idle, "30");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    const alert = await canvas.findByRole("alert");

    const text = [...alert.querySelectorAll("span")].find(
      (span) =>
        span.children.length === 0 &&
        span.textContent.includes("could not be reached")
    );

    if (text === undefined) throw new Error("The failure text is missing.");

    const range = document.createRange();

    range.selectNodeContents(text);

    const lines = [...range.getClientRects()];

    await expect(
      new Set(lines.map((line) => Math.round(line.top))).size
    ).toBeGreaterThan(1);

    const ring = 4;
    const section = alert.closest("section") ?? document.body;

    const overlapping = [...section.querySelectorAll("button")].flatMap(
      (button) => {
        const box = button.getBoundingClientRect();

        const touches = lines.some(
          (line) =>
            box.left - ring < line.right &&
            box.right + ring > line.left &&
            box.top - ring < line.bottom &&
            box.bottom + ring > line.top
        );

        return touches ? [button.textContent] : [];
      }
    );

    await expect(overlapping).toEqual([]);
  },
};

export const ModuleIssueOnField: Story = {
  args: {
    target: { section: "placeholder" },
    onSaveModule: fn(async () => {
      throw {
        message: "The server refused the change.",
        issues: [{ path: "pageSize", message: "Server says no." }],
      };
    }),
  },
  play: async ({ canvas }) => {
    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "40");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(await canvas.findByText("Server says no.")).toBeVisible();
    await expect(pageSize).toBeInvalid();
    await expect(pageSize).toHaveAccessibleDescription("Server says no.");
    // The edits stay and the summary line stays.
    await expect(pageSize).toHaveValue(40);
    await expect(
      canvas.getByText("The server refused the change.")
    ).toBeVisible();
  },
};

/** A root or unmatched issue path names no field, so it stays in the summary line (DR-20 S3-06). */
export const UnmatchedIssueStaysInSummary: Story = {
  args: {
    target: { section: "placeholder" },
    onSaveModule: fn(async () => {
      throw {
        message: "The server refused the root.",
        issues: [
          { path: "", message: "Root says no." },
          { path: "nope", message: "Unknown says no." },
        ],
      };
    }),
  },
  play: async ({ canvas }) => {
    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "40");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    // The server's own message survives a root issue path.
    await expect(
      await canvas.findByText("The server refused the root.")
    ).toBeVisible();
    // Neither issue names a field, so no field shows it and neither blocks Save.
    await expect(canvas.queryByText("Root says no.")).toBeNull();
    await expect(canvas.queryByText("Unknown says no.")).toBeNull();
    await expect(pageSize).not.toBeInvalid();
    await expect(pageSize).toHaveValue(40);
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

/** The same for a core section: the server's issue for the idle timeout (DR-20 S3-06). */
export const CoreIssueOnField: Story = {
  args: {
    target: { section: "sessions" },
    onSaveSessions: fn(async () => {
      throw {
        message: "The server refused the change.",
        issues: [{ path: "sessionIdleMinutes", message: "Server says no." }],
      };
    }),
  },
  play: async ({ canvas }) => {
    const idle = canvas.getByRole("spinbutton", { name: "Idle timeout" });

    await userEvent.clear(idle);
    await userEvent.type(idle, "30");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(await canvas.findByText("Server says no.")).toBeVisible();
    await expect(idle).toBeInvalid();
    await expect(idle).toHaveAccessibleDescription("Server says no.");
    await expect(idle).toHaveValue(30);
    await expect(
      canvas.getByText("The server refused the change.")
    ).toBeVisible();

    // Editing the field clears the server error it carried.
    await userEvent.clear(idle);
    await userEvent.type(idle, "31");
    await waitFor(() =>
      expect(canvas.queryByText("Server says no.")).toBeNull()
    );
  },
};

/** Editing the reporting date saves it, and Use today clears the field to null (R-9). */
export const ReportingDateSavesAndClears: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: { ...FIXTURE_SETTINGS.core, reportingDate: "2026-01-01" },
    },
    target: { section: "reporting" },
  },
  play: async ({ args, canvas }) => {
    fireEvent.change(canvas.getByLabelText("Reporting date"), {
      target: { value: "2026-10-27" },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSaveReporting).toHaveBeenCalledWith({
        reportingDate: "2026-10-27",
      })
    );

    await userEvent.click(canvas.getByRole("button", { name: "Use today" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSaveReporting).toHaveBeenLastCalledWith({
        reportingDate: null,
      })
    );
  },
};

/**
 * The half-typed date proof lives in `tenant-settings.spec.ts`: a story's synthetic key events do
 * not edit Chrome's date segments, so the component browser cannot produce one.
 */

/** The section saves through the screen, so a refusal reaches the field and the footer bar. */
export const ReportingSaveRefusedMarksTheField: Story = {
  args: {
    target: { section: "reporting" },
    onSaveReporting: fn(async () => {
      throw {
        message: "The reporting date was not saved. Your change is kept.",
        issues: [{ path: "reportingDate", message: "Server says no." }],
      };
    }),
  },
  play: async ({ canvas }) => {
    fireEvent.change(canvas.getByLabelText("Reporting date"), {
      target: { value: "2026-10-27" },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(await canvas.findByText("Server says no.")).toBeVisible();
    await expect(
      canvas.getByText("The reporting date was not saved. Your change is kept.")
    ).toBeVisible();
  },
};

/** AI without a key says why in both AI sections, because the key is the first step for both (R-20). */
export const AiOffWithoutKey: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: {
        ...FIXTURE_SETTINGS.core,
        modelKeyStored: false,
        aiState: "no-key",
      },
    },
    target: { section: "ai-connection" },
  },
  play: async ({ canvas }) => {
    const noKey =
      "Store a model provider key in AI connection to turn on AI features.";

    await expect(canvas.getByText("AI is off.")).toBeVisible();
    await expect(canvas.getByText(noKey)).toBeVisible();

    await userEvent.click(
      within(
        canvas.getByRole("navigation", { name: "Settings sections" })
      ).getByRole("button", { name: "AI models" })
    );

    await expect(
      canvas.getByRole("heading", { name: "AI models", level: 2 })
    ).toBeVisible();
    await expect(canvas.getByText("AI is off.")).toBeVisible();
    await expect(canvas.getByText(noKey)).toBeVisible();
  },
};

/** A stored key with no defaults is still off, and the note names the section to fix (R-20). */
export const AiOffWithoutModels: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: {
        ...FIXTURE_SETTINGS.core,
        modelKeyStored: true,
        aiState: "no-models",
      },
    },
    target: { section: "ai-models" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("AI is off.")).toBeVisible();
    await expect(
      canvas.getByText(
        "Choose the allowed models and the two defaults in AI models to turn on AI features."
      )
    ).toBeVisible();
  },
};

/** The key is write-only: it saves, then the field empties, and no value is ever shown (R-17). */
export const AiKeySavesAndClearsTheField: Story = {
  args: { target: { section: "ai-connection" } },
  play: async ({ args, canvas }) => {
    const field = canvas.getByLabelText("OpenRouter API key");

    await expect(canvas.getByText("Not stored")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Remove key" })
    ).toBeDisabled();
    await expect(field).toHaveAttribute("type", "password");

    await userEvent.type(field, "sk-or-v1-story");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(args.onSaveModelKey).toHaveBeenCalledWith({
        apiKey: "sk-or-v1-story",
      })
    );
    await expect(field).toHaveValue("");
  },
};

/** An empty field keeps the stored key, so an empty or spaces-only field cannot save (DEC-53). */
export const AiKeyEmptyFieldKeepsTheKey: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: { ...FIXTURE_SETTINGS.core, modelKeyStored: true },
    },
    target: { section: "ai-connection" },
  },
  play: async ({ args, canvas }) => {
    const field = canvas.getByLabelText("OpenRouter API key");
    const save = canvas.getByRole("button", { name: "Save" });

    await expect(canvas.getByText("Stored")).toBeVisible();
    await expect(save).toBeDisabled();

    await userEvent.type(field, "   ");
    await expect(save).toBeDisabled();
    expect(args.onSaveModelKey).not.toHaveBeenCalled();
  },
};

/** The key leaves only through a danger confirm, and Cancel removes nothing (R-17). */
export const AiKeyRemoveConfirms: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: { ...FIXTURE_SETTINGS.core, modelKeyStored: true },
    },
    target: { section: "ai-connection" },
  },
  play: async ({ args, canvas }) => {
    const remove = canvas.getByRole("button", { name: "Remove key" });

    await userEvent.click(remove);

    const dialog = await screen.findByRole("dialog", {
      name: "Remove the model provider key?",
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(args.onRemoveModelKey).not.toHaveBeenCalled();

    await userEvent.click(remove);
    await userEvent.click(
      within(
        await screen.findByRole("dialog", {
          name: "Remove the model provider key?",
        })
      ).getByRole("button", { name: "Remove key" })
    );
    await waitFor(() => expect(args.onRemoveModelKey).toHaveBeenCalledTimes(1));
  },
};

const MODEL_SETTINGS = {
  allowedModels: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
  chatModel: "openai/gpt-6.1-terra",
  documentModel: "anthropic/claude-opus-5.5",
};

/** A saved view with both defaults, so a story changes one thing from a valid form. */
const withModels = (overrides: Partial<typeof MODEL_SETTINGS> = {}) => ({
  ...FIXTURE_SETTINGS,
  core: { ...FIXTURE_SETTINGS.core, ...MODEL_SETTINGS, ...overrides },
});

/** The options a select offers, in order, so a story can prove it lists the current ids. */
const optionTexts = async () =>
  (await screen.findAllByRole("option")).map((option) => option.textContent);

/** The textarea trims each line, drops blanks and repeats, and both defaults save with it (R-18). */
export const AiModelsSave: Story = {
  args: {
    settings: {
      ...FIXTURE_SETTINGS,
      core: { ...FIXTURE_SETTINGS.core, aiState: "on" },
    },
    target: { section: "ai-models" },
  },
  play: async ({ args, canvas }) => {
    // AI is on, so no section carries the switched-off note (R-20).
    await expect(canvas.queryByText("AI is off.")).toBeNull();

    fireEvent.change(canvas.getByRole("textbox", { name: "Allowed models" }), {
      target: {
        value:
          "openai/gpt-6.1-terra\n\n  anthropic/claude-opus-5.5  \nopenai/gpt-6.1-terra",
      },
    });

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Chat default" })
    );
    await expect(await optionTexts()).toEqual(MODEL_SETTINGS.allowedModels);
    await userEvent.click(
      await screen.findByRole("option", { name: "openai/gpt-6.1-terra" })
    );
    // The closed list fades out before it unmounts; until then its options also match.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Document reading" })
    );
    await expect(await optionTexts()).toEqual(MODEL_SETTINGS.allowedModels);
    await userEvent.click(
      await screen.findByRole("option", {
        name: "anthropic/claude-opus-5.5",
      })
    );

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(args.onSaveModels).toHaveBeenCalledWith({
        allowedModels: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
        chatModel: "openai/gpt-6.1-terra",
        documentModel: "anthropic/claude-opus-5.5",
      })
    );
  },
};

/** Removing the line a default names leaves Save disabled with the default issue shown (R-18). */
export const AiModelsDefaultOutsideList: Story = {
  args: { settings: withModels(), target: { section: "ai-models" } },
  play: async ({ canvas }) => {
    fireEvent.change(canvas.getByRole("textbox", { name: "Allowed models" }), {
      target: { value: "anthropic/claude-opus-5.5" },
    });

    await expect(
      await canvas.findByText("Choose a model from the allowed models.")
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();

    // The removed id is gone from the picker too, not only from the list field.
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Chat default" })
    );
    await expect(await optionTexts()).toEqual(["anthropic/claude-opus-5.5"]);
  },
};

/** A server issue for a default reaches that select (DR-20 S3-06). */
export const AiModelsSaveRefusedMarksTheField: Story = {
  args: {
    settings: withModels(),
    target: { section: "ai-models" },
    onSaveModels: fn(async () => {
      throw {
        message: "The AI models were not saved. Your change is kept.",
        issues: [{ path: "chatModel", message: "Server says no." }],
      };
    }),
  },
  play: async ({ canvas }) => {
    // One more allowed id keeps the form valid while making it dirty, so Save submits.
    fireEvent.change(canvas.getByRole("textbox", { name: "Allowed models" }), {
      target: {
        value:
          "openai/gpt-6.1-terra\nanthropic/claude-opus-5.5\nmeta-llama/llama-3-8b-instruct:free",
      },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(await canvas.findByText("Server says no.")).toBeVisible();
    await expect(
      canvas.getByText("The AI models were not saved. Your change is kept.")
    ).toBeVisible();
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

/** A link to a field of the AI models section focuses the default's picker (R-18). */
export const AiModelsDeepLinkFocusesTheField: Story = {
  args: { target: { section: "ai-models", field: "chatModel" } },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("combobox", { name: "Chat default" })
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
