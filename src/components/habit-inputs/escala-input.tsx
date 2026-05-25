"use client";

import { cn } from "@/lib/utils";

export function Escala1a10Input({
  value,
  onChange,
  onClear,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  onClear?: () => void;
}) {
  const n = value ? parseInt(value, 10) : undefined;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(String(i))}
            className={cn(
              "rounded-md py-2 text-sm font-medium tabular-nums transition-colors",
              n === i
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700",
            )}
            aria-label={`${i}`}
          >
            {i}
          </button>
        ))}
      </div>
      {value !== undefined && (
        <button
          type="button"
          className="text-xs text-neutral-500 underline-offset-2 hover:underline"
          onClick={() => (onClear ? onClear() : onChange(undefined))}
        >
          limpiar
        </button>
      )}
    </div>
  );
}
