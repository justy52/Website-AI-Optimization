ALTER TABLE "agent_runs" ADD COLUMN "estimated_total_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "actual_total_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "model_generation_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;