import { describe, expect, it } from "vitest";

import {
  REALM_OVERRIDE_ALLOW_LIST,
  buildRealmRepresentation,
  checkRealmOverrides,
  fillRealmRepresentation,
  isJsonObject,
  type JsonObject,
  type RealmFill,
} from "./representation.ts";

function minimalTemplate(): JsonObject {
  return {
    realm: "",
    displayName: "",
    ssoSessionIdleTimeout: 900,
    passwordPolicy: "length(14)",
    clients: [
      {
        clientId: "genie-ops-center",
        secret: "",
        redirectUris: [""],
        webOrigins: [""],
        attributes: { "post.logout.redirect.uris": "" },
      },
      { clientId: "genie-studio", secret: "" },
      { clientId: "genie-admin", secret: "", serviceAccountsEnabled: true },
    ],
    smtpServer: { host: "", from: "" },
  };
}

function fill(): RealmFill {
  return {
    realm: "acme",
    displayName: "Acme Group",
    publicUrl: "https://acme.example.invalid",
    clientSecret: "client-secret",
    adminClientSecret: "admin-secret",
    smtp: undefined,
  };
}

function clientsOf(realm: JsonObject): JsonObject[] {
  const clients = realm.clients;

  return Array.isArray(clients) ? clients.filter(isJsonObject) : [];
}

function clientOf(realm: JsonObject, clientId: string): JsonObject | undefined {
  return clientsOf(realm).find((client) => client.clientId === clientId);
}

describe("checkRealmOverrides", () => {
  it("accepts every key of the allow-list", () => {
    expect(() =>
      checkRealmOverrides(
        Object.fromEntries(REALM_OVERRIDE_ALLOW_LIST.map((key) => [key, 1]))
      )
    ).not.toThrow();
  });

  it("refuses a key outside the allow-list with a named cause", () => {
    expect(() => checkRealmOverrides({ users: [] })).toThrow(
      /"users".*allow-list/
    );
    expect(() => checkRealmOverrides({ clients: [] })).toThrow(/"clients"/);
    expect(() => checkRealmOverrides({ smtpServer: {} })).toThrow(
      /"smtpServer"/
    );
    expect(() => checkRealmOverrides({ secret: "x" })).toThrow(/"secret"/);
  });
});

describe("buildRealmRepresentation", () => {
  it("fills the realm name, display name and both client secrets", () => {
    const built = buildRealmRepresentation(minimalTemplate(), {}, fill());

    expect(built.realm).toBe("acme");
    expect(built.displayName).toBe("Acme Group");

    const signIn = clientOf(built, "genie-ops-center");

    expect(signIn?.secret).toBe("client-secret");
    expect(signIn?.redirectUris).toEqual([
      "https://acme.example.invalid/api/auth/callback/keycloak",
    ]);
    expect(signIn?.webOrigins).toEqual(["https://acme.example.invalid"]);
    expect(signIn?.attributes).toEqual({
      "post.logout.redirect.uris": "https://acme.example.invalid",
    });

    const admin = clientOf(built, "genie-admin");

    expect(admin?.secret).toBe("admin-secret");
  });

  it("merges an override value over the template", () => {
    const built = buildRealmRepresentation(
      minimalTemplate(),
      { passwordPolicy: "length(20) and upperCase(1)" },
      fill()
    );

    expect(built.passwordPolicy).toBe("length(20) and upperCase(1)");
  });

  it("lets an override replace a list rather than merge it", () => {
    const template: JsonObject = {
      ...minimalTemplate(),
      supportedLocales: ["en", "de"],
    };

    const built = buildRealmRepresentation(
      template,
      { supportedLocales: ["fr"] },
      fill()
    );

    expect(built.supportedLocales).toEqual(["fr"]);
  });

  it("does not mutate the template the caller loaded", () => {
    const template = minimalTemplate();

    buildRealmRepresentation(template, { passwordPolicy: "x" }, fill());

    expect(template.passwordPolicy).toBe("length(14)");
    expect(clientOf(template, "genie-ops-center")?.secret).toBe("");
  });
});

describe("fillRealmRepresentation", () => {
  it("fills the local variant's SMTP server from the provided values", () => {
    const built = fillRealmRepresentation(minimalTemplate(), {
      ...fill(),
      smtp: {
        host: "smtp.example.invalid",
        port: "465",
        username: "mailer",
        password: "smtp-secret",
        from: "no-reply@example.invalid",
        fromDisplayName: "Acme",
        replyTo: "support@example.invalid",
        replyToDisplayName: "Acme Support",
      },
    });

    expect(built.smtpServer).toMatchObject({
      host: "smtp.example.invalid",
      port: "465",
      user: "mailer",
      password: "smtp-secret",
      from: "no-reply@example.invalid",
      fromDisplayName: "Acme",
      replyTo: "support@example.invalid",
      replyToDisplayName: "Acme Support",
    });
  });
});
