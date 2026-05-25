import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { habitoEntries, habitos } from "@/db/schema";
import { addDays } from "./tz-dates";

// Streak reactivo puro (ADR 0001): cuenta días consecutivos hacia atrás desde
// `hoy` donde TODOS los hábitos activos de ese día tienen entry (con valor o
// skipped). El día `hoy` solo cuenta si ya está cerrado — si no está cerrado,
// la racha empieza en `ayer`.
//
// Simplificación de "hábitos activos de ese día": tomamos el set actual de
// hábitos no archivados. No reconstruimos la historia de activación/archivo —
// el archivado borra del numerador y denominador hacia adelante, pero no
// queremos invalidar racha pasada por archivar un hábito viejo. Si más
// adelante hace falta, se puede agregar `archivado_at`.
export async function computeStreak(
  userId: string,
  hoy: string,
): Promise<number> {
  const activos = await db
    .select({ id: habitos.id, createdAt: habitos.createdAt })
    .from(habitos)
    .where(and(eq(habitos.userId, userId), eq(habitos.archivado, false)));

  if (activos.length === 0) return 0;

  // Entries por (fecha, habito_id) para los últimos N días.
  // Cap a 365 para no explotar — racha > 1 año es premio para una v2.
  const MAX_DIAS = 365;

  // Determinar el primer día candidato: si hoy ya tiene al menos 1 entry de
  // CUALQUIER hábito, arrancamos desde hoy. Si no, desde ayer.
  const [hoyRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(habitoEntries)
    .where(
      and(eq(habitoEntries.userId, userId), eq(habitoEntries.fecha, hoy)),
    );
  const hayEntriesHoy = (hoyRow?.c ?? 0) > 0;

  let dia = hayEntriesHoy ? hoy : addDays(hoy, -1);
  let streak = 0;

  for (let i = 0; i < MAX_DIAS; i++) {
    // Para ese día, contar cuántos hábitos activos tienen entry.
    // Solo cuentan los hábitos que existían en ese día (created_at <= fin del día).
    // Para mantenerlo simple usamos comparación lexicográfica del date contra
    // YYYY-MM-DD y el created_at se castea a date en la TZ del server. Es una
    // aproximación; el spec acepta esta imperfección (ver ADR 0001).
    const activosEseDia = activos.filter((h) => {
      const created = h.createdAt.toISOString().slice(0, 10);
      return created <= dia;
    });
    if (activosEseDia.length === 0) break;

    const entries = await db
      .select({ habitoId: habitoEntries.habitoId })
      .from(habitoEntries)
      .where(
        and(
          eq(habitoEntries.userId, userId),
          eq(habitoEntries.fecha, dia),
        ),
      );
    const entrySet = new Set(entries.map((e) => e.habitoId));
    const todosTrackeados = activosEseDia.every((h) => entrySet.has(h.id));
    if (!todosTrackeados) break;
    streak += 1;
    dia = addDays(dia, -1);
  }
  return streak;
}
