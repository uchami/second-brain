ALTER TABLE "habit_config" ADD COLUMN "reminder_time" time DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ical_token" text;