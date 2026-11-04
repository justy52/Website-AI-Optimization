CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"service" text NOT NULL,
	"scope_reference" text NOT NULL,
	"scope_sha256" text NOT NULL,
	"terms_version" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"customer_email" text NOT NULL,
	"delivery_operator" text NOT NULL,
	"total_cents" integer NOT NULL,
	"deposit_cents" integer NOT NULL,
	"onboarding" jsonb NOT NULL,
	"onboarding_version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_orders_amounts" CHECK (("service_orders"."service"='AUDIT_ONLY' and "service_orders"."total_cents"=49500 and "service_orders"."deposit_cents"=49500) or ("service_orders"."service"='LAUNCH' and "service_orders"."total_cents" between 150000 and 10000000 and "service_orders"."deposit_cents"*2="service_orders"."total_cents"))
);
--> statement-breakpoint
ALTER TABLE "service_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_payment_events" (
	"workspace_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"object_id" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_payment_events_workspace_id_account_id_event_id_pk" PRIMARY KEY("workspace_id","account_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "service_payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"installment" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"account_id" text NOT NULL,
	"base_url" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"customer_id" text,
	"session_id" text,
	"checkout_url" text,
	"attempted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_payments_bounds" CHECK ("service_payments"."amount_cents" between 1 and 10000000 and "service_payments"."installment" in ('INITIAL','BALANCE') and "service_payments"."state" in ('PENDING','PAID','REVIEW'))
);
--> statement-breakpoint
ALTER TABLE "service_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_website_client_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_payment_events" ADD CONSTRAINT "service_payment_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_workspace_id_unique" ON "service_orders" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_order_fk" FOREIGN KEY ("workspace_id","order_id") REFERENCES "public"."service_orders"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_scope_unique" ON "service_orders" USING btree ("workspace_id","scope_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "service_payments_workspace_id_unique" ON "service_payments" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_payments_installment_unique" ON "service_payments" USING btree ("workspace_id","order_id","installment");--> statement-breakpoint
CREATE UNIQUE INDEX "service_payments_session_unique" ON "service_payments" USING btree ("account_id","session_id");
--> statement-breakpoint

-- Recheck real membership, not app.workspace_role, for every user operation.
CREATE FUNCTION public.service_payment_member(write_access boolean) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.actor_type',true)='USER' AND EXISTS (
    SELECT 1 FROM public.workspace_memberships m JOIN public.workspaces w ON w.id=m.workspace_id
    WHERE m.workspace_id=public.current_app_workspace_id()
      AND m.user_id=public.current_app_user_id() AND m.status='ACTIVE'
      AND w.archived_at IS NULL AND w.deletion_pending_at IS NULL
      AND (NOT write_access OR m.role IN ('OWNER','ADMIN'))
  )
$$;
--> statement-breakpoint
CREATE FUNCTION public.service_payment_webhook() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.actor_type',true)='SYSTEM'
    AND current_setting('app.correlation_id',true)='service-payment-webhook'
    AND coalesce(current_setting('app.user_id',true),'')=''
$$;
--> statement-breakpoint
ALTER TABLE service_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE service_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE service_payment_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_orders_read ON service_orders FOR SELECT USING (workspace_id=public.current_app_workspace_id() AND (public.service_payment_member(false) OR public.service_payment_webhook()));
CREATE POLICY service_orders_insert ON service_orders FOR INSERT WITH CHECK (workspace_id=public.current_app_workspace_id() AND public.service_payment_member(true));
CREATE POLICY service_orders_update ON service_orders FOR UPDATE USING (workspace_id=public.current_app_workspace_id() AND public.service_payment_member(true)) WITH CHECK (workspace_id=public.current_app_workspace_id() AND public.service_payment_member(true));
--> statement-breakpoint
CREATE POLICY service_payments_read ON service_payments FOR SELECT USING (workspace_id=public.current_app_workspace_id() AND (public.service_payment_member(false) OR public.service_payment_webhook()));
CREATE POLICY service_payments_insert ON service_payments FOR INSERT WITH CHECK (workspace_id=public.current_app_workspace_id() AND public.service_payment_member(true));
CREATE POLICY service_payments_update ON service_payments FOR UPDATE USING (workspace_id=public.current_app_workspace_id() AND (public.service_payment_member(true) OR public.service_payment_webhook())) WITH CHECK (workspace_id=public.current_app_workspace_id() AND (public.service_payment_member(true) OR public.service_payment_webhook()));
--> statement-breakpoint
CREATE POLICY service_payment_events_read ON service_payment_events FOR SELECT USING (workspace_id=public.current_app_workspace_id() AND (public.service_payment_member(false) OR public.service_payment_webhook()));
CREATE POLICY service_payment_events_insert ON service_payment_events FOR INSERT WITH CHECK (workspace_id=public.current_app_workspace_id() AND public.service_payment_webhook());
CREATE POLICY service_payment_events_update ON service_payment_events FOR UPDATE USING (workspace_id=public.current_app_workspace_id() AND public.service_payment_webhook()) WITH CHECK (workspace_id=public.current_app_workspace_id() AND public.service_payment_webhook());
--> statement-breakpoint
CREATE FUNCTION public.service_order_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(OLD)-ARRAY['onboarding','onboarding_version','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['onboarding','onboarding_version','updated_at']) THEN
    RAISE EXCEPTION 'Signed service schedule is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER service_order_immutable BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION public.service_order_immutable();
--> statement-breakpoint
CREATE FUNCTION public.service_payment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.id,OLD.workspace_id,OLD.order_id,OLD.installment,OLD.amount_cents,OLD.account_id,OLD.base_url,OLD.attempted_at,OLD.expires_at)
    IS DISTINCT FROM (NEW.id,NEW.workspace_id,NEW.order_id,NEW.installment,NEW.amount_cents,NEW.account_id,NEW.base_url,NEW.attempted_at,NEW.expires_at)
    OR (OLD.session_id IS NOT NULL AND (OLD.session_id,OLD.customer_id,OLD.checkout_url) IS DISTINCT FROM (NEW.session_id,NEW.customer_id,NEW.checkout_url))
    OR (OLD.state='REVIEW' AND NEW.state<>'REVIEW') OR (OLD.state='PAID' AND NEW.state='PENDING') THEN
    RAISE EXCEPTION 'Service payment identity or terminal review cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER service_payment_immutable BEFORE UPDATE ON service_payments FOR EACH ROW EXECUTE FUNCTION public.service_payment_immutable();
--> statement-breakpoint
-- The runtime-role hardening workstream may be integrated before this migration.
-- Grant these reviewed tables explicitly; never add broad default table grants.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='virelantic_runtime') THEN
    GRANT SELECT,INSERT,UPDATE ON TABLE public.service_orders,public.service_payments,public.service_payment_events TO virelantic_runtime;
    GRANT EXECUTE ON FUNCTION public.service_payment_member(boolean),public.service_payment_webhook() TO virelantic_runtime;
  END IF;
END $$;
