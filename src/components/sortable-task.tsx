"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "@/components/task-card";
import type { Responsable, Task } from "@/db/schema";

type Props = {
  task: Task;
  responsable: Responsable | undefined;
  context: "in-flight" | "second-brain";
  onClickTask: () => void;
  onSendToSB?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export function SortableTask({
  task,
  responsable,
  context,
  onClickTask,
  onSendToSB,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
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
        onClickTask={onClickTask}
        onSendToSB={onSendToSB}
        showReorder
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
        isDragging={isDragging}
      />
    </div>
  );
}
