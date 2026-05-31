import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { habitos, habitoEntries, userSettings } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { dateInTZ } from "@/lib/tz-dates";
import { InsightsView } from "@/components/insights-view";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const userId = await requireUserId();
  const now = new Date();

  const [activos, settingsRow] = await Promise.all([
    db
      .select()
      .from(habitos)
      .where(and(eq(habitos.userId, userId), eq(habitos.archivado, false)))
      .orderBy(asc(habitos.orden)),
    db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1),
  ]);

  const tz = settingsRow[0]?.timezone ?? "America/Montevideo";
  const hoyISO = dateInTZ(now, tz);

  // Cargamos hasta 6 meses (180 días) de entries — el rango máximo del preset.
  // Custom ranges fuera de eso se rebajan al máximo permitido (manejado en UI).
  const desdeMaxISO = new Date(now);
  desdeMaxISO.setUTCDate(desdeMaxISO.getUTCDate() - 200);
  const desdeMaxStr = dateInTZ(desdeMaxISO, tz);

  const entries = await db
    .select()
    .from(habitoEntries)
    .where(
      and(
        eq(habitoEntries.userId, userId),
        sql`${habitoEntries.fecha} >= ${desdeMaxStr}`,
        sql`${habitoEntries.fecha} <= ${hoyISO}`,
      ),
    )
    .orderBy(asc(habitoEntries.fecha));

  return (
    <InsightsView
      habitos={activos}
      entries={entries}
      hoyISO={hoyISO}
    />
  );
}
