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
  type HabitWeekMetric,
} from "@/app/actions";
import { cn } from "@/lib/utils";
import { displayEmocion } from "@/lib/emociones";

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

            {preview.habitMetrics.length > 0 && (
              <HabitMetricsSection metrics={preview.habitMetrics} />
            )}
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

function HabitMetricsSection({ metrics }: { metrics: HabitWeekMetric[] }) {
  return (
    <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Hábitos de la semana
      </h3>
      <div className="space-y-2">
        {metrics.map((m) => (
          <HabitMetricRow key={m.habitoId} m={m} />
        ))}
      </div>
    </div>
  );
}

function HabitMetricRow({ m }: { m: HabitWeekMetric }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm font-medium leading-snug">{m.pregunta}</p>
      <div className="mt-2">
        {m.tipo === "si_no" && <HeatmapSiNo m={m} />}
        {m.tipo === "estrellas" && <EstrellasPromedio m={m} />}
        {m.tipo === "escala_1_10" && <NumeroEscalaPromedio m={m} />}
        {m.tipo === "emocion" && <TopEmociones m={m} />}
        {m.tipo === "texto" && <TextosColapsables m={m} />}
      </div>
    </div>
  );
}

function HeatmapSiNo({ m }: { m: Extract<HabitWeekMetric, { tipo: "si_no" }> }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex gap-1">
        {m.cells.map((c, i) => (
          <span
            key={i}
            title={c}
            className={cn(
              "h-5 w-5 rounded-sm",
              c === "si" && "bg-emerald-500",
              c === "no" && "bg-neutral-300 dark:bg-neutral-700",
              c === "skip" && "border border-dashed border-neutral-400",
              c === "empty" && "border border-neutral-200 dark:border-neutral-800",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
        {m.ratioActual}
        {m.ratioAnterior && (
          <span className="text-neutral-400">
            {" "}
            (vs {m.ratioAnterior} anterior)
          </span>
        )}
      </p>
    </div>
  );
}

function EstrellasPromedio({
  m,
}: {
  m: Extract<HabitWeekMetric, { tipo: "estrellas" }>;
}) {
  if (m.promedio === null) {
    return <p className="text-xs text-neutral-500">Sin respuestas esta semana</p>;
  }
  const fullStars = Math.floor(m.promedio);
  const partial = m.promedio - fullStars;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-0.5 text-amber-500">
        {[0, 1, 2, 3, 4].map((i) => {
          if (i < fullStars) return <span key={i}>★</span>;
          if (i === fullStars && partial > 0) {
            return (
              <span key={i} className="relative">
                <span className="text-neutral-300 dark:text-neutral-700">★</span>
                <span
                  className="absolute inset-0 overflow-hidden text-amber-500"
                  style={{ width: `${partial * 100}%` }}
                >
                  ★
                </span>
              </span>
            );
          }
          return <span key={i} className="text-neutral-300 dark:text-neutral-700">★</span>;
        })}
        <span className="ml-1 text-xs font-medium tabular-nums text-neutral-700 dark:text-neutral-300">
          {m.promedio.toFixed(1)}
        </span>
      </div>
      {m.delta !== null && <DeltaPill delta={m.delta} suffix="★" />}
    </div>
  );
}

function NumeroEscalaPromedio({
  m,
}: {
  m: Extract<HabitWeekMetric, { tipo: "escala_1_10" }>;
}) {
  if (m.promedio === null) {
    return <p className="text-xs text-neutral-500">Sin respuestas esta semana</p>;
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <span className="text-2xl font-bold tabular-nums">{m.promedio.toFixed(1)}</span>
        <span className="ml-1 text-xs text-neutral-500">/10</span>
      </div>
      {m.delta !== null && <DeltaPill delta={m.delta} />}
    </div>
  );
}

function TopEmociones({
  m,
}: {
  m: Extract<HabitWeekMetric, { tipo: "emocion" }>;
}) {
  if (m.top3.length === 0) {
    return <p className="text-xs text-neutral-500">Sin respuestas esta semana</p>;
  }
  return (
    <p className="text-xs text-neutral-700 dark:text-neutral-300">
      {m.top3
        .map((e) => `${e.label === "Otro" ? "Otro" : displayEmocion(e.label)} (${e.count})`)
        .join(" · ")}
    </p>
  );
}

function TextosColapsables({
  m,
}: {
  m: Extract<HabitWeekMetric, { tipo: "texto" }>;
}) {
  const [open, setOpen] = useState(false);
  if (m.respuestas.length === 0) {
    return <p className="text-xs text-neutral-500">Sin respuestas esta semana</p>;
  }
  return (
    <div>
      <button
        type="button"
        className="text-xs font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-neutral-400"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾" : "▸"} Ver respuestas ({m.respuestas.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {m.respuestas.map((r) => (
            <li
              key={r.fecha}
              className="rounded-md bg-neutral-50 px-2 py-1 text-xs dark:bg-neutral-800/50"
            >
              <span className="font-medium text-neutral-500">{r.fecha}:</span>{" "}
              <span className="text-neutral-700 dark:text-neutral-300">{r.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeltaPill({ delta, suffix }: { delta: number; suffix?: string }) {
  if (delta === 0) {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800">
        igual
      </span>
    );
  }
  const sign = delta > 0 ? "+" : "";
  const positive = delta > 0;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
        positive
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
      )}
    >
      {sign}
      {delta}
      {suffix ?? ""}
    </span>
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
