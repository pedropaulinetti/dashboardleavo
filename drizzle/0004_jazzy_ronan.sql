CREATE INDEX "ad_metrics_org_date_idx" ON "ad_metrics" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "lead_stage_events_org_stage_idx" ON "lead_stage_events" USING btree ("organization_id","stage");--> statement-breakpoint
CREATE INDEX "leads_org_created_idx" ON "leads" USING btree ("organization_id","created_at");