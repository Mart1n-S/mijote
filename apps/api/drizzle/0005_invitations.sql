ALTER TYPE "public"."login_purpose" ADD VALUE 'invitation';--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "account_role" DEFAULT 'user' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_account_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_hash_unique" ON "invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_email_live_unique" ON "invitation" USING btree ("email") WHERE "invitation"."used_at" is null and "invitation"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "invitation_inviter_idx" ON "invitation" USING btree ("invited_by","created_at");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email","created_at");