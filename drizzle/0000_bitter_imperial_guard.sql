CREATE TYPE "public"."estado" AS ENUM('pendiente', 'en_proceso', 'delegado', 'done');--> statement-breakpoint
CREATE TABLE "responsables" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"color" text DEFAULT '#cccccc' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"responsable_id" integer,
	"bucket" integer,
	"estado" "estado" DEFAULT 'pendiente' NOT NULL,
	"eta" date,
	"in_flight" boolean DEFAULT false NOT NULL,
	"in_flight_order" integer,
	"bucket_order" integer DEFAULT 1000 NOT NULL,
	"done_at" timestamp with time zone,
	"closed_week_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_responsable_id_responsables_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."responsables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_in_flight_idx" ON "tasks" USING btree ("in_flight","in_flight_order");--> statement-breakpoint
CREATE INDEX "tasks_bucket_idx" ON "tasks" USING btree ("bucket","bucket_order");--> statement-breakpoint
CREATE INDEX "tasks_closed_week_idx" ON "tasks" USING btree ("closed_week_at");