// Utilidades de fecha en timezone del usuario (no del servidor).
// Toda lógica de "qué día es hoy" usa user_settings.timezone como source of truth.

// Devuelve "YYYY-MM-DD" para el instante `at` en la timezone `tz`.
export function dateInTZ(at: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produce "YYYY-MM-DD"
  return fmt.format(at);
}

// Devuelve "HH:MM" para el instante `at` en la timezone `tz`.
export function timeInTZ(at: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(at);
}

// Suma `days` (puede ser negativo) a un string "YYYY-MM-DD" y devuelve el resultado.
// Operación calendárica pura, no usa la fecha actual.
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Compara dos strings de hora "HH:MM" o "HH:MM:SS".
export function timeBetween(now: string, inicio: string, fin: string): boolean {
  // Normalizar a HH:MM
  const n = now.slice(0, 5);
  const i = inicio.slice(0, 5);
  const f = fin.slice(0, 5);
  if (i <= f) {
    // mismo día: 09:00 → 17:00
    return n >= i && n < f;
  } else {
    // wrap nocturno: 21:00 → 05:00 (cubre 21:00..23:59 y 00:00..04:59)
    return n >= i || n < f;
  }
}

// Devuelve el día de la semana del ISO "YYYY-MM-DD" (0=domingo, 1=lunes, ..., 6=sábado).
export function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Devuelve el lunes de la semana del ISO dado (como ISO).
export function startOfWeekMonday(isoDate: string): string {
  const dow = dayOfWeek(isoDate); // 0=dom, 1=lun, ..., 6=sab
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(isoDate, diffToMonday);
}
