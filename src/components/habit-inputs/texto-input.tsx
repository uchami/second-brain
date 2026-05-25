"use client";

import { Textarea } from "@/components/ui/input";

export function TextoInput({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  onClear?: () => void;
}) {
  return (
    <Textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder="Escribí libremente…"
      rows={3}
    />
  );
}
