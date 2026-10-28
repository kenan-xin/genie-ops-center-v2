import { expect, it } from "vitest";

import { modelSettingsSchema } from "./schemas.ts";

type ModelSettings = {
  readonly allowedModels: string[];
  readonly chatModel: string;
  readonly documentModel: string;
};

function issues(input: ModelSettings) {
  const result = modelSettingsSchema.safeParse(input);

  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
}

it("checks model settings: one issue per broken rule, none for a valid set", () => {
  const rows: ReadonlyArray<{
    readonly input: ModelSettings;
    readonly issues: ReadonlyArray<{ path: string; message: string }>;
  }> = [
    {
      input: { allowedModels: [], chatModel: "", documentModel: "" },
      issues: [{ path: "allowedModels", message: "Add at least one model." }],
    },
    {
      input: {
        allowedModels: ["gpt-6.1"],
        chatModel: "",
        documentModel: "",
      },
      issues: [
        {
          path: "allowedModels",
          message: "Enter one model id per line, as author/model.",
        },
      ],
    },
    {
      input: {
        allowedModels: ["openai/gpt 6"],
        chatModel: "",
        documentModel: "",
      },
      issues: [
        {
          path: "allowedModels",
          message: "Enter one model id per line, as author/model.",
        },
      ],
    },
    {
      input: {
        allowedModels: ["openai/gpt-6.1-terra"],
        chatModel: "anthropic/claude-opus-5.5",
        documentModel: "openai/gpt-6.1-terra",
      },
      issues: [
        {
          path: "chatModel",
          message: "Choose a model from the allowed models.",
        },
      ],
    },
    {
      input: {
        allowedModels: ["openai/gpt-6.1-terra"],
        chatModel: "openai/gpt-6.1-terra",
        documentModel: "anthropic/claude-opus-5.5",
      },
      issues: [
        {
          path: "documentModel",
          message: "Choose a model from the allowed models.",
        },
      ],
    },
    {
      input: {
        allowedModels: [
          "openai/gpt-6.1-terra",
          "meta-llama/llama-3-8b-instruct:free",
        ],
        chatModel: "openai/gpt-6.1-terra",
        documentModel: "meta-llama/llama-3-8b-instruct:free",
      },
      issues: [],
    },
  ];

  for (const row of rows) expect(issues(row.input)).toEqual(row.issues);
});
