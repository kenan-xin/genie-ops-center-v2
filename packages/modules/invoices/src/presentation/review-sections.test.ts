import { describe, expect, it } from "vitest";

import type { ViewerHighlight } from "./document-viewer.tsx";
import type { OriginTagKind, ReviewFieldKey } from "./review-fields.tsx";
import type { ReviewItem } from "./review-model.ts";
import { sectionOf, sectionsOf } from "./review-sections.ts";

const item = (
  key: ReviewFieldKey,
  sources: readonly ViewerHighlight[],
  required: boolean,
  tag: OriginTagKind = "extracted"
): ReviewItem => ({
  key,
  label: key,
  tag,
  sources,
  required,
  control: null,
  controlId: null,
  display: "",
  readAs: null,
  onUndo: null,
  note: null,
});

const QUOTE = [{ page: 1, quote: "Invoice number INV-1" }];

// czjw.187: the one form's sections come from the reading only.
describe("sectionsOf", () => {
  it("puts every item in exactly one section, in list order", () => {
    const items = [
      item("customer", QUOTE, true),
      item("dueDate", [], true, "needs-input"),
      item("number", QUOTE, true),
      item("paymentTerms", [], false, "not-on-document"),
      item("date", [], true, "check-this"),
      item("description", [], false, "check-this"),
    ];

    const sections = sectionsOf(items);

    expect(sections.needs.map((one) => one.key)).toEqual(["dueDate", "date"]);
    expect(sections.read.map((one) => one.key)).toEqual(["customer", "number"]);
    expect(sections.optional.map((one) => one.key)).toEqual([
      "paymentTerms",
      "description",
    ]);
    expect([
      ...sections.needs,
      ...sections.read,
      ...sections.optional,
    ]).toHaveLength(items.length);
  });

  it("keeps a field in its section when the person fills or edits it", () => {
    expect(sectionOf(item("dueDate", [], true, "entered"))).toBe("needs");
    expect(sectionOf(item("number", QUOTE, true, "corrected"))).toBe("read");
    expect(sectionOf(item("dueDate", [], false, "paid-in-full"))).toBe(
      "optional"
    );
  });
});
