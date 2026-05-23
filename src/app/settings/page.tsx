import { db } from "@/db/client";
import { responsables } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ResponsablesEditor } from "@/components/responsables-editor";
import { requireUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const data = await db
    .select()
    .from(responsables)
    .where(eq(responsables.userId, userId))
    .orderBy(asc(responsables.orden));
  return <ResponsablesEditor initial={data} />;
}
