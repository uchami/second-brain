/**
 * ETA helpers.
 * Day-of-week is stored as 1=Mon, 2=Tue, ..., 7=Sun (ISO).
 * Picking a day resolves to the soonest date that matches: today counts if it's that day.
 */

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DAY_LABELS: Record<DayOfWeek, string> = {
  1: "L",
  2: "M",
  3: "X",
  4: "J",
  5: "V",
  6: "S",
  7: "D",
};

export const DAY_LABELS_LONG: Record<DayOfWeek, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export const ALL_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

function isoDow(d: Date): DayOfWeek {
  // JS Sunday=0..Saturday=6; we want 1..7 with Mon=1, Sun=7
  const js = d.getDay();
  return (js === 0 ? 7 : js) as DayOfWeek;
}

/**
 * Resolve a day-of-week choice to the soonest matching date.
 * If today's dow matches the picked day, returns today.
 * Operates in local time.
 */
export function resolveDayToDate(picked: DayOfWeek, today: Date = new Date()): Date {
  const todayDow = isoDow(today);
  const diff = (picked - todayDow + 7) % 7;
  const result = new Date(today);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + diff);
  return result;
}

export function dateToISO(d: Date): string {
  // Returns YYYY-MM-DD in local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODateLocal(iso: string): Date {
  // Treat YYYY-MM-DD as local midnight (avoid UTC offset bugs)
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

export function dayOfWeekOf(iso: string): DayOfWeek {
  return isoDow(parseISODateLocal(iso));
}

export function daysFromToday(iso: string, today: Date = new Date()): number {
  const target = parseISODateLocal(iso);
  const t0 = new Date(today);
  t0.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - t0.getTime()) / msPerDay);
}

export type EtaColor = "yellow" | "red" | "red-dark" | "violet" | "neutral";

/**
 * Color rule:
 *  - sin ETA -> neutral
 *  - hoy -> yellow
 *  - ayer (-1) -> red
 *  - anteayer (-2) -> red-dark
 *  - 3+ días pasado -> violet (caller añade calavera)
 *  - futuro -> neutral
 */
export function etaColor(iso: string | null, today: Date = new Date()): EtaColor {
  if (!iso) return "neutral";
  const diff = daysFromToday(iso, today);
  if (diff === 0) return "yellow";
  if (diff > 0) return "neutral";
  if (diff === -1) return "red";
  if (diff === -2) return "red-dark";
  return "violet";
}

export function formatEtaShort(iso: string, today: Date = new Date()): string {
  const d = parseISODateLocal(iso);
  const dow = isoDow(d);
  const diff = daysFromToday(iso, today);
  const dayLabel = DAY_LABELS_LONG[dow].slice(0, 3).toLowerCase();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  if (diff === 0) return `hoy · ${dayLabel} ${dd}/${mm}`;
  return `${dayLabel} ${dd}/${mm}`;
}

/** Start of week (Monday 00:00 local) for the given date. */
export function startOfWeekMonday(today: Date = new Date()): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = isoDow(d);
  d.setDate(d.getDate() - (dow - 1));
  return d;
}
