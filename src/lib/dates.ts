const MES_LARGO = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function formatDateLong(d: Date): string {
  const day = d.getDate();
  const m = MES_LARGO[d.getMonth()];
  const y = d.getFullYear();
  return `${day} de ${m} ${y}`;
}

export function daysBetween(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

export function formatDaysInList(days: number): string {
  if (days === 0) return "mismo día";
  if (days === 1) return "1 día en la lista";
  return `${days} días en la lista`;
}
