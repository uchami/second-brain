"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUserSettings } from "@/app/habit-actions";
import type { UserSettings } from "@/db/schema";

function getTimezones(): string[] {
  // Intl.supportedValuesOf existe en Node 18+ / browsers modernos. Fallback a
  // un set mínimo si no está disponible.
  type IntlWithSupported = typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const intl = Intl as IntlWithSupported;
  if (typeof intl.supportedValuesOf === "function") {
    return intl.supportedValuesOf("timeZone");
  }
  return [
    "America/Montevideo",
    "America/Argentina/Buenos_Aires",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/Madrid",
    "Europe/London",
    "UTC",
  ];
}

export function CuentaSettings({ initial }: { initial: UserSettings }) {
  const timezones = useMemo(() => getTimezones(), []);
  const [tz, setTz] = useState(initial.timezone);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await updateUserSettings({ timezone: tz });
        toast.success("Guardado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="space-y-1">
          <Label htmlFor="tz">Zona horaria</Label>
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger id="tz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Define qué día es &quot;hoy&quot; para tus hábitos y el cierre del día. Si viajás, cambiala a mano.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={pending} size="sm">
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
