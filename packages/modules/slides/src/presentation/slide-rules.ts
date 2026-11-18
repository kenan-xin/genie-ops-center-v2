import { type ElementKind, slideRuleIssues } from "../contract.ts";

/**
 * The rule that refuses adding `kind` to a slide of `kinds`: the one at the new element, else the
 * first. The Add element menu and the Edit slide sheet show it, so both say the same words (czjw.180).
 */
export function addRefusal(
  kinds: readonly ElementKind[],
  kind: ElementKind
): string | undefined {
  const issues = slideRuleIssues([...kinds, kind]);

  return (
    issues.find(({ path }) => path === `elements.${kinds.length}`) ?? issues[0]
  )?.message;
}
