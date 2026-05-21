"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Send,
  Plane,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Rocket,
  StickyNote,
  Trophy,
  FolderInput,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { etaColor, formatEtaShort } from "@/lib/eta";
import { daysBetween, formatDaysInList } from "@/lib/dates";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { markDone, unmarkDone, promoteToInFlight } from "@/app/actions";
import type { Responsable, Task, Estado } from "@/db/schema";

const estadoLabels: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  delegado: "Delegado",
  postergado: "Postergado",
  done: "Done",
};

const estadoColors: Record<Estado, string> = {
  pendiente:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  en_proceso:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  delegado:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  postergado:
    "bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const etaColorClasses: Record<
  ReturnType<typeof etaColor>,
  string
> = {
  yellow:
    "bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200",
  red: "bg-red-200 text-red-900 dark:bg-red-500/30 dark:text-red-200",
  "red-dark":
    "bg-red-600 text-white dark:bg-red-700 dark:text-red-50",
  violet:
    "bg-violet-300 text-violet-900 dark:bg-violet-500/30 dark:text-violet-200",
  neutral:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export type TaskHighlightTier = "top" | "near-top";

export function TaskCard({
  task,
  responsable,
  context,
  highlightTier,
  onClickTask,
  onSendToSB,
  onChangeBucket,
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
  context: "in-flight" | "second-brain" | "logradas";
  highlightTier?: TaskHighlightTier;
  onClickTask?: () => void;
  onSendToSB?: () => void;
  onChangeBucket?: () => void;
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
  const isLograda = context === "logradas";

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
        isDone && !isLograda && "opacity-70",
        isLograda &&
          "border-emerald-100 bg-emerald-50/40 dark:border-emerald-950/50 dark:bg-emerald-950/10",
        !isLograda &&
          highlightTier === "top" &&
          "border-emerald-500 bg-emerald-200 shadow-lg shadow-emerald-400/40 dark:border-emerald-500 dark:bg-emerald-900/50 dark:shadow-emerald-700/30",
        !isLograda &&
          highlightTier === "near-top" &&
          "border-sky-100 bg-sky-50/50 dark:border-sky-950 dark:bg-sky-950/10",
      )}
    >
      {/* Drag handle (desktop only) */}
      {showReorder && !isLograda && (
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

      {isLograda ? (
        <Trophy
          size={18}
          className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-label="Logrado"
        />
      ) : (
        <Checkbox
          checked={isDone}
          onCheckedChange={(c) => toggleDone(c === true)}
          disabled={pending}
          className="mt-0.5"
        />
      )}

      <button
        type="button"
        onClick={onClickTask}
        className="flex-1 text-left"
      >
        <div
          className={cn(
            "flex items-start gap-1.5 text-sm leading-snug",
            isDone && !isLograda && "text-neutral-400 line-through dark:text-neutral-500",
          )}
        >
          <span className="flex-1">{task.titulo}</span>
          {task.detalle && (
            <StickyNote
              size={12}
              className="mt-0.5 shrink-0 text-neutral-400"
              aria-label="Tiene detalle"
            />
          )}
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
          {!isLograda && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                estadoColors[task.estado],
              )}
            >
              {estadoLabels[task.estado]}
            </span>
          )}
          {task.eta && !isDone && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                etaColorClasses[eColor],
              )}
            >
              {eColor === "violet" && "💀 "}
              {formatEtaShort(task.eta)}
            </span>
          )}
          {context === "second-brain" && task.inFlight && !isDone && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
              <Rocket size={10} /> en in-flight
            </span>
          )}
          {isLograda && task.doneAt && task.createdAt && (
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {formatDaysInList(daysBetween(task.doneAt, task.createdAt))}
            </span>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Mobile reorder buttons */}
        {showReorder && !isLograda && (
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

        {/* Action buttons */}
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
        {context === "second-brain" && !isDone && onChangeBucket && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onChangeBucket}
            aria-label="Cambiar bucket"
            title="Cambiar bucket"
          >
            <FolderInput size={16} />
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
