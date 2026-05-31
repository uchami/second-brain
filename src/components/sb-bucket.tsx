"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SortableTask } from "@/components/sortable-task";
import type { TaskHighlightTier } from "@/components/task-card";
import type { Responsable, Task } from "@/db/schema";

export type BucketUrgencyTier = "warn" | "alarm";

export function SBBucket({
  id,
  title,
  subtitle,
  count,
  taskIds,
  tasks,
  responsables,
  isBucketZero,
  urgencyTier,
  onClickTask,
  onChangeBucket,
  onToggleDone,
  celebratingIds,
  onAddTask,
  collapsible,
  collapsed,
  onToggleCollapse,
  highlight,
  focoLimitReached,
}: {
  id: string;
  title: string;
  subtitle?: string;
  count?: number;
  taskIds: number[];
  tasks: Task[];
  responsables: Responsable[];
  isBucketZero?: boolean;
  urgencyTier?: BucketUrgencyTier;
  onClickTask: (task: Task) => void;
  onChangeBucket?: (task: Task) => void;
  onToggleDone?: (taskId: number, next: boolean) => void;
  celebratingIds?: Set<number>;
  onAddTask?: () => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  highlight?: boolean;
  focoLimitReached?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const itemTasks = taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t);

  const isAlarm = urgencyTier === "alarm";

  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl border p-3 transition-colors",
        urgencyTier === "warn" &&
          "border-amber-300 bg-amber-100/70 dark:border-amber-700 dark:bg-amber-950/40",
        urgencyTier === "alarm" &&
          "border-red-600 bg-red-500 dark:border-red-500 dark:bg-red-600",
        !urgencyTier &&
          "border-neutral-200 bg-neutral-50/40 dark:border-neutral-800 dark:bg-neutral-950/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={onToggleCollapse}
          disabled={!collapsible}
        >
          <h3
            className={cn(
              "text-sm font-semibold uppercase tracking-wide",
              isAlarm
                ? "text-white"
                : "text-neutral-600 dark:text-neutral-400",
            )}
          >
            {title}
          </h3>
          {count !== undefined && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                isAlarm ? "text-white/90" : "text-neutral-400",
              )}
            >
              {count}
            </span>
          )}
          {subtitle && (
            <span
              className={cn(
                "text-xs",
                isAlarm ? "text-white/80" : "text-neutral-400",
              )}
            >
              {subtitle}
            </span>
          )}
          {collapsible && (
            <span
              className={cn(
                "ml-0.5 inline-flex",
                isAlarm ? "text-white" : "text-neutral-500",
              )}
              aria-hidden
            >
              {collapsed ? (
                <ChevronRight size={20} strokeWidth={2.5} />
              ) : (
                <ChevronDown size={20} strokeWidth={2.5} />
              )}
            </span>
          )}
        </button>
        {onAddTask && !collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onAddTask}
            aria-label="Agregar tarea"
            className={isAlarm ? "text-white hover:bg-white/10" : undefined}
          >
            <Plus size={14} />
          </Button>
        )}
      </div>
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={cn(
            "min-h-[44px] space-y-2 rounded-xl p-1 transition-colors",
            (isOver || highlight) &&
              "bg-neutral-200/70 ring-2 ring-neutral-400 dark:bg-neutral-700/40 dark:ring-neutral-500",
          )}
        >
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            {itemTasks.length === 0 ? (
              <div
                className={cn(
                  "rounded-lg border border-dashed px-3 py-2 text-xs",
                  isAlarm
                    ? "border-white/40 text-white/80"
                    : "border-neutral-200 text-neutral-400 dark:border-neutral-800",
                )}
              >
                Sin tareas
              </div>
            ) : (
              itemTasks.map((task, i) => {
                let tier: TaskHighlightTier | undefined;
                if (isBucketZero) {
                  if (i === 0) tier = "top";
                  else if (i <= 3) tier = "near-top";
                }
                return (
                  <SortableTask
                    key={task.id}
                    task={task}
                    responsable={responsables.find(
                      (r) => r.id === task.responsableId,
                    )}
                    context="second-brain"
                    highlightTier={tier}
                    onClickTask={() => onClickTask(task)}
                    onChangeBucket={
                      onChangeBucket ? () => onChangeBucket(task) : undefined
                    }
                    onToggleDone={
                      onToggleDone
                        ? (next) => onToggleDone(task.id, next)
                        : undefined
                    }
                    celebrating={celebratingIds?.has(task.id)}
                    focoLimitReached={focoLimitReached}
                  />
                );
              })
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
}
