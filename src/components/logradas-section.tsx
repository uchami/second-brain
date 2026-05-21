"use client";

import { useMemo } from "react";
import { TaskCard } from "@/components/task-card";
import { startOfWeekMonday } from "@/lib/eta";
import type { Responsable, Task } from "@/db/schema";

const MES_CORTO = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const dStart = start.getDate();
  const dEnd = end.getDate();
  const mStart = MES_CORTO[start.getMonth()];
  const mEnd = MES_CORTO[end.getMonth()];
  const yEnd = end.getFullYear();
  if (mStart === mEnd) {
    return `${dStart} – ${dEnd} ${mEnd} ${yEnd}`;
  }
  return `${dStart} ${mStart} – ${dEnd} ${mEnd} ${yEnd}`;
}

export function LogradasSection({
  tasks,
  responsables,
  collapsed,
  onToggleCollapse,
  onClickTask,
}: {
  tasks: Task[];
  responsables: Responsable[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClickTask: (task: Task) => void;
}) {
  const groups = useMemo(() => {
    const byWeek = new Map<number, Task[]>();
    for (const t of tasks) {
      if (!t.closedWeekAt) continue;
      const wk = startOfWeekMonday(t.closedWeekAt).getTime();
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk)!.push(t);
    }
    const weeks = [...byWeek.entries()].sort((a, b) => b[0] - a[0]); // newest first
    return weeks.map(([wk, ts]) => ({
      weekStart: new Date(wk),
      tasks: ts.sort(
        (a, b) =>
          (b.closedWeekAt?.getTime() ?? 0) - (a.closedWeekAt?.getTime() ?? 0),
      ),
    }));
  }, [tasks]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="flex items-center gap-2 text-left"
        onClick={onToggleCollapse}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          🏆 Logradas
        </h3>
        <span className="text-xs text-neutral-400">
          {tasks.length} histórico
        </span>
        <span className="text-xs text-neutral-400">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-5">
          {groups.length === 0 && (
            <p className="text-sm text-neutral-500">Sin tareas logradas aún.</p>
          )}
          {groups.map((g) => (
            <div key={g.weekStart.getTime()} className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Semana del {formatWeekRange(g.weekStart)} · {g.tasks.length}
              </h4>
              <div className="space-y-2">
                {g.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    responsable={responsables.find(
                      (r) => r.id === task.responsableId,
                    )}
                    context="logradas"
                    onClickTask={() => onClickTask(task)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
