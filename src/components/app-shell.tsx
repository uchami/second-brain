"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Loader2, Settings, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { Responsable, Task } from "@/db/schema";
import { signOut } from "@/app/actions";

// @dnd-kit uses internal counters for aria-describedby that diverge between
// SSR and CSR, producing hydration warnings. The tabs both rely on D&D, so we
// skip server-rendering them entirely.
const InFlightTab = dynamic(
  () => import("@/components/in-flight-tab").then((m) => m.InFlightTab),
  { ssr: false },
);
const SecondBrainTab = dynamic(
  () =>
    import("@/components/second-brain-tab").then((m) => m.SecondBrainTab),
  { ssr: false },
);

// Polling interval for the version probe (ms). Tab/window focus and
// visibility changes also trigger an immediate check, which is what mostly
// catches the "edited on phone, switched to laptop" case.
const POLL_INTERVAL_MS = 30_000;

function computeVersion(tasks: Task[], responsables: Responsable[]): string {
  let tMax = 0;
  for (const t of tasks) {
    const v = t.updatedAt?.getTime() ?? 0;
    if (v > tMax) tMax = v;
  }
  let rMax = 0;
  for (const r of responsables) {
    const v = r.createdAt?.getTime() ?? 0;
    if (v > rMax) rMax = v;
  }
  return `${tMax}-${tasks.length}-${rMax}-${responsables.length}`;
}

export function AppShell({
  tasks,
  responsables,
}: {
  tasks: Task[];
  responsables: Responsable[];
}) {
  const [tab, setTab] = useState<"inflight" | "sb">("inflight");
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  const existingBuckets = useMemo(() => {
    const s = new Set<number>([0, 1, 2, 3]); // permanent buckets
    for (const t of tasks) {
      if (t.bucket !== null && t.estado !== "done") s.add(t.bucket);
    }
    return [...s].sort((a, b) => a - b);
  }, [tasks]);

  const currentVersion = useMemo(
    () => computeVersion(tasks, responsables),
    [tasks, responsables],
  );
  const currentVersionRef = useRef(currentVersion);
  useEffect(() => {
    currentVersionRef.current = currentVersion;
  }, [currentVersion]);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { v: string };
      if (data.v && data.v !== currentVersionRef.current) {
        startRefresh(() => router.refresh());
      }
    } catch {
      // Network blip — next tick will retry
    }
  }, [router]);

  useEffect(() => {
    const interval = setInterval(checkVersion, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", checkVersion);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", checkVersion);
    };
  }, [checkVersion]);

  async function logout() {
    // AuthKit's signOut() throws a NEXT_REDIRECT to the WorkOS logout URL;
    // the browser follows it and lands back here, where the proxy bounces
    // unauthenticated requests to the sign-in page.
    await signOut();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4 sm:px-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">Second brain</h1>
          {isRefreshing ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              aria-live="polite"
            >
              <Loader2 size={11} className="animate-spin" />
              Sincronizando
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300"
              aria-live="polite"
            >
              <Check size={11} />
              Sincronizado
            </span>
          )}
        </div>
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
