"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { displayEmocion } from "@/lib/emociones";
import {
  RANGE_PRESETS,
  computeHabitInsights,
  rangeFromPreset,
  type HabitInsight,
  type InsightsRange,
  type RangePresetId,
} from "@/lib/insights";
import type { Habito, HabitoEntry } from "@/db/schema";

export function InsightsView({
  habitos,
  entries,
  hoyISO,
}: {
  habitos: Habito[];
  entries: HabitoEntry[];
  hoyISO: string;
}) {
  const [preset, setPreset] = useState<RangePresetId>("mes");
  const [customFrom, setCustomFrom] = useState<string>(daysAgo(hoyISO, 30));
  const [customTo, setCustomTo] = useState<string>(hoyISO);

  const range: InsightsRange = useMemo(() => {
    if (preset === "custom") {
      // Sanity-check: si invertidos, los volteo.
      const from = customFrom < customTo ? customFrom : customTo;
      const to = customFrom < customTo ? customTo : customFrom;
      return { fromISO: from, toISO: to };
    }
    return rangeFromPreset(preset, hoyISO);
  }, [preset, customFrom, customTo, hoyISO]);

  const insights = useMemo(
    () => computeHabitInsights(habitos, entries, range),
    [habitos, entries, range],
  );

  if (habitos.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <Header />
        <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          No tenés hábitos configurados todavía.{" "}
          <Link href="/settings" className="underline">
            Configurarlos
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
      <Header />

      <RangePicker
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-500">
        {formatRangeISO(range.fromISO)} — {formatRangeISO(range.toISO)} ·{" "}
        {daysBetween(range.fromISO, range.toISO)} días
      </p>

      <div className="space-y-3">
        {insights.map((insight) => (
          <InsightCard key={insight.habito.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-4 flex items-center gap-2">
      <Link href="/">
        <Button variant="ghost" size="icon" aria-label="Volver">
          <ArrowLeft size={16} />
        </Button>
      </Link>
      <div className="flex items-center gap-2">
        <BarChart3 size={18} className="text-neutral-500" />
        <h1 className="text-xl font-bold tracking-tight">Métricas</h1>
      </div>
    </header>
  );
}

function RangePicker({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  preset: RangePresetId;
  onPresetChange: (p: RangePresetId) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (s: string) => void;
  onCustomToChange: (s: string) => void;
}) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              preset === p.id
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
          <label className="flex items-center gap-1">
            Desde
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="flex items-center gap-1">
            Hasta
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: HabitInsight }) {
  const { habito, completionPct, sparkline, bucket } = insight;
  const maxBar = Math.max(...sparkline.map((b) => b.valuePct), 1);
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-2 text-sm font-medium leading-snug">
        {habito.pregunta}
      </h2>

      {/* Stat principal según el tipo. Si hay nativeMetric, eso manda;
          si no, mostramos completionPct como protagonista. */}
      <PrimaryStat insight={insight} />

      {/* Sparkline */}
      <div className="mt-3">
        <Sparkline bars={sparkline} maxBar={maxBar} bucket={bucket} />
      </div>

      {/* Stats secundarias */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500 dark:text-neutral-400">
        <Stat label="Completion" value={`${completionPct}%`} />
        <Stat label="Trackeados" value={insight.filledEntries} />
        {insight.skippedEntries > 0 && (
          <Stat label="Skipped" value={insight.skippedEntries} />
        )}
        {insight.emptyDays > 0 && (
          <Stat label="Sin registrar" value={insight.emptyDays} />
        )}
      </div>
    </div>
  );
}

function PrimaryStat({ insight }: { insight: HabitInsight }) {
  const m = insight.nativeMetric;
  if (!m) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{insight.completionPct}%</span>
        <span className="text-xs text-neutral-500">completado</span>
      </div>
    );
  }
  if (m.kind === "avg") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">
          {insight.filledEntries === 0 ? "—" : m.value.toFixed(1)}
        </span>
        <span className="text-xs text-neutral-500">{m.label}</span>
      </div>
    );
  }
  if (m.kind === "yesNoPct") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{m.yesPct}%</span>
        <span className="text-xs text-neutral-500">
          de Sí ({m.yesCount}/{m.yesCount + m.noCount})
        </span>
      </div>
    );
  }
  if (m.kind === "topEmotions") {
    if (m.top.length === 0) {
      return (
        <div className="text-xs text-neutral-500">Sin registros aún</div>
      );
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {m.top.map((t) => (
          <span
            key={t.emocion}
            className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {displayEmocion(t.emocion)} · {t.count}
          </span>
        ))}
      </div>
    );
  }
  if (m.kind === "textCount") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{m.count}</span>
        <span className="text-xs text-neutral-500">
          {m.count === 1 ? "registro" : "registros"}
        </span>
      </div>
    );
  }
  return null;
}

function Sparkline({
  bars,
  maxBar,
  bucket,
}: {
  bars: { labelISO: string; valuePct: number }[];
  maxBar: number;
  bucket: "day" | "week";
}) {
  if (bars.length === 0) {
    return (
      <div className="text-xs text-neutral-400">Sin datos en el rango</div>
    );
  }
  // Para mantener legibilidad en mobile cuando hay muchas barras, decidimos
  // cuántas etiquetas mostramos (visibles) — el resto deja un espacio en
  // blanco abajo para preservar el grid. Día siempre etiqueta cada barra
  // (max 7). Semana: cada 2 hasta 13 barras, cada 4 para más.
  const labelEvery =
    bucket === "day"
      ? 1
      : bars.length <= 6
        ? 1
        : bars.length <= 13
          ? 2
          : 4;

  return (
    <div className="space-y-1">
      <div className="flex h-9 items-end gap-[2px] sm:gap-[3px]">
        {bars.map((b, idx) => {
          const h = maxBar > 0 ? Math.max((b.valuePct / maxBar) * 100, 4) : 4;
          return (
            <div
              key={b.labelISO + idx}
              title={`${bucket === "day" ? b.labelISO : weekRangeLabel(b.labelISO)} · ${b.valuePct}%`}
              className={cn(
                "flex-1 rounded-sm",
                b.valuePct > 0
                  ? "bg-emerald-400 dark:bg-emerald-600"
                  : "bg-neutral-200 dark:bg-neutral-800",
              )}
              style={{ height: `${h}%`, minHeight: "4px" }}
              aria-hidden
            />
          );
        })}
      </div>
      <div className="flex gap-[2px] text-[9px] leading-none text-neutral-400 sm:gap-[3px] sm:text-[10px] dark:text-neutral-500">
        {bars.map((b, idx) => {
          const show = idx % labelEvery === 0 || idx === bars.length - 1;
          return (
            <div
              key={"l" + b.labelISO + idx}
              className="flex-1 text-center tabular-nums"
            >
              {show ? formatBarLabel(b.labelISO, bucket) : " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Formato compacto para etiquetas de barra. Día → letra de día de la semana
// (L/M/X/J/V/S/D). Semana → "DD/MM" del lunes.
const DOW_LETTERS = ["D", "L", "M", "X", "J", "V", "S"]; // 0=domingo
function formatBarLabel(iso: string, bucket: "day" | "week"): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (bucket === "day") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return DOW_LETTERS[dow] ?? "";
  }
  // Week: "DD/MM"
  return `${d}/${m}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="font-semibold text-neutral-700 dark:text-neutral-200">
        {value}
      </span>{" "}
      {label}
    </span>
  );
}

function formatRangeISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${d} ${meses[m - 1]} ${y}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.split("-").map(Number);
  const [y2, m2, d2] = toISO.split("-").map(Number);
  return (
    Math.round(
      (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) /
        (1000 * 60 * 60 * 24),
    ) + 1
  );
}

function daysAgo(hoyISO: string, n: number): string {
  const [y, m, d] = hoyISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function weekRangeLabel(mondayISO: string): string {
  return `Semana del ${formatRangeISO(mondayISO)}`;
}
