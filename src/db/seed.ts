import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./client");
  const { responsables, LEGACY_USER_ID } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  const userId = process.env.USER_ID ?? LEGACY_USER_ID;
  const existing = await db
    .select()
    .from(responsables)
    .where(eq(responsables.userId, userId));
  if (existing.length > 0) {
    console.log(
      `Responsables already seeded for user ${userId}:`,
      existing.length,
    );
    return;
  }
  await db.insert(responsables).values([
    { userId, nombre: "Yo (Uri)", color: "#fecaca", orden: 0 },
    { userId, nombre: "Salus", color: "#ddd6fe", orden: 1 },
  ]);
  console.log(`Seeded responsables for user ${userId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
