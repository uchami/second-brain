import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./client");
  const { responsables } = await import("./schema");
  const existing = await db.select().from(responsables);
  if (existing.length > 0) {
    console.log("Responsables already seeded:", existing.length);
    return;
  }
  await db.insert(responsables).values([
    { nombre: "Yo (Uri)", color: "#fecaca", orden: 0 },
    { nombre: "Salus", color: "#ddd6fe", orden: 1 },
  ]);
  console.log("Seeded responsables");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
