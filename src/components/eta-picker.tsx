"use client";

import { useState } from "react";
import { ALL_DAYS, DAY_LABELS, dateToISO, resolveDayToDate, type DayOfWeek } from "@/lib/eta";
import { cn } from "@/lib/utils";

export function EtaPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  // Highlight which day-of-week this ISO maps to (if today picks that day, hoy)
  const [hoverDay, setHoverDay] = useState<DayOfWeek | null>(null);

  function selectDay(day: DayOfWeek) {
    const d = resolveDayToDate(day);
    onChange(dateToISO(d));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {ALL_DAYS.map((day) => {
          const iso = dateToISO(resolveDayToDate(day));
          const active = value === iso;
          return (
            <button
              key={day}
              type="button"
              onClick={() => selectDay(day)}
              onMouseEnter={() => setHoverDay(day)}
              onMouseLeave={() => setHoverDay(null)}
              className={cn(
                "h-9 flex-1 rounded-lg border text-sm font-medium transition-colors",
                active
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
              )}
            >
              {DAY_LABELS[day]}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">
          {value ? value : "Sin ETA"}
          {hoverDay !== null && !value && (
            <> · próximo {DAY_LABELS[hoverDay]}</>
          )}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Quitar ETA
          </button>
        )}
      </div>
    </div>
  );
}
