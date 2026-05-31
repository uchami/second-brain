// CSV utilities — RFC4180-ish, suficiente para export/import del usuario.

// Escapa un valor para CSV: si contiene comilla, coma o newline, lo
// envuelve en comillas dobles y duplica las comillas internas.
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Serializa filas a un CSV string con headers explícitos.
export function csvSerialize<T extends Record<string, unknown>>(
  rows: T[],
  headers: (keyof T)[],
): string {
  const head = headers.map((h) => csvCell(String(h))).join(",");
  const body = rows
    .map((r) =>
      headers
        .map((h) => csvCell(r[h] as string | number | boolean | null | undefined))
        .join(","),
    )
    .join("\n");
  return body.length === 0 ? head + "\n" : head + "\n" + body + "\n";
}

// Parser CSV. Maneja comillas dobles escapadas y newlines dentro de campos
// quoted. Devuelve string[][].
export function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Filtrar filas completamente vacías.
  return rows.filter((r) => r.some((c) => c.length > 0));
}
