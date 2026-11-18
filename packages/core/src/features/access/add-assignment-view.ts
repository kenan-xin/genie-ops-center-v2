import {
  ASK_USER_ROLE,
  AUDITOR_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../../lib/module-contract/system-roles.ts";
import type { AdvancedCatalogue } from "../../services/roles/advanced.ts";
import type {
  AccessPath,
  AccessRecipient,
} from "../../services/roles/effective-access.ts";
import type { GrantRow } from "../../services/roles/grants.ts";
import type { RoleRow } from "../../services/roles/index.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";

export type RoleChoice = {
  readonly roleId: string;
  readonly name: string;
  readonly custom: boolean;
  /** The module's default access role: "(default)" after the name. */
  readonly isDefault: boolean;
  /** The record type that One record searches, or null for a role that covers all records only. */
  readonly recordType: string | null;
  readonly disabled: boolean;
  /** "Already assigned" or "Assigned via <group>". */
  readonly hint: string | null;
};

export type RoleChoiceGroup = {
  /** "Core" or the module's display name. */
  readonly label: string;
  readonly moduleOff: boolean;
  readonly choices: readonly RoleChoice[];
};

const CORE_ORDER: readonly string[] = [
  TENANT_ADMINISTRATOR_ROLE,
  AUDITOR_ROLE,
  ASK_USER_ROLE,
];

const byName = (a: { readonly name: string }, b: { readonly name: string }) =>
  a.name.localeCompare(b.name);

const coreRank = (role: RoleRow) => {
  const index = CORE_ORDER.indexOf(role.name);

  return index === -1 ? CORE_ORDER.length : index;
};

/** The record type an advanced option scopes to, by role id (AD2, AD5). */
function recordTypesOf(
  advanced: AdvancedCatalogue
): ReadonlyMap<string, string> {
  const types = new Map<string, string>();

  for (const option of [...advanced.record, ...advanced.custom]) {
    if (option.recordType !== null) types.set(option.roleId, option.recordType);
  }

  return types;
}

/**
 * The role list of the Add assignment form (G2 change 1): Core first, then each module in
 * catalogue order, with a module that is off disabled and a role the recipient already holds at
 * all records disabled (prototype `rolePop`).
 */
export function roleChoices(input: {
  readonly roles: readonly RoleRow[];
  readonly catalogue: readonly GrantRow[];
  readonly advanced: AdvancedCatalogue;
  readonly paths?: readonly AccessPath[] | undefined;
  /** The sheet's own person or group; with `paths`, a path is direct when its holder is this recipient. */
  readonly recipient?: AccessRecipient | undefined;
  readonly moduleId?: string | undefined;
}): readonly RoleChoiceGroup[] {
  const recordTypes = recordTypesOf(input.advanced);

  const hintOf = (roleId: string) => {
    if (input.paths === undefined || input.recipient === undefined) {
      return { disabled: false, hint: null };
    }

    const { recipient } = input;

    // A scoped path changes nothing here: only the all-records paths decide.
    const paths = input.paths.filter(
      (path) => path.role.id === roleId && path.scope === null
    );

    if (
      paths.some(
        (path) =>
          path.holder.type === recipient.type && path.holder.id === recipient.id
      )
    ) {
      return { disabled: true, hint: "Already assigned" };
    }

    const through = paths.find((path) => path.holder.type === "group");

    return {
      disabled: false,
      hint:
        through === undefined ? null : `Assigned via ${through.holder.name}`,
    };
  };

  const choiceOf = (
    roleId: string,
    name: string,
    custom: boolean,
    isDefault: boolean,
    moduleOff: boolean
  ): RoleChoice => {
    const state = moduleOff ? { disabled: true, hint: null } : hintOf(roleId);

    return {
      roleId,
      name,
      custom,
      isDefault,
      recordType: recordTypes.get(roleId) ?? null,
      disabled: state.disabled,
      hint: state.hint,
    };
  };

  const groups: RoleChoiceGroup[] = [];

  if (input.moduleId === undefined) {
    const core = input.roles
      .filter((role) => role.moduleId === null)
      .toSorted((a, b) => coreRank(a) - coreRank(b) || byName(a, b));

    groups.push({
      label: "Core",
      moduleOff: false,
      choices: core.map((role) =>
        choiceOf(role.id, role.name, role.kind === "custom", false, false)
      ),
    });
  }

  for (const row of input.catalogue) {
    if (row.group !== "modules") continue;

    if (input.moduleId !== undefined && row.id !== input.moduleId) continue;

    groups.push({
      label: row.name,
      moduleOff: !row.enabled,
      choices: row.roles.map((role) =>
        choiceOf(
          role.id,
          role.name,
          role.kind === "custom",
          role.id === row.defaultRoleId,
          !row.enabled
        )
      ),
    });
  }

  return groups;
}

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

const peopleAndGroups = (count: number) => `${count} people and groups`;

/**
 * The toast after a write: who got the role, and who already had it (T6-c). Names join with ", "
 * and " and "; past three, the count says it.
 */
export function addedMessage(
  roleName: string,
  added: readonly string[],
  skipped: readonly string[]
): string {
  const skippedLine =
    skipped.length === 0
      ? null
      : skipped.length <= 3
        ? `${list.format(skipped)} already had it.`
        : `${peopleAndGroups(skipped.length)} already had it.`;

  if (added.length === 0) {
    const who =
      skipped.length === 0
        ? "Nobody"
        : skipped.length <= 3
          ? list.format(skipped)
          : peopleAndGroups(skipped.length);

    return `${who} already had ${roleName}.`;
  }

  const first =
    added.length <= 3
      ? `Assigned ${roleName} to ${list.format(added)}.`
      : `Assigned ${roleName} to ${peopleAndGroups(added.length)}.`;

  return skippedLine === null ? first : `${first} ${skippedLine}`;
}

/** The names of the recipients the server answered, in its order; an id not picked is left out. */
export function namesOf(
  answered: readonly AccessRecipient[],
  picked: readonly RecipientRow[]
): readonly string[] {
  return answered.flatMap((recipient) => {
    const row = picked.find(
      (candidate) =>
        candidate.type === recipient.type && candidate.id === recipient.id
    );

    return row === undefined ? [] : [row.name];
  });
}

/** The refusal line under "The assignment was not added.": module-disabled names the module. */
export function refusalMessage(
  code: string | undefined,
  serverMessage: string,
  moduleName: string | null
): string {
  if (code === "module-disabled" && moduleName !== null)
    return `The ${moduleName} module is off. Turn it on in Modules, or choose a role of another module.`;

  return serverMessage === "" ? "Try again." : serverMessage;
}

/** The picked role's name and its module's name (null for a core role). */
export type PickedRole = {
  readonly name: string;
  readonly moduleName: string | null;
};

/** The picked role's name and its module's name (null for a core role), from the form's role list. */
export function pickedRole(
  groups: readonly RoleChoiceGroup[],
  roleId: string
): PickedRole {
  const group = groups.find((candidate) =>
    candidate.choices.some((choice) => choice.roleId === roleId)
  );

  const choice = group?.choices.find(
    (candidate) => candidate.roleId === roleId
  );

  if (group === undefined || choice === undefined)
    return { name: "", moduleName: null };

  return {
    name: choice.name,
    moduleName: group.label === "Core" ? null : group.label,
  };
}
