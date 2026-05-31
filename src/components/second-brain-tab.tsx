"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, Search, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { SBBucket } from "@/components/sb-bucket";
import { LogradasSection } from "@/components/logradas-section";
import { LogradaInfoDialog } from "@/components/lograda-info-dialog";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { QuickBucketDialog } from "@/components/quick-bucket-dialog";
import { CerrarSemanaDialog } from "@/components/cerrar-semana-dialog";
import { bucketLabel } from "@/lib/buckets";
import { normalizeForSearch } from "@/lib/utils";

const PERMANENT_BUCKETS = [0, 1, 2, 3];
const CELEBRATION_MS = 1600;
import { markDone, reorderBucket, unmarkDone, updateTask } from "@/app/actions";
import type { Responsable, Task } from "@/db/schema";

type BucketKey = string; // "bucket:0" | "bucket:none" | "bucket:1" | "done" | "logradas"

function bucketKey(n: number | null): BucketKey {
  return n === null ? "bucket:none" : `bucket:${n}`;
}

function parseBucketKey(key: BucketKey): number | null | "done" | "logradas" {
  if (key === "done") return "done";
  if (key === "logradas") return "logradas";
  if (key === "bucket:none") return null;
  return Number(key.replace("bucket:", ""));
}

type OptimisticAction =
  | { type: "reorder"; bucket: number | null; ids: number[] }
  | { type: "move"; taskId: number; toBucket: number | null }
  | { type: "toggleDone"; taskId: number; done: boolean };

function applyOptimistic(tasks: Task[], a: OptimisticAction): Task[] {
  switch (a.type) {
    case "reorder": {
      const orderMap = new Map<number, number>();
      a.ids.forEach((id, i) => orderMap.set(id, (i + 1) * 100));
      return tasks.map((t) => {
        const next = orderMap.get(t.id);
        if (next === undefined) return t;
        return { ...t, bucket: a.bucket, bucketOrder: next };
      });
    }
    case "move": {
      let maxOrder = 0;
      for (const t of tasks) {
        if (
          t.id !== a.taskId &&
          t.bucket === a.toBucket &&
          t.estado !== "done" &&
          t.bucketOrder > maxOrder
        ) {
          maxOrder = t.bucketOrder;
        }
      }
      return tasks.map((t) =>
        t.id === a.taskId
          ? { ...t, bucket: a.toBucket, bucketOrder: maxOrder + 100 }
          : t,
      );
    }
    case "toggleDone": {
      return tasks.map((t) =>
        t.id === a.taskId
          ? a.done
            ? { ...t, estado: "done", doneAt: t.doneAt ?? new Date() }
            : { ...t, estado: "pendiente", doneAt: null }
          : t,
      );
    }
  }
}

export function SecondBrainTab({
  tasks,
  responsables,
}: {
  tasks: Task[];
  responsables: Responsable[];
}) {
  const [optimisticTasks, addOptimistic] = useOptimistic(
    tasks,
    applyOptimistic,
  );

  const [showLogradas, setShowLogradas] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedBuckets, setCollapsedBuckets] = useState<
    Record<string, boolean>
  >({});
  const toggleBucket = (key: string) =>
    setCollapsedBuckets((prev) => ({ ...prev, [key]: !prev[key] }));
  const [editing, setEditing] = useState<Task | null>(null);
  const [viewingLograda, setViewingLograda] = useState<Task | null>(null);
  const [creating, setCreating] = useState<{ bucket: number | null } | null>(
    null,
  );
  const [quickBucketTask, setQuickBucketTask] = useState<Task | null>(null);
  const [cerrarSemanaOpen, setCerrarSemanaOpen] = useState(false);
  const [overBucketKey, setOverBucketKey] = useState<BucketKey | null>(null);
  const [activeBucketKey, setActiveBucketKey] = useState<BucketKey | null>(
    null,
  );
  const [celebratingIds, setCelebratingIds] = useState<Set<number>>(
    () => new Set(),
  );
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  useEffect(() => () => {
    for (const t of timersRef.current.values()) clearTimeout(t);
  }, []);
  const [, startTransition] = useTransition();

  // Filtro de búsqueda: matchea LIKE %query% sobre titulo + detalle, case
  // insensitive y con tildes normalizadas. Si query vacío, no filtra.
  const filteredTasks = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (!q) return optimisticTasks;
    return optimisticTasks.filter((t) => {
      const hayTitulo = normalizeForSearch(t.titulo).includes(q);
      const hayDetalle = t.detalle
        ? normalizeForSearch(t.detalle).includes(q)
        : false;
      return hayTitulo || hayDetalle;
    });
  }, [optimisticTasks, query]);

  // Group tasks into buckets/done/logradas.
  // Tasks currently celebrating stay in their source bucket even though their
  // optimistic estado is "done" — that way the stamp/confetti animate in place
  // instead of teleporting the card to the Done section out of view.
  const grouped = useMemo(() => {
    const active = filteredTasks.filter(
      (t) => t.estado !== "done" || celebratingIds.has(t.id),
    );
    const done = filteredTasks
      .filter(
        (t) =>
          t.estado === "done" &&
          t.closedWeekAt === null &&
          !celebratingIds.has(t.id),
      )
      .sort(
        (a, b) =>
          (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0),
      );
    const logradas = filteredTasks
      .filter((t) => t.estado === "done" && t.closedWeekAt !== null)
      .sort(
        (a, b) =>
          (b.closedWeekAt?.getTime() ?? 0) -
          (a.closedWeekAt?.getTime() ?? 0),
      );

    const bucketMap = new Map<number | null, Task[]>();
    bucketMap.set(null, []);
    // Permanent buckets always present, even when empty
    for (const n of PERMANENT_BUCKETS) bucketMap.set(n, []);
    for (const t of active) {
      const b = t.bucket;
      if (!bucketMap.has(b)) bucketMap.set(b, []);
      bucketMap.get(b)!.push(t);
    }
    for (const arr of bucketMap.values()) {
      arr.sort((a, b) => a.bucketOrder - b.bucketOrder);
    }

    const bucketNumbers = [...bucketMap.keys()]
      .filter((k): k is number => k !== null)
      .sort((a, b) => a - b);

    return { bucketMap, bucketNumbers, done, logradas };
  }, [filteredTasks, celebratingIds]);

  const existingBuckets = grouped.bucketNumbers;

  // Cuántas tareas hay activas (no done) marcadas como in-flight. Si está al
  // cap, deshabilitamos el botón "Promover a Foco" en las task cards para
  // no llamar al server y evitar el error overlay feo.
  const FOCO_LIMIT = 6;
  const inFocoCount = optimisticTasks.filter(
    (t) => t.inFlight && t.estado !== "done",
  ).length;
  const focoLimitReached = inFocoCount >= FOCO_LIMIT;

  // Build ordered sections
  type Section =
    | { kind: "bucket"; bucket: number | null; title: string; subtitle?: string; key: BucketKey }
    | { kind: "done"; key: "done" }
    | { kind: "logradas"; key: "logradas" };

  const sections: Section[] = [];
  if (grouped.bucketMap.has(0)) {
    sections.push({
      kind: "bucket",
      bucket: 0,
      title: bucketLabel(0),
      key: "bucket:0",
    });
  }
  const sinDefinirCount = grouped.bucketMap.get(null)?.length ?? 0;
  const sinDefinirSection: Section = {
    kind: "bucket",
    bucket: null,
    title: bucketLabel(null),
    key: "bucket:none",
  };
  // Sin definir va arriba si tiene tareas; si está vacío, al fondo (después
  // de los buckets numerados) para no estorbar.
  if (sinDefinirCount > 0) {
    sections.push(sinDefinirSection);
  }
  for (const n of grouped.bucketNumbers) {
    if (n === 0) continue;
    sections.push({
      kind: "bucket",
      bucket: n,
      title: bucketLabel(n),
      key: `bucket:${n}`,
    });
  }
  if (sinDefinirCount === 0) {
    sections.push(sinDefinirSection);
  }
  sections.push({ kind: "done", key: "done" });
  sections.push({ kind: "logradas", key: "logradas" });

  // Drag handlers
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findContainerOfTask(taskId: number): number | null | "done" | "logradas" | undefined {
    for (const [b, arr] of grouped.bucketMap) {
      if (arr.find((t) => t.id === taskId)) return b;
    }
    if (grouped.done.find((t) => t.id === taskId)) return "done";
    if (grouped.logradas.find((t) => t.id === taskId)) return "logradas";
    return undefined;
  }

  function resolveOverBucket(overId: string): BucketKey | null {
    if (overId.startsWith("bucket:") || overId === "done" || overId === "logradas") {
      return overId;
    }
    const overTaskId = Number(overId);
    const container = findContainerOfTask(overTaskId);
    if (container === undefined) return null;
    if (container === "done" || container === "logradas") return container;
    return bucketKey(container);
  }

  function handleDragStart(e: DragStartEvent) {
    const taskId = Number(e.active.id);
    const src = findContainerOfTask(taskId);
    if (src === undefined || src === "done" || src === "logradas") {
      setActiveBucketKey(null);
    } else {
      setActiveBucketKey(bucketKey(src));
    }
  }

  function handleDragOver(e: DragOverEvent) {
    if (!e.over) {
      setOverBucketKey(null);
      return;
    }
    const target = resolveOverBucket(String(e.over.id));
    setOverBucketKey(target);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setOverBucketKey(null);
    setActiveBucketKey(null);
    if (!over) return;
    const taskId = Number(active.id);
    const sourceBucket = findContainerOfTask(taskId);
    if (sourceBucket === undefined) return;
    if (sourceBucket === "done" || sourceBucket === "logradas") return;

    const overIdStr = String(over.id);
    const targetKey = resolveOverBucket(overIdStr);
    if (!targetKey || targetKey === "done" || targetKey === "logradas") return;

    const parsedTarget = parseBucketKey(targetKey);
    if (parsedTarget === "done" || parsedTarget === "logradas") return;
    const targetBucket = parsedTarget as number | null;

    if (sourceBucket === targetBucket) {
      // Same bucket: respect the drop position relative to the task we dropped on
      const arr = grouped.bucketMap.get(targetBucket) ?? [];
      const ids = arr.map((t) => t.id);
      const srcIdx = ids.indexOf(taskId);
      if (srcIdx === -1) return;
      let dropIdx: number;
      if (overIdStr.startsWith("bucket:")) {
        dropIdx = ids.length - 1;
      } else {
        dropIdx = ids.indexOf(Number(overIdStr));
        if (dropIdx === -1) dropIdx = ids.length - 1;
      }
      if (srcIdx === dropIdx) return;
      ids.splice(srcIdx, 1);
      ids.splice(dropIdx, 0, taskId);
      startTransition(async () => {
        addOptimistic({ type: "reorder", bucket: targetBucket, ids });
        try {
          await reorderBucket(targetBucket, ids);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        }
      });
    } else {
      // Cross-bucket: misma ruta que quick-bucket — manda al fondo del destino.
      startTransition(async () => {
        addOptimistic({ type: "move", taskId, toBucket: targetBucket });
        try {
          await updateTask({ id: taskId, bucket: targetBucket });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        }
      });
    }
  }

  function handleToggleDone(taskId: number, next: boolean) {
    if (!next) {
      startTransition(async () => {
        addOptimistic({ type: "toggleDone", taskId, done: false });
        try {
          await unmarkDone(taskId);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        }
      });
      return;
    }
    setCelebratingIds((s) => {
      const n = new Set(s);
      n.add(taskId);
      return n;
    });
    startTransition(async () => {
      addOptimistic({ type: "toggleDone", taskId, done: true });
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timersRef.current.delete(taskId);
          resolve();
        }, CELEBRATION_MS);
        timersRef.current.set(taskId, t);
      });
      try {
        await markDone(taskId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      } finally {
        setCelebratingIds((s) => {
          const n = new Set(s);
          n.delete(taskId);
          return n;
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            // type="text" en lugar de "search" para evitar el botón X nativo
            // del browser, que duplicaría nuestro botón custom de limpiar.
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tareas…"
            className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-8 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:placeholder:text-neutral-600"
            aria-label="Buscar tareas"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCerrarSemanaOpen(true)}
        >
          <CheckCheck size={14} /> Cerrar semana
        </Button>
      </div>

      <DndContext
        id="dnd-sb"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setOverBucketKey(null);
          setActiveBucketKey(null);
        }}
      >
        <div className="space-y-5">
          {sections.map((s) => {
            if (s.kind === "bucket") {
              const tasksInBucket = grouped.bucketMap.get(s.bucket) ?? [];
              const isOtherBucketHover =
                overBucketKey === s.key &&
                activeBucketKey !== null &&
                activeBucketKey !== s.key;
              const collapsed = !!collapsedBuckets[s.key];
              const isSinDefinir = s.bucket === null;
              const urgencyTier = isSinDefinir
                ? tasksInBucket.length >= 5
                  ? "alarm"
                  : tasksInBucket.length > 3
                    ? "warn"
                    : undefined
                : undefined;
              return (
                <SBBucket
                  key={s.key}
                  id={s.key}
                  title={s.title}
                  count={tasksInBucket.length}
                  taskIds={tasksInBucket.map((t) => t.id)}
                  tasks={tasksInBucket}
                  responsables={responsables}
                  isBucketZero={s.bucket === 0}
                  urgencyTier={urgencyTier}
                  onClickTask={(t) => setEditing(t)}
                  onChangeBucket={(t) => setQuickBucketTask(t)}
                  onToggleDone={handleToggleDone}
                  celebratingIds={celebratingIds}
                  onAddTask={() => setCreating({ bucket: s.bucket })}
                  highlight={isOtherBucketHover}
                  collapsible
                  collapsed={collapsed}
                  onToggleCollapse={() => toggleBucket(s.key)}
                  focoLimitReached={focoLimitReached}
                />
              );
            }
            if (s.kind === "done") {
              const collapsed = !!collapsedBuckets["done"];
              return (
                <SBBucket
                  key="done"
                  id="done"
                  title="Done"
                  count={grouped.done.length}
                  subtitle="esta semana"
                  taskIds={grouped.done.map((t) => t.id)}
                  tasks={grouped.done}
                  responsables={responsables}
                  onClickTask={(t) => setEditing(t)}
                  onToggleDone={handleToggleDone}
                  celebratingIds={celebratingIds}
                  collapsible
                  collapsed={collapsed}
                  onToggleCollapse={() => toggleBucket("done")}
                />
              );
            }
            return (
              <LogradasSection
                key="logradas"
                tasks={grouped.logradas}
                responsables={responsables}
                collapsed={!showLogradas}
                onToggleCollapse={() => setShowLogradas((s) => !s)}
                onClickTask={(t) => setViewingLograda(t)}
              />
            );
          })}
        </div>
      </DndContext>

      {editing && (
        <TaskFormDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          mode={{ kind: "edit", task: editing }}
          responsables={responsables}
          existingBuckets={existingBuckets}
        />
      )}
      {creating && (
        <TaskFormDialog
          open={!!creating}
          onOpenChange={(o) => !o && setCreating(null)}
          mode={{ kind: "create", defaults: { bucket: creating.bucket } }}
          responsables={responsables}
          existingBuckets={existingBuckets}
        />
      )}
      {viewingLograda && (
        <LogradaInfoDialog
          open={!!viewingLograda}
          onOpenChange={(o) => !o && setViewingLograda(null)}
          task={viewingLograda}
          responsable={responsables.find(
            (r) => r.id === viewingLograda.responsableId,
          )}
        />
      )}
      {quickBucketTask && (
        <QuickBucketDialog
          open={!!quickBucketTask}
          onOpenChange={(o) => !o && setQuickBucketTask(null)}
          taskId={quickBucketTask.id}
          currentBucket={quickBucketTask.bucket}
          existingBuckets={existingBuckets}
        />
      )}
      {cerrarSemanaOpen && (
        <CerrarSemanaDialog
          open={cerrarSemanaOpen}
          onOpenChange={setCerrarSemanaOpen}
        />
      )}
    </div>
  );
}
