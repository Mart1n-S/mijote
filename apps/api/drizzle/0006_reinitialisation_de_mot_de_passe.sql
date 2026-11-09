ALTER TYPE "public"."login_purpose" ADD VALUE 'reset_request';--> statement-breakpoint
ALTER TYPE "public"."login_purpose" ADD VALUE 'reset';--> statement-breakpoint
CREATE TABLE "password_reset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_hash_unique" ON "password_reset" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_account_live_unique" ON "password_reset" USING btree ("account_id") WHERE "password_reset"."used_at" is null and "password_reset"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "password_reset_expires_at_idx" ON "password_reset" USING btree ("expires_at");