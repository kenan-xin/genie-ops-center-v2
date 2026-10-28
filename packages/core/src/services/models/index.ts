import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  integrationKeyStored,
  readIntegrationKey,
} from "../integrations/keys.ts";
import {
  MODEL_PROVIDER_BASE_URL,
  MODEL_PROVIDER_ORIGIN,
  guardedModelFetch,
  modelConnectionOf,
} from "./connection.ts";
import { type AiState, aiStateOf } from "./state.ts";

export type { AiState } from "./state.ts";

export type ModelRequest =
  | { readonly task: "chat"; readonly modelId?: string }
  | { readonly task: "document-reading" };

export type ModelStatus = {
  readonly state: AiState;
  readonly allowedModels: readonly string[];
  readonly chatModel: string | null;
  readonly documentModel: string | null;
};

/** What the provider holds instead of the key: the model a caller gets carries no secret. */
const MODEL_PROVIDER_KEY_PLACEHOLDER = "key-set-by-the-model-request-guard";

/** Whether AI is on, and the model settings it reads. It never reads the key, only whether one is stored. */
export async function modelStatus(tenant: TenantContext): Promise<ModelStatus> {
  const { allowedModels, chatModel, documentModel } =
    await tenant.settings.get();

  const keyStored = await integrationKeyStored(tenant, "model-provider");

  return {
    state: aiStateOf({ keyStored, chatModel, documentModel }),
    allowedModels,
    chatModel,
    documentModel,
  };
}

/**
 * The one way to build a language model (R-19, `DEC-55`). It reads the settings and the stored key
 * at each call, and always passes the key, so the provider never falls back to
 * `OPENROUTER_API_KEY`. Every request goes through `guardedModelFetch`.
 */
export async function modelFor(
  tenant: TenantContext,
  request: ModelRequest
): Promise<LanguageModel> {
  const { allowedModels, chatModel, documentModel } =
    await tenant.settings.get();

  const key = await readIntegrationKey(tenant, "model-provider");

  const state = aiStateOf({
    keyStored: key !== undefined,
    chatModel,
    documentModel,
  });

  if (key === undefined || state !== "on") {
    throw new AppError(CORE_ERRORS["ai-off"]);
  }

  const modelId =
    request.task === "document-reading"
      ? documentModel
      : (request.modelId ?? chatModel);

  if (modelId === null || !allowedModels.includes(modelId)) {
    throw new AppError(CORE_ERRORS["model-not-allowed"]);
  }

  const connection = modelConnectionOf(tenant);

  return createOpenRouter({
    // The guard replaces it with the stored key; a set value keeps the provider off OPENROUTER_API_KEY.
    apiKey: MODEL_PROVIDER_KEY_PLACEHOLDER,
    baseURL: MODEL_PROVIDER_BASE_URL,
    compatibility: "strict",
    fetch: guardedModelFetch(connection.transport, {
      origin: MODEL_PROVIDER_ORIGIN,
      timeoutMs: connection.timeoutMs,
      apiKey: key,
    }),
  }).chat(modelId, { provider: { data_collection: "deny" } });
}
