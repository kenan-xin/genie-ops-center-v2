import { GENIE_ADMINISTRATORS_GROUP } from "@genie/core";

import {
  addClientProtocolMapper,
  COMPANY_OIDC_CLIENT_ID,
  COMPANY_OIDC_CLIENT_SECRET,
  COMPANY_REALM,
  createRealmUser,
  deleteRealmUser,
  E2E_PROJECTS,
  E2E_USER_PASSWORD,
  setRealmUserGroupMemberships,
  standinKeycloakPort,
  updateRealmClient,
  type E2eKeycloak,
} from "../testing/e2e-keycloak.ts";
import { FIXTURE_IMAGE } from "../testing/image-tag.ts";
import {
  BROKER_IDP_ALIAS,
  brokeredPort,
  BROKER_REALM,
  imageExists,
  INVITE_REALM,
  invitePort,
  LANDING_REALM,
  landingPort,
  provisionBrokered,
  SAML_REALM,
  samlPort,
} from "./support/brokered.ts";

/**
 * The S2-13 brokered scenario deployments. Two realms on the stand-in Keycloak play the customer:
 * the OIDC broker (S-B, S-D) and the SAML broker (S-E). Each has its own app container and
 * database, so brokering the realm (which sends every sign-in to the provider) never touches the
 * shared local sign-in deployment.
 *
 * The company realm is the provider for both. A company person, and the directory group a proof
 * pre-adds, are scoped to one scenario and one Playwright project, so parallel workers never share
 * a person or a group row.
 */

export type Scenario = "s-b" | "s-d" | "s-e" | "done" | "invite" | "landing";

/**
 * The S2-16 done-when groups (AC-20 to AC-24). The admit group is pre-added and mapped to a role
 * that grants nothing, so it admits a `jit` person and nothing more. The grant group is first
 * seen at sign-in; the proof maps it to the reader role through the Groups screen.
 */
export function doneAdmitGroup(project: string): string {
  return `S2-16 admit ${project}`;
}

export function doneGrantGroup(project: string): string {
  return `S2-16 grant ${project}`;
}

/** One pre-added active administrator per project, a local member of `Genie Administrators`. */
function administratorSql(scenario: Scenario, state = "admin"): string[] {
  return E2E_PROJECTS.flatMap((project) => {
    const email = scenarioEmail(scenario, state, project);

    return [
      `insert into "user" (id, name, email, email_verified, status) values (gen_random_uuid()::text, 'S2-16 Admin ${project}', '${email}', true, 'active') on conflict (email) do nothing`,
      `insert into group_member (group_id, user_id, source) select g.id, u.id, 'local' from "group" g, "user" u where g.name = '${GENIE_ADMINISTRATORS_GROUP}' and u.email = '${email}' on conflict do nothing`,
    ];
  });
}

/** The mapped directory group the OIDC and SAML broker databases pre-add and assign a role. */
export const MAPPED_GROUP = "genie-admins";

/** The group pre-added by exact value before any sign-in (DEC-52), one per project. */
export function preMappedGroupD(project: string): string {
  return `S2-13 pre mapped d ${project}`;
}

/** A company group that is mapped to no role, so a person holding only it is refused. */
const UNMAPPED_GROUP = "s2-13-unmapped";

/** The many groups a large-tenant person holds, to prove a broad claim arrives as plain values. */
export const MANY_GROUPS = Array.from(
  { length: 40 },
  (_, index) => `S2-13 g${index + 1}`
);

/** The company-realm address of one scenario person. */
export function scenarioEmail(
  scenario: Scenario,
  state: string,
  project: string
): string {
  return `e2e.s2-13.${scenario}.${state}.${project}@company.example`;
}

const READER_PERMISSIONS = ["'placeholder:read'", "'placeholder:use'"];

/** The seed SQL both broker databases share: the reader role, the mapped groups, jit onboarding. */
function seedSql(preAddedGroups: readonly string[]): string {
  const preAdd = preAddedGroups.flatMap((name) => [
    `insert into "group" (name, external_id, source, last_seen_at) values ('${name}', '${name}', 'idp', null) on conflict do nothing`,
    `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'group', g.id::text from role r, "group" g where r.name = 'S2-13 reader' and g.external_id = '${name}' on conflict do nothing`,
  ]);

  return [
    `insert into role (name, permissions, is_system) values ('S2-13 reader', array[${READER_PERMISSIONS.join(", ")}], false) on conflict (name) do nothing`,
    `insert into "group" (name, external_id, source) values ('${MAPPED_GROUP}', '${MAPPED_GROUP}', 'idp') on conflict do nothing`,
    `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'group', g.id::text from role r, "group" g where r.name = 'S2-13 reader' and g.external_id = '${MAPPED_GROUP}' on conflict do nothing`,
    ...preAdd,
    "update tenant_settings set onboarding_mode = 'jit'",
  ].join("; ");
}

const OIDC_SEED = [
  seedSql(E2E_PROJECTS.map(preMappedGroupD)),
  "insert into role (name, permissions, is_system) values ('S2-16 member', array[]::text[], false) on conflict (name) do nothing",
  ...E2E_PROJECTS.flatMap((project) => [
    `insert into "group" (name, external_id, source, last_seen_at) values ('${doneAdmitGroup(project)}', '${doneAdmitGroup(project)}', 'idp', null) on conflict do nothing`,
    `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'group', g.id::text from role r, "group" g where r.name = 'S2-16 member' and g.external_id = '${doneAdmitGroup(project)}' on conflict do nothing`,
  ]),
  ...administratorSql("done"),
].join("; ");

/** The invite-mode broker: the default onboarding mode, and its administrators. */
const INVITE_SEED = [
  "update tenant_settings set onboarding_mode = 'invite'",
  ...administratorSql("invite"),
  // S3-05: the Modules and Categories proof's own administrator, so it never shares a sign-in.
  ...administratorSql("invite", "modules"),
  // AC-26: a mixed role, one module's keys beside a core key, held directly by one person.
  "insert into role (name, permissions, is_system) values ('S2-16 mixed', array['placeholder:read', 'placeholder:use', 'core:audit:read'], false) on conflict (name) do nothing",
  ...E2E_PROJECTS.flatMap((project) => {
    const email = scenarioEmail("invite", "mixed", project);

    return [
      `insert into "user" (id, name, email, email_verified, status) values (gen_random_uuid()::text, 'S2-16 Mixed ${project}', '${email}', true, 'active') on conflict (email) do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'S2-16 mixed' and u.email = '${email}' on conflict do nothing`,
    ];
  }),
  // S3-06: the Tenant Settings proof's own administrator, and a person whose role lacks the
  // settings key (the mixed role above), so neither shares a sign-in with another proof.
  ...administratorSql("invite", "settings"),
  ...E2E_PROJECTS.flatMap((project) => {
    const email = scenarioEmail("invite", "nosettings", project);

    return [
      `insert into "user" (id, name, email, email_verified, status) values (gen_random_uuid()::text, 'S3-06 No settings ${project}', '${email}', true, 'active') on conflict (email) do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'S2-16 mixed' and u.email = '${email}' on conflict do nothing`,
    ];
  }),
].join("; ");

const SAML_SEED = seedSql([]);

/**
 * S3-04a: per project, a member who holds the landing fixture's role directly, and a person with no
 * grant at all. The support email gives the no-grants empty state its contact link (R-34).
 */
const LANDING_SEED = [
  "update tenant_settings set onboarding_mode = 'invite'",
  "update tenant_branding set support_email = 'support@example.invalid'",
  ...E2E_PROJECTS.flatMap((project) => {
    const member = scenarioEmail("landing", "member", project);
    const nogrant = scenarioEmail("landing", "nogrant", project);
    // S3-04b: a second person with no grant, for the user menu proof in `admin-seed.spec.ts`.
    const menu = scenarioEmail("landing", "menu", project);

    return [
      `insert into "user" (id, name, email, email_verified, status) values (gen_random_uuid()::text, 'S3-04a Member ${project}', '${member}', true, 'active'), (gen_random_uuid()::text, 'S3-04a No grant ${project}', '${nogrant}', true, 'active'), (gen_random_uuid()::text, 'S3-04b Menu ${project}', '${menu}', true, 'active') on conflict (email) do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'Landing fixture user' and u.email = '${member}' on conflict do nothing`,
    ];
  }),
].join("; ");

/** Starts both brokered deployments and seeds the company people they sign in as. */
export async function provisionScenarioDeployments(
  compose: readonly string[],
  keycloak: E2eKeycloak
): Promise<void> {
  await provisionBrokered(compose, {
    suffix: "oidc",
    realm: BROKER_REALM,
    hostPort: brokeredPort(),
    keycloakIssuer: keycloak.keycloakUrl,
    idpArgs: [
      "--protocol",
      "oidc",
      "--issuer-url",
      `${keycloak.keycloakUrl}/realms/${COMPANY_REALM}`,
      "--client-id",
      COMPANY_OIDC_CLIENT_ID,
      // The stand-in issuer is plain HTTP; the explicit flag keeps it out of a production realm.
      "--allow-http",
    ],
    // The provider secret travels in the command environment only, never on argv (R-58).
    idpEnv: { IDP_CLIENT_SECRET: COMPANY_OIDC_CLIENT_SECRET },
    seedSql: OIDC_SEED,
  });

  await provisionBrokered(compose, {
    suffix: "saml",
    realm: SAML_REALM,
    hostPort: samlPort(),
    keycloakIssuer: keycloak.keycloakUrl,
    idpArgs: [
      "--protocol",
      "saml",
      "--metadata-url",
      `${keycloak.keycloakUrl}/realms/${COMPANY_REALM}/protocol/saml/descriptor`,
      "--entity-id",
      "genie-saml",
      "--allow-http",
    ],
    seedSql: SAML_SEED,
  });

  // S2-16: the same OIDC provider behind a realm whose deployment stays in `invite` mode, so the
  // done-when proofs run in both onboarding modes without changing a shared deployment's mode.
  await provisionBrokered(compose, {
    suffix: "invite",
    realm: INVITE_REALM,
    hostPort: invitePort(),
    keycloakIssuer: keycloak.keycloakUrl,
    idpArgs: [
      "--protocol",
      "oidc",
      "--issuer-url",
      `${keycloak.keycloakUrl}/realms/${COMPANY_REALM}`,
      "--client-id",
      COMPANY_OIDC_CLIENT_ID,
      "--allow-http",
    ],
    idpEnv: { IDP_CLIENT_SECRET: COMPANY_OIDC_CLIENT_SECRET },
    seedSql: INVITE_SEED,
  });

  // S3-04a: the landing route needs a module with the landing flag, which only the fixture image
  // compiles. `test:e2e` builds it; a run without it leaves `navigation.spec.ts` to fail loudly.
  if (await imageExists(FIXTURE_IMAGE)) {
    await provisionBrokered(compose, {
      suffix: "landing",
      realm: LANDING_REALM,
      hostPort: landingPort(),
      keycloakIssuer: keycloak.keycloakUrl,
      image: FIXTURE_IMAGE,
      idpArgs: [
        "--protocol",
        "oidc",
        "--issuer-url",
        `${keycloak.keycloakUrl}/realms/${COMPANY_REALM}`,
        "--client-id",
        COMPANY_OIDC_CLIENT_ID,
        "--allow-http",
      ],
      idpEnv: { IDP_CLIENT_SECRET: COMPANY_OIDC_CLIENT_SECRET },
      seedSql: LANDING_SEED,
    });
  }

  // The company stand-in's SAML client registers `http://*` as its ACS pattern, which Keycloak's
  // redirect-URI validation rejects. Register the exact broker ACS URL the SAML tenant realm
  // presents in its AuthnRequest instead.
  const samlAcs = `http://host.docker.internal:${standinKeycloakPort()}/realms/${SAML_REALM}/broker/${BROKER_IDP_ALIAS}/endpoint`;

  await updateRealmClient(COMPANY_REALM, "genie-saml", {
    attributes: {
      saml_assertion_consumer_url_post: samlAcs,
      saml_assertion_consumer_url_redirect: samlAcs,
    },
    redirectUris: [samlAcs],
  });

  // A real SAML provider sends the person's email and name, so the stand-in's SAML client emits
  // them as attributes. `idp set --protocol saml` writes the matching Attribute Importer mappers
  // on the tenant provider, so this test proves the shipped command and no test-only mapper.
  for (const attribute of ["email", "firstName", "lastName"]) {
    // oxlint-disable-next-line no-await-in-loop -- each mapper is its own admin call.
    await addClientProtocolMapper(COMPANY_REALM, "genie-saml", {
      name: attribute,
      protocol: "saml",
      protocolMapper: "saml-user-property-mapper",
      config: {
        "user.attribute": attribute,
        "attribute.name": attribute,
        "attribute.nameformat": "Basic",
      },
    });
  }

  await seedCompanyPeople();
}

/** One company person per scenario, state and project, with the group memberships the proof reads. */
async function seedCompanyPeople(): Promise<void> {
  const people: Array<{
    readonly scenario: Scenario;
    readonly state: string;
    readonly groups: (project: string) => readonly string[];
  }> = [
    { scenario: "s-b", state: "refused", groups: () => [UNMAPPED_GROUP] },
    {
      scenario: "s-d",
      state: "prepad",
      groups: (project) => [preMappedGroupD(project), ...MANY_GROUPS],
    },
    { scenario: "s-e", state: "admitted", groups: () => [MAPPED_GROUP] },
    { scenario: "done", state: "admin", groups: () => [] },
    {
      scenario: "done",
      state: "member",
      groups: (project) => [doneAdmitGroup(project), doneGrantGroup(project)],
    },
    {
      scenario: "done",
      state: "norole",
      groups: (project) => [doneAdmitGroup(project)],
    },
    { scenario: "invite", state: "admin", groups: () => [] },
    { scenario: "invite", state: "mixed", groups: () => [] },
    { scenario: "invite", state: "modules", groups: () => [] },
    { scenario: "invite", state: "settings", groups: () => [] },
    { scenario: "invite", state: "nosettings", groups: () => [] },
    { scenario: "landing", state: "member", groups: () => [] },
    { scenario: "landing", state: "nogrant", groups: () => [] },
    { scenario: "landing", state: "menu", groups: () => [] },
  ];

  for (const project of E2E_PROJECTS) {
    for (const person of people) {
      const email = scenarioEmail(person.scenario, person.state, project);

      // oxlint-disable-next-line no-await-in-loop -- each person is recreated and joined on its own.
      await deleteRealmUser(COMPANY_REALM, email);

      // oxlint-disable-next-line no-await-in-loop -- each person is created and joined on its own.
      await createRealmUser(COMPANY_REALM, {
        email,
        password: E2E_USER_PASSWORD,
      });

      // oxlint-disable-next-line no-await-in-loop -- each person is created and joined on its own.
      await setRealmUserGroupMemberships(
        COMPANY_REALM,
        email,
        person.groups(project)
      );
    }
  }
}
