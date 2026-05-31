"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Moon, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HabitInput } from "@/components/habit-inputs";
import {
  upsertHabitoEntries,
  type UpsertEntry,
} from "@/app/habit-actions";
import { EMOCION_OTRO_PREFIX } from "@/lib/emociones";
import type { Habito } from "@/db/schema";

export type CerrarDiaMode = "ritual" | "edit-hoy" | "trackear-otro";

export type CerrarDiaInitialEntry = {
  habitoId: number;
  valor: string | null;
  skipped: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  mode: CerrarDiaMode;
  fecha: string; // ISO YYYY-MM-DD
  habitos: Habito[]; // activos, en el orden definido
  entriesIniciales: CerrarDiaInitialEntry[];
  // En modo "ritual" controla qué botón aparece como primario. true → "Guardar
  // y dormir" primario (estamos en sleep window). false → "Guardar" primario
  // (estamos durante el día). Ignorado fuera de modo ritual. Default: true.
  defaultSleepIntent?: boolean;
  // Llamado luego de guardar exitoso. El modal cierra por su cuenta antes.
  // `withSleep` indica si el usuario eligió "Guardar y dormir" (true) o
  // "Guardar" sin dormir (false). En modos no-ritual, mantiene la semántica
  // previa: edit-hoy → true (re-activa sleep), trackear-otro → false.
  onSaved?: (info: {
    mode: CerrarDiaMode;
    fecha: string;
    withSleep: boolean;
  }) => void;
};

// "Valor vacío" para emoción: el prefijo "otro:" sin texto cuenta como vacío.
function isEmptyValue(v: string | undefined): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (v === EMOCION_OTRO_PREFIX) return true;
  return false;
}

export function CerrarDiaModal(props: Props) {
  // El modal solo monta cuando open=true. Esto garantiza que el snapshot
  // inicial se calcule UNA sola vez (al abrir) y que el sync del padre no
  // resetee el form mientras el usuario está editando.
  if (!props.open) return null;
  return <CerrarDiaModalInner {...props} />;
}

type Local = { value: string | undefined; skipped: boolean };

function buildInitialState(
  habitos: Habito[],
  entriesIniciales: CerrarDiaInitialEntry[],
): Map<number, Local> {
  const m = new Map<number, Local>();
  for (const h of habitos) m.set(h.id, { value: undefined, skipped: false });
  for (const e of entriesIniciales) {
    m.set(e.habitoId, {
      value: e.valor ?? undefined,
      skipped: e.skipped,
    });
  }
  return m;
}

function CerrarDiaModalInner({
  open,
  onClose,
  mode,
  fecha,
  habitos,
  entriesIniciales,
  defaultSleepIntent = true,
  onSaved,
}: Props) {
  // useState initializer: se ejecuta una sola vez al montar. Cambios de props
  // (por sync del padre) NO resetean el state — lo que el usuario tipeó manda
  // hasta que cierre o guarde el modal.
  const [state, setState] = useState<Map<number, Local>>(() =>
    buildInitialState(habitos, entriesIniciales),
  );
  const [pending, setPending] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState<{
    ids: number[];
    withSleep: boolean;
  } | null>(null);
  // Recordamos qué botón disparó el save para mantener el spinner sobre él.
  const [savingWithSleep, setSavingWithSleep] = useState<boolean | null>(null);

  function setValue(habitoId: number, v: string | undefined) {
    setState((prev) => {
      const next = new Map(prev);
      next.set(habitoId, { value: v, skipped: false });
      return next;
    });
  }

  async function persist(payload: UpsertEntry[], withSleep: boolean) {
    setPending(true);
    setSavingWithSleep(withSleep);
    try {
      await upsertHabitoEntries({ fecha, entries: payload });
      onSaved?.({ mode, fecha, withSleep });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setPending(false);
      setSavingWithSleep(null);
    }
  }

  function handleSave(withSleep: boolean) {
    // Construir payload. Hábitos sin contestar quedan a parte para confirmación.
    const sinContestar: number[] = [];
    const payload: UpsertEntry[] = [];
    for (const h of habitos) {
      const s = state.get(h.id);
      if (!s) continue;
      if (s.skipped) {
        payload.push({ habitoId: h.id, skipped: true });
        continue;
      }
      if (isEmptyValue(s.value)) {
        sinContestar.push(h.id);
        continue;
      }
      payload.push({ habitoId: h.id, valor: s.value as string });
    }
    if (sinContestar.length > 0) {
      setConfirmSkip({ ids: sinContestar, withSleep });
      return;
    }
    if (payload.length === 0) {
      toast.error("Nada que guardar");
      return;
    }
    void persist(payload, withSleep);
  }

  function handleSkipAll() {
    if (!confirmSkip) return;
    const skipSet = new Set(confirmSkip.ids);
    const payload: UpsertEntry[] = [];
    for (const h of habitos) {
      const s = state.get(h.id);
      if (!s) continue;
      if (skipSet.has(h.id) || s.skipped) {
        payload.push({ habitoId: h.id, skipped: true });
        continue;
      }
      if (!isEmptyValue(s.value)) {
        payload.push({ habitoId: h.id, valor: s.value as string });
      }
    }
    const withSleep = confirmSkip.withSleep;
    setConfirmSkip(null);
    void persist(payload, withSleep);
  }

  // En modo ritual, el título varía según horario: "Cerrar el día" durante
  // sleep window (ritual nocturno) vs "Registrar hábitos" durante el día.
  const title =
    mode === "ritual"
      ? defaultSleepIntent
        ? "Cerrar el día"
        : "Registrar hábitos"
      : mode === "edit-hoy"
        ? "Editar el día"
        : "Trackear día";

  const introCopy =
    mode === "ritual"
      ? defaultSleepIntent
        ? "Repasá tu día. Lo que no quieras trackear hoy, dejalo vacío y al final lo skipiamos."
        : "Registrá tus hábitos cuando te queden cómodos. Si no querés trackear alguno hoy, dejalo vacío y al final lo skipiamos."
      : mode === "edit-hoy"
        ? "Ajustá lo que necesites. Se sobreescribe sin preguntar."
        : `Registrá tus hábitos para ${fecha}.`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(90dvh,720px)] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-neutral-200 sm:shadow-xl dark:sm:border-neutral-800"
          aria-describedby={undefined}
        >
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Cerrar"
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 sm:pb-6">
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
              {introCopy}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {habitos.map((h) => {
                const s = state.get(h.id) ?? { value: undefined, skipped: false };
                return (
                  <div
                    key={h.id}
                    className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium leading-snug">
                        {h.pregunta}
                      </h3>
                      {s.skipped && (
                        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                          skip
                        </span>
                      )}
                    </div>
                    {!s.skipped && (
                      <HabitInput
                        tipo={h.tipo}
                        value={s.value}
                        onChange={(v) => setValue(h.id, v)}
                      />
                    )}
                    {s.skipped && (
                      <button
                        type="button"
                        className="text-xs text-neutral-500 underline-offset-2 hover:underline"
                        onClick={() => setValue(h.id, undefined)}
                      >
                        Deshacer skip
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <footer className="border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
            {mode === "trackear-otro" ? (
              // Día pasado: sleep no aplica. Un solo botón "Guardar".
              <div className="flex justify-center">
                <Button
                  onClick={() => handleSave(false)}
                  disabled={pending}
                  className="h-11 w-full text-base sm:max-w-sm"
                >
                  <Check size={16} />
                  Guardar
                </Button>
              </div>
            ) : (
              // Hoy (ritual o edit-hoy): SIEMPRE las dos opciones. El usuario
              // decide si quiere activar/mantener sleep mode al guardar.
              <div className="mx-auto flex w-full max-w-md flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => handleSave(false)}
                  disabled={pending}
                  variant={defaultSleepIntent ? "outline" : "primary"}
                  className="h-11 flex-1 text-base"
                >
                  <Check size={16} />
                  {savingWithSleep === false ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  onClick={() => handleSave(true)}
                  disabled={pending}
                  variant={defaultSleepIntent ? "primary" : "outline"}
                  className="h-11 flex-1 text-base"
                >
                  <Moon size={16} />
                  {savingWithSleep === true ? "Guardando…" : "Guardar y dormir"}
                </Button>
              </div>
            )}
          </footer>
        </DialogPrimitive.Content>

        {confirmSkip && (
          <ConfirmSkipDialog
            count={confirmSkip.ids.length}
            onCancel={() => setConfirmSkip(null)}
            onSkip={handleSkipAll}
            pending={pending}
          />
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ConfirmSkipDialog({
  count,
  onCancel,
  onSkip,
  pending,
}: {
  count: number;
  onCancel: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  // Sub-diálogo modal encima del modal fullscreen. Centrado, no fullscreen.
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="text-base font-semibold">
            Quedaron {count} sin contestar
          </DialogPrimitive.Title>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            ¿Los marco como &quot;skip por hoy&quot; o volvés al cierre?
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onCancel} disabled={pending}>
              Volver al cierre
            </Button>
            <Button onClick={onSkip} disabled={pending}>
              Skip por hoy
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
