"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  habitConfig,
  habitoEntries,
  habitos,
  userSettings,
  type Habito,
  type HabitConfig,
  type HabitoTipo,
  type UserSettings,
} from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { HABIT_DEFAULTS } from "@/lib/habit-defaults";

function refresh() {
  revalidatePath("/");
  revalidatePath("/settings");
}

// ---------- HÁBITOS CRUD ----------

export type CreateHabitoInput = {
  pregunta: string;
  tipo: HabitoTipo;
};

export async function createHabito(input: CreateHabitoInput): Promise<Habito> {
  const userId = await requireUserId();
  const pregunta = input.pregunta.trim();
  if (!pregunta) throw new Error("La pregunta no puede estar vacía");
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${habitos.orden}), 0)` })
    .from(habitos)
    .where(eq(habitos.userId, userId));
  const orden = (maxRow?.max ?? 0) + 100;
  const [created] = await db
    .insert(habitos)
    .values({ userId, pregunta, tipo: input.tipo, orden })
    .returning();
  refresh();
  return created;
}

export type UpdateHabitoInput = {
  id: number;
  pregunta?: string;
  tipo?: HabitoTipo;
};

export async function updateHabito(input: UpdateHabitoInput): Promise<void> {
  const userId = await requireUserId();
  const set: Partial<typeof habitos.$inferInsert> = {};
  if (input.pregunta !== undefined) {
    const p = input.pregunta.trim();
    if (!p) throw new Error("La pregunta no puede estar vacía");
    set.pregunta = p;
  }
  if (input.tipo !== undefined) set.tipo = input.tipo;
  if (Object.keys(set).length === 0) return;
  await db
    .update(habitos)
    .set(set)
    .where(and(eq(habitos.id, input.id), eq(habitos.userId, userId)));
  refresh();
}

export async function archiveHabito(id: number, archivado = true): Promise<void> {
  const userId = await requireUserId();
  await db
    .update(habitos)
    .set({ archivado })
    .where(and(eq(habitos.id, id), eq(habitos.userId, userId)));
  refresh();
}

export async function deleteHabito(id: number): Promise<void> {
  // Soft delete (mantiene entries históricos) — la UI lo llama "Eliminar" pero
  // semánticamente es archivar. Si en el futuro hace falta un hard delete, ya
  // hay cascade en habito_entries.
  await archiveHabito(id, true);
}

export async function reorderHabitos(habitoIds: number[]): Promise<void> {
  if (habitoIds.length === 0) return;
  const userId = await requireUserId();
  await db.transaction(async (tx) => {
    for (let i = 0; i < habitoIds.length; i++) {
      await tx
        .update(habitos)
        .set({ orden: (i + 1) * 100 })
        .where(and(eq(habitos.id, habitoIds[i]), eq(habitos.userId, userId)));
    }
  });
  refresh();
}

export async function seedExampleHabitos(): Promise<void> {
  const userId = await requireUserId();
  // Solo siembra si no hay ninguno (activo o archivado) — no queremos duplicar
  // si el usuario apretó el botón dos veces en pestañas distintas.
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(habitos)
    .where(eq(habitos.userId, userId));
  if ((row?.c ?? 0) > 0) return;
  await db.insert(habitos).values(
    HABIT_DEFAULTS.map((h, i) => ({
      userId,
      pregunta: h.pregunta,
      tipo: h.tipo,
      orden: (i + 1) * 100,
    })),
  );
  refresh();
}

// ---------- HABIT CONFIG (singleton) ----------

export async function getOrCreateHabitConfig(): Promise<HabitConfig> {
  const userId = await requireUserId();
  const [existing] = await db
    .select()
    .from(habitConfig)
    .where(eq(habitConfig.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(habitConfig)
    .values({ userId })
    .returning();
  return created;
}

export type UpdateHabitConfigInput = {
  sleepModeInicio?: string; // "HH:MM" or "HH:MM:SS"
  sleepModeFin?: string;
  sleepModeAuto?: boolean;
  reminderTime?: string; // "HH:MM" or "HH:MM:SS"
};

export async function updateHabitConfig(
  input: UpdateHabitConfigInput,
): Promise<HabitConfig> {
  const userId = await requireUserId();
  await getOrCreateHabitConfig(); // ensure row
  const set: Partial<typeof habitConfig.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.sleepModeInicio !== undefined) set.sleepModeInicio = input.sleepModeInicio;
  if (input.sleepModeFin !== undefined) set.sleepModeFin = input.sleepModeFin;
  if (input.sleepModeAuto !== undefined) set.sleepModeAuto = input.sleepModeAuto;
  if (input.reminderTime !== undefined) set.reminderTime = input.reminderTime;
  const [updated] = await db
    .update(habitConfig)
    .set(set)
    .where(eq(habitConfig.userId, userId))
    .returning();
  refresh();
  return updated;
}

// ---------- USER SETTINGS (singleton) ----------

export async function getOrCreateUserSettings(): Promise<UserSettings> {
  const userId = await requireUserId();
  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(userSettings)
    .values({ userId })
    .returning();
  return created;
}

export type UpdateUserSettingsInput = {
  timezone?: string;
};

export async function updateUserSettings(
  input: UpdateUserSettingsInput,
): Promise<UserSettings> {
  const userId = await requireUserId();
  await getOrCreateUserSettings();
  const set: Partial<typeof userSettings.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.timezone !== undefined) set.timezone = input.timezone;
  const [updated] = await db
    .update(userSettings)
    .set(set)
    .where(eq(userSettings.userId, userId))
    .returning();
  refresh();
  return updated;
}

// ---------- ICAL TOKEN ----------

function randomToken(): string {
  // 32 hex chars (~128 bits). Suficiente entropía contra fuerza bruta.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Devuelve el token actual del usuario, o genera uno si no existe.
 * Idempotente — segundo llamado devuelve el mismo token.
 */
export async function getOrCreateIcalToken(): Promise<string> {
  const userId = await requireUserId();
  const settings = await getOrCreateUserSettings();
  if (settings.icalToken) return settings.icalToken;
  const token = randomToken();
  await db
    .update(userSettings)
    .set({ icalToken: token, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  refresh();
  return token;
}

/**
 * Regenera el token. Invalida el URL anterior — quien lo tenía suscripto
 * empieza a recibir 404 hasta resuscribirse con el nuevo.
 */
export async function regenerateIcalToken(): Promise<string> {
  const userId = await requireUserId();
  await getOrCreateUserSettings();
  const token = randomToken();
  await db
    .update(userSettings)
    .set({ icalToken: token, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  refresh();
  return token;
}

// ---------- ENTRIES UPSERT ----------

export type UpsertEntry =
  | { habitoId: number; valor: string }
  | { habitoId: number; skipped: true };

export type UpsertHabitoEntriesInput = {
  fecha: string; // ISO date "YYYY-MM-DD"
  entries: UpsertEntry[];
};

export async function upsertHabitoEntries(
  input: UpsertHabitoEntriesInput,
): Promise<void> {
  const userId = await requireUserId();
  if (input.entries.length === 0) return;

  // Validar: no se acepta entry sin valor y sin skipped (estado ilegal del spec).
  for (const e of input.entries) {
    if ("valor" in e) {
      if (e.valor === null || e.valor === undefined || e.valor === "") {
        throw new Error("Entry sin valor no permitida — usá skipped");
      }
    } else if (!("skipped" in e) || e.skipped !== true) {
      throw new Error("Entry inválida");
    }
  }

  // Validar que todos los habitoIds son del usuario actual (no confiar en el cliente).
  const ids = Array.from(new Set(input.entries.map((e) => e.habitoId)));
  const owned = await db
    .select({ id: habitos.id })
    .from(habitos)
    .where(and(eq(habitos.userId, userId), inArray(habitos.id, ids)));
  const ownedSet = new Set(owned.map((r) => r.id));
  for (const id of ids) {
    if (!ownedSet.has(id)) throw new Error(`Hábito ${id} no pertenece al usuario`);
  }

  await db.transaction(async (tx) => {
    for (const e of input.entries) {
      const valor = "valor" in e ? e.valor : null;
      const skipped = "skipped" in e ? e.skipped === true : false;
      await tx
        .insert(habitoEntries)
        .values({
          userId,
          habitoId: e.habitoId,
          fecha: input.fecha,
          valor,
          skipped,
        })
        .onConflictDoUpdate({
          target: [habitoEntries.habitoId, habitoEntries.fecha],
          set: { valor, skipped },
        });
    }
  });
  refresh();
}

// ---------- ENTRIES READ ----------

export async function getHabitoEntriesForRange(
  fechaDesde: string,
  fechaHasta: string,
) {
  const userId = await requireUserId();
  return await db
    .select()
    .from(habitoEntries)
    .where(
      and(
        eq(habitoEntries.userId, userId),
        sql`${habitoEntries.fecha} >= ${fechaDesde}`,
        sql`${habitoEntries.fecha} <= ${fechaHasta}`,
      ),
    )
    .orderBy(asc(habitoEntries.fecha));
}
