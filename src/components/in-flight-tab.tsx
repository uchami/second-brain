"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskCard, type TaskHighlightTier } from "@/components/task-card";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { markDone, moveToSecondBrain, unmarkDone } from "@/app/actions";
import { bucketLabel } from "@/lib/buckets";
import type { Responsable, Task } from "@/db/schema";

const IN_FLIGHT_LIMIT = 6;
// How long the "¡Logrado!" celebration runs before the server actually
// gets called. Long enough to feel rewarding, short enough to not annoy.
const CELEBRATION_MS = 1600;

/**
 * Sort key: bucket 0 first, then null (Sin definir), then 1, 2, 3...
 * Mirrors the SB tab section order.
 */
function bucketSortKey(b: number | null): number {
  if (b === 0) return -Infinity;
  if (b === null) return -1;
  return b;
}

type OptimisticAction = { type: "toggleDone"; taskId: number; done: boolean };

function applyOptimistic(tasks: Task[], a: OptimisticAction): Task[] {
  if (a.type === "toggleDone") {
    return tasks.map((t) =>
      t.id === a.taskId
        ? a.done
          ? { ...t, estado: "done", doneAt: t.doneAt ?? new Date() }
          : { ...t, estado: "pendiente", doneAt: null }
        : t,
    );
  }
  return tasks;
}

export function InFlightTab({
  tasks,
  responsables,
  existingBuckets,
}: {
  tasks: Task[];
  responsables: Responsable[];
  existingBuckets: number[];
}) {
  const [optimisticTasks, addOptimistic] = useOptimistic(tasks, applyOptimistic);

  // Active (non-done) tasks grouped by bucket — used for both the position
  // badge ("1/7") and to find bucket 0's top for the warning banner.
  // We use the SERVER tasks (not optimistic) for the badge/banner so that an
  // optimistic "done" doesn't flicker the bucket counts mid-flight.
  const bucketPositions = new Map<number, { label: string; position: number; total: number }>();
  const byBucket = new Map<number | null, Task[]>();
  for (const t of tasks) {
    if (t.estado === "done") continue;
    const arr = byBucket.get(t.bucket) ?? [];
    arr.push(t);
    byBucket.set(t.bucket, arr);
  }
  for (const [b, arr] of byBucket) {
    arr.sort((a, b) => a.bucketOrder - b.bucketOrder);
    arr.forEach((t, i) => {
      bucketPositions.set(t.id, {
        label: bucketLabel(b),
        position: i + 1,
        total: arr.length,
      });
    });
  }

  // In-flight, sorted by (bucket sort key, bucket_order). Reads from
  // optimisticTasks so a "done" tick keeps the card in place with strike-
  // through until the server roundtrip removes it from in-flight.
  const inFlight = optimisticTasks
    .filter((t) => t.inFlight)
    .sort((a, b) => {
      const ka = bucketSortKey(a.bucket);
      const kb = bucketSortKey(b.bucket);
      if (ka !== kb) return ka - kb;
      return a.bucketOrder - b.bucketOrder;
    });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [celebratingIds, setCelebratingIds] = useState<Set<number>>(
    () => new Set(),
  );
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => () => {
    for (const t of timersRef.current.values()) clearTimeout(t);
  }, []);
  const [, startTransition] = useTransition();

  function handleSendToSB(taskId: number) {
    startTransition(async () => {
      try {
        await moveToSecondBrain(taskId);
        toast.success("Tarea mandada al second brain");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
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
    // Celebrate first, then actually mark done. The optimistic state keeps
    // the card visible (with stamp + confetti) while the timer runs.
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

  const atLimit = inFlight.length >= IN_FLIGHT_LIMIT;

  const bucketZero = byBucket.get(0) ?? [];
  const topPriority = bucketZero[0];
  const showTopMissingBanner = !!topPriority && !topPriority.inFlight;

  function tierFor(taskId: number): TaskHighlightTier | undefined {
    const idx = bucketZero.findIndex((t) => t.id === taskId);
    if (idx === 0) return "top";
    if (idx > 0 && idx <= 3) return "near-top";
    return undefined;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {inFlight.length} / {IN_FLIGHT_LIMIT} tareas
        </h2>
        <Button
          size="sm"
          onClick={() => {
            if (atLimit) {
              toast.error(`Llegaste al máximo de ${IN_FLIGHT_LIMIT}`);
              return;
            }
            setCreateOpen(true);
          }}
          disabled={atLimit}
        >
          <Plus size={14} /> Nueva
        </Button>
      </div>

      {inFlight.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Sin tareas en vuelo. Toca "+ Nueva" para arrancar.
        </p>
      ) : (
        <div className="space-y-2">
          {inFlight.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              responsable={responsables.find(
                (r) => r.id === task.responsableId,
              )}
              context="in-flight"
              highlightTier={tierFor(task.id)}
              bucketBadge={bucketPositions.get(task.id)}
              onClickTask={() => setEditing(task)}
              onSendToSB={() => handleSendToSB(task.id)}
              onToggleDone={(next) => handleToggleDone(task.id, next)}
              celebrating={celebratingIds.has(task.id)}
            />
          ))}
        </div>
      )}

      {showTopMissingBanner && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">¡Ojo! No estás haciendo la cosa más importante.</p>
            <p className="mt-0.5 text-xs opacity-80">
              {topPriority.titulo}
            </p>
          </div>
        </div>
      )}

      {createOpen && (
        <TaskFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode={{ kind: "create", defaults: { inFlight: true } }}
          responsables={responsables}
          existingBuckets={existingBuckets}
        />
      )}

      {editing && (
        <TaskFormDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          mode={{ kind: "edit", task: editing }}
          responsables={responsables}
          existingBuckets={existingBuckets}
        />
      )}
    </div>
  );
}
