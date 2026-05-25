import { AppShell } from "@/components/app-shell";
import { InstallBanner } from "@/components/install-banner";
import { getAllData } from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getAllData();
  return (
    <>
      <InstallBanner />
      <AppShell
        tasks={data.tasks}
        responsables={data.responsables}
        habitos={data.habitos}
        habitoEntries={data.habitoEntriesUltimaSemana}
        habitConfig={data.habitConfig}
        userSettings={data.userSettings}
        sleepMode={data.sleepMode}
        streak={data.streak}
        hoyISO={data.hoyISO}
      />
    </>
  );
}
