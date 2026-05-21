"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  responsables,
  tasks,
  type Estado,
  type Task,
} from "@/db/schema";

const IN_FLIGHT_LIMIT = 6;

function refresh() {
  revalidatePath("/");
  revalidatePath("/settings");
}

// ---------- READ ----------

export async function getAllData() {
  const [allTasks, allResponsables] = await Promise.all([
    db.select().from(tasks).orderBy(asc(tasks.bucketOrder)),
    db.select().from(responsables).orderBy(asc(responsables.orden)),
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
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error("El título no puede estar vacío");

  if (input.inFlight) {
    const count = await countInFlight();
    if (count >= IN_FLIGHT_LIMIT) {
      throw new Error(`Llegaste al máximo de ${IN_FLIGHT_LIMIT} tareas en in-flight`);
    }
  }

  const inFlightOrder = input.inFlight ? await nextInFlightOrder() : null;
  const bucketOrder = await nextBucketOrder(input.bucket ?? null);

  const [created] = await db
    .insert(tasks)
    .values({
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
    set.bucket = input.bucket;
    set.bucketOrder = await nextBucketOrder(input.bucket);
  }

  const [updated] = await db
    .update(tasks)
    .set(set)
    .where(eq(tasks.id, input.id))
    .returning();
  refresh();
  return updated;
}

export async function deleteTask(id: number) {
  await db.delete(tasks).where(eq(tasks.id, id));
  refresh();
}

// ---------- IN-FLIGHT MOVEMENT ----------

export async function moveToSecondBrain(id: number, bucket: number | null) {
  // Tarea sale de in-flight, queda en SB con bucket (o null = "Sin definir")
  const newBucketOrder = await nextBucketOrder(bucket);
  await db
    .update(tasks)
    .set({
      inFlight: false,
      inFlightOrder: null,
      bucket,
      bucketOrder: newBucketOrder,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));
  refresh();
}

export async function promoteToInFlight(id: number) {
  const count = await countInFlight();
  if (count >= IN_FLIGHT_LIMIT) {
    throw new Error(`Llegaste al máximo de ${IN_FLIGHT_LIMIT} tareas en in-flight`);
  }
  const order = await nextInFlightOrder();
  await db
    .update(tasks)
    .set({ inFlight: true, inFlightOrder: order, updatedAt: new Date() })
    .where(eq(tasks.id, id));
  refresh();
}

export async function markDone(id: number) {
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
    .where(eq(tasks.id, id));
  refresh();
}

export async function unmarkDone(id: number) {
  await db
    .update(tasks)
    .set({
      estado: "pendiente",
      doneAt: null,
      closedWeekAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));
  refresh();
}

// ---------- REORDER ----------

/**
 * Reorder within in-flight. taskIds is the full ordered list of in-flight task ids.
 */
export async function reorderInFlight(taskIds: number[]) {
  if (taskIds.length === 0) return;
  // Set order as (index+1)*100 so insertions later have room
  await db.transaction(async (tx) => {
    for (let i = 0; i < taskIds.length; i++) {
      await tx
        .update(tasks)
        .set({ inFlightOrder: (i + 1) * 100, updatedAt: new Date() })
        .where(eq(tasks.id, taskIds[i]));
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
  await db.transaction(async (tx) => {
    for (let i = 0; i < taskIds.length; i++) {
      await tx
        .update(tasks)
        .set({
          bucket,
          bucketOrder: (i + 1) * 100,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskIds[i]));
    }
  });
  refresh();
}

/** Move a task to a specific position (0-indexed) in a target bucket. */
export async function moveTaskToBucketPosition(
  taskId: number,
  targetBucket: number | null,
  position: number,
) {
  // Get current ordering of target bucket excluding the task being moved
  const inBucket = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        targetBucket === null
          ? isNull(tasks.bucket)
          : eq(tasks.bucket, targetBucket),
        eq(tasks.inFlight, false),
        // Exclude done so it doesn't mix with active tasks ordering
      ),
    )
    .orderBy(asc(tasks.bucketOrder));

  const ids = inBucket.map((r) => r.id).filter((id) => id !== taskId);
  const clamped = Math.max(0, Math.min(position, ids.length));
  ids.splice(clamped, 0, taskId);
  await reorderBucket(targetBucket, ids);
}

// ---------- CERRAR SEMANA ----------

export async function cerrarSemana() {
  await db
    .update(tasks)
    .set({ closedWeekAt: new Date() })
    .where(
      and(eq(tasks.estado, "done"), isNull(tasks.closedWeekAt)),
    );
  refresh();
}

// ---------- RESPONSABLES ----------

export async function createResponsable(input: {
  nombre: string;
  color: string;
}) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre no puede estar vacío");
  const [max] = await db
    .select({ max: sql<number>`coalesce(max(${responsables.orden}), -1)` })
    .from(responsables);
  await db.insert(responsables).values({
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
  const set: Partial<typeof responsables.$inferInsert> = {};
  if (input.nombre !== undefined) {
    const n = input.nombre.trim();
    if (!n) throw new Error("El nombre no puede estar vacío");
    set.nombre = n;
  }
  if (input.color !== undefined) set.color = input.color;
  await db.update(responsables).set(set).where(eq(responsables.id, input.id));
  refresh();
}

export async function deleteResponsable(id: number) {
  await db.delete(responsables).where(eq(responsables.id, id));
  refresh();
}

// ---------- HELPERS ----------

async function countInFlight(): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.inFlight, true));
  return row?.c ?? 0;
}

async function nextInFlightOrder(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.inFlightOrder}), 0)` })
    .from(tasks)
    .where(eq(tasks.inFlight, true));
  return (row?.max ?? 0) + 100;
}

async function nextBucketOrder(bucket: number | null): Promise<number> {
  const where =
    bucket === null
      ? and(isNull(tasks.bucket), eq(tasks.inFlight, false))
      : and(eq(tasks.bucket, bucket), eq(tasks.inFlight, false));
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.bucketOrder}), 0)` })
    .from(tasks)
    .where(where);
  return (row?.max ?? 0) + 100;
}
