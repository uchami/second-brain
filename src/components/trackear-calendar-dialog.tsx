"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HabitoEntry } from "@/db/schema";

const MES_LARGO = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const DOW_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function ymdToISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoYear(iso: string): number {
  return parseInt(iso.slice(0, 4), 10);
}
function isoMonth(iso: string): number {
  return parseInt(iso.slice(5, 7), 10) - 1;
}

export function TrackearCalendarDialog({
  open,
  onClose,
  hoyISO,
  entriesByFecha,
  onPickDate,
}: {
  open: boolean;
  onClose: () => void;
  hoyISO: string;
  entriesByFecha: Map<string, HabitoEntry[]>;
  onPickDate: (fecha: string) => void;
}) {
  const [cursor, setCursor] = useState({
    year: isoYear(hoyISO),
    month: isoMonth(hoyISO),
  });

  function prevMonth() {
    setCursor((c) => {
      const m = c.month - 1;
      return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m };
    });
  }
  function nextMonth() {
    setCursor((c) => {
      const m = c.month + 1;
      return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m };
    });
  }

  // Construir grid: lunes-first
  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const lastOfMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  // dow: 0=dom..6=sab; queremos lunes=0..domingo=6
  const dow0 = firstOfMonth.getDay(); // 0=dom
  const leadingBlanks = dow0 === 0 ? 6 : dow0 - 1;

  const cells: ({ iso: string; day: number; hasEntries: boolean; isFuture: boolean } | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= lastOfMonth; d++) {
    const iso = ymdToISO(cursor.year, cursor.month, d);
    cells.push({
      iso,
      day: d,
      hasEntries: (entriesByFecha.get(iso)?.length ?? 0) > 0,
      isFuture: iso > hoyISO,
    });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold">
              Trackear día
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Cerrar"
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Mes anterior">
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm font-medium">
              {MES_LARGO[cursor.month]} {cursor.year}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              aria-label="Mes siguiente"
              disabled={
                cursor.year > isoYear(hoyISO) ||
                (cursor.year === isoYear(hoyISO) && cursor.month >= isoMonth(hoyISO))
              }
            >
              <ChevronRight size={16} />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {DOW_LABELS.map((l) => (
              <div
                key={l}
                className="text-center text-[10px] font-medium uppercase tracking-wide text-neutral-500"
              >
                {l}
              </div>
            ))}
            {cells.map((c, i) =>
              c === null ? (
                <div key={`b-${i}`} />
              ) : (
                <button
                  key={c.iso}
                  type="button"
                  disabled={c.isFuture}
                  onClick={() => onPickDate(c.iso)}
                  className={cn(
                    "aspect-square rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                    c.iso === hoyISO &&
                      "ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-neutral-900",
                    c.hasEntries
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700",
                  )}
                  aria-label={c.iso}
                >
                  {c.day}
                </button>
              ),
            )}
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Verde = al menos una entry. Gris = vacío. Tocá un día para registrar o editar.
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
