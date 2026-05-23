DROP INDEX "tasks_in_flight_idx";--> statement-breakpoint
DROP INDEX "tasks_bucket_idx";--> statement-breakpoint
DROP INDEX "tasks_closed_week_idx";--> statement-breakpoint
ALTER TABLE "cierres_semana" ADD COLUMN "user_id" text NOT NULL DEFAULT 'legacy-owner';--> statement-breakpoint
ALTER TABLE "responsables" ADD COLUMN "user_id" text NOT NULL DEFAULT 'legacy-owner';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "user_id" text NOT NULL DEFAULT 'legacy-owner';--> statement-breakpoint
ALTER TABLE "cierres_semana" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "responsables" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "cierres_semana_user_idx" ON "cierres_semana" USING btree ("user_id","cerrado_at");--> statement-breakpoint
CREATE INDEX "responsables_user_idx" ON "responsables" USING btree ("user_id","orden");--> statement-breakpoint
CREATE INDEX "tasks_user_in_flight_idx" ON "tasks" USING btree ("user_id","in_flight","in_flight_order");--> statement-breakpoint
CREATE INDEX "tasks_user_bucket_idx" ON "tasks" USING btree ("user_id","bucket","bucket_order");--> statement-breakpoint
CREATE INDEX "tasks_user_closed_week_idx" ON "tasks" USING btree ("user_id","closed_week_at");
