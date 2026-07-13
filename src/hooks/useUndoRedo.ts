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
    gestures,
    isPaused = false,
    undo,
    redo,
    onQuickAction,
    onToast,
    historyEntries = [],
}: UseUndoRedoOptions) {
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [quickMenuVisible, setQuickMenuVisible] = useState(false);
    const [timelineVisible, setTimelineVisible] = useState(false);
    const [timelineIndex, setTimelineIndex] = useState(0);

    const lastActionRef = useRef(0);
    const lastAngleRef = useRef<number | null>(null);
    const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const actionCandidateRef = useRef<{ action: string | null; enteredAt: number | null }>({ action: null, enteredAt: null });
    const quickMenuTimerRef = useRef<number | null>(null);
    const toastTimerRef = useRef<number | null>(null);
    const thumbHoldRef = useRef<number | null>(null);

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
        const gesture = gestures.find((entry) => entry.hand === hand.handedness)?.type ?? 'NONE';
        const indexTip = hand.landmarks[8];
        const thumbTip = hand.landmarks[4];
        const wrist = hand.landmarks[0];

        if (!indexTip || !thumbTip || !wrist) return;

        const indexX = indexTip.x;
        const indexY = indexTip.y;
        const angle = Math.atan2(indexTip.y - wrist.y, indexTip.x - wrist.x);

        // Region-based quick commands: require holding pointer in region for a short time to avoid accidental triggers
        const HOLD_MS = 450;
        let desiredAction: string | null = null;
        if (indexX < 0.12) desiredAction = 'undo';
        else if (indexX > 0.88) desiredAction = 'redo';
        else if (indexY < 0.12) desiredAction = 'export';
        else if (indexY > 0.88) desiredAction = 'clear';

        const now = Date.now();
        if (desiredAction) {
            const candidate = actionCandidateRef.current;
            if (candidate.action === desiredAction && candidate.enteredAt && now - candidate.enteredAt > HOLD_MS) {
                // Execute once and reset
                if (desiredAction === 'undo') void runCommand({ id: 'undo', label: 'Deshecho', execute: undo });
                else if (desiredAction === 'redo') void runCommand({ id: 'redo', label: 'Rehecho', execute: redo });
                else if (desiredAction === 'export') void runCommand({ id: 'export', label: 'Exportado', execute: () => onQuickAction?.('export') });
                else if (desiredAction === 'clear') void runCommand({ id: 'clear', label: 'Limpieza', execute: () => onQuickAction?.('clear') });
                actionCandidateRef.current = { action: null, enteredAt: null };
                return;
            }
            // start candidate timer
            if (actionCandidateRef.current.action !== desiredAction) {
                actionCandidateRef.current = { action: desiredAction, enteredAt: now };
            }
            // do not proceed further while waiting for hold
            return;
        } else {
            actionCandidateRef.current = { action: null, enteredAt: null };
        }

        if (gesture === 'POINT' || gesture === 'OPEN_PALM') {
            if (lastAngleRef.current !== null) {
                const delta = angle - lastAngleRef.current;
                if (delta > 0.4) {
                    void runCommand({ id: 'undo-rotate', label: 'Deshecho', execute: undo });
                } else if (delta < -0.4) {
                    void runCommand({ id: 'redo-rotate', label: 'Rehecho', execute: redo });
                }
            }
            lastAngleRef.current = angle;
        } else {
            lastAngleRef.current = null;
        }

        const thumbDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        // Require a short hold to open quick menu and increase threshold to reduce false positives
        const QUICK_MENU_THRESHOLD = 0.09;
        const QUICK_MENU_HOLD_MS = 220;
        if ((gesture === 'PINCH' || gesture === 'POINT') && thumbDistance < QUICK_MENU_THRESHOLD) {
            const now2 = Date.now();
            if (thumbHoldRef.current === null) {
                thumbHoldRef.current = now2;
            } else if (now2 - thumbHoldRef.current > QUICK_MENU_HOLD_MS) {
                if (!quickMenuVisible) {
                    setQuickMenuVisible(true);
                    if (quickMenuTimerRef.current) {
                        window.clearTimeout(quickMenuTimerRef.current);
                    }
                    quickMenuTimerRef.current = window.setTimeout(() => setQuickMenuVisible(false), 2200);
                }
                // keep menu until interaction
            }
            return;
        } else {
            thumbHoldRef.current = null;
        }

        if (quickMenuVisible) {
            if (!swipeStartRef.current) {
                swipeStartRef.current = { x: indexX, y: indexY };
                return;
            }

            const dx = indexX - swipeStartRef.current.x;
            const dy = indexY - swipeStartRef.current.y;
            const threshold = 0.16;
            if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
                const action = Math.abs(dx) > Math.abs(dy)
                    ? (dx > 0 ? 'newLayer' : 'prevLayer')
                    : (dy > 0 ? 'clear' : 'export');
                void onQuickAction?.(action);
                setQuickMenuVisible(false);
                swipeStartRef.current = null;
            }
        } else {
            swipeStartRef.current = null;
        }
    }, [gestures, hands, onQuickAction, quickMenuVisible, redo, runCommand, undo]);

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
