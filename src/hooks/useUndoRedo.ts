import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HandLandmarks, RecognizedGesture } from '../types/hand';

interface UseUndoRedoOptions {
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    isPaused?: boolean;
    undo: () => Promise<void> | void;
    redo: () => Promise<void> | void;
    onQuickAction?: (action: 'clear' | 'export' | 'newLayer' | 'prevLayer') => Promise<void> | void;
    onToast?: (message: string, type: 'success' | 'info' | 'warning') => void;
    historyEntries?: Array<{ id: string; description: string }>;
}

interface HistoryCommand {
    id: string;
    label: string;
    execute: () => Promise<void> | void;
}

export function useUndoRedo({
    hands,
    gestures: _gestures,
    isPaused = false,
    undo,
    redo,
    onQuickAction: _onQuickAction,
    onToast,
    historyEntries = [],
}: UseUndoRedoOptions) {
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [quickMenuVisible, setQuickMenuVisible] = useState(false);
    const [timelineVisible, setTimelineVisible] = useState(false);
    const [timelineIndex, setTimelineIndex] = useState(0);

    const lastActionRef = useRef(0);
    const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const actionCandidateRef = useRef<{ action: string | null; enteredAt: number | null }>({ action: null, enteredAt: null });
    const quickMenuTimerRef = useRef<number | null>(null);
    const toastTimerRef = useRef<number | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' = 'info') => {
        setToastMessage(message);
        onToast?.(message, type);
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 1000);
    }, [onToast]);

    const runCommand = useCallback(async (command: HistoryCommand) => {
        const now = Date.now();
        if (now - lastActionRef.current < 350) return;
        lastActionRef.current = now;
        await command.execute();
        showToast(command.label);
    }, [showToast]);

    useEffect(() => {
        if (isPaused) {
            setTimelineVisible(true);
            setTimelineIndex(Math.max(0, historyEntries.length - 1));
        } else {
            setTimelineVisible(false);
        }
    }, [historyEntries.length, isPaused]);

    useEffect(() => {
        if (!hands.length) {
            swipeStartRef.current = null;
            return;
        }

        const hand = hands.find((entry) => entry.handedness === 'right') ?? hands[0];
        const indexTip = hand.landmarks[8];

        if (!indexTip) return;

        const indexX = indexTip.x;

        // Region-based quick commands for undo/redo (holding hand near side edges)
        const HOLD_MS = 600;
        let desiredAction: string | null = null;
        if (indexX < 0.08) desiredAction = 'undo';
        else if (indexX > 0.92) desiredAction = 'redo';

        const now = Date.now();
        if (desiredAction) {
            const candidate = actionCandidateRef.current;
            if (candidate.action === desiredAction && candidate.enteredAt && now - candidate.enteredAt > HOLD_MS) {
                if (desiredAction === 'undo') void runCommand({ id: 'undo', label: 'Deshecho', execute: undo });
                else if (desiredAction === 'redo') void runCommand({ id: 'redo', label: 'Rehecho', execute: redo });
                actionCandidateRef.current = { action: null, enteredAt: null };
                return;
            }
            if (actionCandidateRef.current.action !== desiredAction) {
                actionCandidateRef.current = { action: desiredAction, enteredAt: now };
            }
            return;
        } else {
            actionCandidateRef.current = { action: null, enteredAt: null };
        }
    }, [hands, redo, runCommand, undo]);

    useEffect(() => {
        if (!timelineVisible || !historyEntries.length) return;
        const hand = hands.find((entry) => entry.handedness === 'right') ?? hands[0];
        if (!hand) return;
        const indexTip = hand.landmarks[8];
        if (!indexTip) return;
        if (!swipeStartRef.current) {
            swipeStartRef.current = { x: indexTip.x, y: indexTip.y };
            return;
        }
        const dx = indexTip.x - swipeStartRef.current.x;
        const dy = indexTip.y - swipeStartRef.current.y;
        if (Math.abs(dx) > 0.18) {
            setTimelineIndex((prev) => clamp(prev + (dx > 0 ? -1 : 1), 0, Math.max(0, historyEntries.length - 1)));
            swipeStartRef.current = { x: indexTip.x, y: indexTip.y };
        }
        if (Math.abs(dy) > 0.18) {
            setTimelineIndex((prev) => clamp(prev + (dy > 0 ? -1 : 1), 0, Math.max(0, historyEntries.length - 1)));
            swipeStartRef.current = { x: indexTip.x, y: indexTip.y };
        }
    }, [hands, historyEntries, timelineVisible]);

    useEffect(() => () => {
        if (quickMenuTimerRef.current) {
            window.clearTimeout(quickMenuTimerRef.current);
        }
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
        }
    }, []);

    const quickActions = useMemo(() => [
        { id: 'clear' as const, label: 'Limpiar', icon: '🗑️' },
        { id: 'export' as const, label: 'Exportar', icon: '⬇️' },
        { id: 'newLayer' as const, label: 'Nueva capa', icon: '➕' },
        { id: 'prevLayer' as const, label: 'Capa anterior', icon: '↺' },
    ], []);

    return {
        toastMessage,
        quickMenuVisible,
        closeQuickMenu: () => setQuickMenuVisible(false),
        timelineVisible,
        timelineIndex,
        timelineEntries: historyEntries,
        quickActions,
    };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
