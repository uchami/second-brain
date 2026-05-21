"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SortableTask } from "@/components/sortable-task";
import type { TaskHighlightTier } from "@/components/task-card";
import type { Responsable, Task } from "@/db/schema";

export function SBBucket({
  id,
  title,
  subtitle,
  taskIds,
  tasks,
  responsables,
  isBucketZero,
  onClickTask,
  onChangeBucket,
  onMoveUp,
  onMoveDown,
  onAddTask,
  collapsible,
  collapsed,
  onToggleCollapse,
  highlight,
}: {
  id: string;
  title: string;
  subtitle?: string;
  taskIds: number[];
  tasks: Task[];
  responsables: Responsable[];
  isBucketZero?: boolean;
  onClickTask: (task: Task) => void;
  onChangeBucket?: (task: Task) => void;
  onMoveUp: (taskId: number, bucketKey: string) => void;
  onMoveDown: (taskId: number, bucketKey: string) => void;
  onAddTask?: () => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  highlight?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const itemTasks = taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={onToggleCollapse}
          disabled={!collapsible}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
            {title}
          </h3>
          {subtitle && (
            <span className="text-xs text-neutral-400">{subtitle}</span>
          )}
          {collapsible && (
            <span className="text-xs text-neutral-400">
              {collapsed ? "▸" : "▾"}
            </span>
          )}
        </button>
        {onAddTask && !collapsed && (
          <Button variant="ghost" size="icon" onClick={onAddTask} aria-label="Agregar tarea">
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
              <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-xs text-neutral-400 dark:border-neutral-800">
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
                    onMoveUp={() => onMoveUp(task.id, id)}
                    onMoveDown={() => onMoveDown(task.id, id)}
                    canMoveUp={i > 0}
                    canMoveDown={i < itemTasks.length - 1}
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
