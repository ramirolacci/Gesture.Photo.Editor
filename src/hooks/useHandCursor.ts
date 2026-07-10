import { useEffect, useMemo, useRef, useState } from 'react';
import { HandLandmarks, RecognizedGesture } from '../types/hand';

interface HandCursorOptions {
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    isGesturePaused?: boolean;
    viewportSize?: { width: number; height: number };
    smoothing?: number;
}

interface HandCursorResult {
    cursorPosition: { x: number; y: number } | null;
    isVisible: boolean;
    isDrawing: boolean;
    isErasing: boolean;
    isMoving: boolean;
}

export function useHandCursor({
    hands,
    gestures,
    isGesturePaused = false,
    viewportSize,
    smoothing = 0.18,
}: HandCursorOptions): HandCursorResult {
    const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isErasing, setIsErasing] = useState(false);
    const [isMoving, setIsMoving] = useState(false);

    const targetPositionRef = useRef<{ x: number; y: number } | null>(null);
    const smoothedPositionRef = useRef<{ x: number; y: number } | null>(null);
    const frameRef = useRef<number | null>(null);

    const size = useMemo(() => ({
        width: viewportSize?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1280),
        height: viewportSize?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 720),
    }), [viewportSize?.width, viewportSize?.height]);

    useEffect(() => {
        const updateLoop = () => {
            const target = targetPositionRef.current;
            if (!target) {
                setCursorPosition(null);
                setIsVisible(false);
                frameRef.current = requestAnimationFrame(updateLoop);
                return;
            }

            if (!smoothedPositionRef.current) {
                smoothedPositionRef.current = { ...target };
            } else {
                smoothedPositionRef.current = {
                    x: smoothedPositionRef.current.x + (target.x - smoothedPositionRef.current.x) * smoothing,
                    y: smoothedPositionRef.current.y + (target.y - smoothedPositionRef.current.y) * smoothing,
                };
            }

            setCursorPosition({ ...smoothedPositionRef.current });
            setIsVisible(true);
            frameRef.current = requestAnimationFrame(updateLoop);
        };

        frameRef.current = requestAnimationFrame(updateLoop);

        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [smoothing]);

    useEffect(() => {
        if (isGesturePaused || hands.length === 0) {
            targetPositionRef.current = null;
            smoothedPositionRef.current = null;
            setCursorPosition(null);
            setIsVisible(false);
            setIsDrawing(false);
            setIsErasing(false);
            setIsMoving(false);
            return;
        }

        const hand = hands[0];
        const gesture = gestures.find((g) => g.hand === hand.handedness) || gestures[0];
        const indexTip = hand.landmarks[8];

        if (!indexTip) {
            targetPositionRef.current = null;
            smoothedPositionRef.current = null;
            setCursorPosition(null);
            setIsVisible(false);
            setIsDrawing(false);
            setIsErasing(false);
            setIsMoving(false);
            return;
        }

        const nextPosition = {
            x: (1 - indexTip.x) * size.width,
            y: indexTip.y * size.height,
        };

        targetPositionRef.current = nextPosition;
        setIsDrawing(gesture.type === 'PINCH');
        setIsErasing(gesture.type === 'PEACE');
        setIsMoving(gesture.type === 'POINT');
    }, [hands, gestures, isGesturePaused, size.height, size.width]);

    return {
        cursorPosition,
        isVisible,
        isDrawing,
        isErasing,
        isMoving,
    };
}
