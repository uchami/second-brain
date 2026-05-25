import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { habitos, responsables } from "@/db/schema";
import { SettingsShell } from "@/components/settings-shell";
import { getOrCreateHabitConfig, getOrCreateUserSettings } from "@/app/habit-actions";
import { requireUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [allResponsables, allHabitos, cfg, settings] = await Promise.all([
    db
      .select()
      .from(responsables)
      .where(eq(responsables.userId, userId))
      .orderBy(asc(responsables.orden)),
    db
      .select()
      .from(habitos)
      .where(eq(habitos.userId, userId))
      .orderBy(asc(habitos.orden)),
    getOrCreateHabitConfig(),
    getOrCreateUserSettings(),
  ]);
  return (
    <SettingsShell
      responsables={allResponsables}
      habitos={allHabitos}
      habitConfig={cfg}
      userSettings={settings}
    />
  );
}
