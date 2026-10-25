import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import {
  Button,
  ConfigForm,
  type ConfigFormField,
  type ConfigFormSchema,
  type ConfigValue,
} from "../index.ts";

// The placeholder module's configuration as core converts it (R-75).
const schema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 60,
      default: "Placeholder",
    },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    enabled: { type: "boolean", default: false },
    mode: { type: "string", enum: ["basic", "advanced"], default: "basic" },
    tags: {
      type: "array",
      items: { type: "string", pattern: "^[a-z0-9-]+$" },
      maxItems: 5,
      default: [],
    },
  },
} as const satisfies ConfigFormSchema;

const fields: readonly ConfigFormField[] = [
  {
    id: "title",
    title: "Title",
    description: "Shown at the top of the workspace.",
  },
  { id: "pageSize", title: "Page size", description: "Rows per page." },
  {
    id: "enabled",
    title: "Enabled",
    description: "Turns the sample feature on.",
  },
  { id: "mode", title: "Mode", description: "How much the workspace shows." },
  { id: "tags", title: "Tags", description: "Lower-case words and hyphens." },
];

const stored = {
  title: "Placeholder",
  pageSize: 20,
  enabled: false,
  mode: "basic",
  tags: ["one"],
} satisfies Record<string, ConfigValue>;

const phone = { viewport: { value: "mobile1", isRotated: false } };

const meta = {
  title: "UI/ConfigForm",
  component: ConfigForm,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Renders a module's configuration from plain JSON Schema: string, number, boolean, enum and string list, and nothing else (DEC-28, R-75, R-76). It is not a form engine. TanStack Form holds the state, with a validator rebuilt from the schema, so the messages are the fixed R-80 texts. A stored value that already fails shows its message on load; every other field waits for blur. The host renders the footer from the `footer` state.",
      },
    },
  },
  args: {
    schema,
    fields,
    values: stored,
    idPrefix: "cfg",
    onSubmit: fn<(values: Record<string, ConfigValue>) => Promise<void>>(
      async () => {}
    ),
    onDirtyChange: fn(),
    footer: ({ dirty, canSubmit, submitting, submit, reset }) => (
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!dirty} onClick={reset}>
          Discard
        </Button>
        <Button disabled={!canSubmit || submitting} onClick={submit}>
          Save
        </Button>
      </div>
    ),
  },
} satisfies Meta<typeof ConfigForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllFiveKinds: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Placeholder"
    );
    await expect(canvas.getByText("11/60")).toBeVisible();
    await expect(
      canvas.getByRole("spinbutton", { name: "Page size" })
    ).toHaveAccessibleDescription("Rows per page. From 1 to 100.");
    await expect(
      canvas.getByRole("switch", { name: "Enabled" })
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      canvas.getByRole("combobox", { name: "Mode" })
    ).toHaveTextContent("basic");
    await expect(canvas.getByRole("textbox", { name: "Tags 1" })).toHaveValue(
      "one"
    );
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};

export const AllFiveKindsOnPhone: Story = { ...AllFiveKinds, globals: phone };

/** An integer field asks for a numeric keypad; a number field keeps the decimal point. */
const numericSchema = {
  type: "object",
  properties: {
    count: { type: "integer", minimum: 0, default: 1 },
    ratio: { type: "number", minimum: 0, default: 0.5 },
  },
} as const satisfies ConfigFormSchema;

export const IntegerAndNumberKeypads: Story = {
  args: {
    schema: numericSchema,
    fields: [
      { id: "count", title: "Count" },
      { id: "ratio", title: "Ratio" },
    ],
    values: { count: 1, ratio: 0.5 },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("spinbutton", { name: "Count" })
    ).toHaveAttribute("inputmode", "numeric");
    await expect(
      canvas.getByRole("spinbutton", { name: "Ratio" })
    ).toHaveAttribute("inputmode", "decimal");
  },
};

/** An optional number left empty does not block Save; the module schema accepts it (admin M-2). */
export const OptionalNumberLeftEmpty: Story = {
  args: {
    schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1 } },
    },
    fields: [{ id: "limit", title: "Limit" }],
    values: { limit: 5 },
  },
  play: async ({ args, canvas }) => {
    await userEvent.clear(canvas.getByRole("spinbutton", { name: "Limit" }));
    await userEvent.tab();
    await expect(canvas.queryByRole("alert")).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({ limit: undefined })
    );
  },
};

/** `z.number().int()` emits the safe-integer bounds; they are no range a person sets (admin L-3). */
export const RangeHintSkipsSafeIntegerBounds: Story = {
  args: {
    schema: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          minimum: Number.MIN_SAFE_INTEGER,
          maximum: Number.MAX_SAFE_INTEGER,
          default: 1,
        },
        floor: {
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
          default: 1,
        },
        size: { type: "integer", minimum: 1, maximum: 10, default: 1 },
      },
    },
    fields: [
      { id: "count", title: "Count", description: "Any whole number." },
      { id: "floor", title: "Floor" },
      { id: "size", title: "Size" },
    ],
    values: { count: 1, floor: 1, size: 1 },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("spinbutton", { name: "Count" })
    ).toHaveAccessibleDescription("Any whole number.");
    await expect(
      canvas.getByRole("spinbutton", { name: "Floor" })
    ).toHaveAccessibleDescription("At least 1.");
    await expect(
      canvas.getByRole("spinbutton", { name: "Size" })
    ).toHaveAccessibleDescription("From 1 to 10.");
  },
};

export const BlurShowsMessage: Story = {
  play: async ({ canvas }) => {
    const title = canvas.getByRole("textbox", { name: "Title" });

    await userEvent.clear(title);
    await userEvent.type(title, "a".repeat(61));
    await expect(canvas.queryByRole("alert")).toBeNull();

    await userEvent.tab();
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Keep title to 60 characters."
    );
    await expect(title).toBeInvalid();
    await expect(title).toHaveAccessibleDescription(
      "Keep title to 60 characters."
    );
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};

export const StoredValueFailsOnLoad: Story = {
  args: { values: { ...stored, pageSize: 500 } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Page size must be at most 100."
    );

    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "50");
    await userEvent.tab();
    await waitFor(() => expect(canvas.queryByRole("alert")).toBeNull());
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

export const StringListLimit: Story = {
  args: { values: { ...stored, tags: ["a", "b", "c", "d"] } },
  play: async ({ canvas }) => {
    const add = canvas.getByRole("button", { name: "Add entry" });

    await userEvent.click(add);
    await expect(add).toBeDisabled();
    await expect(canvas.getByText("5/5")).toBeVisible();

    const fifth = canvas.getByRole("textbox", { name: "Tags 5" });

    await userEvent.type(fifth, "Bad Tag");
    await userEvent.tab();
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Entry 5: wrong format."
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove entry 5" })
    );
    await waitFor(() => expect(canvas.queryByRole("alert")).toBeNull());
    await expect(add).toBeEnabled();
  },
};

export const ResetRestores: Story = {
  play: async ({ args, canvas }) => {
    const toggle = canvas.getByRole("switch", { name: "Enabled" });

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() =>
      expect(args.onDirtyChange).toHaveBeenLastCalledWith(true)
    );

    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await waitFor(() =>
      expect(args.onDirtyChange).toHaveBeenLastCalledWith(false)
    );
  },
};

export const SubmitSendsValues: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Mode" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "advanced" })
    );

    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "40");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledOnce());
    await expect(args.onSubmit).toHaveBeenCalledWith({
      ...stored,
      mode: "advanced",
      pageSize: 40,
    });
  },
};

/** A save hands new stored values back, and the form takes them as its clean state. */
export const NewValuesReset: Story = {
  render: (args) => {
    const [values, setValues] = useState(args.values);

    return (
      <ConfigForm
        {...args}
        values={values}
        onSubmit={async (next) => {
          await args.onSubmit(next);
          setValues(next);
        }}
      />
    );
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("switch", { name: "Enabled" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onDirtyChange).toHaveBeenLastCalledWith(false)
    );
    await expect(
      canvas.getByRole("switch", { name: "Enabled" })
    ).toHaveAttribute("aria-checked", "true");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};

/** A server issue shows under the field it names, and editing that field clears it (DR-20 S3-06). */
export const ServerIssueOnField: Story = {
  args: { issues: [{ path: "pageSize", message: "Server says no." }] },
  play: async ({ canvas }) => {
    const pageSize = canvas.getByRole("spinbutton", { name: "Page size" });

    await expect(await canvas.findByText("Server says no.")).toBeVisible();
    await expect(pageSize).toBeInvalid();
    await expect(pageSize).toHaveAccessibleDescription("Server says no.");

    await userEvent.clear(pageSize);
    await userEvent.type(pageSize, "40");
    await waitFor(() =>
      expect(canvas.queryByText("Server says no.")).toBeNull()
    );
  },
};

export const FocusField: Story = {
  args: { focusFieldId: "pageSize" },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("spinbutton", { name: "Page size" })
      ).toHaveFocus()
    );
  },
};

// zod emits a union of titled literals as `anyOf` of `{ type, const, title }` (U-4).
const labeledSchema = {
  type: "object",
  properties: {
    mode: {
      anyOf: [
        { type: "string", const: "basic", title: "Basic" },
        { type: "string", const: "advanced", title: "Advanced" },
      ],
      default: "basic",
    },
    level: { type: "string", enum: ["low", "high"], default: "low" },
  },
} as const satisfies ConfigFormSchema;

/** A labeled choice shows its title; an unlabeled choice shows the raw value. */
export const LabeledChoices: Story = {
  args: {
    schema: labeledSchema,
    fields: [
      { id: "mode", title: "Mode" },
      { id: "level", title: "Level" },
    ],
    values: { mode: "basic", level: "low" },
  },
  play: async ({ args, canvas }) => {
    const mode = canvas.getByRole("combobox", { name: "Mode" });

    await expect(mode).toHaveTextContent("Basic");
    await expect(
      canvas.getByRole("combobox", { name: "Level" })
    ).toHaveTextContent("low");

    await userEvent.click(mode);
    await userEvent.click(
      await screen.findByRole("option", { name: "Advanced" })
    );
    await expect(mode).toHaveTextContent("Advanced");

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        mode: "advanced",
        level: "low",
      })
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Title" })).toBeDisabled();
    await expect(
      canvas.getByRole("switch", { name: "Enabled" })
    ).toHaveAttribute("aria-disabled", "true");
  },
};

export const Dark: Story = {
  ...StoredValueFailsOnLoad,
  globals: { theme: "dark" },
};
