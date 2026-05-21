"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy } from "lucide-react";
import { daysBetween, formatDateLong, formatDaysInList } from "@/lib/dates";
import type { Responsable, Task } from "@/db/schema";

export function LogradaInfoDialog({
  open,
  onOpenChange,
  task,
  responsable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  responsable: Responsable | undefined;
}) {
  const days =
    task.doneAt && task.createdAt
      ? daysBetween(task.doneAt, task.createdAt)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy
              size={18}
              className="text-emerald-600 dark:text-emerald-400"
            />
            Lograda
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <p className="break-words text-base font-medium leading-snug">
              {task.titulo}
            </p>
          </div>

          {task.detalle && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Detalle
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200">
                {task.detalle}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Info label="Responsable" value={responsable?.nombre ?? "—"} />
            <Info
              label="Bucket"
              value={task.bucket === null ? "Sin definir" : `Bucket ${task.bucket}`}
            />
            <Info
              label="Creada"
              value={task.createdAt ? formatDateLong(task.createdAt) : "—"}
            />
            <Info
              label="Lograda"
              value={task.doneAt ? formatDateLong(task.doneAt) : "—"}
            />
          </div>

          {days !== null && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              {formatDaysInList(days)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 break-words text-neutral-800 dark:text-neutral-200">
        {value}
      </p>
    </div>
  );
}
