"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sigma, X, Minus, Maximize2, GripHorizontal } from "lucide-react";
import { MathKeyboardPanel } from "@/components/MathKeyboardPanel";
import { mathInputManager } from "@/lib/mathInputManager";
import type { PlainMathInsertion } from "@/components/editor/plainMathKeyboard";
import { cn } from "@/lib/utils";

interface DraggableFloatingMathKeyboardProps {
  open: boolean;
  onClose: () => void;
  currentQuestionId?: string;
  variant?: "full" | "numeric";
  className?: string;
}

export function DraggableFloatingMathKeyboard({
  open,
  onClose,
  currentQuestionId,
  variant = "full",
  className,
}: DraggableFloatingMathKeyboardProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTargetInfo, setActiveTargetInfo] = useState<{ id: string; label?: string } | null>(() => {
    const active = mathInputManager.getActiveTarget();
    return active ? { id: active.id, label: active.label } : null;
  });

  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ startX: 0, startY: 0, origX: 0, origY: 0 });

  // Subscribe to central math input registry for active target changes
  useEffect(() => {
    return mathInputManager.subscribe(() => {
      const active = mathInputManager.getActiveTarget();
      setActiveTargetInfo(active ? { id: active.id, label: active.label } : null);
    });
  }, []);

  // Sync current question ID with the central manager
  useEffect(() => {
    if (currentQuestionId) {
      mathInputManager.setCurrentQuestionId(currentQuestionId);
    }
  }, [currentQuestionId]);

  // Viewport clamping function ensuring the keyboard remains reachable and on-screen
  const clampPosition = useCallback(
    (x: number, y: number, minimized: boolean): { x: number; y: number } => {
      if (typeof window === "undefined") return { x, y };

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const padding = 12;

      // Approximate dimensions for boundary enforcement
      const width = minimized ? 290 : Math.min(vw - 24, 460);
      const height = minimized ? 46 : Math.min(vh - 24, 400);

      const minX = padding;
      const maxX = Math.max(minX, vw - width - padding);
      const minY = padding;
      const maxY = Math.max(minY, vh - height - padding);

      return {
        x: Math.max(minX, Math.min(x, maxX)),
        y: Math.max(minY, Math.min(y, maxY)),
      };
    },
    [],
  );

  // Initialize position to bottom-right of viewport on first open
  useEffect(() => {
    if (open && position === null && typeof window !== "undefined") {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const defaultWidth = 460;
      const defaultHeight = 360;
      const initialX = Math.max(16, vw - defaultWidth - 24);
      const initialY = Math.max(16, vh - defaultHeight - 32);
      setPosition(clampPosition(initialX, initialY, false));
    }
  }, [open, position, clampPosition]);

  // Keep position constrained on window resize or fullscreen transition
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResizeOrFullscreen = () => {
      setPosition((prev) => {
        if (!prev) return null;
        return clampPosition(prev.x, prev.y, isMinimized);
      });
    };

    window.addEventListener("resize", handleResizeOrFullscreen, { passive: true });
    document.addEventListener("fullscreenchange", handleResizeOrFullscreen, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResizeOrFullscreen);
      document.removeEventListener("fullscreenchange", handleResizeOrFullscreen);
    };
  }, [clampPosition, isMinimized]);

  // Pointer drag event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag with primary mouse button or touch
    if (e.button !== 0) return;
    // Prevent focus loss on active input field and prevent page selection
    e.preventDefault();

    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };

    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // fallback
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const nextX = dragStartRef.current.origX + dx;
    const nextY = dragStartRef.current.origY + dy;
    setPosition(clampPosition(nextX, nextY, isMinimized));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // fallback
      }
    }
  };

  const handleToggleMinimize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMinimized((prev) => {
      const next = !prev;
      setPosition((p) => (p ? clampPosition(p.x, p.y, next) : null));
      return next;
    });
  };

  const handleInsert = (ins: PlainMathInsertion) => {
    mathInputManager.insertIntoActive(ins, undefined, currentQuestionId);
  };

  if (!open) return null;

  const stylePosition = position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined;

  return (
    <div
      ref={panelRef}
      style={stylePosition}
      data-testid="draggable-floating-math-keyboard"
      className={cn(
        "fixed z-50 select-none shadow-2xl transition-shadow",
        isDragging && "shadow-3xl cursor-grabbing ring-2 ring-evergreen-600/40",
        isMinimized
          ? "w-[min(90vw,19rem)] rounded-full border border-evergreen-900/30 bg-white p-1"
          : "w-[min(94vw,29rem)] rounded-2xl border border-evergreen-900/25 bg-white p-2.5",
        className,
      )}
    >
      {/* Title Bar and Drag Handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "flex items-center justify-between cursor-grab touch-none",
          isDragging && "cursor-grabbing",
          isMinimized ? "px-2 py-0.5" : "border-b border-evergreen-900/10 pb-1.5 mb-1.5",
        )}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          <GripHorizontal className="h-4 w-4 shrink-0 text-evergreen-800/60" aria-hidden="true" />
          <span className="flex items-center gap-1 font-display text-xs font-bold text-evergreen-950">
            <Sigma className="h-3.5 w-3.5 text-evergreen-700 shrink-0" aria-hidden="true" />
            <span className="truncate">Math Keyboard</span>
          </span>
          {!isMinimized && (
            <span
              className={cn(
                "hidden sm:inline-block max-w-[140px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                activeTargetInfo?.label
                  ? "bg-evergreen-100/80 text-evergreen-900"
                  : "bg-amber-100/70 text-amber-900",
              )}
              title={activeTargetInfo?.label ? `Target: ${activeTargetInfo.label}` : "Click any cell or answer field"}
            >
              {activeTargetInfo?.label ?? "Select field"}
            </span>
          )}
        </div>

        {/* Floating Controls: Minimize/Restore & Close */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleToggleMinimize}
            className="rounded p-1 text-ink-soft hover:bg-cream hover:text-ink transition"
            aria-label={isMinimized ? "Expand math keyboard" : "Minimize math keyboard"}
            title={isMinimized ? "Expand math keyboard" : "Minimize math keyboard"}
          >
            {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="rounded p-1 text-ink-soft hover:bg-cream hover:text-ink transition"
            aria-label="Close math keyboard"
            title="Close math keyboard"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded Keyboard Body */}
      {!isMinimized && (
        <div
          className="max-h-[50vh] overflow-y-auto overscroll-contain pr-0.5"
          data-testid="floating-math-keyboard-body"
        >
          <MathKeyboardPanel
            onInsert={handleInsert}
            variant={variant}
            questionId={currentQuestionId}
            label="Platform mathematical keyboard"
          />
        </div>
      )}
    </div>
  );
}
