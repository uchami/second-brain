CREATE TYPE "public"."habito_tipo" AS ENUM('texto', 'estrellas', 'escala_1_10', 'si_no', 'emocion');--> statement-breakpoint
CREATE TABLE "habit_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sleep_mode_inicio" time DEFAULT '21:00' NOT NULL,
	"sleep_mode_fin" time DEFAULT '05:00' NOT NULL,
	"sleep_mode_auto" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habito_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"habito_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"valor" text,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habitos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pregunta" text NOT NULL,
	"tipo" "habito_tipo" NOT NULL,
	"orden" integer DEFAULT 100 NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timezone" text DEFAULT 'America/Montevideo' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habito_entries" ADD CONSTRAINT "habito_entries_habito_id_habitos_id_fk" FOREIGN KEY ("habito_id") REFERENCES "public"."habitos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_config_user_idx" ON "habit_config" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habito_entries_habito_fecha_idx" ON "habito_entries" USING btree ("habito_id","fecha");--> statement-breakpoint
CREATE INDEX "habito_entries_user_fecha_idx" ON "habito_entries" USING btree ("user_id","fecha");--> statement-breakpoint
CREATE INDEX "habitos_user_idx" ON "habitos" USING btree ("user_id","archivado","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_user_idx" ON "user_settings" USING btree ("user_id");