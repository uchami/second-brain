/**
 * Display labels for buckets. Buckets 0-3 are renamed; 4+ stay as
 * "Bucket N" since they're the user's overflow space.
 */
const NAMED: Record<number, string> = {
  0: "Importante",
  1: "Si hay tiempo…",
  2: "Quizás más tarde",
  3: "Meh, pero lo anoto",
};

export function bucketLabel(n: number | null): string {
  if (n === null) return "Sin definir";
  return NAMED[n] ?? `Bucket ${n}`;
}
