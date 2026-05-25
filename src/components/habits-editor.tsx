"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  archiveHabito,
  createHabito,
  deleteHabito,
  reorderHabitos,
  seedExampleHabitos,
  updateHabito,
} from "@/app/habit-actions";
import type { Habito, HabitoTipo } from "@/db/schema";

const TIPO_LABELS: Record<HabitoTipo, string> = {
  texto: "Texto libre",
  estrellas: "Estrellas (1-5)",
  escala_1_10: "Escala 1-10",
  si_no: "Sí / No",
  emocion: "Emoción",
};

export function HabitsEditor({ initial }: { initial: Habito[] }) {
  const activos = initial.filter((h) => !h.archivado);
  const archivados = initial.filter((h) => h.archivado);
  // Optimistic local order so D&D is instant; server reorder follows.
  // React-recommended pattern: store the prop snapshot alongside the local
  // state so we can detect prop changes during render and reset both.
  const activosKey = activos.map((h) => h.id).sort().join(",");
  const [snapshot, setSnapshot] = useState<{ key: string; order: number[] }>({
    key: activosKey,
    order: activos.map((h) => h.id),
  });
  if (snapshot.key !== activosKey) {
    setSnapshot({ key: activosKey, order: activos.map((h) => h.id) });
  }
  const order = snapshot.order;
  const setOrder = (next: number[]) =>
    setSnapshot({ key: activosKey, order: next });
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(Number(active.id));
    const newIndex = order.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    startTransition(async () => {
      try {
        await reorderHabitos(next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al reordenar");
      }
    });
  }

  function handleSeed() {
    startTransition(async () => {
      try {
        await seedExampleHabitos();
        toast.success("Set de ejemplo cargado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  const sortedActivos = order
    .map((id) => activos.find((h) => h.id === id))
    .filter((h): h is Habito => !!h);

  return (
    <div className="space-y-4">
      {initial.length === 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            ¿Querés arrancar con un set predefinido?
          </h2>
          <p className="text-sm text-emerald-800/80 dark:text-emerald-200/80">
            Te creamos hábitos típicos que después podés editar o borrar.
          </p>
          <Button
            onClick={handleSeed}
            disabled={pending}
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Sparkles size={14} /> Cargar set de ejemplo
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {sortedActivos.map((h) => (
              <HabitoRow key={h.id} h={h} />
            ))}
          </SortableContext>
        </DndContext>

        {sortedActivos.length === 0 && initial.length > 0 && (
          <p className="text-center text-sm text-neutral-500">
            Sin hábitos activos. Agregá uno abajo o reactivá uno archivado.
          </p>
        )}
      </div>

      <NewHabitForm />

      {archivados.length > 0 && (
        <ArchivedSection archivados={archivados} />
      )}
    </div>
  );
}

function HabitoRow({ h }: { h: Habito }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: h.id });
  const [pregunta, setPregunta] = useState(h.pregunta);
  const [tipo, setTipo] = useState<HabitoTipo>(h.tipo);
  const [pending, startTransition] = useTransition();

  function savePregunta() {
    if (pregunta.trim() === h.pregunta) return;
    if (!pregunta.trim()) {
      setPregunta(h.pregunta);
      return;
    }
    startTransition(async () => {
      try {
        await updateHabito({ id: h.id, pregunta });
        toast.success("Guardado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function saveTipo(next: HabitoTipo) {
    setTipo(next);
    startTransition(async () => {
      try {
        await updateHabito({ id: h.id, tipo: next });
        toast.success("Guardado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function handleArchive() {
    if (!confirm(`Archivar "${h.pregunta}"? Mantiene el histórico.`)) return;
    startTransition(async () => {
      try {
        await deleteHabito(h.id);
        toast.success("Archivado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="touch-none mt-1 cursor-grab text-neutral-400 active:cursor-grabbing"
        aria-label="Reordenar"
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1 space-y-2">
        <Input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onBlur={savePregunta}
          placeholder="Pregunta del hábito"
        />
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <Select value={tipo} onValueChange={(v) => saveTipo(v as HabitoTipo)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(TIPO_LABELS) as [HabitoTipo, string][]).map(
                ([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleArchive}
            disabled={pending}
            aria-label="Archivar"
            className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewHabitForm() {
  const [pregunta, setPregunta] = useState("");
  const [tipo, setTipo] = useState<HabitoTipo>("escala_1_10");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    if (!pregunta.trim()) return;
    startTransition(async () => {
      try {
        await createHabito({ pregunta, tipo });
        setPregunta("");
        setOpen(false);
        toast.success("Hábito creado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="ghost"
        className="w-full justify-center border border-dashed border-neutral-300 dark:border-neutral-700"
      >
        <Plus size={14} /> Agregar hábito
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/50">
      <Label>Nuevo hábito</Label>
      <Input
        value={pregunta}
        onChange={(e) => setPregunta(e.target.value)}
        placeholder="ej: ¿Cómo dormiste anoche?"
        autoFocus
      />
      <Select value={tipo} onValueChange={(v) => setTipo(v as HabitoTipo)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(TIPO_LABELS) as [HabitoTipo, string][]).map(
            ([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <div className="flex justify-end gap-2">
        <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
          Cancelar
        </Button>
        <Button
          onClick={handleCreate}
          size="sm"
          disabled={pending || !pregunta.trim()}
        >
          Crear
        </Button>
      </div>
    </div>
  );
}

function ArchivedSection({ archivados }: { archivados: Habito[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function unarchive(id: number) {
    startTransition(async () => {
      try {
        await archiveHabito(id, false);
        toast.success("Reactivado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾" : "▸"} Archivados ({archivados.length})
      </button>
      {open && (
        <div className="space-y-1">
          {archivados.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900/30"
            >
              <span className="text-neutral-500 line-through">{h.pregunta}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unarchive(h.id)}
                disabled={pending}
              >
                Reactivar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
