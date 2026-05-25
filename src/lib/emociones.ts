// Lista canónica de emociones. Hardcoded global por ahora (multi-tenant note en
// spec-habits.md). Single-select en el input. La opción "Otro" no vive acá —
// se renderiza al final del select y se guarda como `"otro:<texto libre>"`.

export type EmocionGrupo =
  | "agradable_alta"
  | "agradable_baja"
  | "desagradable_alta"
  | "desagradable_baja"
  | "mixta";

export type Emocion = {
  slug: string;
  label: string;
  grupo: EmocionGrupo;
};

export const EMOCION_GRUPOS: { key: EmocionGrupo; label: string }[] = [
  { key: "agradable_alta", label: "Agradable · alta energía" },
  { key: "agradable_baja", label: "Agradable · baja energía" },
  { key: "desagradable_alta", label: "Desagradable · alta energía" },
  { key: "desagradable_baja", label: "Desagradable · baja energía" },
  { key: "mixta", label: "Mixta" },
];

export const EMOCIONES: Emocion[] = [
  { slug: "alegria", label: "Alegría", grupo: "agradable_alta" },
  { slug: "entusiasmo", label: "Entusiasmo", grupo: "agradable_alta" },
  { slug: "orgullo", label: "Orgullo", grupo: "agradable_alta" },
  { slug: "calma", label: "Calma", grupo: "agradable_baja" },
  { slug: "gratitud", label: "Gratitud", grupo: "agradable_baja" },
  { slug: "ansiedad", label: "Ansiedad", grupo: "desagradable_alta" },
  { slug: "enojo", label: "Enojo", grupo: "desagradable_alta" },
  { slug: "frustracion", label: "Frustración", grupo: "desagradable_alta" },
  { slug: "miedo", label: "Miedo", grupo: "desagradable_alta" },
  { slug: "tristeza", label: "Tristeza", grupo: "desagradable_baja" },
  { slug: "verguenza", label: "Vergüenza", grupo: "desagradable_baja" },
  { slug: "aburrimiento", label: "Aburrimiento", grupo: "desagradable_baja" },
  { slug: "sorpresa", label: "Sorpresa", grupo: "mixta" },
];

export const EMOCION_OTRO_PREFIX = "otro:";

export type ParsedEmocion =
  | { kind: "canonica"; slug: string; label: string }
  | { kind: "otro"; texto: string };

export function parseEmocionValue(v: string | null | undefined): ParsedEmocion | null {
  if (!v) return null;
  if (v.startsWith(EMOCION_OTRO_PREFIX)) {
    return { kind: "otro", texto: v.slice(EMOCION_OTRO_PREFIX.length) };
  }
  const found = EMOCIONES.find((e) => e.slug === v);
  if (found) return { kind: "canonica", slug: found.slug, label: found.label };
  return null;
}

// Para mostrar en el card del día: si es "otro:nostalgia" muestra "nostalgia",
// si es canónica muestra el label, si no parsea muestra el raw.
export function displayEmocion(v: string | null | undefined): string {
  if (!v) return "";
  const parsed = parseEmocionValue(v);
  if (!parsed) return v;
  return parsed.kind === "otro" ? parsed.texto : parsed.label;
}
