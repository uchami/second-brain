"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, AlertTriangle } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { SortableTask } from "@/components/sortable-task";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { MoveToSBDialog } from "@/components/move-to-sb-dialog";
import { reorderInFlight } from "@/app/actions";
import type { Responsable, Task } from "@/db/schema";

const IN_FLIGHT_LIMIT = 6;

export function InFlightTab({
  tasks,
  responsables,
  existingBuckets,
}: {
  tasks: Task[];
  responsables: Responsable[];
  existingBuckets: number[];
}) {
  const inFlight = tasks
    .filter((t) => t.inFlight)
    .sort((a, b) => (a.inFlightOrder ?? 0) - (b.inFlightOrder ?? 0));

  const [order, setOrder] = useState<number[]>(inFlight.map((t) => t.id));
  // Sync state when tasks change from server
  const orderKey = inFlight.map((t) => t.id).join(",");
  const currentKey = order.join(",");
  if (orderKey !== currentKey && order.length !== inFlight.length) {
    setOrder(inFlight.map((t) => t.id));
  }
  const orderedTasks = order
    .map((id) => inFlight.find((t) => t.id === id))
    .filter((t): t is Task => !!t);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(Number(active.id));
    const newIdx = order.indexOf(Number(over.id));
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    startTransition(async () => {
      try {
        await reorderInFlight(next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...order];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrder(next);
    startTransition(() => {
      reorderInFlight(next).catch((err) => toast.error(err.message));
    });
  }
  function moveDown(index: number) {
    if (index >= order.length - 1) return;
    const next = [...order];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    setOrder(next);
    startTransition(() => {
      reorderInFlight(next).catch((err) => toast.error(err.message));
    });
  }

  const atLimit = orderedTasks.length >= IN_FLIGHT_LIMIT;

  // Top priority = first non-done task in bucket 0. If it's not in
  // in-flight, nag the user.
  const topPriority = tasks
    .filter((t) => t.bucket === 0 && t.estado !== "done")
    .sort((a, b) => a.bucketOrder - b.bucketOrder)[0];
  const showTopMissingBanner = !!topPriority && !topPriority.inFlight;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {orderedTasks.length} / {IN_FLIGHT_LIMIT} tareas
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

      {orderedTasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Sin tareas en vuelo. Toca "+ Nueva" para arrancar.
        </p>
      ) : (
        <DndContext
          id="dnd-inflight"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={order}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {orderedTasks.map((task, i) => (
                <SortableTask
                  key={task.id}
                  task={task}
                  responsable={responsables.find(
                    (r) => r.id === task.responsableId,
                  )}
                  context="in-flight"
                  onClickTask={() => setEditing(task)}
                  onSendToSB={() => setMoving(task)}
                  onMoveUp={() => moveUp(i)}
                  onMoveDown={() => moveDown(i)}
                  canMoveUp={i > 0}
                  canMoveDown={i < orderedTasks.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

      {moving && (
        <MoveToSBDialog
          open={!!moving}
          onOpenChange={(o) => !o && setMoving(null)}
          taskId={moving.id}
          existingBuckets={existingBuckets}
        />
      )}
    </div>
  );
}
