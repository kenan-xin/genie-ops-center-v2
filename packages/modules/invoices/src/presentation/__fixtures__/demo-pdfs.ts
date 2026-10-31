/**
 * The live demo files the review stories draw, imported as URLs. The bundler emits a file only
 * when a story that imports it is built, so a Storybook selection without this module carries none
 * of them. `?no-inline` keeps each one a served file: these PDFs are under Vite's 4 KB inline
 * limit, and a `data:` URL breaks a story that adds `?v=` to it.
 * Copies of `docs/modules/invoices-and-payments/demo-pack/03_Live_Upload_Documents/`.
 */
import invoice01 from "./pdfs/01_Invoice_Missing_Due_Date.pdf?no-inline";
import payment02 from "./pdfs/02_Payment_Partial_Existing_Invoice.pdf?no-inline";
import payment03 from "./pdfs/03_Payment_Covers_Two_Invoices.pdf?no-inline";
import payment05 from "./pdfs/05_Payment_Unmatched.pdf?no-inline";
import receipt06 from "./pdfs/06_Paid_Sales_Receipt.pdf?no-inline";
import order07 from "./pdfs/07_Purchase_Order_Not_Proof_of_Payment.pdf?no-inline";

export const DEMO_PDF = {
  invoice01,
  payment02,
  payment03,
  payment05,
  receipt06,
  order07,
};
