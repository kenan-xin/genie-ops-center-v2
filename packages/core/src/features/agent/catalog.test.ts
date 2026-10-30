import { describe, expect, it } from "vitest";

import { CATALOG_PROMPT } from "../../services/agent/catalog-prompt.generated.ts";
import { catalogPrompt } from "./catalog-prompt.ts";

describe("the answer catalog prompt", () => {
  it("matches the committed prompt the agent receives", () => {
    expect(catalogPrompt()).toBe(CATALOG_PROMPT);
  });
});
