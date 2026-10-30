import { expect, it } from "vitest";

import {
  AppError,
  CORE_ERRORS,
  GENERIC_ERROR_CODE,
  safeMessageFor,
} from "../../lib/errors/index.ts";
import { streamErrorText } from "./chat.ts";

it("keeps a tool refusal's text unlogged, and answers any other error generically and logs it", () => {
  const refusal = new Error(
    'You may not do that. select.0: Field "colour" is not in the dataset.',
    { cause: new AppError(CORE_ERRORS.forbidden) }
  );

  const failure = new Error('relation "agent_message" does not exist');

  const logged: unknown[] = [];

  const texts = [refusal, failure].map((error) =>
    streamErrorText(error, (cause) => logged.push(cause))
  );

  expect(texts).toEqual([
    'You may not do that. select.0: Field "colour" is not in the dataset.',
    safeMessageFor(GENERIC_ERROR_CODE),
  ]);
  expect(logged).toEqual([failure]);
});
