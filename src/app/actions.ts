"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { signOut as authkitSignOut } from "@workos-inc/authkit-nextjs";
import { db } from "@/db/client";
import {
  cierresSemana,
  habitConfig,
  habitoEntries,
  habitos,
  responsables,
  tasks,
  userSettings,
  type Estado,
  type Task,
} from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { computeSleepMode } from "@/lib/sleep-mode";
import { computeStreak } from "@/lib/streak";
import { addDays, dateInTZ } from "@/lib/tz-dates";

// ---------- AUTH ----------

export async function signOut() {
  // Clears the AuthKit session cookie and redirects through WorkOS to also
  // clear their session. The returnTo URL must be whitelisted in the WorkOS
  // dashboard (Redirects → Logout redirect URIs).
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  await authkitSignOut({ returnTo: `${proto}://${host}/` });
}

const IN_FLIGHT_LIMIT = 6;

function refresh() {
  revalidatePath("/");
  revalidatePath("/settings");
}

// ---------- READ ----------

async function loadResponsables(userId: string) {
  return await db
    .select()
    .from(responsables)
    .where(eq(responsables.userId, userId))
    .orderBy(asc(responsables.orden));
}

export async function getAllData() {
  const userId = await requireUserId();
  const now = new Date();

  const [allTasks, allResponsables, allHabitos, settingsRow, configRow] =
    await Promise.all([
      db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, userId))
        .orderBy(asc(tasks.bucketOrder)),
      loadResponsables(userId),
      db
        .select()
        .from(habitos)
        .where(eq(habitos.userId, userId))
        .orderBy(asc(habitos.orden)),
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

  // Garantizar singletons. Si faltan, los creamos on-demand para que el cliente
  // siempre reciba algo con defaults.
  let settings = settingsRow[0];
  if (!settings) {
    const [created] = await db
      .insert(userSettings)
      .values({ userId })
      .returning();
    settings = created;
  }
  let cfg = configRow[0];
  if (!cfg) {
    const [created] = await db
      .insert(habitConfig)
      .values({ userId })
      .returning();
    cfg = created;
  }

  const tz = settings.timezone;
  const hoyISO = dateInTZ(now, tz);
  // Las últimas 8 semanas (56 días) de entries para alimentar la tab Habits.
  const desdeISO = addDays(hoyISO, -56);

  const entriesSemana = await db
    .select()
    .from(habitoEntries)
    .where(
      and(
        eq(habitoEntries.userId, userId),
        sql`${habitoEntries.fecha} >= ${desdeISO}`,
        sql`${habitoEntries.fecha} <= ${hoyISO}`,
      ),
    )
    .orderBy(asc(habitoEntries.fecha));

  const [sleepMode, streak] = await Promise.all([
    computeSleepMode(userId, now),
    computeStreak(userId, hoyISO),
  ]);

  return {
    tasks: allTasks,
    responsables: allResponsables,
    habitos: allHabitos,
    habitoEntriesUltimaSemana: entriesSemana,
    habitConfig: cfg,
    userSettings: settings,
    sleepMode,
    streak,
    hoyISO,
  };
}

// ---------- CREATE ----------

export type CreateTaskInput = {
  titulo: string;
  detalle?: string | null;
  responsableId?: number | null;
  estado?: Estado;
  bucket?: number | null;
  eta?: string | null;
  inFlight?: boolean;
};

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const userId = await requireUserId();
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error("El título no puede estar vacío");

  if (input.inFlight) {
    const count = await countInFlight(userId);
    if (count >= IN_FLIGHT_LIMIT) {
      throw new Error(`Llegaste al máximo de ${IN_FLIGHT_LIMIT} tareas en in-flight`);
    }
  }

  const inFlightOrder = input.inFlight ? await nextInFlightOrder(userId) : null;
  const bucketOrder = await nextBucketOrder(userId, input.bucket ?? null);

  const [created] = await db
    .insert(tasks)
    .values({
      userId,
      titulo,
      detalle: input.detalle ?? null,
      responsableId: input.responsableId ?? null,
      estado: input.estado ?? "pendiente",
      bucket: input.bucket ?? null,
      eta: input.eta ?? null,
      inFlight: !!input.inFlight,
      inFlightOrder,
      bucketOrder,
    })
    .returning();
  refresh();
  return created;
}

// ---------- UPDATE ----------

export type UpdateTaskInput = {
  id: number;
  titulo?: string;
  detalle?: string | null;
  responsableId?: number | null;
  estado?: Estado;
  eta?: string | null;
  bucket?: number | null;
};

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const userId = await requireUserId();
  const set: Partial<Task> = { updatedAt: new Date() };
  if (input.titulo !== undefined) {
    const t = input.titulo.trim();
    if (!t) throw new Error("El título no puede estar vacío");
    set.titulo = t;
  }
  if (input.detalle !== undefined) set.detalle = input.detalle;
  if (input.responsableId !== undefined) set.responsableId = input.responsableId;
  if (input.estado !== undefined) set.estado = input.estado;
  if (input.eta !== undefined) set.eta = input.eta;
  if (input.bucket !== undefined) {
    // Only reset bucketOrder if the bucket actually changed — editing other
    // fields (e.g. ETA) shouldn't kick the task to the bottom of its bucket.
    const [current] = await db
      .select({ bucket: tasks.bucket })
      .from(tasks)
      .where(and(eq(tasks.id, input.id), eq(tasks.userId, userId)));
    if (current && current.bucket !== input.bucket) {
      set.bucket = input.bucket;
      set.bucketOrder = await nextBucketOrder(userId, input.bucket);
    }
  }

  const [updated] = await db
    .update(tasks)
    .set(set)
    .where(and(eq(tasks.id, input.id), eq(tasks.userId, userId)))
    .returning();
  refresh();
  return updated;
}

export async function deleteTask(id: number) {
  const userId = await requireUserId();
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  refresh();
}

// ---------- IN-FLIGHT MOVEMENT ----------

export async function moveToSecondBrain(id: number) {
  const userId = await requireUserId();
  // Tarea sale de in-flight, se queda en el bucket y posición donde ya estaba.
  await db
    .update(tasks)
    .set({
      inFlight: false,
      inFlightOrder: null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  refresh();
}

export async function promoteToInFlight(id: number) {
  const userId = await requireUserId();
  const count = await countInFlight(userId);
  if (count >= IN_FLIGHT_LIMIT) {
    throw new Error(`Llegaste al máximo de ${IN_FLIGHT_LIMIT} tareas en in-flight`);
  }
  const order = await nextInFlightOrder(userId);
  await db
    .update(tasks)
    .set({ inFlight: true, inFlightOrder: order, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  refresh();
}

export async function markDone(id: number) {
  const userId = await requireUserId();
  // Cualquier tarea (in-flight o SB) pasa al bucket especial "Done"
  // bucket: usamos un valor centinela: null no porque colisiona con "Sin definir"
  // Decisión: usamos estado=done + flag closedWeekAt null. La UI agrupa por estado.
  await db
    .update(tasks)
    .set({
      estado: "done",
      inFlight: false,
      inFlightOrder: null,
      doneAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  refresh();
}

export async function unmarkDone(id: number) {
  const userId = await requireUserId();
  await db
    .update(tasks)
    .set({
      estado: "pendiente",
      doneAt: null,
      closedWeekAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  refresh();
}

// ---------- REORDER ----------

/**
 * Reorder within in-flight. taskIds is the full ordered list of in-flight task ids.
 */
export async function reorderInFlight(taskIds: number[]) {
  if (taskIds.length === 0) return;
  const userId = await requireUserId();
  // Set order as (index+1)*100 so insertions later have room
  await db.transaction(async (tx) => {
    for (let i = 0; i < taskIds.length; i++) {
      await tx
        .update(tasks)
        .set({ inFlightOrder: (i + 1) * 100, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskIds[i]), eq(tasks.userId, userId)));
    }
  });
  refresh();
}

/**
 * Reorder within a bucket. taskIds is the full ordered list of tasks in the bucket
 * (bucket may be null for "Sin definir").
 */
export async function reorderBucket(
  bucket: number | null,
  taskIds: number[],
) {
  if (taskIds.length === 0) return;
  const userId = await requireUserId();
  await db.transaction(async (tx) => {
    for (let i = 0; i < taskIds.length; i++) {
      await tx
        .update(tasks)
        .set({
          bucket,
          bucketOrder: (i + 1) * 100,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, taskIds[i]), eq(tasks.userId, userId)));
    }
  });
  refresh();
}

// ---------- CERRAR SEMANA ----------

export type CerrarSemanaPreview = {
  doneEstaSemana: number;
  tareasAgregadas: number;
  pendientesActuales: number;
  pendientesUltimoCierre: number | null;
  diffPctVsUltimo: number | null; // positive = more pending now (red), negative = less (green)
  mvp: { nombre: string; count: number } | null;
  masVieja: { titulo: string; dias: number } | null;
  masRapida: { titulo: string; dias: number } | null;
  habitMetrics: HabitWeekMetric[];
};

export type HabitWeekMetric =
  | {
      habitoId: number;
      pregunta: string;
      tipo: "si_no";
      cells: ("si" | "no" | "skip" | "empty")[]; // 7 días, cronológico
      ratioActual: string; // "4/7"
      ratioAnterior: string | null;
    }
  | {
      habitoId: number;
      pregunta: string;
      tipo: "estrellas";
      promedio: number | null;
      delta: number | null;
      count: number;
    }
  | {
      habitoId: number;
      pregunta: string;
      tipo: "escala_1_10";
      promedio: number | null;
      delta: number | null;
      count: number;
    }
  | {
      habitoId: number;
      pregunta: string;
      tipo: "emocion";
      top3: { label: string; count: number }[];
      count: number;
    }
  | {
      habitoId: number;
      pregunta: string;
      tipo: "texto";
      respuestas: { fecha: string; texto: string }[];
    };

export async function getCerrarSemanaPreview(): Promise<CerrarSemanaPreview> {
  const userId = await requireUserId();
  const [doneRows, pendientesRow, [ultimoCierre], allResponsables] =
    await Promise.all([
      db
        .select({
          id: tasks.id,
          titulo: tasks.titulo,
          responsableId: tasks.responsableId,
          createdAt: tasks.createdAt,
          doneAt: tasks.doneAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            eq(tasks.estado, "done"),
            isNull(tasks.closedWeekAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), ne(tasks.estado, "done"))),
      db
        .select()
        .from(cierresSemana)
        .where(eq(cierresSemana.userId, userId))
        .orderBy(desc(cierresSemana.cerradoAt))
        .limit(1),
      db
        .select()
        .from(responsables)
        .where(eq(responsables.userId, userId)),
    ]);

  const pendientesActuales = pendientesRow[0]?.c ?? 0;
  const pendientesUltimoCierre = ultimoCierre?.pendientesAntes ?? null;
  const diffPctVsUltimo =
    pendientesUltimoCierre !== null && pendientesUltimoCierre > 0
      ? Math.round(
          ((pendientesActuales - pendientesUltimoCierre) /
            pendientesUltimoCierre) *
            100,
        )
      : null;

  // Tasks created since the previous cierre (or all tasks if never closed)
  const tareasAgregadasRow = ultimoCierre
    ? await db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            gt(tasks.createdAt, ultimoCierre.cerradoAt),
          ),
        )
    : await db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(eq(tasks.userId, userId));
  const tareasAgregadas = tareasAgregadasRow[0]?.c ?? 0;

  // MVP: responsable with most done this week
  const mvpMap = new Map<number, number>();
  for (const t of doneRows) {
    if (t.responsableId === null) continue;
    mvpMap.set(t.responsableId, (mvpMap.get(t.responsableId) ?? 0) + 1);
  }
  let mvp: CerrarSemanaPreview["mvp"] = null;
  let mvpId: number | null = null;
  let mvpCount = 0;
  for (const [id, c] of mvpMap) {
    if (c > mvpCount) {
      mvpId = id;
      mvpCount = c;
    }
  }
  if (mvpId !== null) {
    const r = allResponsables.find((r) => r.id === mvpId);
    if (r) mvp = { nombre: r.nombre, count: mvpCount };
  }

  // Oldest and fastest done (based on doneAt - createdAt)
  let masVieja: CerrarSemanaPreview["masVieja"] = null;
  let masRapida: CerrarSemanaPreview["masRapida"] = null;
  const msPerDay = 24 * 60 * 60 * 1000;
  for (const t of doneRows) {
    if (!t.doneAt || !t.createdAt) continue;
    const diff = Math.max(
      0,
      Math.round((t.doneAt.getTime() - t.createdAt.getTime()) / msPerDay),
    );
    if (!masVieja || diff > masVieja.dias) {
      masVieja = { titulo: t.titulo, dias: diff };
    }
    if (!masRapida || diff < masRapida.dias) {
      masRapida = { titulo: t.titulo, dias: diff };
    }
  }

  const habitMetrics = await computeHabitWeekMetrics(userId);

  return {
    doneEstaSemana: doneRows.length,
    tareasAgregadas,
    pendientesActuales,
    pendientesUltimoCierre,
    diffPctVsUltimo,
    mvp,
    masVieja,
    masRapida,
    habitMetrics,
  };
}

async function computeHabitWeekMetrics(
  userId: string,
): Promise<HabitWeekMetric[]> {
  const [settingsRow] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const tz = settingsRow?.timezone ?? "America/Montevideo";
  const now = new Date();
  const hoyISO = dateInTZ(now, tz);
  const semanaInicio = addDays(hoyISO, -6); // últimos 7 días incluyendo hoy
  const anteriorInicio = addDays(hoyISO, -13);
  const anteriorFin = addDays(hoyISO, -7);

  const allHabitos = await db
    .select()
    .from(habitos)
    .where(and(eq(habitos.userId, userId), eq(habitos.archivado, false)))
    .orderBy(asc(habitos.orden));

  if (allHabitos.length === 0) return [];

  const allEntries = await db
    .select()
    .from(habitoEntries)
    .where(
      and(
        eq(habitoEntries.userId, userId),
        sql`${habitoEntries.fecha} >= ${anteriorInicio}`,
        sql`${habitoEntries.fecha} <= ${hoyISO}`,
      ),
    );

  const byHabito = new Map<number, typeof allEntries>();
  for (const e of allEntries) {
    const arr = byHabito.get(e.habitoId) ?? [];
    arr.push(e);
    byHabito.set(e.habitoId, arr);
  }

  const out: HabitWeekMetric[] = [];
  for (const h of allHabitos) {
    const ents = byHabito.get(h.id) ?? [];
    const actual = ents.filter(
      (e) => e.fecha >= semanaInicio && e.fecha <= hoyISO,
    );
    const anterior = ents.filter(
      (e) => e.fecha >= anteriorInicio && e.fecha <= anteriorFin,
    );

    switch (h.tipo) {
      case "si_no": {
        const map = new Map<string, (typeof ents)[number]>();
        for (const e of actual) map.set(e.fecha, e);
        const cells: ("si" | "no" | "skip" | "empty")[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = addDays(hoyISO, -i);
          const e = map.get(d);
          if (!e) cells.push("empty");
          else if (e.skipped) cells.push("skip");
          else if (e.valor === "si") cells.push("si");
          else cells.push("no");
        }
        const conValor = actual.filter(
          (e) => !e.skipped && e.valor !== null,
        );
        const ratioActual = `${conValor.filter((e) => e.valor === "si").length}/${conValor.length}`;
        const antConValor = anterior.filter(
          (e) => !e.skipped && e.valor !== null,
        );
        const ratioAnterior =
          antConValor.length > 0
            ? `${antConValor.filter((e) => e.valor === "si").length}/${antConValor.length}`
            : null;
        out.push({
          habitoId: h.id,
          pregunta: h.pregunta,
          tipo: "si_no",
          cells,
          ratioActual,
          ratioAnterior,
        });
        break;
      }
      case "estrellas":
      case "escala_1_10": {
        const numActual = actual
          .filter((e) => !e.skipped && e.valor !== null)
          .map((e) => parseFloat(e.valor!))
          .filter((n) => !isNaN(n));
        const numAnterior = anterior
          .filter((e) => !e.skipped && e.valor !== null)
          .map((e) => parseFloat(e.valor!))
          .filter((n) => !isNaN(n));
        const promedio =
          numActual.length === 0
            ? null
            : Math.round(
                (numActual.reduce((a, b) => a + b, 0) / numActual.length) *
                  10,
              ) / 10;
        const promAnterior =
          numAnterior.length === 0
            ? null
            : numAnterior.reduce((a, b) => a + b, 0) / numAnterior.length;
        const delta =
          promedio !== null && promAnterior !== null
            ? Math.round((promedio - promAnterior) * 10) / 10
            : null;
        out.push({
          habitoId: h.id,
          pregunta: h.pregunta,
          tipo: h.tipo,
          promedio,
          delta,
          count: numActual.length,
        });
        break;
      }
      case "emocion": {
        const counts = new Map<string, number>();
        for (const e of actual) {
          if (e.skipped || !e.valor) continue;
          const label = (() => {
            const v = e.valor;
            if (v.startsWith("otro:")) return "Otro";
            return v;
          })();
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        const top3 = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([label, count]) => ({ label, count }));
        out.push({
          habitoId: h.id,
          pregunta: h.pregunta,
          tipo: "emocion",
          top3,
          count: [...counts.values()].reduce((a, b) => a + b, 0),
        });
        break;
      }
      case "texto": {
        const respuestas = actual
          .filter((e) => !e.skipped && e.valor)
          .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
          .map((e) => ({ fecha: e.fecha, texto: e.valor! }));
        out.push({
          habitoId: h.id,
          pregunta: h.pregunta,
          tipo: "texto",
          respuestas,
        });
        break;
      }
    }
  }
  return out;
}

export async function cerrarSemana() {
  const userId = await requireUserId();
  const ahora = new Date();
  // Snapshot active count BEFORE we do anything
  const [pendRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), ne(tasks.estado, "done")));
  const pendientesAntes = pendRow?.c ?? 0;

  await db.transaction(async (tx) => {
    // 1. Archive done tasks into Logradas
    const archived = await tx
      .update(tasks)
      .set({ closedWeekAt: ahora })
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.estado, "done"),
          isNull(tasks.closedWeekAt),
        ),
      )
      .returning({ id: tasks.id });

    // 2. Reset bucket on all active tasks (incluye in-flight)
    await tx
      .update(tasks)
      .set({ bucket: null, bucketOrder: 1000, updatedAt: ahora })
      .where(and(eq(tasks.userId, userId), ne(tasks.estado, "done")));

    // 3. Record the closure for next-week diff
    await tx.insert(cierresSemana).values({
      userId,
      cerradoAt: ahora,
      pendientesAntes,
      doneArchivadas: archived.length,
    });
  });
  refresh();
}

// ---------- RESPONSABLES ----------

export async function createResponsable(input: {
  nombre: string;
  color: string;
}) {
  const userId = await requireUserId();
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre no puede estar vacío");
  const [max] = await db
    .select({ max: sql<number>`coalesce(max(${responsables.orden}), -1)` })
    .from(responsables)
    .where(eq(responsables.userId, userId));
  await db.insert(responsables).values({
    userId,
    nombre,
    color: input.color || "#cccccc",
    orden: (max?.max ?? -1) + 1,
  });
  refresh();
}

export async function updateResponsable(input: {
  id: number;
  nombre?: string;
  color?: string;
}) {
  const userId = await requireUserId();
  const set: Partial<typeof responsables.$inferInsert> = {};
  if (input.nombre !== undefined) {
    const n = input.nombre.trim();
    if (!n) throw new Error("El nombre no puede estar vacío");
    set.nombre = n;
  }
  if (input.color !== undefined) set.color = input.color;
  await db
    .update(responsables)
    .set(set)
    .where(and(eq(responsables.id, input.id), eq(responsables.userId, userId)));
  refresh();
}

export async function deleteResponsable(id: number) {
  const userId = await requireUserId();
  await db
    .delete(responsables)
    .where(and(eq(responsables.id, id), eq(responsables.userId, userId)));
  refresh();
}

// ---------- HELPERS ----------

async function countInFlight(userId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.inFlight, true)));
  return row?.c ?? 0;
}

async function nextInFlightOrder(userId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.inFlightOrder}), 0)` })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.inFlight, true)));
  return (row?.max ?? 0) + 100;
}

async function nextBucketOrder(
  userId: string,
  bucket: number | null,
): Promise<number> {
  // El "fondo" del bucket es el max bucketOrder entre todas las tareas activas
  // (no-done) del bucket — incluye in-flight, porque la vista de SB las muestra
  // ordenadas junto al resto.
  const bucketWhere =
    bucket === null ? isNull(tasks.bucket) : eq(tasks.bucket, bucket);
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.bucketOrder}), 0)` })
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), bucketWhere, ne(tasks.estado, "done")),
    );
  return (row?.max ?? 0) + 100;
}
