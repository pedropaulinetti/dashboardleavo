ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "lead_stage_events" ADD CONSTRAINT "lead_stage_events_organization_id_lead_id_stage_occurred_at_unique" UNIQUE("organization_id","lead_id","stage","occurred_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_email_unique" UNIQUE("organization_id","email");