import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Normaliza texto para búsqueda case-insensitive + sin tildes/diacríticos.
// Ejemplo: "Niños — sábado" → "ninos — sabado". Stripping NFD lo hace
// porque las tildes se separan como combining marks y se filtran por rango.
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
