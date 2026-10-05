import {
  insertCredentialPerson,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { imageHostPort } from "./image-ports.ts";
import { pollHealth, startImage, type RunningImage } from "./image-process.ts";

const EMAIL = "client-address@example.invalid";

const PASSWORD = "client-address-password-14";

/** An address from the documentation range, which no Docker network hands out. */
const SPOOFED = "198.51.100.9";

/** Every private range a Docker host can connect from, so the test host counts as the proxy. */
const PRIVATE_RANGES = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);
  await markSetupDone(deployment.context);
  await insertCredentialPerson(deployment.context, {
    email: EMAIL,
    password: PASSWORD,
  });
}, 240000);

afterAll(async () => {
  await deployment?.stop();
});

/** Signs the break-glass account in with a client-sent X-Forwarded-For; answers the stored address. */
async function storedAddress(trustedProxies: string): Promise<string | null> {
  const port = imageHostPort(3450);
  const url = `http://127.0.0.1:${port}`;
  let image: RunningImage | undefined;

  try {
    image = await startImage(
      {
        DATABASE_URL: deployment.context.env.databaseUrl,
        PUBLIC_URL: url,
        // A closed port: break-glass sign-in needs no realm (DEC-24).
        KEYCLOAK_URL: "http://127.0.0.1:1",
        AUTH_TRUSTED_PROXIES: trustedProxies,
      },
      port
    );

    await pollHealth(port);

    await deployment.context.db.$client.query("delete from session");

    const response = await fetch(`${url}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": url,
        "x-forwarded-for": SPOOFED,
      },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });

    expect(response.status, await image.logs()).toBe(200);

    const result = await deployment.context.db.$client.query(
      "select ip_address from session"
    );

    // SAFETY: the statement selects the one nullable text column.
    const [row] = result.rows as readonly { ip_address: string | null }[];

    return row?.ip_address ?? null;
  } finally {
    await image?.stop();
  }
}

describe("the client address the image stores on a session", () => {
  it("ignores a client-sent X-Forwarded-For when no proxy is trusted (AC-1, AC-5, R-4a, R-16)", async () => {
    const address = await storedAddress("");

    expect(address).not.toBe(SPOOFED);
    expect(address).toMatch(/^[\d.:a-f]+$/);
  });

  it("stores the forwarded client address when the request came from a trusted proxy (R-16)", async () => {
    expect(await storedAddress(PRIVATE_RANGES)).toBe(SPOOFED);
  });
});
