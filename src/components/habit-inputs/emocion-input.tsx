"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  EMOCIONES,
  EMOCION_GRUPOS,
  EMOCION_OTRO_PREFIX,
  parseEmocionValue,
} from "@/lib/emociones";

const OTRO_KEY = "__otro";

export function EmocionInput({
  value,
  onChange,
  onClear,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  onClear?: () => void;
}) {
  const parsed = parseEmocionValue(value);
  const selectedKey =
    parsed?.kind === "otro"
      ? OTRO_KEY
      : parsed?.kind === "canonica"
        ? parsed.slug
        : "";
  const [otroText, setOtroText] = useState(
    parsed?.kind === "otro" ? parsed.texto : "",
  );

  function handleSelect(key: string) {
    if (key === OTRO_KEY) {
      // Setear placeholder vacío; el commit ocurre cuando escriben
      onChange(EMOCION_OTRO_PREFIX);
      return;
    }
    onChange(key);
  }

  function commitOtro(v: string) {
    setOtroText(v);
    const trimmed = v.trim();
    if (!trimmed) {
      // todavía válido como "otro:" vacío; el modal lo va a considerar sin valor
      // pero conservamos la selección del modo Otro
      onChange(EMOCION_OTRO_PREFIX);
      return;
    }
    onChange(`${EMOCION_OTRO_PREFIX}${trimmed}`);
  }

  return (
    <div className="space-y-2">
      <Select value={selectedKey || undefined} onValueChange={handleSelect}>
        <SelectTrigger>
          <SelectValue placeholder="Elegí una emoción…" />
        </SelectTrigger>
        <SelectContent>
          {EMOCION_GRUPOS.map((g, idx) => {
            const items = EMOCIONES.filter((e) => e.grupo === g.key);
            if (items.length === 0) return null;
            return (
              <SelectGroup key={g.key}>
                {idx > 0 && (
                  <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
                )}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  {g.label}
                </div>
                {items.map((e) => (
                  <SelectItem key={e.slug} value={e.slug}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
          <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          <SelectItem value={OTRO_KEY}>Otro…</SelectItem>
        </SelectContent>
      </Select>

      {selectedKey === OTRO_KEY && (
        <Input
          autoFocus
          value={otroText}
          onChange={(e) => commitOtro(e.target.value)}
          placeholder="¿Qué sentiste?"
        />
      )}

      {value !== undefined && (
        <button
          type="button"
          className="text-xs text-neutral-500 underline-offset-2 hover:underline"
          onClick={() => {
            setOtroText("");
            if (onClear) onClear();
            else onChange(undefined);
          }}
        >
          limpiar
        </button>
      )}
    </div>
  );
}
