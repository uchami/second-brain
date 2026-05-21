"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EtaPicker } from "@/components/eta-picker";
import { createTask, updateTask, deleteTask } from "@/app/actions";
import type { Responsable, Task, Estado } from "@/db/schema";

type Mode =
  | { kind: "create"; defaults?: { inFlight?: boolean; bucket?: number | null } }
  | { kind: "edit"; task: Task };

export function TaskFormDialog({
  open,
  onOpenChange,
  mode,
  responsables,
  existingBuckets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  responsables: Responsable[];
  existingBuckets: number[];
}) {
  const initial =
    mode.kind === "edit"
      ? {
          titulo: mode.task.titulo,
          detalle: mode.task.detalle,
          responsableId: mode.task.responsableId,
          estado: mode.task.estado,
          eta: mode.task.eta,
          bucket: mode.task.bucket,
        }
      : {
          titulo: "",
          detalle: null as string | null,
          responsableId: responsables[0]?.id ?? null,
          estado: "pendiente" as Estado,
          eta: null as string | null,
          bucket: mode.defaults?.bucket ?? null,
        };

  const [titulo, setTitulo] = useState(initial.titulo);
  const [detalle, setDetalle] = useState<string>(initial.detalle ?? "");
  const [responsableId, setResponsableId] = useState<number | null>(
    initial.responsableId,
  );
  const [estado, setEstado] = useState<Estado>(initial.estado);
  const [eta, setEta] = useState<string | null>(initial.eta);
  const [bucket, setBucket] = useState<number | null>(initial.bucket);
  const [pending, startTransition] = useTransition();

  // In-flight create only needs título + responsable + estado (no bucket/eta in this tab)
  const isInFlightCreate =
    mode.kind === "create" && mode.defaults?.inFlight === true;

  function submit() {
    startTransition(async () => {
      try {
        const detalleClean = detalle.trim() === "" ? null : detalle;
        if (mode.kind === "create") {
          await createTask({
            titulo,
            detalle: detalleClean,
            responsableId,
            estado,
            eta: isInFlightCreate ? null : eta,
            bucket: isInFlightCreate ? null : bucket,
            inFlight: !!mode.defaults?.inFlight,
          });
          toast.success("Tarea creada");
        } else {
          await updateTask({
            id: mode.task.id,
            titulo,
            detalle: detalleClean,
            responsableId,
            estado,
            eta,
            bucket,
          });
          toast.success("Tarea actualizada");
        }
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function handleDelete() {
    if (mode.kind !== "edit") return;
    if (!confirm("¿Eliminar esta tarea?")) return;
    startTransition(async () => {
      try {
        await deleteTask(mode.task.id);
        toast.success("Tarea eliminada");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  // For bucket select, build options: existing buckets + Sin definir + custom input
  const [customBucket, setCustomBucket] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode.kind === "create" ? "Nueva tarea" : "Editar tarea"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Textarea
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="¿Qué hay que hacer?"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="detalle">Detalle (opcional)</Label>
            <Textarea
              id="detalle"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Notas, links, contexto…"
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select
              value={responsableId === null ? "_none" : String(responsableId)}
              onValueChange={(v) =>
                setResponsableId(v === "_none" ? null : Number(v))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin responsable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin responsable</SelectItem>
                {responsables.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              value={estado}
              onValueChange={(v) => setEstado(v as Estado)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_proceso">En proceso</SelectItem>
                <SelectItem value="delegado">Delegado</SelectItem>
                <SelectItem value="postergado">Postergado</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isInFlightCreate && (
            <>
              <div className="space-y-1.5">
                <Label>Bucket</Label>
                <div className="flex gap-2">
                  <Select
                    value={bucket === null ? "_none" : String(bucket)}
                    onValueChange={(v) =>
                      setBucket(v === "_none" ? null : Number(v))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Sin definir</SelectItem>
                      {existingBuckets.map((b) => (
                        <SelectItem key={b} value={String(b)}>
                          Bucket {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Nuevo #"
                    value={customBucket}
                    onChange={(e) => setCustomBucket(e.target.value)}
                    className="w-24"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    disabled={customBucket === ""}
                    onClick={() => {
                      const n = parseInt(customBucket, 10);
                      if (!Number.isFinite(n) || n < 0) {
                        toast.error("Número inválido");
                        return;
                      }
                      setBucket(n);
                      setCustomBucket("");
                    }}
                  >
                    Usar
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>ETA</Label>
                <EtaPicker value={eta} onChange={setEta} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {mode.kind === "edit" && (
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={pending}
              className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Eliminar
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !titulo.trim()}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
