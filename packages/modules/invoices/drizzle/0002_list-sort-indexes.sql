CREATE INDEX "customer_name_idx" ON "customer" USING btree ("name");--> statement-breakpoint
CREATE INDEX "invoice_number_idx" ON "invoice" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoice_invoice_date_idx" ON "invoice" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "invoice_due_date_idx" ON "invoice" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "invoice_total_cents_idx" ON "invoice" USING btree ("total_cents");--> statement-breakpoint
CREATE INDEX "invoice_updated_at_idx" ON "invoice" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "payment_payment_date_idx" ON "payment" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "payment_method_idx" ON "payment" USING btree ("method");--> statement-breakpoint
CREATE INDEX "payment_amount_cents_idx" ON "payment" USING btree ("amount_cents");--> statement-breakpoint
CREATE INDEX "payment_updated_at_idx" ON "payment" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "document_created_at_idx" ON "document" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "document_updated_at_idx" ON "document" USING btree ("updated_at","id");