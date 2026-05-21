"use client";

import { useMemo, useState } from "react";
import { Settings, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { InFlightTab } from "@/components/in-flight-tab";
import { SecondBrainTab } from "@/components/second-brain-tab";
import type { Responsable, Task } from "@/db/schema";

export function AppShell({
  tasks,
  responsables,
}: {
  tasks: Task[];
  responsables: Responsable[];
}) {
  const [tab, setTab] = useState<"inflight" | "sb">("inflight");
  const router = useRouter();

  const existingBuckets = useMemo(() => {
    const s = new Set<number>();
    for (const t of tasks) {
      if (t.bucket !== null && t.estado !== "done") s.add(t.bucket);
    }
    return [...s].sort((a, b) => a - b);
  }, [tasks]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4 sm:px-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Second brain</h1>
        <div className="flex items-center gap-1">
          <Link href="/settings">
            <Button variant="ghost" size="icon" aria-label="Ajustes">
              <Settings size={16} />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label="Salir"
            title="Salir"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "inflight" | "sb")}
        className="flex-1"
      >
        <TabsList className="w-full">
          <TabsTrigger value="inflight">In-flight</TabsTrigger>
          <TabsTrigger value="sb">Second brain</TabsTrigger>
        </TabsList>
        <TabsContent value="inflight">
          <InFlightTab
            tasks={tasks}
            responsables={responsables}
            existingBuckets={existingBuckets}
          />
        </TabsContent>
        <TabsContent value="sb">
          <SecondBrainTab tasks={tasks} responsables={responsables} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
