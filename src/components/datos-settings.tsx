"use client";

import { useRef, useState, useTransition } from "react";
import {
  CalendarClock,
  Copy,
  Download,
  FileUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importTasksFromCsv, type ImportTasksResult } from "@/app/actions";
import {
  getOrCreateIcalToken,
  regenerateIcalToken,
  updateHabitConfig,
} from "@/app/habit-actions";
import type { HabitConfig, UserSettings } from "@/db/schema";

export function DatosSettings({
  habitConfig,
  userSettings,
}: {
  habitConfig: HabitConfig;
  userSettings: UserSettings;
}) {
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportTasksResult | null>(null);
  const [icalToken, setIcalToken] = useState<string | null>(
    userSettings.icalToken,
  );
  const [icalLoading, setIcalLoading] = useState(false);
  const [reminderTime, setReminderTime] = useState(
    (habitConfig.reminderTime ?? "09:00").slice(0, 5),
  );
  const [savingReminder, startReminderTransition] = useTransition();

  function handleExport() {
    // Trigger nativo del browser: navegamos al endpoint que devuelve el ZIP
    // con Content-Disposition attachment. Si el server tarda, se nota en el
    // botón.
    setExporting(true);
    const a = document.createElement("a");
    a.href = "/api/export";
    a.rel = "noopener";
    a.click();
    // No hay forma 100% confiable de saber cuándo terminó el download desde
    // el browser; le damos 2s y volvemos al estado idle.
    setTimeout(() => setExporting(false), 2000);
  }

  async function handleGenerateToken() {
    setIcalLoading(true);
    try {
      const t = await getOrCreateIcalToken();
      setIcalToken(t);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setIcalLoading(false);
    }
  }

  async function handleRegenerateToken() {
    if (
      !confirm(
        "Regenerar invalida el URL actual. Si lo tenés suscripto en tu calendar, vas a tener que resuscribirte.\n¿Continuar?",
      )
    ) {
      return;
    }
    setIcalLoading(true);
    try {
      const t = await regenerateIcalToken();
      setIcalToken(t);
      toast.success("Nuevo URL generado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setIcalLoading(false);
    }
  }

  function saveReminder() {
    startReminderTransition(async () => {
      try {
        await updateHabitConfig({ reminderTime: reminderTime + ":00" });
        toast.success("Hora actualizada");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function buildIcalUrls(): { https: string; webcal: string } | null {
    if (!icalToken) return null;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const path = `/api/ical/${encodeURIComponent(userSettings.userId)}/${icalToken}.ics`;
    return {
      https: `${origin}${path}`,
      webcal: `webcal://${origin.replace(/^https?:\/\//, "")}${path}`,
    };
  }

  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copiado"))
      .catch(() => toast.error("No pude copiar"));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Archivo demasiado grande (máx 5 MB)");
      e.target.value = "";
      return;
    }
    startTransition(async () => {
      try {
        const text = await file.text();
        const r = await importTasksFromCsv(text);
        setResult(r);
        if (r.created > 0) {
          toast.success(`${r.created} tareas importadas`);
        } else if (r.errors.length === 0) {
          toast.error("El CSV no tenía filas válidas");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al importar");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  const icalUrls = buildIcalUrls();

  return (
    <div className="space-y-4">
      {/* CALENDAR FEED */}
      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-2">
          <CalendarClock size={18} className="mt-0.5 shrink-0 text-indigo-500" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Reminders en tu calendar</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Suscribite a un calendario propio que incluye tus tareas con ETA
              y un recordatorio diario de hábitos. Los reminders los maneja tu
              calendar app — Google Calendar, Apple Calendar, etc. No hay
              notificaciones de la app.
            </p>
          </div>
        </div>

        {!icalUrls ? (
          <Button onClick={handleGenerateToken} disabled={icalLoading} size="sm">
            {icalLoading && <Loader2 size={14} className="animate-spin" />}
            Generar URL del calendar
          </Button>
        ) : (
          <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                URL para iPhone/iPad (tap-to-subscribe):
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-md bg-white px-2 py-1 text-[11px] dark:bg-neutral-950">
                  {icalUrls.webcal}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copy(icalUrls.webcal)}
                  aria-label="Copiar URL"
                >
                  <Copy size={12} /> Copiar
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                URL para Google Calendar / desktop:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-md bg-white px-2 py-1 text-[11px] dark:bg-neutral-950">
                  {icalUrls.https}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copy(icalUrls.https)}
                  aria-label="Copiar URL"
                >
                  <Copy size={12} /> Copiar
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-neutral-500 dark:text-neutral-500">
              <details>
                <summary className="cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-300">
                  Cómo suscribirse
                </summary>
                <ul className="ml-4 mt-1 list-disc space-y-1">
                  <li>
                    <strong>iPhone</strong>: Settings → Calendar → Accounts →
                    Add Account → Other → Add Subscribed Calendar → pegá el
                    URL webcal.
                  </li>
                  <li>
                    <strong>Mac Calendar</strong>: File → New Calendar
                    Subscription → pegá cualquiera de los dos URLs.
                  </li>
                  <li>
                    <strong>Google Calendar (desktop)</strong>: sidebar
                    izquierdo → Other calendars → + → From URL → pegá el URL
                    https. En el celu no soporta esto — hay que hacerlo
                    primero desde la PC.
                  </li>
                </ul>
              </details>
              <button
                type="button"
                onClick={handleRegenerateToken}
                disabled={icalLoading}
                className="inline-flex items-center gap-1 hover:text-red-600 dark:hover:text-red-400"
              >
                <RefreshCw size={11} /> Regenerar URL
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 text-xs">
          <label className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            Hora del reminder diario de hábitos
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={saveReminder}
            disabled={savingReminder}
          >
            Guardar
          </Button>
        </div>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-500">
          Los reminders viajan en el calendar; la latencia depende del polling
          del calendar app (típicamente unas horas).
        </p>
      </div>

      {/* EXPORT */}
      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="text-sm font-semibold">Exportar todo</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Descargá un ZIP con tus tareas, hábitos, registros, cierres,
            responsables y settings — un CSV por tabla. Útil para backup o para
            alimentar tu Excel de planificación semanal.
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting} size="sm">
          {exporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          Exportar ZIP
        </Button>
      </div>

      {/* IMPORT */}
      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="text-sm font-semibold">Importar tareas (CSV)</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Subí un CSV con columnas <code className="font-mono">titulo</code> y{" "}
            <code className="font-mono">descripcion</code> (opcional). Las
            tareas se crean en bucket <strong>Sin definir</strong>, sin
            responsable y sin ETA. Cada fila genera una tarea nueva — no
            deduplica. Máximo 1000 filas por import.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          disabled={pending}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-neutral-200 dark:file:bg-neutral-800 dark:file:text-neutral-300 dark:hover:file:bg-neutral-700"
        />
        {pending && (
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Loader2 size={12} className="animate-spin" /> Procesando…
          </p>
        )}
        {result && (
          <div className="space-y-1 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/50">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              {result.created} tareas creadas
            </p>
            {result.capExceeded && (
              <p className="text-amber-700 dark:text-amber-300">
                ⚠ Se ignoraron filas más allá del cap de 1000.
              </p>
            )}
            {result.errors.length > 0 && (
              <details>
                <summary className="cursor-pointer text-red-700 dark:text-red-300">
                  {result.errors.length} errores (click para ver)
                </summary>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Fila {e.row}: {e.message}
                    </li>
                  ))}
                  {result.errors.length > 20 && (
                    <li>… y {result.errors.length - 20} más</li>
                  )}
                </ul>
              </details>
            )}
          </div>
        )}
        <p className="flex items-start gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-500">
          <FileUp size={12} className="mt-0.5 shrink-0" />
          Tip: hacé un export primero para ver el formato esperado.
        </p>
      </div>
    </div>
  );
}
