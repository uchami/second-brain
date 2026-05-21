"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Crown, Hourglass, Sparkles, Zap, TrendingDown, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  cerrarSemana,
  getCerrarSemanaPreview,
  type CerrarSemanaPreview,
} from "@/app/actions";
import { cn } from "@/lib/utils";

const MENSAJES = [
  "Una semana más de progreso y avance real.",
  "Otra semana cerrada con cosas terminadas.",
  "Lo que está hecho, está hecho. A seguir.",
  "Otra semana de movimiento. Bien jugado.",
];

export function CerrarSemanaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [preview, setPreview] = useState<CerrarSemanaPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, startConfirming] = useTransition();
  const [mensaje] = useState(
    () => MENSAJES[Math.floor(Math.random() * MENSAJES.length)],
  );

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    getCerrarSemanaPreview()
      .then((p) => {
        if (alive) {
          setPreview(p);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (alive) {
          toast.error(err instanceof Error ? err.message : "Error");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [open]);

  function confirm() {
    startConfirming(async () => {
      try {
        await cerrarSemana();
        toast.success("Semana cerrada. A la próxima.");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  const trendIsBetter =
    preview?.diffPctVsUltimo !== null &&
    preview?.diffPctVsUltimo !== undefined &&
    preview.diffPctVsUltimo <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles
              size={18}
              className="text-emerald-600 dark:text-emerald-400"
            />
            Cerrar semana
          </DialogTitle>
        </DialogHeader>

        {loading || !preview ? (
          <p className="py-6 text-center text-sm text-neutral-500">
            Calculando…
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-base font-medium leading-snug">{mensaje}</p>

            <div className="grid grid-cols-2 gap-3">
              <Stat
                big
                label="Tareas done"
                value={String(preview.doneEstaSemana)}
              />
              <Stat
                big
                label="Tareas nuevas"
                value={String(preview.tareasAgregadas)}
              />
            </div>

            {preview.mvp && (
              <Row
                icon={
                  <Crown
                    size={16}
                    className="text-amber-500 dark:text-amber-400"
                  />
                }
                label="MVP de la semana"
                value={`${preview.mvp.nombre} · ${preview.mvp.count} done`}
              />
            )}

            {preview.masVieja && (
              <Row
                icon={
                  <Hourglass
                    size={16}
                    className="text-violet-600 dark:text-violet-400"
                  />
                }
                label="La que más esperó"
                value={`${preview.masVieja.titulo} · ${preview.masVieja.dias}d`}
              />
            )}

            {preview.masRapida && (
              <Row
                icon={
                  <Zap
                    size={16}
                    className="text-sky-600 dark:text-sky-400"
                  />
                }
                label="La más rápida"
                value={`${preview.masRapida.titulo} · ${preview.masRapida.dias}d`}
              />
            )}

            <Row
              icon={
                preview.diffPctVsUltimo === null ? null : trendIsBetter ? (
                  <TrendingDown
                    size={16}
                    className="text-emerald-600 dark:text-emerald-400"
                  />
                ) : (
                  <TrendingUp
                    size={16}
                    className="text-red-600 dark:text-red-400"
                  />
                )
              }
              label="Pendientes vs. semana pasada"
              value={
                preview.diffPctVsUltimo === null
                  ? `${preview.pendientesActuales} (sin referencia)`
                  : `${preview.pendientesActuales} (${
                      preview.diffPctVsUltimo > 0 ? "+" : ""
                    }${preview.diffPctVsUltimo}%)`
              }
              valueClass={
                preview.diffPctVsUltimo === null
                  ? undefined
                  : trendIsBetter
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
              }
            />

            <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              Al cerrar la semana, todas las tareas pasan a{" "}
              <strong>Sin definir</strong> y los Done pasan a{" "}
              <strong>Logrados</strong>.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={loading || confirming}>
            {confirming ? "Cerrando…" : "Cerrar semana"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-semibold",
          big ? "text-2xl" : "text-base",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 break-words text-sm font-medium",
            valueClass,
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
