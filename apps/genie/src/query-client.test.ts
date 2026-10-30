import { environmentManager } from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";

import { queryClient } from "./query-client.ts";

afterEach(() => {
  // TanStack's own default: a runtime without `window` is the server.
  environmentManager.setIsServer(() => typeof window === "undefined");
});

// The test runs in Node, where TanStack Query reports the server, as a server render does.
it("gives each server request its own cache, so one person's list never reaches another's render", () => {
  queryClient().setQueryData(["agent", "sessions"], ["Alex's question"]);

  expect(queryClient().getQueryData(["agent", "sessions"])).toBeUndefined();
});

it("keeps one client in the browser, so a cached value survives the next render", () => {
  environmentManager.setIsServer(() => false);

  expect(queryClient()).toBe(queryClient());
});
