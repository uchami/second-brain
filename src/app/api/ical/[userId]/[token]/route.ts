// Calendar feed ICS suscribible. Sin auth WorkOS — autenticamos por token
// random guardado en user_settings.ical_token. El usuario suscribe el URL
// una vez en Google/Apple Calendar y se actualiza solo por polling.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  habitConfig,
  habitos,
  tasks,
  userSettings,
} from "@/db/schema";
import { buildIcal } from "@/lib/ical";

// URL pública de la app — usada en la descripción del reminder de hábitos
// para que sea un shortcut clickeable. Se intenta tomar del request host;
// si por alguna razón viene un host privado/raro, cae al fallback prod.
const PROD_FALLBACK = "https://second-brain-uri.vercel.app";

function resolveAppUrl(host: string | null): string {
  if (!host) return PROD_FALLBACK;
  // Si es localhost, usamos http; para todo lo demás, https.
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1")
    ? "http"
    : "https";
  return `${proto}://${host}`;
}

export const dynamic = "force-dynamic";

// Catch-all del token: aceptamos `{token}` y `{token}.ics` para que algunos
// calendar apps quisquillosos lo acepten.
function stripIcsSuffix(s: string): string {
  return s.endsWith(".ics") ? s.slice(0, -4) : s;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string; token: string }> },
) {
  const params = await ctx.params;
  const userId = params.userId;
  const token = stripIcsSuffix(params.token);

  if (!userId || !token) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Verificamos token contra DB. Si no matchea, 404 (no 401 — no queremos
  // filtrar la existencia del usuario por status code).
  const [settingsRow] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  if (!settingsRow || !settingsRow.icalToken || settingsRow.icalToken !== token) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [cfgRow] = await db
    .select()
    .from(habitConfig)
    .where(eq(habitConfig.userId, userId));

  const [allHabitos, allTasksWithEta] = await Promise.all([
    db
      .select()
      .from(habitos)
      .where(and(eq(habitos.userId, userId), eq(habitos.archivado, false)))
      .orderBy(asc(habitos.orden)),
    db.select().from(tasks).where(eq(tasks.userId, userId)),
  ]);

  const h = await headers();
  const appUrl = resolveAppUrl(h.get("host"));

  const ical = buildIcal({
    feedId: userId.slice(0, 8) || "user",
    feedName: "Second brain — Reminders",
    reminderTime: cfgRow?.reminderTime ?? "09:00",
    tz: settingsRow.timezone,
    appUrl,
    tasks: allTasksWithEta,
    habitos: allHabitos,
  });

  return new NextResponse(ical, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      // CORS no necesario porque los calendar apps polean server-side; lo
      // dejamos abierto por si alguna app móvil hace fetch desde un iframe.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
