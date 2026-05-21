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
import { updateTask } from "@/app/actions";

export function QuickBucketDialog({
  open,
  onOpenChange,
  taskId,
  currentBucket,
  existingBuckets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number;
  currentBucket: number | null;
  existingBuckets: number[];
}) {
  const [bucket, setBucket] = useState<number | null>(currentBucket);
  const [customBucket, setCustomBucket] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await updateTask({ id: taskId, bucket });
        toast.success(
          bucket === null ? "Movida a Sin definir" : `Movida a Bucket ${bucket}`,
        );
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar bucket</DialogTitle>
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
                <SelectItem value="_none">Sin definir</SelectItem>
                {existingBuckets.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    Bucket {b}
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
          <Button onClick={submit} disabled={pending}>
            {pending ? "Moviendo…" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
