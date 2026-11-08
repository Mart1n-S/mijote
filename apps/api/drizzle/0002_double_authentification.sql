CREATE TYPE "public"."login_purpose" AS ENUM('password', 'code');--> statement-breakpoint
CREATE TABLE "account_two_factor" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"secret_cipher" text NOT NULL,
	"activated_at" timestamp with time zone,
	"last_used_step" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_login" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_secret" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor_backup_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_attempt" ADD COLUMN "purpose" "login_purpose" DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "admin_unlocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_two_factor" ADD CONSTRAINT "account_two_factor_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_login" ADD CONSTRAINT "pending_login_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor_backup_code" ADD CONSTRAINT "two_factor_backup_code_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_login_token_hash_unique" ON "pending_login" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "pending_login_expires_at_idx" ON "pending_login" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "two_factor_backup_code_position_unique" ON "two_factor_backup_code" USING btree ("account_id","position");