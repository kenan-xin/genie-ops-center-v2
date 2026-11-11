import type { RequiredCase } from "@genie/core/testing/required-tests-validator";

/**
 * The slides module's integration manifest.
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. The validator and its case shape are core's, shared
 * through `@genie/core/testing/required-tests-validator`, so this module keeps
 * only the manifest that is its own. Each entry is derived from a named
 * acceptance clause.
 */
export * from "@genie/core/testing/required-tests-validator";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/schema.integration.test.ts",
    reason:
      "Spec 7 R-52, R-53 and the plan limits: the deck constraints on a real Postgres",
    cases: [
      "a blank title",
      "a title of 81 characters",
      "a content hash that is not 64 hex characters",
      "an undo list of 11 entries",
      "21 slides",
    ].map((row) => `the slides schema refuses ${row}`),
  },
  {
    file: "testing/decks.integration.test.ts",
    reason:
      "Spec 7 R-52, R-53, R-54 and R-46: only the owner reads or writes a deck, behind slides:read and slides:write; a change on an older hash, a broken chart or a foreign image writes nothing; a change keeps a figures date that moved meanwhile; Undo restores saves in reverse order; every write leaves one audit row, and delete removes the deck's files; an image upload stores only a PNG or JPEG on the caller's own deck; the deck page is owner-only, offers no chat to a person who cannot ask, and links only the images the deck shows",
    cases: [
      ...[
        "lists only the caller's own decks, the last changed first",
        "refuses the list to a person without slides:read",
      ].map((name) => `the slides listDecks procedure ${name}`),
      ...[
        "is the same for one content written with its keys in two orders",
        "changes when only the title changes",
      ].map((name) => `the slides content hash ${name}`),
      ...[
        ...["readDeck", "changeDeck", "undoDeck", "deleteDeck"].map(
          (procedure) =>
            `answer not-found to ${procedure} on another person's deck and leave it the same`
        ),
        ...[
          "createDeck",
          "changeDeck",
          "undoDeck",
          "deleteDeck",
          "readDeck",
        ].map((procedure) => `refuse ${procedure} to a person without its key`),
        "refuse a change on an older hash and write nothing",
        "keep a figures date that moved while a text change waited for the row lock",
        "refuse a chart on a dataset this deployment lacks and write nothing",
        "undo two renames in reverse order with their hashes, then answer nothing-to-undo",
        "refuse an image whose file is not one of the deck's images",
        "write one audit row for each create, change, Undo and delete",
        "delete the deck's image and export files with the deck",
      ].map((name) => `the slides deck procedures ${name}`),
      ...[
        "store a PNG with the caller as uploader, append its id, keep the hash and write one audit row",
        "answer a link that serves an image a change adds, without a page load",
        "refuse a PDF with image-invalid and store no file",
        "refuse a PDF body declared as image/png with image-invalid, store no file and keep the deck's images",
        "refuse an image over the deployment's upload limit with image-too-large and store no file",
        "answer not-found on another person's deck and store no file",
      ].map((name) => `the slides deck images ${name}`),
      ...[
        "answer not-found to the deck page of another person's deck",
        "answer chat none on the Slides list to a person without core:ask:use",
        "issue image links only for the images the deck shows",
      ].map((name) => `the slides page loaders ${name}`),
    ],
  },
  {
    file: "testing/agent-tools.integration.test.ts",
    reason:
      "Spec 7 R-46, R-52 and R-56: the agent reads only the asker's own decks, a created chart passes the chart gate and a refused one stores nothing, every slide leads with its title and holds one table at most beside one other box, the change tool saves through the store with one Undo entry and refuses an older hash, and the write tools and their rules reach only a holder of slides:write",
    cases: [
      "slides-read-deck answers not-found to another person and leaves the deck the same",
      "slides-create-deck answers chart-invalid for a chart on an unknown dataset and stores no deck",
      "slides-create-deck refuses in its input a slide whose first element is not its title",
      "slides-create-deck refuses in its input a table that shares its slide with a text and another visual",
      "slides-change-deck answers the new content hash, and a second change with it saves without a read",
      "slides-change-deck refuses a hash read before a hand change with deck-changed and saves nothing",
      "slides-change-deck keeps a change-slide element's stored box and style when the step leaves them out, and null clears them",
      "offers the read tools in Ask and the write tools only in a Slides session of a writer, with the write rules only there",
    ].map((name) => `the slides agent tools ${name}`),
  },
  {
    file: "testing/agent-surface.integration.test.ts",
    reason:
      "Spec 7 R-42b and S7-42: the Slides surface makes the empty deck inside the handoff's transaction, as the person, behind slides:write, so a refusal or a rollback leaves no deck",
    cases: [
      "createRecord makes an empty deck of the person in the given transaction, frozen on the reporting date, with no Undo entry and one created audit row, and a rolled back transaction leaves none",
      "createRecord refuses a person without slides:write and makes nothing",
    ].map((name) => `the Slides agent surface ${name}`),
  },
];
