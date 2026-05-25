"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function EstrellasInput({
  value,
  onChange,
  onClear,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  onClear?: () => void;
}) {
  const n = value ? parseInt(value, 10) : 0;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} estrellas`}
          onClick={() => onChange(String(i))}
          className={cn(
            "rounded-md p-1.5 transition-colors",
            i <= n
              ? "text-amber-500"
              : "text-neutral-300 hover:text-amber-400 dark:text-neutral-600",
          )}
        >
          <Star
            size={28}
            fill={i <= n ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
      ))}
      {value !== undefined && (
        <button
          type="button"
          className="ml-2 text-xs text-neutral-500 underline-offset-2 hover:underline"
          onClick={() => (onClear ? onClear() : onChange(undefined))}
        >
          limpiar
        </button>
      )}
    </div>
  );
}
