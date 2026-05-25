"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResponsablesEditor } from "@/components/responsables-editor";
import { HabitsEditor } from "@/components/habits-editor";
import { SleepModeConfig } from "@/components/sleep-mode-config";
import { CuentaSettings } from "@/components/cuenta-settings";
import type {
  HabitConfig,
  Habito,
  Responsable,
  UserSettings,
} from "@/db/schema";

export function SettingsShell({
  responsables,
  habitos,
  habitConfig,
  userSettings,
}: {
  responsables: Responsable[];
  habitos: Habito[];
  habitConfig: HabitConfig;
  userSettings: UserSettings;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="icon" aria-label="Volver">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Ajustes</h1>
      </header>

      <Tabs defaultValue="habitos">
        <TabsList className="w-full">
          <TabsTrigger value="habitos">Hábitos</TabsTrigger>
          <TabsTrigger value="mimir">Modo sueño</TabsTrigger>
          <TabsTrigger value="responsables">Responsables</TabsTrigger>
          <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
        </TabsList>

        <TabsContent value="habitos">
          <HabitsEditor initial={habitos} />
        </TabsContent>
        <TabsContent value="mimir">
          <SleepModeConfig initial={habitConfig} />
        </TabsContent>
        <TabsContent value="responsables">
          <ResponsablesEditor initial={responsables} embedded />
        </TabsContent>
        <TabsContent value="cuenta">
          <CuentaSettings initial={userSettings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
