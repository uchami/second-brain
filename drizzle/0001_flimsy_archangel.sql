ALTER TYPE "public"."estado" ADD VALUE 'postergado' BEFORE 'done';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "detalle" text;