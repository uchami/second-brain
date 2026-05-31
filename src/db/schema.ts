import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const estadoEnum = pgEnum("estado", [
  "pendiente",
  "en_proceso",
  "delegado",
  "postergado",
  "done",
]);

export const habitoTipoEnum = pgEnum("habito_tipo", [
  "texto",
  "estrellas",
  "escala_1_10",
  "si_no",
  "emocion",
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

// ---------- HÁBITOS ----------

export const habitos = pgTable(
  "habitos",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    pregunta: text("pregunta").notNull(),
    tipo: habitoTipoEnum("tipo").notNull(),
    // sparse order (100, 200, 300...) to insert without reindex
    orden: integer("orden").notNull().default(100),
    archivado: boolean("archivado").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("habitos_user_idx").on(t.userId, t.archivado, t.orden)],
);

export const habitoEntries = pgTable(
  "habito_entries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    habitoId: integer("habito_id")
      .notNull()
      .references(() => habitos.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    // null + skipped=false is illegal; server actions guard against it
    valor: text("valor"),
    skipped: boolean("skipped").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("habito_entries_habito_fecha_idx").on(t.habitoId, t.fecha),
    index("habito_entries_user_fecha_idx").on(t.userId, t.fecha),
  ],
);

export const habitConfig = pgTable(
  "habit_config",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    sleepModeInicio: time("sleep_mode_inicio").notNull().default("21:00"),
    sleepModeFin: time("sleep_mode_fin").notNull().default("05:00"),
    sleepModeAuto: boolean("sleep_mode_auto").notNull().default(true),
    // Hora global del reminder diario de hábitos en el ICS feed. Single setting
    // por usuario — todos los hábitos suenan a la misma hora.
    reminderTime: time("reminder_time").notNull().default("09:00"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("habit_config_user_idx").on(t.userId)],
);

export const userSettings = pgTable(
  "user_settings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    timezone: text("timezone").notNull().default("America/Montevideo"),
    // Token random para el URL del calendar feed. Generado on-demand cuando
    // el usuario pide la URL por primera vez (o la regenera).
    icalToken: text("ical_token"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("user_settings_user_idx").on(t.userId)],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Responsable = typeof responsables.$inferSelect;
export type Estado = (typeof estadoEnum.enumValues)[number];
export type CierreSemana = typeof cierresSemana.$inferSelect;
export type Habito = typeof habitos.$inferSelect;
export type NewHabito = typeof habitos.$inferInsert;
export type HabitoTipo = (typeof habitoTipoEnum.enumValues)[number];
export type HabitoEntry = typeof habitoEntries.$inferSelect;
export type NewHabitoEntry = typeof habitoEntries.$inferInsert;
export type HabitConfig = typeof habitConfig.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
