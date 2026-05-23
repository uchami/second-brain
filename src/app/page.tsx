import { AppShell } from "@/components/app-shell";
import { InstallBanner } from "@/components/install-banner";
import { getAllData } from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { tasks, responsables } = await getAllData();
  return (
    <>
      <InstallBanner />
      <AppShell tasks={tasks} responsables={responsables} />
    </>
  );
}
