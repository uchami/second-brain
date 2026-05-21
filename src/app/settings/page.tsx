import { db } from "@/db/client";
import { responsables } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ResponsablesEditor } from "@/components/responsables-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await db
    .select()
    .from(responsables)
    .orderBy(asc(responsables.orden));
  return <ResponsablesEditor initial={data} />;
}
