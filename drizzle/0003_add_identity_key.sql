ALTER TABLE "leads" ADD COLUMN "identity_key" text;--> statement-breakpoint
CREATE INDEX "leads_org_identity_idx" ON "leads" USING btree ("organization_id","identity_key");