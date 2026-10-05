import {
  addClientProtocolMapper,
  addIdentityProviderMapper,
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
import {
  BROKER_IDP_ALIAS,
  brokeredPort,
  BROKER_REALM,
  provisionBrokered,
  SAML_REALM,
  samlPort,
} from "./support/brokered.ts";

/**
 * The S2-13 brokered scenario deployments. Two realms on the stand-in Keycloak play the customer:
 * the OIDC broker (S-B, S-D, S-G) and the SAML broker (S-E). Each has its own app container and
 * database, so brokering the realm (which sends every sign-in to the provider) never touches the
 * shared local sign-in deployment.
 *
 * The company realm is the provider for both. A company person, and the directory group a proof
 * pre-adds, are scoped to one scenario and one Playwright project, so parallel workers never share
 * a person or a group row.
 */

export type Scenario = "s-b" | "s-d" | "s-e" | "s-g";

/** The mapped directory group the OIDC and SAML broker databases pre-add and assign a role. */
export const MAPPED_GROUP = "genie-admins";

/** The groups pre-added by exact value before any sign-in (DEC-52), one per scenario and project. */
export function preMappedGroupD(project: string): string {
  return `S2-13 pre mapped d ${project}`;
}

export function preMappedGroupG(project: string): string {
  return `S2-13 pre mapped g ${project}`;
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

const OIDC_SEED = seedSql([
  ...E2E_PROJECTS.map(preMappedGroupD),
  ...E2E_PROJECTS.map(preMappedGroupG),
]);

const SAML_SEED = seedSql([]);

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
      "--client-secret",
      COMPANY_OIDC_CLIENT_SECRET,
    ],
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
    ],
    seedSql: SAML_SEED,
  });

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

  // A real SAML provider sends the person's email and name. The stand-in's SAML client emits only
  // groups, so add property mappers for email and name on the company client and the matching
  // Attribute Importer mappers on the tenant identity provider. Without an email the tenant
  // realm's first-broker-login cannot create the person.
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

    // oxlint-disable-next-line no-await-in-loop -- each mapper is its own admin call.
    await addIdentityProviderMapper(SAML_REALM, BROKER_IDP_ALIAS, {
      name: attribute,
      identityProviderAlias: BROKER_IDP_ALIAS,
      identityProviderMapper: "saml-user-attribute-idp-mapper",
      config: {
        "syncMode": "FORCE",
        "attribute.name": attribute,
        "user.attribute": attribute,
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
    { scenario: "s-b", state: "admitted", groups: () => [MAPPED_GROUP] },
    { scenario: "s-b", state: "refused", groups: () => [UNMAPPED_GROUP] },
    {
      scenario: "s-d",
      state: "prepad",
      groups: (project) => [preMappedGroupD(project), ...MANY_GROUPS],
    },
    { scenario: "s-d", state: "offboard", groups: () => [MAPPED_GROUP] },
    { scenario: "s-e", state: "admitted", groups: () => [MAPPED_GROUP] },
    { scenario: "s-e", state: "refused", groups: () => [UNMAPPED_GROUP] },
    {
      scenario: "s-g",
      state: "many",
      groups: (project) => [preMappedGroupG(project), ...MANY_GROUPS],
    },
    { scenario: "s-g", state: "refused", groups: () => [UNMAPPED_GROUP] },
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
