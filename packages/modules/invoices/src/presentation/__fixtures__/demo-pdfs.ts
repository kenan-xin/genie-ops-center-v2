/**
 * The live demo files the review stories draw, imported as URLs. The bundler emits a file only
 * when a story that imports it is built, so a Storybook selection without this module carries none
 * of them. The Storybook host keeps every PDF a file, never a `data:` URL. Copies of
 * `docs/modules/invoices-and-payments/demo-pack/03_Live_Upload_Documents/`, and `history0903` of
 * `02_History_PDFs/Invoices/INV-2026-09-03.pdf`.
 */
import invoice01 from "./pdfs/01_Invoice_Missing_Due_Date.pdf?url";
import payment02 from "./pdfs/02_Payment_Partial_Existing_Invoice.pdf?url";
import payment03 from "./pdfs/03_Payment_Covers_Two_Invoices.pdf?url";
import payment05 from "./pdfs/05_Payment_Unmatched.pdf?url";
import receipt06 from "./pdfs/06_Paid_Sales_Receipt.pdf?url";
import order07 from "./pdfs/07_Purchase_Order_Not_Proof_of_Payment.pdf?url";
import history0903 from "./pdfs/INV-2026-09-03.pdf?url";

export const DEMO_PDF = {
  invoice01,
  payment02,
  payment03,
  payment05,
  receipt06,
  order07,
  history0903,
};
