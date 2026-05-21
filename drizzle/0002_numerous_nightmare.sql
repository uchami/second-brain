CREATE TABLE "cierres_semana" (
	"id" serial PRIMARY KEY NOT NULL,
	"cerrado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pendientes_antes" integer NOT NULL,
	"done_archivadas" integer NOT NULL
);
