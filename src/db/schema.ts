import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const estadoEnum = pgEnum("estado", [
  "pendiente",
  "en_proceso",
  "delegado",
  "postergado",
  "done",
]);

// Placeholder used by the multi-tenant migration to tag pre-existing,
// single-tenant rows. After WorkOS login we manually UPDATE all rows with this
// value to the real WorkOS user id.
export const LEGACY_USER_ID = "legacy-owner";

export const responsables = pgTable(
  "responsables",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    nombre: text("nombre").notNull(),
    color: text("color").notNull().default("#cccccc"),
    orden: integer("orden").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("responsables_user_idx").on(t.userId, t.orden)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    titulo: text("titulo").notNull(),
    detalle: text("detalle"),
    responsableId: integer("responsable_id").references(() => responsables.id, {
      onDelete: "set null",
    }),
    // null = "Sin definir"
    bucket: integer("bucket"),
    estado: estadoEnum("estado").notNull().default("pendiente"),
    eta: date("eta"),
    inFlight: boolean("in_flight").notNull().default(false),
    // sparse ordering (100, 200, 300...) to insert without reindex
    inFlightOrder: integer("in_flight_order"),
    bucketOrder: integer("bucket_order").notNull().default(1000),
    doneAt: timestamp("done_at", { withTimezone: true }),
    // null = current week or active; set when "cerrar semana" archives a Done task
    closedWeekAt: timestamp("closed_week_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tasks_user_in_flight_idx").on(t.userId, t.inFlight, t.inFlightOrder),
    index("tasks_user_bucket_idx").on(t.userId, t.bucket, t.bucketOrder),
    index("tasks_user_closed_week_idx").on(t.userId, t.closedWeekAt),
  ],
);

export const cierresSemana = pgTable(
  "cierres_semana",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    cerradoAt: timestamp("cerrado_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // snapshot of active (non-done) tasks at the moment of closing,
    // so the next "close week" preview can show the delta
    pendientesAntes: integer("pendientes_antes").notNull(),
    doneArchivadas: integer("done_archivadas").notNull(),
  },
  (t) => [index("cierres_semana_user_idx").on(t.userId, t.cerradoAt)],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Responsable = typeof responsables.$inferSelect;
export type Estado = (typeof estadoEnum.enumValues)[number];
export type CierreSemana = typeof cierresSemana.$inferSelect;
