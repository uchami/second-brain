"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { SBBucket } from "@/components/sb-bucket";
import { LogradasSection } from "@/components/logradas-section";
import { TaskFormDialog } from "@/components/task-form-dialog";
import {
  cerrarSemana,
  moveTaskToBucketPosition,
  reorderBucket,
} from "@/app/actions";
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

export function SecondBrainTab({
  tasks,
  responsables,
}: {
  tasks: Task[];
  responsables: Responsable[];
}) {
  const [showLogradas, setShowLogradas] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState<{ bucket: number | null } | null>(
    null,
  );
  const [, startTransition] = useTransition();

  // Group tasks into buckets/done/logradas
  const grouped = useMemo(() => {
    const active = tasks.filter((t) => t.estado !== "done");
    const done = tasks
      .filter((t) => t.estado === "done" && t.closedWeekAt === null)
      .sort(
        (a, b) =>
          (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0),
      );
    const logradas = tasks
      .filter((t) => t.estado === "done" && t.closedWeekAt !== null)
      .sort(
        (a, b) =>
          (b.closedWeekAt?.getTime() ?? 0) -
          (a.closedWeekAt?.getTime() ?? 0),
      );

    const bucketMap = new Map<number | null, Task[]>();
    bucketMap.set(null, []);
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
  }, [tasks]);

  const existingBuckets = grouped.bucketNumbers;

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
      title: "Bucket 0",
      key: "bucket:0",
    });
  }
  sections.push({
    kind: "bucket",
    bucket: null,
    title: "Sin definir",
    key: "bucket:none",
  });
  for (const n of grouped.bucketNumbers) {
    if (n === 0) continue;
    sections.push({
      kind: "bucket",
      bucket: n,
      title: `Bucket ${n}`,
      key: `bucket:${n}`,
    });
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

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const taskId = Number(active.id);
    const sourceBucket = findContainerOfTask(taskId);
    if (sourceBucket === "done" || sourceBucket === "logradas") return;

    // over.id can be a task id (when dropped on a task) or a bucket key (when dropped on container)
    const overIdStr = String(over.id);
    let targetBucket: number | null;
    let targetIndex: number;

    if (overIdStr.startsWith("bucket:")) {
      const parsed = parseBucketKey(overIdStr);
      if (parsed === "done" || parsed === "logradas") return;
      targetBucket = parsed as number | null;
      const targetArr = grouped.bucketMap.get(targetBucket) ?? [];
      targetIndex = targetArr.length;
    } else {
      const overTaskId = Number(over.id);
      const targetContainer = findContainerOfTask(overTaskId);
      if (
        targetContainer === undefined ||
        targetContainer === "done" ||
        targetContainer === "logradas"
      )
        return;
      targetBucket = targetContainer;
      const arr = grouped.bucketMap.get(targetBucket) ?? [];
      const idx = arr.findIndex((t) => t.id === overTaskId);
      targetIndex = idx;
      // If same bucket and moving down, adjust
      if (sourceBucket === targetBucket) {
        const srcIdx = arr.findIndex((t) => t.id === taskId);
        if (srcIdx !== -1 && srcIdx < idx) {
          targetIndex = idx;
        } else {
          targetIndex = idx;
        }
      }
    }

    if (sourceBucket === targetBucket) {
      // Reorder within same bucket
      const arr = grouped.bucketMap.get(targetBucket) ?? [];
      const ids = arr.map((t) => t.id);
      const srcIdx = ids.indexOf(taskId);
      if (srcIdx === -1) return;
      ids.splice(srcIdx, 1);
      const insertAt = Math.max(0, Math.min(targetIndex, ids.length));
      ids.splice(insertAt, 0, taskId);
      startTransition(() => {
        reorderBucket(targetBucket, ids).catch((err) => toast.error(err.message));
      });
    } else {
      // Cross-bucket
      startTransition(() => {
        moveTaskToBucketPosition(taskId, targetBucket, targetIndex).catch((err) =>
          toast.error(err.message),
        );
      });
    }
  }

  // Mobile reorder
  function moveUp(taskId: number, key: string) {
    const parsed = parseBucketKey(key);
    if (parsed === "done" || parsed === "logradas") return;
    const arr = grouped.bucketMap.get(parsed as number | null) ?? [];
    const idx = arr.findIndex((t) => t.id === taskId);
    if (idx <= 0) return;
    const ids = arr.map((t) => t.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    startTransition(() => {
      reorderBucket(parsed as number | null, ids).catch((err) =>
        toast.error(err.message),
      );
    });
  }
  function moveDown(taskId: number, key: string) {
    const parsed = parseBucketKey(key);
    if (parsed === "done" || parsed === "logradas") return;
    const arr = grouped.bucketMap.get(parsed as number | null) ?? [];
    const idx = arr.findIndex((t) => t.id === taskId);
    if (idx === -1 || idx >= arr.length - 1) return;
    const ids = arr.map((t) => t.id);
    [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
    startTransition(() => {
      reorderBucket(parsed as number | null, ids).catch((err) =>
        toast.error(err.message),
      );
    });
  }

  function handleCerrarSemana() {
    if (grouped.done.length === 0) {
      toast.info("No hay tareas done que cerrar");
      return;
    }
    if (
      !confirm(
        `Cerrar semana? ${grouped.done.length} tarea(s) pasan a Logradas`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await cerrarSemana();
        toast.success("Semana cerrada");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCerrarSemana}
          disabled={grouped.done.length === 0}
        >
          <CheckCheck size={14} /> Cerrar semana
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-5">
          {sections.map((s) => {
            if (s.kind === "bucket") {
              const tasksInBucket = grouped.bucketMap.get(s.bucket) ?? [];
              return (
                <SBBucket
                  key={s.key}
                  id={s.key}
                  title={s.title}
                  taskIds={tasksInBucket.map((t) => t.id)}
                  tasks={tasksInBucket}
                  responsables={responsables}
                  onClickTask={(t) => setEditing(t)}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                  onAddTask={() => setCreating({ bucket: s.bucket })}
                />
              );
            }
            if (s.kind === "done") {
              return (
                <SBBucket
                  key="done"
                  id="done"
                  title="Done"
                  subtitle="esta semana"
                  taskIds={grouped.done.map((t) => t.id)}
                  tasks={grouped.done}
                  responsables={responsables}
                  onClickTask={(t) => setEditing(t)}
                  onMoveUp={() => {}}
                  onMoveDown={() => {}}
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
                onClickTask={(t) => setEditing(t)}
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
    </div>
  );
}
