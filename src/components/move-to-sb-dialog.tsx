"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moveToSecondBrain } from "@/app/actions";
import { bucketLabel } from "@/lib/buckets";

export function MoveToSBDialog({
  open,
  onOpenChange,
  taskId,
  existingBuckets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number;
  existingBuckets: number[];
}) {
  const [bucket, setBucket] = useState<number | null>(null);
  const [customBucket, setCustomBucket] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(targetBucket: number | null) {
    startTransition(async () => {
      try {
        await moveToSecondBrain(taskId, targetBucket);
        toast.success("Tarea mandada al second brain");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mandar al second brain</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Bucket</Label>
            <Select
              value={bucket === null ? "_none" : String(bucket)}
              onValueChange={(v) =>
                setBucket(v === "_none" ? null : Number(v))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{bucketLabel(null)}</SelectItem>
                {existingBuckets.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    {bucketLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>O un nuevo bucket</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="ej: 4"
                value={customBucket}
                onChange={(e) => setCustomBucket(e.target.value)}
              />
              <Button
                variant="outline"
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={() => submit(bucket)} disabled={pending}>
            {pending ? "Moviendo…" : "Mandar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
