"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
  const [pending, startTransition] = useTransition();

  function move(bucket: number | null) {
    if (bucket === currentBucket) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateTask({ id: taskId, bucket });
        toast.success(
          bucket === null
            ? "Movida a Sin definir"
            : `Movida a Bucket ${bucket}`,
        );
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  // Order: 0 first (if exists), then Sin definir, then 1..n. Mirrors the SB view.
  const options: Array<{ key: string; bucket: number | null; label: string }> =
    [];
  if (existingBuckets.includes(0)) {
    options.push({ key: "0", bucket: 0, label: "Bucket 0" });
  }
  options.push({ key: "none", bucket: null, label: "Sin definir" });
  for (const n of existingBuckets) {
    if (n === 0) continue;
    options.push({ key: String(n), bucket: n, label: `Bucket ${n}` });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover a…</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {options.map((opt) => {
            const active = opt.bucket === currentBucket;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => move(opt.bucket)}
                disabled={pending}
                className={cn(
                  "flex h-14 items-center justify-center rounded-xl border text-base font-medium transition-colors",
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 bg-white text-neutral-900 hover:border-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
                  pending && "opacity-50",
                )}
              >
                {active && <Check size={16} className="mr-1.5" />}
                {opt.label}
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-neutral-500">
          Para crear un bucket nuevo, usa el modal de edición.
        </p>
      </DialogContent>
    </Dialog>
  );
}
