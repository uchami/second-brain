// Generador de feed iCalendar (RFC 5545) para reminders de tasks y hábitos.
// Pensado para suscripción vía Google/Apple Calendar — no para descarga
// puntual. El cliente polea cada ~3-12hs y maneja los reminders nativamente.

import type { Habito, Task } from "@/db/schema";

export type IcalInput = {
  // Identificador estable del calendar — usado en PRODID y UID prefix.
  feedId: string;
  // Nombre legible que aparece en el calendar del usuario.
  feedName: string;
  // Hora local del reminder diario de hábitos, "HH:MM" o "HH:MM:SS".
  reminderTime: string;
  // Timezone del usuario (IANA). Usado para todos los DTSTART/DTEND locales.
  tz: string;
  // URL de la app — aparece en la descripción del reminder de hábitos como
  // shortcut clickeable para abrir el modal y registrar.
  appUrl: string;
  // Tareas con ETA no done → evento all-day el día del ETA.
  tasks: Task[];
  // Hábitos activos → cantidad usada solo para decidir si emitimos el
  // reminder (si no hay hábitos activos, no hay nada que registrar).
  habitos: Habito[];
};

// Escapa texto según RFC 5545 §3.3.11.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// Convierte "YYYY-MM-DD" a "YYYYMMDD" (formato ICS DATE).
function isoDateToIcs(iso: string): string {
  return iso.replace(/-/g, "");
}

// Convierte "HH:MM" o "HH:MM:SS" a "HHMMSS".
function timeToIcs(t: string): string {
  const parts = t.split(":");
  const hh = (parts[0] ?? "00").padStart(2, "0");
  const mm = (parts[1] ?? "00").padStart(2, "0");
  const ss = (parts[2] ?? "00").padStart(2, "0");
  return `${hh}${mm}${ss}`;
}

// Fold lines a 75 octets como manda el RFC (suavemente — para que Apple/Google
// no se quejen). Continuation: CRLF + espacio.
function foldLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  const chunks: string[] = [];
  let i = 0;
  // Primera línea hasta 75, las siguientes hasta 74 (porque el espacio es 1).
  chunks.push(line.slice(i, i + max));
  i += max;
  while (i < line.length) {
    chunks.push(" " + line.slice(i, i + (max - 1)));
    i += max - 1;
  }
  return chunks.join("\r\n");
}

function nowStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

export function buildIcal(input: IcalInput): string {
  const dtstamp = nowStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//second-brain//${input.feedId}//ES`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.feedName)}`,
    `X-WR-TIMEZONE:${input.tz}`,
  ];

  // -------- Tasks con ETA --------
  for (const t of input.tasks) {
    if (!t.eta || t.estado === "done") continue;
    const dateStart = isoDateToIcs(t.eta);
    // VEVENT all-day: DTSTART/DTEND VALUE=DATE, con DTEND = día siguiente.
    const next = isoDateToIcs(addDayISO(t.eta));
    const uid = `task-${t.id}@${input.feedId}`;
    const summary = `📌 ${t.titulo}`;
    const description = t.detalle ? t.detalle : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateStart}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escapeText(summary)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15H", // 9am del día del ETA (15h después de 00:00 = 09:00 local-ish)
      `DESCRIPTION:${escapeText(summary)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  // -------- Hábitos: UN solo reminder recurrente diario --------
  // No emitimos un evento por hábito (saturaba el calendar y dificultaba
  // dismiss). Un solo "Registrar hábitos" diario alcanza — el usuario abre
  // la app y registra todo lo que tiene activo. La descripción tiene la URL
  // como shortcut clickeable desde el calendar event.
  const activos = input.habitos.filter((h) => !h.archivado);
  if (activos.length > 0) {
    const time = timeToIcs(input.reminderTime);
    const today = nowStamp().slice(0, 8);
    const summary = "🧠 Registrar hábitos";
    const description = `Abrí el second brain para registrar tus hábitos de hoy:\n${input.appUrl}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:habitos-daily@${input.feedId}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${input.tz}:${today}T${time}`,
      `DTEND;TZID=${input.tz}:${today}T${addMinutes(time, 15)}`,
      "RRULE:FREQ=DAILY",
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${input.appUrl}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT0M",
      `DESCRIPTION:${escapeText(summary)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function addDayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function addMinutes(hhmmss: string, mins: number): string {
  const hh = Number(hhmmss.slice(0, 2));
  const mm = Number(hhmmss.slice(2, 4));
  const ss = Number(hhmmss.slice(4, 6));
  let total = hh * 60 + mm + mins;
  total = ((total % 1440) + 1440) % 1440;
  const outH = String(Math.floor(total / 60)).padStart(2, "0");
  const outM = String(total % 60).padStart(2, "0");
  return `${outH}${outM}${String(ss).padStart(2, "0")}`;
}
