ALTER TABLE "service_payments" DROP CONSTRAINT "service_payments_order_fk";
--> statement-breakpoint
DROP INDEX "service_orders_scope_unique";
--> statement-breakpoint
DROP INDEX "service_payments_session_unique";
--> statement-breakpoint
ALTER TABLE "service_payment_events" DROP CONSTRAINT "service_payment_events_workspace_id_account_id_event_id_pk";
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "payment_mode" text DEFAULT 'test' NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "merchant_account_id" text;
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "legal_seller" text;
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "activation_approval_reference" text;
--> statement-breakpoint
ALTER TABLE "service_payment_events" ADD COLUMN "payment_mode" text DEFAULT 'test' NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_payments" ADD COLUMN "payment_mode" text DEFAULT 'test' NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_payment_events" ADD CONSTRAINT "service_payment_events_mode_pk" PRIMARY KEY("workspace_id","account_id","payment_mode","event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_mode_unique" ON "service_orders" USING btree ("workspace_id","id","payment_mode");
--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_order_fk" FOREIGN KEY ("workspace_id","order_id","payment_mode") REFERENCES "public"."service_orders"("workspace_id","id","payment_mode") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_scope_unique" ON "service_orders" USING btree ("workspace_id","payment_mode","scope_reference");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_payments_session_unique" ON "service_payments" USING btree ("account_id","payment_mode","session_id");
--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_mode" CHECK ("service_orders"."payment_mode" in ('test','live'));
--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_live_identity" CHECK ("service_orders"."payment_mode"<>'live' or ("service_orders"."merchant_account_id" is not null and "service_orders"."legal_seller" is not null and "service_orders"."activation_approval_reference" is not null));
--> statement-breakpoint
ALTER TABLE "service_payment_events" ADD CONSTRAINT "service_payment_events_mode" CHECK ("service_payment_events"."payment_mode" in ('test','live'));
--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_mode" CHECK ("service_payments"."payment_mode" in ('test','live'));
--> statement-breakpoint
-- Existing financial records remain test-only. Persisted mode is immutable.
CREATE OR REPLACE FUNCTION public.service_payment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.id,OLD.workspace_id,OLD.order_id,OLD.payment_mode,OLD.installment,OLD.amount_cents,OLD.account_id,OLD.base_url,OLD.attempted_at,OLD.expires_at)
    IS DISTINCT FROM (NEW.id,NEW.workspace_id,NEW.order_id,NEW.payment_mode,NEW.installment,NEW.amount_cents,NEW.account_id,NEW.base_url,NEW.attempted_at,NEW.expires_at)
    OR (OLD.session_id IS NOT NULL AND (OLD.session_id,OLD.customer_id,OLD.checkout_url) IS DISTINCT FROM (NEW.session_id,NEW.customer_id,NEW.checkout_url))
    OR (OLD.state='REVIEW' AND NEW.state<>'REVIEW') OR (OLD.state='PAID' AND NEW.state='PENDING') THEN
    RAISE EXCEPTION 'Service payment identity or terminal review cannot be changed';
  END IF;
  RETURN NEW;
END $$;
