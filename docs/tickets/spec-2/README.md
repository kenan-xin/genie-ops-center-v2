# Spec 2 ticket breakdown

Spec: [Identity and access](../../specs/02-identity-and-access.md). Technical plan: [02-identity-and-access.md](../../tech-plans/02-identity-and-access.md). Beads epic: `genie-ops-center-v2-d8l5`. Beads owns live status, claims and blockers. This index records the ticket set and its scope, written from the beads on 2026-10-22.

Status: approved on 2026-09-27 with 16 tickets. Some earlier beads merged into these tickets. They are closed with a reason that names the new ticket, and their old titles keep the old numbers. All 16 tickets are closed. Three follow-up beads stay deferred: `d8l5.22`, and the owner beads `d8l5.23` and `d8l5.24`.

## Tickets

| Ticket | Bead | Status | Title |
| --- | --- | --- | --- |
| S2-01 | `d8l5.1` | closed | Identity migration and tenant.yaml realm field |
| S2-02 | `cla` | closed | Stack: bundled-keycloak profile and identity stand-ins |
| S2-03 | `d8l5.4` | closed | Realm templates, realm and clients steps |
| S2-04 | `d8l5.5` | closed | Better Auth instance, sign-in, sign-out |
| S2-05 | `d8l5.6` | closed | Onboarding, ban check, groups sync, new-device event |
| S2-06 | `d8l5.7` | closed | Access seam and permission evolution |
| S2-07 | `d8l5.9` | closed | Sessions, idle rule, account page |
| S2-08 | `d8l5.10` | closed | roles, admin_seed and break_glass steps (gate S2-G2) |
| S2-09 | `d8l5.12` | closed | Break-glass lifecycle, rotate, rate limits |
| S2-10 | `d8l5.13` | closed | People screen, invitation email, scenario S-F |
| S2-11 | `d8l5.14` | closed | Groups and Roles screens, group label, role events |
| S2-12 | `d8l5.16` | closed | Audit log reader |
| S2-13 | `d8l5.17` | closed | idp set and admin add, with S-B, S-D, S-E, S-G |
| S2-14 | `d8l5.18` | closed | Keycloak address guard and issuer check, with S-A |
| S2-15 | `d8l5.19` | closed | Client-only mode, with S-C |
| S2-16 | `d8l5.21` | closed | Section 2 acceptance and the scheduled Entra run (gate S2-G3) |

## Follow-up beads under this epic

| Bead | Type | Status | Title |
| --- | --- | --- | --- |
| `0gr` | task | closed | Session cookie __Host- prefix and trusted proxy IP in Better Auth config |
| `1rr0` | bug | closed | GET /api/auth/session-expired clears the cookie without a check (cross-site sign-out) |
| `57n2` | bug | closed | Identity stand-in networks leak across runs (23 left, Docker address pools exhausted) |
| `5ee8` | bug | closed | e2e: break-glass standalone deployment poll (60s) outlives the 30s test timeout |
| `7lb2` | bug | closed | CI: identity-standins LDAP memberOf search returned nothing on develop 8a534dc |
| `8i97` | task | closed | Decide: client-only mode in a customer's existing Keycloak realm (amends DEC-36, DEC-8) |
| `d8l5.11` | task | closed | S2-12: Rate limits on sensitive endpoints |
| `d8l5.15` | task | closed | S2-16: Notifications and core identity events |
| `d8l5.2` | task | closed | S2-02: tenant.yaml realm field and realm_mode seed |
| `d8l5.20` | task | closed | S2-21: Scheduled real Entra run |
| `d8l5.22` | task | deferred | Worker: build the job principal with principalFor for jobs that act for a person |
| `d8l5.23` | task | deferred | OWNER: create ENTRA_TEST_TENANT and run the Entra suite once (Section 2 gate S2-G3) |
| `d8l5.24` | task | deferred | OWNER/OPERATOR: confirm the Keycloak hardening checklist on a real deployment (Spec 2 AC-14) |
| `d8l5.3` | task | closed | S2-04: Identity stand-ins in the end-to-end stack |
| `d8l5.8` | task | closed | S2-07: Permission evolution and retained access |
| `jfq9` | bug | closed | Idle redirect on /account, /admin/account, /admin/login points at the cookie-clearing route |
| `lqns` | bug | closed | Idle session race across separate requests renders signed-out instead of the expired banner |
| `oghf` | task | closed | Map an Entra group to a Genie role before any member has signed in |
| `pt9d` | bug | closed | e2e flake: sessions.spec.ts:290 idle document reload times out on phone |
| `r6a3` | bug | closed | e2e: the client-only stack's database is never created in the generated-module run |
| `rraw` | task | closed | Record per-app access (option C): amend DEC-7, Spec 02 R-9 and access-model |
| `uxl` | task | closed | Entra groups claim: show readable group names, not object IDs |
| `vdm9` | bug | closed | Groups screen at phone width: a pointer click on a row button can land on the next row |
| `xshj` | feature | closed | Realm step fills genie-studio's redirect and post-logout URIs from tenant.yaml |
| `zdd` | task | closed | Add person on a company-login customer sends a Genie invitation email |
| `zzjg` | task | closed | Widen the document-session guard test to every idle-deleting session read |

Read a ticket's full scope and acceptance with `bd show <bead>`.
