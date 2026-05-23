import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import path from "node:path";

type Row = {
  responsable: string;
  tarea: string;
  ui: string;
  L: string;
  M1: string;
  M2: string;
  J: string;
  V: string;
  S: string;
  detalle: string;
};

type Estado = "pendiente" | "en_proceso" | "delegado" | "postergado" | "done";

/**
 * Minimal RFC4180-ish CSV parser. Handles quoted fields with embedded
 * commas and escaped double-quotes ("").
 */
function parseCsv(text: string): string[][] {
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
  return rows;
}

function classifyEstado(dayValues: string[]): Estado {
  const joined = dayValues.map((v) => v.trim()).join(" | ").toLowerCase();
  if (joined.includes("logrado")) return "done";
  if (joined.includes("en proceso")) return "en_proceso";
  if (joined.includes("delegado")) return "delegado";
  if (joined.includes("postergado")) return "postergado";
  if (joined.includes("pendiente")) return "pendiente";
  return "pendiente";
}

/**
 * Parses a CSV bucket cell like "0", "0.01", "0.1", "1", "2.5" into:
 *   { bucket: int, subOrder: int (0..999999) }
 *
 * The user historically used decimals as sub-priorities WITHIN an integer
 * bucket. We preserve that ordering by treating the fractional part as a
 * sub-order key.
 */
function parseBucket(s: string): { bucket: number | null; subOrder: number } {
  const trimmed = s.trim().replace(",", ".");
  if (trimmed === "") return { bucket: null, subOrder: 0 };
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return { bucket: null, subOrder: 0 };
  const intPart = Math.trunc(num);
  // Sub-order: take the decimal characters as an integer to preserve
  // the user's alphabetic-like ordering hack (.11 before .9). Pad to 6 digits.
  const dotIdx = trimmed.indexOf(".");
  let subOrder = 0;
  if (dotIdx !== -1) {
    const frac = trimmed.slice(dotIdx + 1).slice(0, 6).padEnd(6, "0");
    subOrder = parseInt(frac, 10) || 0;
  }
  return { bucket: intPart, subOrder };
}

async function main() {
  const csvPath =
    process.argv[2] ||
    path.join(process.cwd(), "import.csv");

  const text = readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.error("CSV vacío");
    process.exit(1);
  }
  const headerIdx = 0;
  const dataRows = rows.slice(headerIdx + 1).filter((r) => {
    const tarea = (r[1] ?? "").trim();
    return tarea.length > 0;
  });

  const parsed: Array<{
    row: Row;
    bucket: number | null;
    subOrder: number;
    estado: Estado;
  }> = dataRows.map((r) => {
    const row: Row = {
      responsable: (r[0] ?? "").trim(),
      tarea: (r[1] ?? "").trim(),
      ui: (r[2] ?? "").trim(),
      L: r[3] ?? "",
      M1: r[4] ?? "",
      M2: r[5] ?? "",
      J: r[6] ?? "",
      V: r[7] ?? "",
      S: r[8] ?? "",
      detalle: (r[9] ?? "").trim(),
    };
    const { bucket, subOrder } = parseBucket(row.ui);
    const estado = classifyEstado([row.L, row.M1, row.M2, row.J, row.V, row.S]);
    return { row, bucket, subOrder, estado };
  });

  console.log(`Leyendo ${parsed.length} filas...`);

  // Group active tasks by bucket and sort by subOrder; done tasks all go to Logradas
  const active = parsed.filter((p) => p.estado !== "done");
  const done = parsed.filter((p) => p.estado === "done");

  const byBucket = new Map<number | null, typeof active>();
  for (const p of active) {
    const k = p.bucket;
    if (!byBucket.has(k)) byBucket.set(k, []);
    byBucket.get(k)!.push(p);
  }
  for (const arr of byBucket.values()) {
    arr.sort((a, b) => a.subOrder - b.subOrder);
  }

  const { db } = await import("./client");
  const { responsables, tasks, LEGACY_USER_ID } = await import("./schema");
  const { eq } = await import("drizzle-orm");

  // Target user for this import. Defaults to the legacy placeholder so
  // pre-WorkOS imports keep working; pass USER_ID=user_xxx to import into a
  // specific WorkOS user.
  const userId = process.env.USER_ID ?? LEGACY_USER_ID;

  // Build/refresh responsable map (auto-create new ones)
  const existing = await db
    .select()
    .from(responsables)
    .where(eq(responsables.userId, userId));
  const respByName = new Map<string, number>();
  for (const r of existing) respByName.set(r.nombre, r.id);

  const allResponsableNames = new Set(
    parsed.map((p) => p.row.responsable).filter((n) => n.length > 0),
  );
  let nextOrden = existing.length;
  for (const name of allResponsableNames) {
    if (!respByName.has(name)) {
      const [created] = await db
        .insert(responsables)
        .values({
          userId,
          nombre: name,
          color: "#e5e7eb",
          orden: nextOrden++,
        })
        .returning();
      respByName.set(name, created.id);
      console.log(`Responsable creado: ${name}`);
    }
  }

  // Clear existing tasks (idempotent re-runs) — comment this out if you want to merge
  const existingTasksCount = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId));
  if (existingTasksCount.length > 0) {
    console.log(
      `⚠ La DB ya tiene ${existingTasksCount.length} tarea(s) para ${userId}. Pasá --clear para borrarlas antes.`,
    );
    if (process.argv.includes("--clear")) {
      await db.delete(tasks).where(eq(tasks.userId, userId));
      console.log("Tareas previas borradas");
    } else {
      console.log("Sumando al final sin tocar las existentes");
    }
  }

  // Bucket orders: within each bucket, assign (i+1)*100
  const inserts: Array<typeof tasks.$inferInsert> = [];

  for (const [bucket, arr] of byBucket) {
    arr.forEach((p, i) => {
      inserts.push({
        userId,
        titulo: p.row.tarea,
        detalle: p.row.detalle || null,
        responsableId: p.row.responsable
          ? respByName.get(p.row.responsable) ?? null
          : null,
        estado: p.estado,
        bucket,
        bucketOrder: (i + 1) * 100,
        inFlight: false,
      });
    });
  }

  // Done tasks → Logradas (set closed_week_at to last week)
  const closedAt = new Date();
  closedAt.setDate(closedAt.getDate() - 7);
  done.forEach((p, i) => {
    inserts.push({
      userId,
      titulo: p.row.tarea,
      detalle: p.row.detalle || null,
      responsableId: p.row.responsable
        ? respByName.get(p.row.responsable) ?? null
        : null,
      estado: "done",
      bucket: p.bucket,
      bucketOrder: (i + 1) * 100,
      inFlight: false,
      doneAt: closedAt,
      closedWeekAt: closedAt,
    });
  });

  if (inserts.length === 0) {
    console.log("Nada que importar");
    return;
  }

  // Bulk insert
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    await db.insert(tasks).values(chunk);
    inserted += chunk.length;
    process.stdout.write(`\rInsertadas ${inserted}/${inserts.length}`);
  }
  console.log(`\n✓ Importadas ${inserted} tareas (${active.length} activas, ${done.length} a Logradas)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
