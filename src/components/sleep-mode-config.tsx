"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateHabitConfig } from "@/app/habit-actions";
import type { HabitConfig } from "@/db/schema";

// time columns vienen como "HH:MM:SS"; trim a "HH:MM" para el <input type="time">
function toTimeInput(v: string): string {
  return v.slice(0, 5);
}

export function SleepModeConfig({ initial }: { initial: HabitConfig }) {
  const [inicio, setInicio] = useState(toTimeInput(initial.sleepModeInicio));
  const [fin, setFin] = useState(toTimeInput(initial.sleepModeFin));
  const [auto, setAuto] = useState(initial.sleepModeAuto);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await updateHabitConfig({
          sleepModeInicio: inicio,
          sleepModeFin: fin,
          sleepModeAuto: auto,
        });
        toast.success("Guardado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          El modo sueño se activa automáticamente en la franja nocturna que definas, o cuando ya cerraste el día.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="inicio">Inicio automático</Label>
            <Input
              id="inicio"
              type="time"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fin">Fin automático</Label>
            <Input
              id="fin"
              type="time"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={auto}
            onCheckedChange={(v) => setAuto(v === true)}
          />
          <span>Activar modo sueño automáticamente por horario</span>
        </label>

        <div className="flex justify-end">
          <Button onClick={save} disabled={pending} size="sm">
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
