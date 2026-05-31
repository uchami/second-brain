// Export ZIP — devuelve los 5 CSVs de tablas del usuario en un solo archivo.
// Pensado para backup y para alimentar el Excel personal de planificación.

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { db } from "@/db/client";
import {
  cierresSemana,
  habitConfig,
  habitoEntries,
  habitos,
  responsables,
  tasks,
  userSettings,
} from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { csvSerialize } from "@/lib/csv";

export const dynamic = "force-dynamic";

function iso(v: Date | string | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.toISOString();
}

export async function GET() {
  const userId = await requireUserId();

  const [
    allTasks,
    allResponsables,
    allHabitos,
    allEntries,
    allCierres,
    settingsRow,
    cfgRow,
  ] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(asc(tasks.id)),
    db
      .select()
      .from(responsables)
      .where(eq(responsables.userId, userId))
      .orderBy(asc(responsables.id)),
    db
      .select()
      .from(habitos)
      .where(eq(habitos.userId, userId))
      .orderBy(asc(habitos.id)),
    db
      .select()
      .from(habitoEntries)
      .where(eq(habitoEntries.userId, userId))
      .orderBy(asc(habitoEntries.fecha)),
    db
      .select()
      .from(cierresSemana)
      .where(eq(cierresSemana.userId, userId))
      .orderBy(asc(cierresSemana.cerradoAt)),
    db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1),
    db
      .select()
      .from(habitConfig)
      .where(eq(habitConfig.userId, userId))
      .limit(1),
  ]);

  const responsableNombre = new Map(
    allResponsables.map((r) => [r.id, r.nombre] as const),
  );
  const habitoPregunta = new Map(
    allHabitos.map((h) => [h.id, h.pregunta] as const),
  );

  // Serializamos cada tabla a CSV. Los IDs internos quedan en el archivo
  // para debugging, pero los names/preguntas también — el import (si algún
  // día se amplía) puede matchear por business key.
  const tasksCsv = csvSerialize(
    allTasks.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      detalle: t.detalle ?? "",
      responsable: t.responsableId
        ? responsableNombre.get(t.responsableId) ?? ""
        : "",
      bucket: t.bucket ?? "",
      estado: t.estado,
      eta: t.eta ?? "",
      in_flight: t.inFlight,
      done_at: iso(t.doneAt),
      closed_week_at: iso(t.closedWeekAt),
      created_at: iso(t.createdAt),
    })),
    [
      "id",
      "titulo",
      "detalle",
      "responsable",
      "bucket",
      "estado",
      "eta",
      "in_flight",
      "done_at",
      "closed_week_at",
      "created_at",
    ],
  );

  const responsablesCsv = csvSerialize(
    allResponsables.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      color: r.color,
      orden: r.orden,
      created_at: iso(r.createdAt),
    })),
    ["id", "nombre", "color", "orden", "created_at"],
  );

  const habitosCsv = csvSerialize(
    allHabitos.map((h) => ({
      id: h.id,
      pregunta: h.pregunta,
      tipo: h.tipo,
      orden: h.orden,
      archivado: h.archivado,
      created_at: iso(h.createdAt),
    })),
    ["id", "pregunta", "tipo", "orden", "archivado", "created_at"],
  );

  const entriesCsv = csvSerialize(
    allEntries.map((e) => ({
      fecha: e.fecha,
      habito: habitoPregunta.get(e.habitoId) ?? "",
      habito_id: e.habitoId,
      valor: e.valor ?? "",
      skipped: e.skipped,
      created_at: iso(e.createdAt),
    })),
    ["fecha", "habito", "habito_id", "valor", "skipped", "created_at"],
  );

  const cierresCsv = csvSerialize(
    allCierres.map((c) => ({
      id: c.id,
      cerrado_at: iso(c.cerradoAt),
      pendientes_antes: c.pendientesAntes,
      done_archivadas: c.doneArchivadas,
    })),
    ["id", "cerrado_at", "pendientes_antes", "done_archivadas"],
  );

  // Settings (singleton) como CSV de 1 fila para mantener consistencia.
  const settingsCsv = csvSerialize(
    [
      {
        timezone: settingsRow[0]?.timezone ?? "",
        sleep_mode_inicio: cfgRow[0]?.sleepModeInicio ?? "",
        sleep_mode_fin: cfgRow[0]?.sleepModeFin ?? "",
        sleep_mode_auto: cfgRow[0]?.sleepModeAuto ?? "",
      },
    ],
    ["timezone", "sleep_mode_inicio", "sleep_mode_fin", "sleep_mode_auto"],
  );

  const zip = new JSZip();
  zip.file("tasks.csv", tasksCsv);
  zip.file("responsables.csv", responsablesCsv);
  zip.file("habitos.csv", habitosCsv);
  zip.file("habito_entries.csv", entriesCsv);
  zip.file("cierres_semana.csv", cierresCsv);
  zip.file("user_settings.csv", settingsCsv);

  const buf = await zip.generateAsync({ type: "blob" });
  // JSZip's "blob" output es un Blob nativo — TS5 + Next 15 lo aceptan
  // como BodyInit sin chistar.
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="second-brain-export-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
