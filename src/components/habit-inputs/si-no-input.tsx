"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SiNoInput({
  value,
  onChange,
  onClear,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("si")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
          value === "si"
            ? "bg-emerald-600 text-white"
            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700",
        )}
      >
        <Check size={16} /> Sí
      </button>
      <button
        type="button"
        onClick={() => onChange("no")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
          value === "no"
            ? "bg-neutral-600 text-white"
            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700",
        )}
      >
        <X size={16} /> No
      </button>
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
