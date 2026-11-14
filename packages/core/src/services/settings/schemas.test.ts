import { expect, it } from "vitest";

import {
  agentRunSettingsSchema,
  modelKeySchema,
  modelSettingsSchema,
} from "./schemas.ts";

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

function timeBoxRefusal(timeBoxMinutes: number) {
  const result = agentRunSettingsSchema.safeParse({ timeBoxMinutes });

  return result.success
    ? null
    : result.error.issues.map(({ path, message }) => ({
        path: path.join("."),
        message,
      }));
}

it("accepts a run time box of whole minutes from 10 to 1440 only", () => {
  const refused = [
    {
      path: "timeBoxMinutes",
      message: "Enter a whole number of minutes from 10 to 1440.",
    },
  ];

  expect([9, 10, 1440, 1441, 90.5].map(timeBoxRefusal)).toEqual([
    refused,
    null,
    null,
    refused,
    refused,
  ]);
});

it("refuses a key with a character a key cannot hold, and keeps a trimmed key", () => {
  const refused = modelKeySchema.safeParse({ apiKey: "sk-or-v1-ab\ncd" });

  expect(
    refused.success
      ? []
      : refused.error.issues.map(({ path, message }) => ({
          path: path.join("."),
          message,
        }))
  ).toEqual([
    {
      path: "apiKey",
      message:
        "The key holds a character that a key cannot hold. Paste the key again.",
    },
  ]);

  expect(modelKeySchema.parse({ apiKey: "  sk-or-v1-abcd  " })).toEqual({
    apiKey: "sk-or-v1-abcd",
  });
});
