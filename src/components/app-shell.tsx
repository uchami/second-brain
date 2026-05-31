"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Brain, Check, Loader2, Repeat, Settings, LogOut, Moon } from "lucide-react";
import { FocoIcon } from "@/components/icons/foco-icon";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type {
  HabitConfig,
  Habito,
  HabitoEntry,
  Responsable,
  Task,
  UserSettings,
} from "@/db/schema";
import type { SleepMode } from "@/lib/sleep-mode";
import { signOut } from "@/app/actions";

const InFlightTab = dynamic(
  () => import("@/components/in-flight-tab").then((m) => m.InFlightTab),
  { ssr: false },
);
const SecondBrainTab = dynamic(
  () =>
    import("@/components/second-brain-tab").then((m) => m.SecondBrainTab),
  { ssr: false },
);
const HabitsTab = dynamic(
  () => import("@/components/habits-tab").then((m) => m.HabitsTab),
  { ssr: false },
);

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

export type AppShellProps = {
  tasks: Task[];
  responsables: Responsable[];
  habitos: Habito[];
  habitoEntries: HabitoEntry[];
  habitConfig: HabitConfig;
  userSettings: UserSettings;
  sleepMode: SleepMode;
  streak: number;
  hoyISO: string;
};

type TabKey = "inflight" | "sb" | "habits";

export function AppShell(props: AppShellProps) {
  const {
    tasks,
    responsables,
    habitos,
    habitoEntries,
    habitConfig,
    userSettings,
    sleepMode,
    streak,
    hoyISO,
  } = props;

  // Optimistic sleep mode: cuando el modal de Cerrar día guarda (modo ritual),
  // entramos en sleep mode al toque sin esperar el refresh. Solo lo usamos
  // mientras el server NO se haya alineado todavía; en cuanto coincide, el
  // optimistic queda obsoleto pero inofensivo (preferimos siempre el server).
  // No reseteamos el state durante render para no caer en "setState in render"
  // (causa errores internos de React con useTransition).
  const [optimisticSleep, setOptimisticSleep] = useState<SleepMode | null>(null);

  // Dismiss manual: el usuario puede salir de A mimir aunque el server diga
  // que está activo (entró por error, o quiere editar el día post-cierre).
  // Vive en sessionStorage para que persista mientras la pestaña esté abierta;
  // si vuelve a cerrar el día desde el modal, lo limpiamos (vuelve a A mimir).
  const DISMISS_KEY = "sb:sleep-dismissed";
  const [dismissedSleep, setDismissedSleep] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });
  function exitSleepMode() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissedSleep(true);
    setOptimisticSleep(null);
  }
  function clearDismissOnRitual() {
    sessionStorage.removeItem(DISMISS_KEY);
    setDismissedSleep(false);
  }

  // Derived state puro — sin setState durante render.
  const effectiveSleep: SleepMode = useMemo(() => {
    if (dismissedSleep) return { active: false, reason: null };
    // Si el optimistic difiere del server, asumimos que el server todavía no
    // se alineó y mostramos el optimistic. Cuando se alinean, preferimos
    // server (más fresco / con el reason correcto).
    if (optimisticSleep && optimisticSleep.active !== sleepMode.active) {
      return optimisticSleep;
    }
    return sleepMode;
  }, [dismissedSleep, optimisticSleep, sleepMode]);

  const [tab, setTab] = useState<TabKey>("inflight");
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  const existingBuckets = useMemo(() => {
    const s = new Set<number>([0, 1, 2, 3]);
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

  // Modo dark a nivel <html> cuando sleep está activo. Tailwind v4 con `dark:`
  // toggle se basa en la clase `dark` en el ancestor.
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveSleep.active) root.classList.add("dark");
    else root.classList.remove("dark");
    return () => {
      // No "limpiamos" en unmount porque la app-shell vive toda la sesión.
    };
  }, [effectiveSleep.active]);

  // Welcome modal: una sola vez por cold-open / foreground transition.
  // sessionStorage flag asegura "no en cada navegación interna".
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  useEffect(() => {
    if (!effectiveSleep.active) return;
    const KEY = "sb:welcome-shown";
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
    // Diferimos a un microtask para evitar setState sincrónico en effect.
    queueMicrotask(() => setWelcomeOpen(true));
  }, [effectiveSleep.active]);
  // Re-show on visibilitychange → visible si pasó al menos 1h desde la última
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState !== "visible") return;
      if (!effectiveSleep.active) return;
      const KEY = "sb:welcome-last";
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      const now = Date.now();
      if (now - last > 60 * 60 * 1000) {
        sessionStorage.setItem(KEY, String(now));
        setWelcomeOpen(true);
      }
    }
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [effectiveSleep.active]);

  async function logout() {
    await signOut();
  }

  // Animación post-cierre del ritual: optimistic sleep + navega a habits +
  // freeza interacción + después de ~3s navega a A mimir (la ex In-flight).
  const [ritualAnimating, setRitualAnimating] = useState<string | null>(null);
  const ritualTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      for (const t of ritualTimersRef.current) clearTimeout(t);
    };
  }, []);

  function activateSleepOptimistic() {
    setOptimisticSleep({ active: true, reason: "cerrado" });
  }

  // Centralizado: cualquier modal de hábitos llama acá al guardar exitoso.
  // Decide animación, sleep optimistic y dismiss según mode + fecha + intent.
  // `withSleep` viene del botón que el usuario apretó en el modal:
  //   true  → quiere cerrar el día y dormir (ritual nocturno).
  //   false → quiere persistir sin tocar el sleep mode (tracking diurno).
  function handleHabitSave({
    mode,
    fecha,
    withSleep,
  }: {
    mode: "ritual" | "edit-hoy" | "trackear-otro";
    fecha: string;
    withSleep: boolean;
  }) {
    const esHoy = fecha === hoyISO;
    if (mode === "ritual" && esHoy && withSleep) {
      // Ritual nocturno: animación completa + sleep + reset dismiss.
      startRitualAnimation(fecha);
      return;
    }
    if (esHoy && withSleep) {
      // Edit-hoy con intent de dormir: re-activamos sleep optimistic
      // (caso típico: el usuario había salido de A mimir y vuelve a cerrar).
      clearDismissOnRitual();
      activateSleepOptimistic();
      toast.success("Guardado");
      return;
    }
    // Resto: tracking diurno (mode=ritual sin sleep), trackear-otro o pasados.
    // No tocamos sleep mode.
    toast.success("Guardado");
  }

  function startRitualAnimation(fecha: string) {
    // Si veníamos de "Salir de A mimir", limpiamos el dismiss para que el
    // cierre del día efectivamente vuelva a poner la app en sleep mode.
    clearDismissOnRitual();
    activateSleepOptimistic();
    setTab("habits");
    setRitualAnimating(fecha);
    // Después de ~3s total: navega a A mimir y toast.
    const t1 = setTimeout(() => {
      setTab("inflight");
      toast.success("Buenas noches. A mimir.");
    }, 3000);
    const t2 = setTimeout(() => {
      setRitualAnimating(null);
    }, 3400);
    ritualTimersRef.current.push(t1, t2);
  }

  // Si el usuario navega manualmente, abortamos la animación gracefully.
  function handleTabChange(next: TabKey) {
    if (ritualAnimating) {
      // El usuario interrumpió — limpiamos timers y dejamos que vaya donde quiere.
      for (const t of ritualTimersRef.current) clearTimeout(t);
      ritualTimersRef.current = [];
      setRitualAnimating(null);
    }
    setTab(next);
  }

  const inflightLabel = effectiveSleep.active ? "Modo sueño" : "Foco";

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
        onValueChange={(v) => handleTabChange(v as TabKey)}
        className="flex-1"
      >
        <TabsList className="w-full">
          <TabsTrigger value="inflight" className="flex items-center gap-1.5">
            {effectiveSleep.active ? <Moon size={13} /> : <FocoIcon size={13} />}
            {inflightLabel}
          </TabsTrigger>
          <TabsTrigger value="habits" className="flex items-center gap-1.5">
            <Repeat size={13} />
            Habits
          </TabsTrigger>
          <TabsTrigger value="sb" className="flex items-center gap-1.5">
            <Brain size={13} />
            Second brain
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inflight">
          <InFlightTab
            tasks={tasks}
            responsables={responsables}
            existingBuckets={existingBuckets}
            habitos={habitos.filter((h) => !h.archivado)}
            habitoEntries={habitoEntries}
            sleepMode={effectiveSleep}
            streak={streak}
            hoyISO={hoyISO}
            onHabitSaved={handleHabitSave}
            onExitSleepMode={exitSleepMode}
          />
        </TabsContent>
        <TabsContent value="habits">
          <HabitsTab
            habitos={habitos}
            habitoEntries={habitoEntries}
            streak={streak}
            hoyISO={hoyISO}
            sleepMode={effectiveSleep}
            celebrateFecha={ritualAnimating}
            onHabitSaved={handleHabitSave}
          />
        </TabsContent>
        <TabsContent value="sb">
          <SecondBrainTab tasks={tasks} responsables={responsables} />
        </TabsContent>
      </Tabs>

      <WelcomeMimirDialog
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
      />

      {ritualAnimating && (
        <div
          aria-hidden
          className="pointer-events-auto fixed inset-0 z-40 bg-transparent"
        />
      )}

      {/* Marker for tests / debugging */}
      <span className="sr-only">
        sleepMode:{effectiveSleep.active ? "on" : "off"} ({effectiveSleep.reason ?? "—"})
      </span>
      {/* habitConfig / userSettings se reciben para uso futuro de cierre semana, etc. */}
      <span className="hidden">
        {habitConfig.sleepModeInicio} {userSettings.timezone}
      </span>
    </div>
  );
}

function WelcomeMimirDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-2">
            <Moon size={18} className="text-indigo-500" />
            <DialogPrimitive.Title className="text-base font-semibold">
              Modo sueño
            </DialogPrimitive.Title>
          </div>
          <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
            Cerraste el día. Andá a dormir, no seas bobo. Es más productivo dormir bien y hacer eso mañana.
          </p>
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose}>OK, ya voy</Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
