"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Send,
  GripVertical,
  StickyNote,
  Trophy,
  FolderInput,
  PartyPopper,
} from "lucide-react";
import { FocoIcon } from "@/components/icons/foco-icon";
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

export type BucketBadge = {
  label: string;
  position: number; // 1-based
  total: number;
};

export function TaskCard({
  task,
  responsable,
  context,
  highlightTier,
  bucketBadge,
  onClickTask,
  onSendToSB,
  onChangeBucket,
  onToggleDone,
  celebrating,
  showReorder,
  focoLimitReached,
  // drag handle attributes (from @dnd-kit sortable)
  dragHandleProps,
  isDragging,
}: {
  task: Task;
  responsable: Responsable | undefined;
  context: "in-flight" | "second-brain" | "logradas";
  highlightTier?: TaskHighlightTier;
  bucketBadge?: BucketBadge;
  onClickTask?: () => void;
  onSendToSB?: () => void;
  onChangeBucket?: () => void;
  // When provided, the parent owns the toggle (e.g. to apply optimistic
  // state); otherwise TaskCard falls back to calling the action directly.
  onToggleDone?: (next: boolean) => void;
  celebrating?: boolean;
  showReorder?: boolean;
  // Cuando el padre detecta que ya hay 6 tareas en Foco, pasa true para que
  // el botón "Promover a Foco" muestre un toast amistoso en lugar de llamar
  // al server (que tiraría error 500 / overlay feo).
  focoLimitReached?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const isDone = task.estado === "done";
  const isLograda = context === "logradas";

  function toggleDone(next: boolean) {
    if (onToggleDone) {
      onToggleDone(next);
      return;
    }
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
    if (focoLimitReached) {
      toast.error("Llegaste al máximo de 6 tareas en Foco. Sacá una primero.");
      return;
    }
    startTransition(async () => {
      try {
        await promoteToInFlight(task.id);
        toast.success("Tarea promovida a Foco");
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
        isDone && !isLograda && !celebrating && "opacity-70",
        isLograda &&
          "border-emerald-100 bg-emerald-50/40 dark:border-emerald-950/50 dark:bg-emerald-950/10",
        !isLograda &&
          highlightTier === "top" &&
          "border-emerald-500 bg-emerald-200 shadow-lg shadow-emerald-400/40 dark:border-emerald-500 dark:bg-emerald-900/50 dark:shadow-emerald-700/30",
        !isLograda &&
          highlightTier === "near-top" &&
          "border-sky-100 bg-sky-50/50 dark:border-sky-950 dark:bg-sky-950/10",
        celebrating &&
          "sb-celebrating border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30",
      )}
    >
      {celebrating && <CelebrationOverlay />}
      {/* Drag handle */}
      {showReorder && !isLograda && (
        <button
          type="button"
          data-dnd-handle
          {...dragHandleProps}
          className="flex touch-none items-center self-stretch text-neutral-300 hover:text-neutral-600 dark:text-neutral-700 dark:hover:text-neutral-300"
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
              <FocoIcon size={10} /> en Foco
            </span>
          )}
          {isLograda && task.doneAt && task.createdAt && (
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {formatDaysInList(daysBetween(task.doneAt, task.createdAt))}
            </span>
          )}
          {bucketBadge && (
            <span className="rounded-md border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
              {bucketBadge.label} · {bucketBadge.position}/{bucketBadge.total}
            </span>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
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
            aria-label={
              focoLimitReached
                ? "Foco lleno (6/6)"
                : "Promover a Foco"
            }
            title={
              focoLimitReached
                ? "Foco lleno (6/6) — sacá una primero"
                : "Promover a Foco"
            }
            className={cn(focoLimitReached && "opacity-40")}
          >
            <FocoIcon size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

const CONFETTI_EMOJIS = ["🎉", "🏆", "⭐", "✨", "💪", "🔥", "🎊", "🌟"];

function CelebrationOverlay() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div className="sb-celebrating-stamp inline-flex items-center gap-1.5 rounded-md border-[3px] border-emerald-600/80 bg-emerald-50/95 px-3 py-1 text-base font-black uppercase tracking-widest text-emerald-700 shadow-md dark:border-emerald-500/80 dark:bg-emerald-950/80 dark:text-emerald-300">
          <PartyPopper size={16} strokeWidth={2.5} />
          ¡Logrado!
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
        {CONFETTI_EMOJIS.map((emoji, i) => {
          const angle = (i / CONFETTI_EMOJIS.length) * Math.PI * 2;
          const radius = 90;
          const dx = Math.cos(angle) * radius;
          const dy = Math.sin(angle) * radius - 30; // bias upward
          return (
            <span
              key={i}
              className="sb-celebrating-confetti absolute left-1/2 top-1/2 text-lg leading-none"
              style={
                {
                  "--sb-dx": `${dx}px`,
                  "--sb-dy": `${dy}px`,
                  animationDelay: `${i * 35}ms`,
                } as React.CSSProperties
              }
              aria-hidden
            >
              {emoji}
            </span>
          );
        })}
      </div>
    </>
  );
}
