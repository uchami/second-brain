import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { habitConfig, habitoEntries, habitos, userSettings } from "@/db/schema";
import { dateInTZ, timeBetween, timeInTZ } from "./tz-dates";

export type SleepMode = {
  active: boolean;
  // 'cerrado' = ya hay al menos una entry de hoy
  // 'horario' = entró en la ventana nocturna sin entries de hoy
  reason: "cerrado" | "horario" | null;
};

// Computa el estado de sleep mode para un usuario. Requiere:
// - al menos 1 hábito activo
// - (entries de hoy en tz user) || (hora actual ∈ [inicio, fin] y auto=true)
export async function computeSleepMode(
  userId: string,
  now: Date,
): Promise<SleepMode> {
  const [activosRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(habitos)
    .where(and(eq(habitos.userId, userId), eq(habitos.archivado, false)));
  const activos = activosRow?.c ?? 0;
  if (activos === 0) return { active: false, reason: null };

  // Cargar timezone + config en paralelo (puede no existir si nunca se entró a settings).
  const [settingsRow] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  const tz = settingsRow?.timezone ?? "America/Montevideo";

  const [cfgRow] = await db
    .select()
    .from(habitConfig)
    .where(eq(habitConfig.userId, userId));
  const sleepInicio = cfgRow?.sleepModeInicio ?? "21:00";
  const sleepFin = cfgRow?.sleepModeFin ?? "05:00";
  const sleepAuto = cfgRow?.sleepModeAuto ?? true;

  const hoy = dateInTZ(now, tz);
  const [entriesHoyRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(habitoEntries)
    .where(
      and(eq(habitoEntries.userId, userId), eq(habitoEntries.fecha, hoy)),
    );
  const entriesHoy = entriesHoyRow?.c ?? 0;

  if (entriesHoy > 0) return { active: true, reason: "cerrado" };

  if (sleepAuto) {
    const ahora = timeInTZ(now, tz);
    if (timeBetween(ahora, sleepInicio, sleepFin)) {
      return { active: true, reason: "horario" };
    }
  }
  return { active: false, reason: null };
}
