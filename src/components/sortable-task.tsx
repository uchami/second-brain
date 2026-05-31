"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard, type TaskHighlightTier } from "@/components/task-card";
import type { Responsable, Task } from "@/db/schema";

type Props = {
  task: Task;
  responsable: Responsable | undefined;
  context: "in-flight" | "second-brain";
  highlightTier?: TaskHighlightTier;
  onClickTask: () => void;
  onSendToSB?: () => void;
  onChangeBucket?: () => void;
  onToggleDone?: (next: boolean) => void;
  celebrating?: boolean;
  focoLimitReached?: boolean;
};

export function SortableTask({
  task,
  responsable,
  context,
  highlightTier,
  onClickTask,
  onSendToSB,
  onChangeBucket,
  onToggleDone,
  celebrating,
  focoLimitReached,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        responsable={responsable}
        context={context}
        highlightTier={highlightTier}
        onClickTask={onClickTask}
        onSendToSB={onSendToSB}
        onChangeBucket={onChangeBucket}
        onToggleDone={onToggleDone}
        celebrating={celebrating}
        focoLimitReached={focoLimitReached}
        showReorder
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
        isDragging={isDragging}
      />
    </div>
  );
}
