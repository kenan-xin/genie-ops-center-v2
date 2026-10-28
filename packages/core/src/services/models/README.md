# packages/core/src/services/models

The one place a language model is built (R-19, `DEC-55`).

## What belongs here

The one model function, `modelFor`, and `modelStatus`; the request guard `guardedModelFetch`
(the allowed origin only, data collection denied in every body, no redirect, a time limit per
request that also stops a stalled stream); the AI state rule `aiStateOf`; and the test seam
`setModelConnection`, which only `@genie/core/testing` calls.

The provider reads `OPENROUTER_API_KEY` from the environment when it gets no key. `modelFor`
hands the provider a fixed placeholder, so that variable is never read, and refuses with `ai-off`
when no key is stored. The stored key goes only into the guard's closure, which sets the
`authorization` header after its checks. The model a caller holds carries no key (R-17, `DEC-53`).

## What must not go here

A prompt, a tool, an agent, or a feature's call: a call site builds its model here and calls
`generateText` or `streamText` itself. A key read outside the integrations service. A second base
URL: the allowed origin derives from `MODEL_PROVIDER_BASE_URL`.

## What it imports

`ai`, `@openrouter/ai-sdk-provider`, zod for the body check, `MODEL_KEY_PATTERN` from the
settings schemas, the integrations key reader, the tenant-context type, and the error catalogue.
