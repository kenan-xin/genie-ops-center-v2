import { describe, expect, it } from "vitest";

import { parseSmtpUrl } from "./smtp.ts";

describe("parseSmtpUrl", () => {
  it("reads implicit TLS from an smtps URL", () => {
    expect(parseSmtpUrl("smtps://mail.invalid:465")).toMatchObject({
      host: "mail.invalid",
      port: "465",
      ssl: true,
      starttls: false,
    });
  });

  it("reads STARTTLS from a plain smtp URL", () => {
    expect(parseSmtpUrl("smtp://mail.invalid:587")).toMatchObject({
      host: "mail.invalid",
      port: "587",
      ssl: false,
      starttls: true,
    });
  });

  it("defaults the port from the scheme", () => {
    expect(parseSmtpUrl("smtps://mail.invalid").port).toBe("465");
    expect(parseSmtpUrl("smtp://mail.invalid").port).toBe("587");
  });

  it("decodes an encoded user and a password holding / + @ %", () => {
    const connection = parseSmtpUrl(
      "smtp://user%40x:p%2Fq%2Bw%40%25@mail.invalid:587"
    );

    expect(connection.username).toBe("user@x");
    expect(connection.password).toBe("p/q+w@%");
  });
});
