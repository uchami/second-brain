import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { responsables, tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Cheap data-version stamp. The client polls this and compares with a
// version derived from props; if they differ, the page is refreshed.
export async function GET() {
  const userId = await requireUserId();
  const [[t], [r]] = await Promise.all([
    db
      .select({
        max: sql<string>`coalesce(extract(epoch from max(${tasks.updatedAt})) * 1000, 0)::bigint::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(eq(tasks.userId, userId)),
    db
      .select({
        max: sql<string>`coalesce(extract(epoch from max(${responsables.createdAt})) * 1000, 0)::bigint::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(responsables)
      .where(eq(responsables.userId, userId)),
  ]);
  const v = `${t?.max ?? "0"}-${t?.count ?? 0}-${r?.max ?? "0"}-${r?.count ?? 0}`;
  return NextResponse.json(
    { v },
    { headers: { "Cache-Control": "no-store" } },
  );
}
