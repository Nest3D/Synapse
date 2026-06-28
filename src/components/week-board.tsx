"use client";

import * as React from "react";
import { GripVertical, Plus, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { setTaskDay, createTask } from "@/app/(app)/actions";

type BoardTask = {
  id: string;
  title: string;
  brood: string;
  scheduledDay: number | null;
};
type Rect = { x: number; y: number; w: number; h: number };

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const STORAGE_KEY = "synapse-board-layout-v2";
const HIDDEN_KEY = "synapse-board-hidden-v1";
const BOTTOM_GAP = 30; // space kept between a window and the canvas bottom
const GRID = 20; // snap grid cell size (px)
const snap = (v: number) => Math.round(v / GRID) * GRID;

function defaultRects(): Rect[] {
  const W = 300;
  const H = 240;
  const GAP = 20;
  const M = 20;
  const COLS = 4;
  return DAYS.map((_, i) => ({
    x: M + (i % COLS) * (W + GAP),
    y: M + Math.floor(i / COLS) * (H + GAP),
    w: W,
    h: H,
  }));
}

export function WeekBoard({ initialTasks }: { initialTasks: BoardTask[] }) {
  const [tasks, setTasks] = React.useState(initialTasks);
  const [, start] = React.useTransition();
  const [rects, setRects] = React.useState<Rect[]>(defaultRects);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [boundsW, setBoundsW] = React.useState(0);

  // Track the canvas width so windows can't be dragged/resized past the sides.
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoundsW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-sync optimistic copy when the server data changes.
  const [prevInit, setPrevInit] = React.useState(initialTasks);
  if (prevInit !== initialTasks) {
    setPrevInit(initialTasks);
    setTasks(initialTasks);
  }

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // Default-then-load avoids an SSR/client position mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(parsed) && parsed.length === 7) setRects(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: Rect[]) => {
    setRects(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const [hidden, setHidden] = React.useState<boolean[]>(() =>
    DAYS.map(() => false),
  );
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(parsed) && parsed.length === 7) setHidden(parsed.map(Boolean));
    } catch {
      /* ignore */
    }
  }, []);
  const toggleHidden = (day: number) =>
    setHidden((h) => {
      const next = h.map((v, i) => (i === day ? !v : v));
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const move = (taskId: string, day: number | null) => {
    setTasks((ts) =>
      ts.map((t) => (t.id === taskId ? { ...t, scheduledDay: day } : t)),
    );
    start(() => setTaskDay(taskId, day).then(() => {}));
  };

  const unscheduled = tasks.filter((t) => t.scheduledDay == null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
          Days
        </span>
        {DAYS.map((n, i) => (
          <button
            key={i}
            onClick={() => toggleHidden(i)}
            title={hidden[i] ? `Show ${n}` : `Hide ${n}`}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              hidden[i]
                ? "border-border text-faint line-through hover:text-ink"
                : "border-accent/40 bg-accent/10 text-accent",
            )}
          >
            {n.slice(0, 3)}
          </button>
        ))}
      </div>

      <MobileBoard tasks={tasks} move={move} hidden={hidden} />

      <div className="hidden md:block">
      <DropZone
        onDropTask={(id) => move(id, null)}
        className="mb-6 rounded-xl border border-dashed border-border bg-surface/40 p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
            Unscheduled · {unscheduled.length}
          </p>
          <button
            onClick={() => persist(defaultRects())}
            className="text-[11px] text-faint transition-colors hover:text-ink"
          >
            Reset layout
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {unscheduled.length === 0 ? (
            <span className="text-sm text-faint">
              Drag a task here to unschedule it.
            </span>
          ) : (
            unscheduled.map((t) => <TaskChip key={t.id} task={t} />)
          )}
        </div>
      </DropZone>

      <div
        ref={canvasRef}
        className="relative rounded-xl border border-border-soft"
        style={{
          minHeight:
            Math.max(
              560,
              ...rects.filter((_, i) => !hidden[i]).map((r) => r.y + r.h),
            ) + BOTTOM_GAP,
          backgroundImage:
            "linear-gradient(to right, rgba(120,120,120,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,120,120,0.08) 1px, transparent 1px)",
          backgroundSize: `${GRID}px ${GRID}px`,
        }}
      >
        {DAYS.map((name, day) => {
          if (hidden[day]) return null;
          const dayTasks = tasks.filter((t) => t.scheduledDay === day);
          return (
            <FloatingWindow
              key={day}
              title={name}
              count={dayTasks.length}
              rect={rects[day]}
              boundsW={boundsW}
              onRectChange={(r) =>
                persist(rects.map((x, i) => (i === day ? r : x)))
              }
              onDropTask={(id) => move(id, day)}
              onHide={() => toggleHidden(day)}
              footer={<QuickAdd day={day} />}
            >
              {dayTasks.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-faint">
                  Drop tasks here
                </p>
              ) : (
                dayTasks.map((t) => <TaskChip key={t.id} task={t} block />)
              )}
            </FloatingWindow>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/** Touch-friendly stacked board for small screens: tap a task's day to move it. */
function MobileBoard({
  tasks,
  move,
  hidden,
}: {
  tasks: BoardTask[];
  move: (taskId: string, day: number | null) => void;
  hidden: boolean[];
}) {
  const groups: { key: string; label: string; day: number | null }[] = [
    { key: "none", label: "Unscheduled", day: null },
    ...DAYS.map((n, i) => ({ key: String(i), label: n, day: i })),
  ];
  const visible = groups.filter((g) => g.day == null || !hidden[g.day]);
  return (
    <div className="flex flex-col gap-4 md:hidden">
      {visible.map((g) => {
        const items = tasks.filter((t) => (t.scheduledDay ?? null) === g.day);
        return (
          <div
            key={g.key}
            className="overflow-hidden rounded-xl border border-border bg-surface card-float"
          >
            <div className="flex items-center gap-2 border-b border-border-soft bg-surface-2/60 px-3 py-2">
              <span className="font-display text-sm font-semibold text-ink">
                {g.label}
              </span>
              <span className="ml-auto text-[11px] text-faint">
                {items.length}
              </span>
            </div>
            <div className="space-y-1.5 p-2">
              {items.length === 0 ? (
                <p className="px-1 py-2 text-center text-xs text-faint">
                  No tasks
                </p>
              ) : (
                items.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-ink">
                        {t.title}
                      </div>
                      <div className="truncate text-[10px] text-faint">
                        {t.brood}
                      </div>
                    </div>
                    <Select
                      value={t.scheduledDay == null ? "" : String(t.scheduledDay)}
                      ariaLabel="Move to day"
                      variant="cell"
                      align="right"
                      className="w-28 shrink-0"
                      options={[
                        { value: "", label: "Unscheduled" },
                        ...DAYS.map((n, i) => ({ value: String(i), label: n })),
                      ]}
                      onChange={(v) => move(t.id, v === "" ? null : Number(v))}
                    />
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border-soft">
              <QuickAdd day={g.day} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Inline add: creates a personal task already planned on this day (or none). */
function QuickAdd({ day }: { day: number | null }) {
  const [text, setText] = React.useState("");
  const [pending, start] = React.useTransition();
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      await createTask({ text: t, scope: "PRIVATE", scheduledDay: day });
      setText("");
    });
  };
  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <Plus className="h-3.5 w-3.5 shrink-0 text-faint" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={pending}
        placeholder="Add task"
        className="w-full rounded-md bg-transparent px-1 py-0.5 text-xs text-ink outline-none placeholder:text-faint focus:bg-surface-2 disabled:opacity-60"
      />
    </div>
  );
}

function TaskChip({ task, block }: { task: BoardTask; block?: boolean }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "cursor-grab rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink shadow-sm transition-shadow hover:shadow active:cursor-grabbing",
        block && "mb-1.5 w-full",
      )}
    >
      <div className="truncate font-medium">{task.title}</div>
      <div className="truncate text-[10px] text-faint">{task.brood}</div>
    </div>
  );
}

function DropZone({
  children,
  className,
  onDropTask,
}: {
  children: React.ReactNode;
  className?: string;
  onDropTask: (taskId: string) => void;
}) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      className={cn(className, over && "border-accent bg-accent/5")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropTask(id);
      }}
    >
      {children}
    </div>
  );
}

function FloatingWindow({
  title,
  count,
  rect,
  boundsW,
  onRectChange,
  onDropTask,
  onHide,
  children,
  footer,
}: {
  title: string;
  count: number;
  rect: Rect;
  boundsW: number;
  onRectChange: (r: Rect) => void;
  onDropTask: (taskId: string) => void;
  onHide: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [over, setOver] = React.useState(false);
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  const startDrag =
    (mode: "move" | "resize") => (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const base = rect;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (mode === "move") {
          // Snap to the grid; left/top/right bounded, bottom grows the canvas.
          const maxX = boundsW > 0 ? boundsW - base.w : Infinity;
          onRectChange({
            ...base,
            x: clamp(snap(base.x + dx), 0, Math.max(0, maxX)),
            y: Math.max(0, snap(base.y + dy)),
          });
        } else {
          const maxW = boundsW > 0 ? boundsW - base.x : Infinity;
          onRectChange({
            ...base,
            w: clamp(snap(base.w + dx), 180, Math.max(180, maxW)),
            h: Math.max(120, snap(base.h + dy)),
          });
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  return (
    <div
      className={cn(
        "card-float absolute flex flex-col overflow-hidden rounded-xl border bg-surface",
        over ? "border-accent ring-1 ring-accent/40" : "border-border",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropTask(id);
      }}
    >
      <div
        onPointerDown={startDrag("move")}
        className="flex cursor-move touch-none items-center gap-1.5 border-b border-border-soft bg-surface-2/60 px-3 py-2"
      >
        <GripVertical className="h-3.5 w-3.5 text-faint" />
        <span className="font-display text-sm font-semibold text-ink">
          {title}
        </span>
        <span className="ml-auto text-[11px] text-faint">{count}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onHide}
          aria-label={`Hide ${title}`}
          title="Hide"
          className="rounded p-0.5 text-faint transition-colors hover:bg-surface hover:text-ink"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">{children}</div>

      {footer && (
        <div className="border-t border-border-soft">{footer}</div>
      )}

      <div
        onPointerDown={startDrag("resize")}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize touch-none"
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, var(--color-border, #ccc) 50%)",
        }}
      />
    </div>
  );
}
