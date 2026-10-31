import { DOCUMENT_KINDS } from "../contract.ts";

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** The inbox's and the review's words for a document's type (R-27, R-37). */
export function kindText(kind: DocumentKind | null): string {
  switch (kind) {
    case "invoice":
      return "Invoice";
    case "payment":
      return "Payment evidence";
    case "paid-receipt":
      return "Paid receipt";
    case "purchase-order":
      return "Purchase order";
    case null:
      return "Not classified";
  }
}
