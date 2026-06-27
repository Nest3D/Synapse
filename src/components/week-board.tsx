"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { setTaskDay } from "@/app/(app)/actions";

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
const STORAGE_KEY = "synapse-board-layout-v1";
const PAD = 8; // keep windows this far inside the left/top/right edges
const BOTTOM_GAP = 30; // space kept between a window and the canvas bottom

function defaultRects(): Rect[] {
  const W = 300;
  const H = 240;
  const GAP = 16;
  const COLS = 4;
  return DAYS.map((_, i) => ({
    x: PAD + (i % COLS) * (W + GAP),
    y: PAD + Math.floor(i / COLS) * (H + GAP),
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
  const [boundsH, setBoundsH] = React.useState(0);

  // Track the canvas size so windows can't be dragged/resized past the edges.
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoundsW(el.clientWidth);
      setBoundsH(el.clientHeight);
    });
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

  const move = (taskId: string, day: number | null) => {
    setTasks((ts) =>
      ts.map((t) => (t.id === taskId ? { ...t, scheduledDay: day } : t)),
    );
    start(() => setTaskDay(taskId, day).then(() => {}));
  };

  const unscheduled = tasks.filter((t) => t.scheduledDay == null);

  return (
    <div>
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

      <div ref={canvasRef} className="relative" style={{ minHeight: 640 }}>
        {DAYS.map((name, day) => {
          const dayTasks = tasks.filter((t) => t.scheduledDay === day);
          return (
            <FloatingWindow
              key={day}
              title={name}
              count={dayTasks.length}
              rect={rects[day]}
              boundsW={boundsW}
              boundsH={boundsH}
              onRectChange={(r) =>
                persist(rects.map((x, i) => (i === day ? r : x)))
              }
              onDropTask={(id) => move(id, day)}
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
  boundsH,
  onRectChange,
  onDropTask,
  children,
}: {
  title: string;
  count: number;
  rect: Rect;
  boundsW: number;
  boundsH: number;
  onRectChange: (r: Rect) => void;
  onDropTask: (taskId: string) => void;
  children: React.ReactNode;
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
          const maxX = boundsW > 0 ? boundsW - base.w - PAD : Infinity;
          const maxY = boundsH > 0 ? boundsH - base.h - BOTTOM_GAP : Infinity;
          onRectChange({
            ...base,
            x: clamp(base.x + dx, PAD, Math.max(PAD, maxX)),
            y: clamp(base.y + dy, PAD, Math.max(PAD, maxY)),
          });
        } else {
          const maxW = boundsW > 0 ? boundsW - base.x - PAD : Infinity;
          const maxH = boundsH > 0 ? boundsH - base.y - BOTTOM_GAP : Infinity;
          onRectChange({
            ...base,
            w: clamp(base.w + dx, 180, Math.max(180, maxW)),
            h: clamp(base.h + dy, 120, Math.max(120, maxH)),
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
      </div>

      <div className="flex-1 overflow-auto p-2">{children}</div>

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
