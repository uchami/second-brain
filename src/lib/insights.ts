// Cálculos de métricas agregadas del Journal por hábito y rango de fechas.
// Mobile-first: las visualizaciones son sparklines simples (1 barra por
// semana del rango, o 1 por día si el rango es "Esta semana"). Sin libs de
// charts — el cliente renderiza con SVG/divs.

import type { Habito, HabitoEntry, HabitoTipo } from "@/db/schema";
import { addDays, startOfWeekMonday } from "./tz-dates";

export type InsightsRange = {
  fromISO: string; // inclusive
  toISO: string; // inclusive
};

// Granularidad de la sparkline. "day" se usa solo cuando el rango es ≤ 7 días.
export type Bucket = "day" | "week";

// Una barra de la sparkline. valuePct es el % de días "tracked" (con entry no
// skipped) sobre los días que ese bucket cubre dentro del rango.
export type SparklineBar = {
  labelISO: string; // ISO del primer día del bucket (lunes si week)
  valuePct: number; // 0..100
  total: number; // días del bucket dentro del rango
  filled: number; // días con entry no skipped dentro del bucket
};

// Stats agregadas por hábito.
export type HabitInsight = {
  habito: Habito;
  // Total de entries (incluye skipped) en el rango. Útil para "ratio total".
  totalEntries: number;
  // Entries con valor (no skipped). El numerador de "completion".
  filledEntries: number;
  // Entries skipped explícitamente.
  skippedEntries: number;
  // Días dentro del rango que NO tienen entry.
  emptyDays: number;
  // 0..100. Completion = filled / total_days_in_range.
  completionPct: number;
  // Métrica nativa al tipo. Si no aplica (texto), null.
  nativeMetric: NativeMetric | null;
  // Sparkline para visualizar evolución.
  sparkline: SparklineBar[];
  bucket: Bucket;
};

export type NativeMetric =
  | { kind: "avg"; label: string; value: number; min: number; max: number }
  | { kind: "yesNoPct"; yesPct: number; yesCount: number; noCount: number }
  | { kind: "topEmotions"; top: Array<{ emocion: string; count: number }> }
  | { kind: "textCount"; count: number };

export const RANGE_PRESETS = [
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "3meses", label: "Últimos 3 meses" },
  { id: "6meses", label: "Últimos 6 meses" },
  { id: "custom", label: "Custom" },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"];

// Calcula el rango ISO para un preset, anchurado en hoyISO.
export function rangeFromPreset(
  preset: Exclude<RangePresetId, "custom">,
  hoyISO: string,
): InsightsRange {
  switch (preset) {
    case "semana": {
      // Desde el lunes hasta hoy (no hasta el domingo: queremos data parcial).
      return { fromISO: startOfWeekMonday(hoyISO), toISO: hoyISO };
    }
    case "mes": {
      // Día 1 del mes hasta hoy.
      const firstOfMonth = hoyISO.slice(0, 8) + "01";
      return { fromISO: firstOfMonth, toISO: hoyISO };
    }
    case "3meses":
      return { fromISO: addDays(hoyISO, -90), toISO: hoyISO };
    case "6meses":
      return { fromISO: addDays(hoyISO, -180), toISO: hoyISO };
  }
}

// Cantidad de días en un rango (inclusive).
function daysInRange(range: InsightsRange): number {
  const [y1, m1, d1] = range.fromISO.split("-").map(Number);
  const [y2, m2, d2] = range.toISO.split("-").map(Number);
  const dt1 = Date.UTC(y1, m1 - 1, d1);
  const dt2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((dt2 - dt1) / (1000 * 60 * 60 * 24)) + 1;
}

// Itera todos los días del rango como ISO.
function* iterDays(range: InsightsRange): Generator<string> {
  let cur = range.fromISO;
  while (cur <= range.toISO) {
    yield cur;
    cur = addDays(cur, 1);
  }
}

// Bucket recomendado según el span del rango.
function bucketFor(range: InsightsRange): Bucket {
  return daysInRange(range) <= 7 ? "day" : "week";
}

function buildSparkline(
  entriesByDate: Map<string, HabitoEntry>,
  range: InsightsRange,
  bucket: Bucket,
): SparklineBar[] {
  if (bucket === "day") {
    const bars: SparklineBar[] = [];
    for (const d of iterDays(range)) {
      const e = entriesByDate.get(d);
      const filled = e && !e.skipped ? 1 : 0;
      bars.push({
        labelISO: d,
        valuePct: filled * 100,
        total: 1,
        filled,
      });
    }
    return bars;
  }
  // Bucket semanal — agrupar por lunes.
  const buckets = new Map<
    string,
    { total: number; filled: number }
  >();
  for (const d of iterDays(range)) {
    const monday = startOfWeekMonday(d);
    const b = buckets.get(monday) ?? { total: 0, filled: 0 };
    b.total += 1;
    const e = entriesByDate.get(d);
    if (e && !e.skipped) b.filled += 1;
    buckets.set(monday, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([labelISO, { total, filled }]) => ({
      labelISO,
      valuePct: total > 0 ? Math.round((filled / total) * 100) : 0,
      total,
      filled,
    }));
}

function computeNativeMetric(
  tipo: HabitoTipo,
  entriesFilled: HabitoEntry[],
): NativeMetric | null {
  if (entriesFilled.length === 0) {
    // Aún así devolvemos un placeholder para que el card no parezca roto.
    if (tipo === "texto") return { kind: "textCount", count: 0 };
    if (tipo === "si_no")
      return { kind: "yesNoPct", yesPct: 0, yesCount: 0, noCount: 0 };
    if (tipo === "emocion") return { kind: "topEmotions", top: [] };
    return { kind: "avg", label: labelForTipo(tipo), value: 0, min: 0, max: 0 };
  }
  if (tipo === "escala_1_10" || tipo === "estrellas") {
    const nums = entriesFilled
      .map((e) => Number(e.valor))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0)
      return {
        kind: "avg",
        label: labelForTipo(tipo),
        value: 0,
        min: 0,
        max: 0,
      };
    const sum = nums.reduce((a, b) => a + b, 0);
    return {
      kind: "avg",
      label: labelForTipo(tipo),
      value: sum / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
    };
  }
  if (tipo === "si_no") {
    let yes = 0;
    let no = 0;
    for (const e of entriesFilled) {
      const v = (e.valor ?? "").toLowerCase();
      if (v === "si" || v === "sí" || v === "yes") yes += 1;
      else no += 1;
    }
    const total = yes + no;
    return {
      kind: "yesNoPct",
      yesPct: total > 0 ? Math.round((yes / total) * 100) : 0,
      yesCount: yes,
      noCount: no,
    };
  }
  if (tipo === "emocion") {
    const counts = new Map<string, number>();
    for (const e of entriesFilled) {
      const v = e.valor ?? "";
      // Normalizar el prefijo "otro:" — mostrar el texto del usuario.
      const key = v.startsWith("otro:") ? v.slice(5).trim() || "(otro)" : v;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const top = Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([emocion, count]) => ({ emocion, count }));
    return { kind: "topEmotions", top };
  }
  if (tipo === "texto") {
    return { kind: "textCount", count: entriesFilled.length };
  }
  return null;
}

function labelForTipo(tipo: HabitoTipo): string {
  if (tipo === "escala_1_10") return "Promedio (1–10)";
  if (tipo === "estrellas") return "Promedio (⭐)";
  return "Promedio";
}

export function computeHabitInsights(
  habitos: Habito[],
  entries: HabitoEntry[],
  range: InsightsRange,
): HabitInsight[] {
  const bucket = bucketFor(range);
  const total = daysInRange(range);
  return habitos.map((h) => {
    const own = entries.filter(
      (e) =>
        e.habitoId === h.id &&
        e.fecha >= range.fromISO &&
        e.fecha <= range.toISO,
    );
    const byDate = new Map<string, HabitoEntry>();
    for (const e of own) byDate.set(e.fecha, e);
    const filledEntries = own.filter((e) => !e.skipped);
    const skippedEntries = own.length - filledEntries.length;
    const emptyDays = total - own.length;
    const completionPct =
      total > 0 ? Math.round((filledEntries.length / total) * 100) : 0;
    return {
      habito: h,
      totalEntries: own.length,
      filledEntries: filledEntries.length,
      skippedEntries,
      emptyDays,
      completionPct,
      nativeMetric: computeNativeMetric(h.tipo, filledEntries),
      sparkline: buildSparkline(byDate, range, bucket),
      bucket,
    };
  });
}
