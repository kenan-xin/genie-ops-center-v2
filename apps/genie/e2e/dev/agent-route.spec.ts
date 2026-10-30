import { randomUUID } from "node:crypto";

import { mintDevSession } from "@genie/core/testing";
import { expect, test } from "@playwright/test";

import { TEST_AUTH_ENV } from "../../testing/auth-env.ts";
import {
  ASK_PEOPLE,
  DEV_DB_PORT,
  DEV_MODULES,
  DEV_PORT,
} from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("placeholder"),
  "The model stand-in replays the placeholder's recordings."
);

const PUBLIC_URL = `http://127.0.0.1:${DEV_PORT}`;

/**
 * The agent route in `next dev` (Spec 7 R-40, P13). The model stand-in answers from the
 * placeholder's recordings, so the answer proves that the stand-in is loaded and
 * that AI is on in this run: without it, the server would call a live model host.
 */
test("a signed-in person's message streams the recorded answer @no-screen", async ({
  request,
}) => {
  // A development server compiles the route on its first request.
  test.setTimeout(180_000);

  const { name, value } = await mintDevSession({
    databaseUrl: `postgres://genie:genie@127.0.0.1:${DEV_DB_PORT}/genie`,
    publicUrl: PUBLIC_URL,
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    subject: { email: ASK_PEOPLE.desktop },
  });

  const response = await request.post("/api/agent", {
    headers: { cookie: `${name}=${value}`, origin: PUBLIC_URL },
    data: {
      sessionId: randomUUID(),
      message: {
        id: "client-message",
        role: "user",
        parts: [{ type: "text", text: "What can you do?" }],
      },
    },
    timeout: 180_000,
  });

  const body = await response.text();

  expect(response.status(), body).toBe(200);

  // The answer streams in many `text-delta` chunks, so join them before reading it.
  const text = body
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice("data: ".length)))
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => chunk.delta)
    .join("");

  expect(text).toContain(
    "I can answer questions using workspace records you have permission to read."
  );
});
