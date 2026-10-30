import { randomBytes } from "node:crypto";

/**
 * A valid one-page PDF with no content stream: the "no text layer" case of a scanned document
 * (R-26). Hand-written with a cross-reference table, because PDF.js refuses a document without
 * one; the offsets below are the byte offsets of each object in this exact text.
 */
export const NO_TEXT_PDF: Buffer = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "endobj",
    "3 0 obj",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    "endobj",
    "xref",
    "0 4",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "trailer",
    "<< /Size 4 /Root 1 0 R >>",
    "startxref",
    "186",
    "%%EOF",
    "",
  ].join("\n"),
  "latin1"
);

/** Bytes that start with a PDF header but hold no object, cross-reference table or trailer. */
export const BROKEN_PDF: Buffer = Buffer.from(
  "%PDF-1.4\nnot a PDF: no object, no cross-reference table, no trailer.\n",
  "latin1"
);

/**
 * A copy whose trailer `/ID [<hex><hex>]` holds new random hex of the same length: another
 * SHA-256 for the same text, with no byte offset moved. The hash check answers `duplicate` for
 * an exact copy, so a test that uploads the same bytes twice rewrites the id between uploads.
 */
export function withNewId(pdf: Buffer): Buffer {
  const text = pdf.toString("latin1");

  const id = /\/ID\s*\[\s*<([0-9a-fA-F]{32})><([0-9a-fA-F]{32})>\s*\]/.exec(
    text
  );

  if (id === null) {
    throw new Error("The PDF trailer holds no /ID entry to rewrite.");
  }

  const rewritten = id[0].replace(
    /<[0-9a-fA-F]{32}>/g,
    () => `<${randomBytes(16).toString("hex")}>`
  );

  return Buffer.from(
    text.slice(0, id.index) + rewritten + text.slice(id.index + id[0].length),
    "latin1"
  );
}
