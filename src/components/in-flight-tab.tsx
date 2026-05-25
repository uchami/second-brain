"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, AlertTriangle, Moon, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskCard, type TaskHighlightTier } from "@/components/task-card";
import { TaskFormDialog } from "@/components/task-form-dialog";
import {
  CerrarDiaModal,
  type CerrarDiaInitialEntry,
  type CerrarDiaMode,
} from "@/components/cerrar-dia-modal";
import { markDone, moveToSecondBrain, unmarkDone } from "@/app/actions";
import { bucketLabel } from "@/lib/buckets";
import type { Habito, HabitoEntry, Responsable, Task } from "@/db/schema";
import type { SleepMode } from "@/lib/sleep-mode";

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

export type HabitSavedInfo = {
  mode: "ritual" | "edit-hoy" | "trackear-otro";
  fecha: string;
};

export function InFlightTab({
  tasks,
  responsables,
  existingBuckets,
  habitos,
  habitoEntries,
  sleepMode,
  streak,
  hoyISO,
  onHabitSaved,
  onExitSleepMode,
}: {
  tasks: Task[];
  responsables: Responsable[];
  existingBuckets: number[];
  habitos: Habito[];
  habitoEntries: HabitoEntry[];
  sleepMode: SleepMode;
  streak: number;
  hoyISO: string;
  onHabitSaved: (info: HabitSavedInfo) => void;
  onExitSleepMode: () => void;
}) {
  // En modo A mimir reemplazamos toda la tab por una vista mínima focalizada
  // en el ritual nocturno. Sin tareas, sin "Nueva", sin banner rojo.
  if (sleepMode.active) {
    return (
      <MimirView
        habitos={habitos}
        habitoEntries={habitoEntries}
        sleepMode={sleepMode}
        streak={streak}
        hoyISO={hoyISO}
        onHabitSaved={onHabitSaved}
        onExitSleepMode={onExitSleepMode}
      />
    );
  }
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

      <CerrarDiaSection
        habitos={habitos}
        habitoEntries={habitoEntries}
        sleepMode={sleepMode}
        streak={streak}
        hoyISO={hoyISO}
        onHabitSaved={onHabitSaved}
      />
    </div>
  );
}

// --- Cerrar día section ---

function CerrarDiaSection({
  habitos,
  habitoEntries,
  sleepMode,
  streak,
  hoyISO,
  onHabitSaved,
}: {
  habitos: Habito[];
  habitoEntries: HabitoEntry[];
  sleepMode: SleepMode;
  streak: number;
  hoyISO: string;
  onHabitSaved: (info: HabitSavedInfo) => void;
}) {
  const [open, setOpen] = useState(false);

  if (habitos.length === 0) return null;

  const entriesHoy: CerrarDiaInitialEntry[] = habitoEntries
    .filter((e) => e.fecha === hoyISO)
    .map((e) => ({
      habitoId: e.habitoId,
      valor: e.valor,
      skipped: e.skipped,
    }));

  const hayEntriesHoy = entriesHoy.length > 0;
  const mode: CerrarDiaMode = hayEntriesHoy ? "edit-hoy" : "ritual";

  // Color destacado si entró el horario sleep y no hay entries (reason='horario').
  const urgente = sleepMode.reason === "horario";

  // Banner nocturno: solo si reason='horario' (sleep activado por horario sin
  // entries de hoy). Si reason='cerrado', ya cerraste, no mostramos banner.
  const showBanner = sleepMode.active && sleepMode.reason === "horario";

  return (
    <>
      {showBanner && (
        <div className="rounded-xl border border-indigo-300 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
          <p className="font-medium">No trackeaste tus hábitos hoy.</p>
          <p className="mt-0.5 text-xs opacity-80">
            Hacelo, es un minuto. Recordá: semanas comparables aseguran resultados sostenidos.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setOpen(true)}
          >
            Trackear ahora
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <Button
          onClick={() => setOpen(true)}
          className={cn(
            "flex-1 h-11 text-base",
            urgente &&
              "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700",
          )}
        >
          <Moon size={16} />
          Cerrar día
        </Button>
        <StreakBadge streak={streak} />
      </div>

      {open && (
        <CerrarDiaModal
          open={open}
          onClose={() => setOpen(false)}
          mode={mode}
          fecha={hoyISO}
          habitos={habitos}
          entriesIniciales={entriesHoy}
          onSaved={onHabitSaved}
        />
      )}
    </>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        title="Sin racha — cerrá el día para arrancar"
      >
        <Flame size={12} />0
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
      title={`Racha actual: ${streak} día${streak === 1 ? "" : "s"}`}
    >
      <Flame size={12} />
      {streak}
    </span>
  );
}

// --- Mimir view (reemplaza la tab cuando sleep mode está activo) ---

function MimirView({
  habitos,
  habitoEntries,
  sleepMode,
  streak,
  hoyISO,
  onHabitSaved,
  onExitSleepMode,
}: {
  habitos: Habito[];
  habitoEntries: HabitoEntry[];
  sleepMode: SleepMode;
  streak: number;
  hoyISO: string;
  onHabitSaved: (info: HabitSavedInfo) => void;
  onExitSleepMode: () => void;
}) {
  const [open, setOpen] = useState(false);

  const entriesHoy: CerrarDiaInitialEntry[] = habitoEntries
    .filter((e) => e.fecha === hoyISO)
    .map((e) => ({
      habitoId: e.habitoId,
      valor: e.valor,
      skipped: e.skipped,
    }));
  const hayEntriesHoy = entriesHoy.length > 0;
  // En sleep mode siempre permitimos editar (no es ritual virgen).
  const mode: CerrarDiaMode = hayEntriesHoy ? "edit-hoy" : "ritual";

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-5 text-center dark:border-indigo-800 dark:bg-indigo-950/40">
        <Moon className="mx-auto text-indigo-500" size={28} />
        <p className="mt-2 text-base font-semibold text-indigo-900 dark:text-indigo-100">
          {hayEntriesHoy
            ? "Cerraste el día. A mimir."
            : "Hora de cerrar el día."}
        </p>
        <p className="mt-1 text-sm text-indigo-800/80 dark:text-indigo-200/80">
          {hayEntriesHoy
            ? "Andá a dormir, no seas bobo. Es más productivo dormir bien y hacer eso mañana."
            : "Trackeá tus hábitos antes de dormir."}
        </p>
      </div>

      {sleepMode.reason === "horario" && !hayEntriesHoy && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">No trackeaste tus hábitos hoy.</p>
          <p className="mt-0.5 text-xs opacity-80">
            Recordá: semanas comparables aseguran resultados sostenidos.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={() => setOpen(true)}
          className="h-11 flex-1 text-base"
        >
          <Moon size={16} />
          {hayEntriesHoy ? "Editar el día" : "Cerrar día"}
        </Button>
        <StreakBadge streak={streak} />
      </div>

      <div className="flex justify-center pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onExitSleepMode}
          className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Salir del modo sueño
        </Button>
      </div>

      {open && (
        <CerrarDiaModal
          open={open}
          onClose={() => setOpen(false)}
          mode={mode}
          fecha={hoyISO}
          habitos={habitos}
          entriesIniciales={entriesHoy}
          onSaved={onHabitSaved}
        />
      )}
    </div>
  );
}
