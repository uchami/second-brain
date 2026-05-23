"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { signOut as authkitSignOut } from "@workos-inc/authkit-nextjs";
import { db } from "@/db/client";
import {
  cierresSemana,
  responsables,
  tasks,
  type Estado,
  type Task,
} from "@/db/schema";
import { requireUserId } from "@/lib/auth";

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

export async function getAllData() {
  const userId = await requireUserId();
  const [allTasks, allResponsables] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(asc(tasks.bucketOrder)),
    db
      .select()
      .from(responsables)
      .where(eq(responsables.userId, userId))
      .orderBy(asc(responsables.orden)),
  ]);
  return { tasks: allTasks, responsables: allResponsables };
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

  return {
    doneEstaSemana: doneRows.length,
    tareasAgregadas,
    pendientesActuales,
    pendientesUltimoCierre,
    diffPctVsUltimo,
    mvp,
    masVieja,
    masRapida,
  };
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
