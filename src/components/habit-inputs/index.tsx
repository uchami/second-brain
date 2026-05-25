"use client";

import type { HabitoTipo } from "@/db/schema";
import { TextoInput } from "./texto-input";
import { EstrellasInput } from "./estrellas-input";
import { Escala1a10Input } from "./escala-input";
import { SiNoInput } from "./si-no-input";
import { EmocionInput } from "./emocion-input";

export type HabitInputProps = {
  tipo: HabitoTipo;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  onClear?: () => void;
};

export function HabitInput({ tipo, value, onChange, onClear }: HabitInputProps) {
  switch (tipo) {
    case "texto":
      return <TextoInput value={value} onChange={onChange} onClear={onClear} />;
    case "estrellas":
      return (
        <EstrellasInput value={value} onChange={onChange} onClear={onClear} />
      );
    case "escala_1_10":
      return (
        <Escala1a10Input value={value} onChange={onChange} onClear={onClear} />
      );
    case "si_no":
      return <SiNoInput value={value} onChange={onChange} onClear={onClear} />;
    case "emocion":
      return <EmocionInput value={value} onChange={onChange} onClear={onClear} />;
  }
}

// Helper para la UI read-only en cards de la tab Habits / cierre de semana.
// El modal usa solo HabitInput.
export { TextoInput, EstrellasInput, Escala1a10Input, SiNoInput, EmocionInput };
