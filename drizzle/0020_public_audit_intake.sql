CREATE TABLE "public_audit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"nonce_hash" text NOT NULL,
	"payload_hash" text NOT NULL,
	"email_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_until" timestamp with time zone DEFAULT now() + interval '90 days' NOT NULL,
	"state" text DEFAULT 'RECEIVED' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"lead_id" uuid,
	CONSTRAINT "public_audit_requests_state" CHECK ("public_audit_requests"."state" in ('RECEIVED','IMPORTED','DISMISSED'))
);
--> statement-breakpoint
CREATE TABLE "public_intake_destination" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "public_intake_singleton" CHECK ("public_intake_destination"."singleton" = true)
);
--> statement-breakpoint
CREATE TABLE "public_intake_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_audit_requests_nonce_unique" ON "public_audit_requests" USING btree ("nonce_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "public_audit_requests_lead_unique" ON "public_audit_requests" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "public_audit_requests_queue" ON "public_audit_requests" USING btree ("workspace_id","created_at");