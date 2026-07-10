import { useEffect, useRef, useState } from 'react';
import { GestureType, HandLandmarks, RecognizedGesture } from '../types/hand';

const HOLD_DURATION_MS = 2000;
const RADIAL_HIDE_MS = 3000;

interface UseGestureCommandsOptions {
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    isGesturePaused?: boolean;
}

interface UseGestureCommandsResult {
    activeCommand: GestureType | null;
    radialMenuVisible: boolean;
    setRadialMenuVisible: (value: boolean) => void;
    clearRadialMenu: () => void;
}

export function useGestureCommands({
    hands,
    gestures,
    isGesturePaused = false,
}: UseGestureCommandsOptions): UseGestureCommandsResult {
    const [activeCommand, setActiveCommand] = useState<GestureType | null>(null);
    const [radialMenuVisible, setRadialMenuVisible] = useState(false);

    const holdStartRef = useRef<number | null>(null);
    const holdGestureRef = useRef<GestureType>('NONE');
    const radialTimerRef = useRef<number | null>(null);

    const clearRadialMenu = () => {
        if (radialTimerRef.current) {
            window.clearTimeout(radialTimerRef.current);
            radialTimerRef.current = null;
        }
        setRadialMenuVisible(false);
    };

    useEffect(() => {
        if (isGesturePaused) {
            holdStartRef.current = null;
            holdGestureRef.current = 'NONE';
            setActiveCommand(null);
            clearRadialMenu();
            return;
        }

        if (!hands.length || !gestures.length) {
            holdStartRef.current = null;
            holdGestureRef.current = 'NONE';
            setActiveCommand(null);
            return;
        }

        const gesture = gestures[0]?.type ?? 'NONE';
        if (gesture === 'NONE') {
            holdStartRef.current = null;
            holdGestureRef.current = 'NONE';
            setActiveCommand(null);
            return;
        }

        if (gesture !== holdGestureRef.current) {
            holdGestureRef.current = gesture;
            holdStartRef.current = Date.now();
            return;
        }

        if (holdStartRef.current === null) {
            holdStartRef.current = Date.now();
            return;
        }

        if (Date.now() - holdStartRef.current >= HOLD_DURATION_MS) {
            if (gesture === 'THUMBS_UP') {
                setRadialMenuVisible(true);
                if (radialTimerRef.current) {
                    window.clearTimeout(radialTimerRef.current);
                }
                radialTimerRef.current = window.setTimeout(() => {
                    setRadialMenuVisible(false);
                    radialTimerRef.current = null;
                }, RADIAL_HIDE_MS);
            } else {
                setActiveCommand(gesture);
            }
            holdStartRef.current = null;
            holdGestureRef.current = 'NONE';
        }
    }, [hands, gestures, isGesturePaused]);

    useEffect(() => {
        return () => {
            if (radialTimerRef.current) {
                window.clearTimeout(radialTimerRef.current);
            }
        };
    }, []);

    return {
        activeCommand,
        radialMenuVisible,
        setRadialMenuVisible,
        clearRadialMenu,
    };
}
