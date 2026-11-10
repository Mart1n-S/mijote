CREATE TYPE "public"."household_allergen" AS ENUM('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree-nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs');--> statement-breakpoint
CREATE TYPE "public"."household_diet" AS ENUM('vegetarian', 'pescatarian', 'pork-free');--> statement-breakpoint
CREATE TYPE "public"."household_goal" AS ENUM('economy', 'balance', 'speed', 'mix');--> statement-breakpoint
CREATE TYPE "public"."household_variety" AS ENUM('variety', 'balanced', 'reuse');--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "people_count" smallint;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "goal" "household_goal";--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "monthly_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "max_meal_minutes" smallint;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "variety_balance" "household_variety" DEFAULT 'reuse' NOT NULL;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "allergens" "household_allergen"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "diets" "household_diet"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "excluded_ingredients" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "onboarding_done_at" timestamp with time zone;