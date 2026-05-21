"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  createResponsable,
  updateResponsable,
  deleteResponsable,
} from "@/app/actions";
import type { Responsable } from "@/db/schema";

const PRESET_COLORS = [
  "#fecaca",
  "#fed7aa",
  "#fde68a",
  "#bbf7d0",
  "#a5f3fc",
  "#bfdbfe",
  "#ddd6fe",
  "#fbcfe8",
  "#e5e7eb",
];

export function ResponsablesEditor({
  initial,
}: {
  initial: Responsable[];
}) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoColor, setNuevoColor] = useState(PRESET_COLORS[0]);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    if (!nuevoNombre.trim()) return;
    startTransition(async () => {
      try {
        await createResponsable({ nombre: nuevoNombre, color: nuevoColor });
        setNuevoNombre("");
        toast.success("Responsable creado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="icon" aria-label="Volver">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Responsables</h1>
      </header>

      <div className="space-y-4">
        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-medium">Nuevo responsable</h2>
          <div className="space-y-2">
            <Label htmlFor="nuevo">Nombre</Label>
            <Input
              id="nuevo"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="ej: Salus"
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNuevoColor(c)}
                  className={`h-8 w-8 rounded-lg border-2 ${
                    nuevoColor === c
                      ? "border-neutral-900 dark:border-neutral-100"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleCreate}
              disabled={pending || !nuevoNombre.trim()}
              size="sm"
            >
              <Plus size={14} /> Agregar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {initial.map((r) => (
            <ResponsableRow key={r.id} r={r} />
          ))}
          {initial.length === 0 && (
            <p className="text-center text-sm text-neutral-500">
              Sin responsables aún
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResponsableRow({ r }: { r: Responsable }) {
  const [nombre, setNombre] = useState(r.nombre);
  const [color, setColor] = useState(r.color);
  const [pending, startTransition] = useTransition();

  function saveIfChanged() {
    if (nombre === r.nombre && color === r.color) return;
    startTransition(async () => {
      try {
        await updateResponsable({ id: r.id, nombre, color });
        toast.success("Guardado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar "${r.nombre}"? Las tareas asignadas quedarán sin responsable.`))
      return;
    startTransition(async () => {
      try {
        await deleteResponsable(r.id);
        toast.success("Eliminado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-6 w-6 shrink-0 rounded-md border border-neutral-300 dark:border-neutral-700"
          style={{ backgroundColor: color }}
        />
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={saveIfChanged}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Eliminar"
          className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <Trash2 size={16} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              startTransition(async () => {
                await updateResponsable({ id: r.id, color: c });
              });
            }}
            className={`h-6 w-6 rounded-md border ${
              color === c
                ? "border-neutral-900 ring-2 ring-neutral-900/20 dark:border-neutral-100 dark:ring-neutral-100/20"
                : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}
