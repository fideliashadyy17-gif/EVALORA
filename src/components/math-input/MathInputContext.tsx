"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  mathInputManager,
  type MathInputTarget,
} from "@/lib/mathInputManager";
import type { PlainMathInsertion } from "@/components/editor/plainMathKeyboard";

interface MathInputContextValue {
  activeTarget: MathInputTarget | null;
  activeTargetId: string | null;
  setActiveTarget: (target: MathInputTarget | string | null) => void;
  insertIntoActive: (
    insertion: PlainMathInsertion,
    fallbackTargetId?: string,
    questionId?: string,
  ) => boolean;
  resolveTarget: (fallbackTargetId?: string, questionId?: string) => MathInputTarget | null;
  getTarget: (id: string) => MathInputTarget | null;
  allTargets: MathInputTarget[];
}

const MathInputContext = createContext<MathInputContextValue>({
  activeTarget: null,
  activeTargetId: null,
  setActiveTarget: (t) => mathInputManager.setActiveTarget(t),
  insertIntoActive: (ins, fallback, qId) => mathInputManager.insertIntoActive(ins, fallback, qId),
  resolveTarget: (fallback, qId) => mathInputManager.resolveTarget(fallback, qId),
  getTarget: (id) => mathInputManager.getTarget(id),
  allTargets: [],
});

export function MathInputProvider({
  children,
  currentQuestionId,
}: {
  children: ReactNode;
  currentQuestionId?: string;
}) {
  const [activeTargetId, setActiveTargetId] = useState<string | null>(
    () => mathInputManager.getActiveTargetId(),
  );

  useEffect(() => {
    if (currentQuestionId !== undefined) {
      mathInputManager.setCurrentQuestionId(currentQuestionId);
    }
  }, [currentQuestionId]);

  useEffect(() => {
    return mathInputManager.subscribe(() => {
      setActiveTargetId(mathInputManager.getActiveTargetId());
    });
  }, []);

  const activeTarget = mathInputManager.getActiveTarget();
  const allTargets = mathInputManager.getAllTargets();

  const setActiveTarget = useCallback((target: MathInputTarget | string | null) => {
    mathInputManager.setActiveTarget(target);
  }, []);

  const insertIntoActive = useCallback(
    (insertion: PlainMathInsertion, fallbackTargetId?: string, questionId?: string) => {
      return mathInputManager.insertIntoActive(
        insertion,
        fallbackTargetId,
        questionId ?? currentQuestionId,
      );
    },
    [currentQuestionId],
  );

  const resolveTarget = useCallback(
    (fallbackTargetId?: string, questionId?: string) => {
      return mathInputManager.resolveTarget(
        fallbackTargetId,
        questionId ?? currentQuestionId,
      );
    },
    [currentQuestionId],
  );

  const getTarget = useCallback((id: string) => {
    return mathInputManager.getTarget(id);
  }, []);

  return (
    <MathInputContext.Provider
      value={{
        activeTarget,
        activeTargetId,
        setActiveTarget,
        insertIntoActive,
        resolveTarget,
        getTarget,
        allTargets,
      }}
    >
      {children}
    </MathInputContext.Provider>
  );
}

export function useMathInput(): MathInputContextValue {
  return useContext(MathInputContext);
}
