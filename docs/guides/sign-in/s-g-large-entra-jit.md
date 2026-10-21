# S-G: a large Entra ID customer, `jit`, group-to-role mapping

For the customer's Entra ID administrator and the Genie Ops Center administrator. This is
[S-D](s-d-entra.md) at the scale of an organization that opens Genie Ops Center to thousands of
people at once. Entra ID is the named example; the shape fits any large OIDC or SAML provider.

Do [S-D](s-d-entra.md) first. This guide adds what a large rollout needs.

## App assignment is the gate

1. Turn on "Assignment required" for the Entra application, so only assigned people reach the
   sign-in at all.
2. Assign the groups that should have access, not individual people, so joiners and leavers follow
   their group membership.

## Map the groups to roles before launch

3. Ask the customer for the exact claim value of each group: the group name, or the group object id
   when the tenant sends object ids.
4. In the Groups screen, add each directory group by that exact value and assign it a role. A group
   added before anyone signs in shows "Not seen yet" and is filled by the first sign-in that lists
   it.
5. Map the groups to roles before switching onboarding to `jit`. In `jit`, a newcomer is admitted
   only through a directory group that is mapped to a role, so an unmapped group refuses them.

## Nested groups

6. Choose how Entra sends nested membership. A role ladder (an "HR Head" nested inside "HR
   Manager" nested inside "HR Employee") arrives as separate group values, one per group the person
   holds, and each is mapped on its own. Set the token groups claim to emit the transitive groups
   the rollout needs, and map each value.

## Past the overage limit

7. Entra omits the `groups` claim for a person in more than 200 groups (150 in SAML). Genie Ops
   Center then keeps that person's previous memberships and writes an audit event, if the claim
   reaches it as absent. Keycloak's Attribute Importer may clear the `groups` attribute instead,
   which reads as zero groups. The scheduled Entra run below reports which one happens; this is
   not confirmed yet. Ask the customer to emit only the groups assigned to this application, which keeps
   the claim under the limit. Until then, pre-add and map the groups that matter most, because a
   person whose claim arrives absent and who is new is refused.

## Switch onboarding to `jit`

8. After the mappings are in place, set the onboarding mode to `jit`. A person assigned in Entra
   through a mapped group is created active on first sign-in. A person in no mapped group is
   refused with the not-registered message and no `user` row.
9. Sign in as one member of each mapped group and confirm they land in the workspace with the roles
   their groups give.

## The scheduled Entra run

The workflow `.github/workflows/entra-scheduled.yml` proves this guide against the test tenant
"Default Directory" each Monday and on a manual run. It is never a pull request check. It starts
Keycloak, Postgres and the app on the runner, brokers a realm to Entra with `genie-ops idp set`,
and signs real test people in. It also reports what the Keycloak Attribute Importer does to the
`groups` attribute when Entra sends no `groups` claim, and it does not fail on that report.

The run reads one repository secret, `ENTRA_TEST_TENANT`. If the secret is absent, the job prints
a notice and skips the suite. The secret is one JSON object:

```json
{
  "tenantId": "<directory (tenant) id>",
  "clientId": "<application (client) id>",
  "clientSecret": "<client secret value>",
  "groupId": "<object id of the group assigned to the app>",
  "parentGroupId": "<object id of a group that holds groupId as a member>",
  "assigned": { "email": "<user principal name>", "password": "<password>" },
  "unassigned": { "email": "<user principal name>", "password": "<password>" },
  "overage": { "email": "<user principal name>", "password": "<password>" }
}
```

To prepare the test tenant, do these steps once:

1. Register an application. Add the Web redirect URI
   `http://localhost:18080/realms/genie-entra/broker/company-login/endpoint`.
2. Create a client secret. Grant admin consent for `openid`, `profile` and `email`.
3. In Token configuration, add the groups claim with "Security groups", so the token carries
   group object ids and the transitive (nested) groups.
4. Turn on "Assignment required" in the enterprise application. Assign the group `groupId`.
5. Make `groupId` a member of the group `parentGroupId`.
6. Make the `assigned` person a direct member of `groupId`. Do not assign the `unassigned` person.
7. Optional: make the `overage` person a member of `groupId` and of more than 200 other groups.
   Without this field, the overage report is skipped.
8. Make sure that these test people get no MFA prompt and no password change prompt. Exclude them
   from security defaults or from the Conditional Access policy that would ask.

The overage report appears in the job summary. It names one of three outcomes: the importer
cleared the attribute, kept it, or wrote another value. Take a "cleared" outcome to the product
owner, because the `genie_groups` marker then reads an overage as zero groups.
