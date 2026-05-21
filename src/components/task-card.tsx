"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Send,
  Plane,
  Check,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { etaColor, formatEtaShort } from "@/lib/eta";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { markDone, unmarkDone, promoteToInFlight } from "@/app/actions";
import type { Responsable, Task, Estado } from "@/db/schema";

const estadoLabels: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  delegado: "Delegado",
  done: "Done",
};

const estadoColors: Record<Estado, string> = {
  pendiente:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  en_proceso:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  delegado:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const etaColorClasses: Record<
  ReturnType<typeof etaColor>,
  string
> = {
  yellow:
    "bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200",
  red: "bg-red-200 text-red-900 dark:bg-red-500/30 dark:text-red-200",
  violet:
    "bg-violet-300 text-violet-900 dark:bg-violet-500/30 dark:text-violet-200",
  neutral:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export function TaskCard({
  task,
  responsable,
  context,
  onClickTask,
  onSendToSB,
  // mobile reorder controls (optional)
  showReorder,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  // drag handle attributes (from @dnd-kit sortable)
  dragHandleProps,
  isDragging,
}: {
  task: Task;
  responsable: Responsable | undefined;
  context: "in-flight" | "second-brain";
  onClickTask?: () => void;
  onSendToSB?: () => void;
  showReorder?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const isDone = task.estado === "done";

  function toggleDone(next: boolean) {
    startTransition(async () => {
      try {
        if (next) {
          await markDone(task.id);
        } else {
          await unmarkDone(task.id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function handlePromote() {
    startTransition(async () => {
      try {
        await promoteToInFlight(task.id);
        toast.success("Tarea promovida a in-flight");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  const eColor = etaColor(task.eta);

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition-shadow hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        isDragging && "opacity-50",
        isDone && "opacity-70",
      )}
    >
      {/* Drag handle (desktop only) */}
      {showReorder && (
        <button
          type="button"
          data-dnd-handle
          {...dragHandleProps}
          className="hidden touch-none items-center self-stretch text-neutral-300 hover:text-neutral-600 sm:flex dark:text-neutral-700 dark:hover:text-neutral-300"
          aria-label="Reordenar"
        >
          <GripVertical size={16} />
        </button>
      )}

      <Checkbox
        checked={isDone}
        onCheckedChange={(c) => toggleDone(c === true)}
        disabled={pending}
        className="mt-0.5"
      />

      <button
        type="button"
        onClick={onClickTask}
        className="flex-1 text-left"
      >
        <div
          className={cn(
            "text-sm leading-snug",
            isDone && "text-neutral-400 line-through dark:text-neutral-500",
          )}
        >
          {task.titulo}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {responsable && (
            <span
              className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: responsable.color, color: "#1f1f1f" }}
            >
              {responsable.nombre}
            </span>
          )}
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              estadoColors[task.estado],
            )}
          >
            {estadoLabels[task.estado]}
          </span>
          {task.eta && !isDone && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                etaColorClasses[eColor],
              )}
            >
              {formatEtaShort(task.eta)}
            </span>
          )}
          {context === "second-brain" && task.inFlight && !isDone && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
              <Rocket size={10} /> en in-flight
            </span>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Mobile reorder buttons */}
        {showReorder && (
          <div className="flex flex-col sm:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              aria-label="Subir"
            >
              <ArrowUp size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              aria-label="Bajar"
            >
              <ArrowDown size={14} />
            </Button>
          </div>
        )}

        {/* Action button */}
        {context === "in-flight" && onSendToSB && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSendToSB}
            aria-label="Mandar al second brain"
            title="Mandar al second brain"
          >
            <Send size={16} />
          </Button>
        )}
        {context === "second-brain" && !task.inFlight && !isDone && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePromote}
            disabled={pending}
            aria-label="Promover a in-flight"
            title="Promover a in-flight"
          >
            <Plane size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
