import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/** The two parts that `@genie/ui` owns alone (Spec 3 R-19a). */
const OWNED_NAMES: ReadonlySet<string> = new Set([
  "ConfirmDialog",
  "focusRing",
]);

/** The roles that only a `@genie/ui` dialog part may carry (Spec 3 R-22). */
const DIALOG_ROLES: ReadonlySet<string> = new Set(["dialog", "alertdialog"]);

/** The name of a binding or an export specifier side, or null when it is a pattern. */
function nameOf(node: ESTree.Node): string | null {
  if (node.type === "Identifier") return node.name;

  // A string-literal export name, `export { x as "focusRing" }`.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a parsed AST literal, not untrusted I/O
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;

  return null;
}

/** The string a JSX attribute value holds, bare or inside braces, or null. */
function roleValueOf(value: ESTree.JSXAttribute["value"]): string | null {
  const literal =
    value?.type === "JSXExpressionContainer" ? value.expression : value;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a parsed AST literal, not untrusted I/O
  if (literal?.type !== "Literal" || typeof literal.value !== "string")
    return null;

  return literal.value;
}

/**
 * Outside `packages/ui`, a part that `@genie/ui` owns is never declared a
 * second time, and a dialog is never built by hand (Spec 3 R-19a). It reads
 * names and one JSX attribute, so it needs no type information. The
 * `packages/ui` exemption is configuration, in `packages/config/src/oxlint`.
 */
export const singleOwnerRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a second owner of ConfirmDialog or focusRing, and a hand-made dialog role.",
    },
    messages: {
      secondOwner:
        "`{{name}}` has one owner, `@genie/ui`. Import it from there (Spec 3 R-19a).",
      handMadeDialog:
        'A dialog comes from `@genie/ui` (Dialog, Sheet or ConfirmDialog), never from a hand-made role="{{role}}" (Spec 3 R-19a, R-22).',
    },
  },
  createOnce(context) {
    function checkName(node: ESTree.Node, name: string | null): void {
      if (name !== null && OWNED_NAMES.has(name)) {
        context.report({ node, messageId: "secondOwner", data: { name } });
      }
    }

    return {
      FunctionDeclaration(node) {
        if (node.id !== null) checkName(node.id, node.id.name);
      },
      ClassDeclaration(node) {
        if (node.id !== null) checkName(node.id, node.id.name);
      },
      VariableDeclarator(node) {
        checkName(node.id, nameOf(node.id));
      },
      // Covers `export { focusRing }` and `export { x as focusRing } from "..."`.
      ExportSpecifier(node) {
        checkName(node.exported, nameOf(node.exported));
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "role")
          return;

        const role = roleValueOf(node.value);

        if (role !== null && DIALOG_ROLES.has(role)) {
          context.report({ node, messageId: "handMadeDialog", data: { role } });
        }
      },
    };
  },
});
