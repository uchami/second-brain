"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Flame, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CerrarDiaModal,
  type CerrarDiaInitialEntry,
  type CerrarDiaMode,
} from "@/components/cerrar-dia-modal";
import { TrackearCalendarDialog } from "@/components/trackear-calendar-dialog";
import { addDays, startOfWeekMonday } from "@/lib/tz-dates";
import { displayEmocion } from "@/lib/emociones";
import { formatDateLong } from "@/lib/dates";
import type { Habito, HabitoEntry, HabitoTipo } from "@/db/schema";

const MES_CORTO = [
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

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(iso: string): string {
  const d = isoToDate(iso);
  return `${d.getDate()} ${MES_CORTO[d.getMonth()]}`;
}

function longDate(iso: string): string {
  return formatDateLong(isoToDate(iso));
}

export function HabitsTab({
  habitos,
  habitoEntries,
  streak,
  hoyISO,
  celebrateFecha,
  onHabitSaved,
}: {
  habitos: Habito[];
  habitoEntries: HabitoEntry[];
  streak: number;
  hoyISO: string;
  celebrateFecha?: string | null;
  onHabitSaved: (info: {
    mode: "ritual" | "edit-hoy" | "trackear-otro";
    fecha: string;
  }) => void;
}) {
  const activos = useMemo(() => habitos.filter((h) => !h.archivado), [habitos]);
  const [modal, setModal] = useState<{
    mode: CerrarDiaMode;
    fecha: string;
    entries: CerrarDiaInitialEntry[];
  } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Cuántas semanas mostrar (carga inicial = 8, "Ver más" suma 4).
  const [weeksShown, setWeeksShown] = useState(8);

  if (activos.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No tenés hábitos configurados todavía.
        </p>
        <Link href="/settings">
          <Button size="sm">Configurar hábitos</Button>
        </Link>
      </div>
    );
  }

  // Agrupar entries por fecha
  const entriesByFecha = new Map<string, HabitoEntry[]>();
  for (const e of habitoEntries) {
    const arr = entriesByFecha.get(e.fecha) ?? [];
    arr.push(e);
    entriesByFecha.set(e.fecha, arr);
  }

  // Lista de fechas a renderizar: desde hoy hacia atrás weeksShown*7 días.
  const desde = addDays(hoyISO, -(weeksShown * 7 - 1));
  const dias: string[] = [];
  let cursor = hoyISO;
  while (cursor >= desde) {
    dias.push(cursor);
    cursor = addDays(cursor, -1);
  }

  // Agrupar por semana (lunes)
  const weeks = new Map<string, string[]>();
  for (const d of dias) {
    const wk = startOfWeekMonday(d);
    const arr = weeks.get(wk) ?? [];
    arr.push(d);
    weeks.set(wk, arr);
  }
  const weekKeys = [...weeks.keys()].sort((a, b) => (a < b ? 1 : -1));

  function openEditDia(fecha: string) {
    const ents: CerrarDiaInitialEntry[] = (entriesByFecha.get(fecha) ?? []).map(
      (e) => ({ habitoId: e.habitoId, valor: e.valor, skipped: e.skipped }),
    );
    // Si es hoy y no hay entries: ritual; si es hoy con entries: edit-hoy.
    // Si es otro día: trackear-otro.
    let mode: CerrarDiaMode;
    if (fecha === hoyISO) {
      mode = ents.length === 0 ? "ritual" : "edit-hoy";
    } else {
      mode = "trackear-otro";
    }
    setModal({ mode, fecha, entries: ents });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">
              Racha actual
            </p>
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Flame size={24} />
              <span className="text-4xl font-bold tabular-nums">{streak}</span>
              <span className="text-sm">
                {streak === 1 ? "día" : "días"}
              </span>
            </div>
          </div>
          <Button onClick={() => setCalendarOpen(true)} size="sm">
            <Plus size={14} /> Trackear hábito
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {weekKeys.map((wk) => {
          const fechasSemana = (weeks.get(wk) ?? []).sort((a, b) =>
            a < b ? 1 : -1,
          );
          const finSemana = addDays(wk, 6);
          const diasTrackeados = fechasSemana.filter(
            (d) => (entriesByFecha.get(d)?.length ?? 0) > 0,
          ).length;
          return (
            <section key={wk} className="space-y-2">
              <h2 className="px-1 text-xs uppercase tracking-wide text-neutral-500">
                Semana del {shortDate(wk)}–{shortDate(finSemana)} ·{" "}
                {diasTrackeados} {diasTrackeados === 1 ? "día trackeado" : "días trackeados"}
              </h2>
              <div className="space-y-2">
                {fechasSemana.map((d) => (
                  <DayCard
                    key={d}
                    fecha={d}
                    isToday={d === hoyISO}
                    habitos={activos}
                    entries={entriesByFecha.get(d) ?? []}
                    onEdit={() => openEditDia(d)}
                    celebrating={celebrateFecha === d}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeeksShown((w) => w + 4)}
        >
          Ver más semanas
        </Button>
      </div>

      {modal && (
        <CerrarDiaModal
          open={true}
          onClose={() => setModal(null)}
          mode={modal.mode}
          fecha={modal.fecha}
          habitos={activos}
          entriesIniciales={modal.entries}
          onSaved={onHabitSaved}
        />
      )}

      {calendarOpen && (
        <TrackearCalendarDialog
          open={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          hoyISO={hoyISO}
          entriesByFecha={entriesByFecha}
          onPickDate={(fecha) => {
            setCalendarOpen(false);
            openEditDia(fecha);
          }}
        />
      )}
    </div>
  );
}

function DayCard({
  fecha,
  isToday,
  habitos,
  entries,
  onEdit,
  celebrating,
}: {
  fecha: string;
  isToday: boolean;
  habitos: Habito[];
  entries: HabitoEntry[];
  onEdit: () => void;
  celebrating?: boolean;
}) {
  const [open, setOpen] = useState(isToday || !!celebrating);

  const entryById = new Map<number, HabitoEntry>();
  for (const e of entries) entryById.set(e.habitoId, e);

  const totalHab = habitos.length;
  const conValor = habitos.filter((h) => {
    const e = entryById.get(h.id);
    return e && !e.skipped && e.valor;
  }).length;
  const skipped = habitos.filter((h) => {
    const e = entryById.get(h.id);
    return e?.skipped;
  }).length;
  const sinContestar = totalHab - conValor - skipped;

  let status: string;
  let statusTone: string;
  if (totalHab === 0) {
    status = "Sin hábitos";
    statusTone = "text-neutral-500";
  } else if (entries.length === 0) {
    status = "Sin entries";
    statusTone = "text-neutral-500";
  } else if (sinContestar === 0) {
    status =
      skipped > 0
        ? `${conValor}/${totalHab} cerrado · ${skipped} skipped`
        : `${conValor}/${totalHab} cerrado`;
    statusTone = "text-emerald-600 dark:text-emerald-400";
  } else {
    status = `${conValor + skipped}/${totalHab} sin cerrar`;
    statusTone = "text-amber-600 dark:text-amber-400";
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white transition-all dark:bg-neutral-900",
        isToday
          ? "border-emerald-300 ring-2 ring-emerald-200 dark:border-emerald-700 dark:ring-emerald-800/40"
          : "border-neutral-200 dark:border-neutral-800",
        celebrating && "celebrate-ritual",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={14} className="text-neutral-400" />
          ) : (
            <ChevronRight size={14} className="text-neutral-400" />
          )}
          <span className="text-sm font-medium">
            {isToday ? "Hoy" : longDate(fecha)}
          </span>
          {isToday && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              hoy
            </span>
          )}
        </div>
        <span className={cn("text-xs", statusTone)}>{status}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-neutral-100 px-3 py-3 dark:border-neutral-800">
          {entries.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No hay respuestas para este día.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {habitos.map((h) => {
                const e = entryById.get(h.id);
                return (
                  <li
                    key={h.id}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {h.pregunta}
                    </span>
                    <ReadOnlyValue tipo={h.tipo} entry={e} />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end pt-1">
            <Button onClick={onEdit} size="sm" variant="outline">
              <Pencil size={12} />
              {entries.length === 0 ? "Trackear este día" : "Editar este día"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyValue({
  tipo,
  entry,
}: {
  tipo: HabitoTipo;
  entry: HabitoEntry | undefined;
}) {
  if (!entry) {
    return <span className="text-xs text-neutral-400">—</span>;
  }
  if (entry.skipped) {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        skip
      </span>
    );
  }
  if (entry.valor === null) {
    return <span className="text-xs text-neutral-400">—</span>;
  }
  switch (tipo) {
    case "si_no":
      return (
        <span
          className={cn(
            "text-xs font-medium",
            entry.valor === "si"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-neutral-500",
          )}
        >
          {entry.valor === "si" ? "Sí" : "No"}
        </span>
      );
    case "estrellas": {
      const n = parseInt(entry.valor, 10);
      return (
        <span className="text-xs text-amber-500">{"★".repeat(n)}{"☆".repeat(5 - n)}</span>
      );
    }
    case "escala_1_10":
      return (
        <span className="text-xs font-medium tabular-nums">{entry.valor}/10</span>
      );
    case "emocion":
      return (
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {displayEmocion(entry.valor)}
        </span>
      );
    case "texto":
      return (
        <span className="max-w-[60%] text-right text-xs text-neutral-600 dark:text-neutral-400">
          {entry.valor.length > 80 ? `${entry.valor.slice(0, 80)}…` : entry.valor}
        </span>
      );
  }
}
