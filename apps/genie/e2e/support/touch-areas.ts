import { expect, type Page } from "@playwright/test";

import { waitForSettledScreen } from "./axe.ts";

/**
 * Lists every control whose touch area is under 44 x 44 px, runs into another control, or is
 * covered by another control's touch area, measured by hit testing the settled screen.
 */
export async function touchAreaFindings(page: Page): Promise<string[]> {
  await waitForSettledScreen(page);

  return page.evaluate(findTouchAreaProblems);
}

/** Fails with every finding of `touchAreaFindings`. */
export async function expectTouchAreas(
  page: Page,
  label: string
): Promise<void> {
  const findings = await touchAreaFindings(page);

  expect(findings, `${label} has a control without a 44 px touch area`).toEqual(
    []
  );
}

/**
 * Runs in the page: `page.evaluate` sends this function's source text, so it uses no import and no
 * helper outside its own body.
 */
/* oxlint-disable unicorn/consistent-function-scoping -- `page.evaluate` sends only this body, so its helpers cannot move out. */
function findTouchAreaProblems(): string[] {
  const TARGETS = [
    "a[href]",
    "button",
    "input:not([type=hidden])",
    "select",
    "textarea",
    "summary",
    ...[
      "button",
      "link",
      "checkbox",
      "radio",
      "switch",
      "tab",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "combobox",
      "slider",
    ].map((role) => `[role=${role}]`),
    '[tabindex]:not([tabindex="-1"])',
  ].join(", ");

  const TEXT_INPUTS = new Set([
    "",
    "text",
    "email",
    "number",
    "password",
    "search",
    "tel",
    "url",
  ]);

  const MIN = 44;

  const targets = [...document.querySelectorAll<HTMLElement>(TARGETS)].filter(
    (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return !(
        element.matches(":disabled") ||
        element.closest('[inert], [aria-hidden="true"]') !== null ||
        !element.checkVisibility({ visibilityProperty: true }) ||
        rect.width <= 1 ||
        rect.height <= 1 ||
        style.pointerEvents === "none" ||
        (element.localName === "a" && style.display === "inline")
      );
    }
  );

  // Rule 8: `scrollIntoView` scrolls every scrolling ancestor (the shell's content area, a sheet,
  // a tab row), not only the window, so the check records each one and puts it back.
  const scrolled = new Map<Element, [number, number]>();

  for (const target of targets) {
    for (
      let element = target.parentElement;
      element !== null && !scrolled.has(element);
      element = element.parentElement
    )
      scrolled.set(element, [element.scrollLeft, element.scrollTop]);
  }

  const root = document.scrollingElement;

  if (root !== null && !scrolled.has(root))
    scrolled.set(root, [root.scrollLeft, root.scrollTop]);

  // A native field cannot draw a touch area, so the box that wraps it carries one (rule 2): an
  // input box, an input group, or the chips box of a several-pick combobox. A
  // swatch, checkbox or slider beside the field in that box is its own control, with its own box.
  const wrapperOf = (element: Element): Element | null =>
    element.matches(
      "input:not([type=color], [type=checkbox], [type=radio], [type=range], [type=file]), textarea, select"
    )
      ? element.closest(
          "[data-slot=input-box], [data-slot=input-group], [data-slot=combobox-chips]"
        )
      : null;

  const boxOf = (element: Element): DOMRect =>
    (wrapperOf(element) ?? element).getBoundingClientRect();

  // A target that contains the checked one is its container (the shell's focusable scroll region,
  // a tab panel), not a control that competes for the tap, so it owns no hit.
  const ownerOf = (hit: Element, target: Element): HTMLElement | null => {
    const owner = hit.closest<HTMLElement>(TARGETS);

    return owner !== null && owner !== target && owner.contains(target)
      ? null
      : owner;
  };

  const labelsOf = (element: Element): HTMLLabelElement[] => [
    // SAFETY: only labelable elements have `labels`; on any other element it reads `undefined`.
    ...((element as HTMLInputElement).labels ?? []),
  ];

  const isOwn = (target: HTMLElement, hit: Element): boolean => {
    const owner = ownerOf(hit, target);
    const wrapper = wrapperOf(target);

    return (
      owner === target ||
      // A custom control (a Base UI checkbox is a span) has no `labels`, but a tap on the label
      // that wraps it still reaches it. Another control inside that label is not the target's.
      ((owner === null || owner === target) &&
        (labelsOf(target).some((label) => label.contains(hit)) ||
          target.closest("label")?.contains(hit) === true ||
          wrapper?.contains(hit) === true))
    );
  };

  const inside = (inner: DOMRect, outer: DOMRect): boolean =>
    inner.left >= outer.left - 1 &&
    inner.top >= outer.top - 1 &&
    inner.right <= outer.right + 1 &&
    inner.bottom <= outer.bottom + 1;

  const contains = (box: DOMRect, x: number, y: number): boolean =>
    x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

  const inViewport = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < document.documentElement.clientWidth &&
    y < document.documentElement.clientHeight;

  const collapse = (text: string | null | undefined): string =>
    (text ?? "").replaceAll(/\s+/g, " ").trim();

  const nameOf = (element: Element): string => {
    const type = element.getAttribute("type")?.toLowerCase() ?? "";

    const role =
      element.getAttribute("role") ??
      (element.localName === "a"
        ? "link"
        : element.localName === "textarea" ||
            (element.localName === "input" && TEXT_INPUTS.has(type))
          ? "textbox"
          : element.localName);

    const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent)
      .filter(Boolean)
      .join(" ");

    const text =
      collapse(element.getAttribute("aria-label")) ||
      collapse(labelledBy) ||
      collapse(labelsOf(element)[0]?.textContent) ||
      collapse(element.getAttribute("title")) ||
      collapse(element.textContent);

    return `${role} "${text.slice(0, 40)}"`;
  };

  const findings: { element: Element; text: string }[] = [];

  for (const target of targets) {
    target.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    });

    const box = boxOf(target);
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    const halfWidth = Math.max(box.width, MIN) / 2;
    const halfHeight = Math.max(box.height, MIN) / 2;
    const name = nameOf(target);

    // Rule 5: the midpoints of the 44 px area's edges, on the outermost whole pixel inside it.
    // Chromium hit tests a fractional point as the next whole pixel (751.4 hits a box that starts
    // at 752), so a probe 0.5 px inside the bottom or right edge would land outside.
    const short: string[] = [];

    const areaProbes: [string, number, number][] = [
      ["top", centerX, Math.ceil(centerY - halfHeight)],
      ["bottom", centerX, Math.ceil(centerY + halfHeight) - 1],
      ["left", Math.ceil(centerX - halfWidth), centerY],
      ["right", Math.ceil(centerX + halfWidth) - 1, centerY],
    ];

    for (const [side, x, y] of areaProbes) {
      if (!inViewport(x, y)) continue;

      const hit = document.elementFromPoint(x, y);

      if (hit === null || isOwn(target, hit)) continue;

      const owner = ownerOf(hit, target);

      if (owner === null) {
        short.push(side);
        continue;
      }

      const ownerBox = boxOf(owner);

      if (
        contains(ownerBox, x, y) &&
        !inside(box, ownerBox) &&
        !inside(ownerBox, box)
      )
        findings.push({
          element: target,
          text: `${name}: 44 px touch area runs into ${nameOf(owner)}`,
        });
    }

    if (short.length > 0)
      findings.push({
        element: target,
        text: `${name}: touch area under 44 px (${short.join(", ")})`,
      });

    // Rule 6: the center and the edge midpoints of the control's own box, 1 px inside it. A field
    // is probed on its own box, not its group's: a swatch or button in the group whose touch area
    // reaches over the field takes the tap. A tap on a label reaches the label's control. A control
    // inside the target is its content, also where the target's scroll box clips its own box.
    const own = target.getBoundingClientRect();
    const ownX = own.left + own.width / 2;
    const ownY = own.top + own.height / 2;

    const coverProbes: [number, number][] = [
      [ownX, ownY],
      [ownX, own.top + 1],
      [ownX, own.bottom - 1],
      [own.left + 1, ownY],
      [own.right - 1, ownY],
    ];

    for (const [x, y] of coverProbes) {
      if (!inViewport(x, y)) continue;

      const hit = document.elementFromPoint(x, y);

      const owner =
        hit === null
          ? null
          : (ownerOf(hit, target) ?? hit.closest("label")?.control ?? null);

      if (
        owner === null ||
        owner === target ||
        target.contains(owner) ||
        inside(boxOf(owner), own)
      )
        continue;

      findings.push({
        element: owner,
        text: `${nameOf(owner)}: covers ${name}`,
      });
    }
  }

  for (const [element, [left, top]] of scrolled)
    element.scrollTo({ left, top, behavior: "instant" });

  // Rule 8: once each, in document order of the target each finding names first.
  findings.sort((a, b) =>
    a.element === b.element
      ? 0
      : a.element.compareDocumentPosition(b.element) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1
  );

  return [...new Set(findings.map((finding) => finding.text))];
}
/* oxlint-enable unicorn/consistent-function-scoping */
