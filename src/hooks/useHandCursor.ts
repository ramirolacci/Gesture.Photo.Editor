import { useEffect, useMemo, useRef, useState } from 'react';
import { HandLandmarks, RecognizedGesture } from '../types/hand';
import { Point3DSmoother } from '../utils/landmarkSmoother';

interface HandCursorOptions {
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    isGesturePaused?: boolean;
    viewportSize?: { width: number; height: number };
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
}: HandCursorOptions): HandCursorResult {
    const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isErasing, setIsErasing] = useState(false);
    const [isMoving, setIsMoving] = useState(false);

    const smootherRef = useRef<Point3DSmoother>(new Point3DSmoother(1.2, 0.03));

    const size = useMemo(() => ({
        width: viewportSize?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1280),
        height: viewportSize?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 720),
    }), [viewportSize?.width, viewportSize?.height]);

    useEffect(() => {
        if (isGesturePaused || hands.length === 0) {
            smootherRef.current.reset();
            setCursorPosition(null);
            setIsVisible(false);
            setIsDrawing(false);
            setIsErasing(false);
            setIsMoving(false);
            return;
        }

        const hand = hands[0];
        if (!hand?.landmarks?.length) {
            smootherRef.current.reset();
            setCursorPosition(null);
            setIsVisible(false);
            setIsDrawing(false);
            setIsErasing(false);
            setIsMoving(false);
            return;
        }

        const gesture = gestures.find((g) => g.hand === hand.handedness) ?? gestures[0];
        const gestureType = gesture?.type ?? 'NONE';
        const indexTip = hand.landmarks[8];

        if (!indexTip) {
            smootherRef.current.reset();
            setCursorPosition(null);
            setIsVisible(false);
            setIsDrawing(false);
            setIsErasing(false);
            setIsMoving(false);
            return;
        }

        const rawPos = {
            x: (1 - indexTip.x) * size.width,
            y: indexTip.y * size.height,
        };

        const filteredPos = smootherRef.current.filter(rawPos);

        setCursorPosition(filteredPos);
        setIsVisible(true);
        // POINT (índice extendido) = Dibujar
        setIsDrawing(gestureType === 'POINT');
        // PEACE (índice + medio extendidos juntos) = Borrar
        setIsErasing(gestureType === 'PEACE');
        // PINCH (pulgar + índice juntos) = Agarrar / Arrastrar
        setIsMoving(gestureType === 'PINCH');
    }, [hands, gestures, isGesturePaused, size.height, size.width]);

    return {
        cursorPosition,
        isVisible,
        isDrawing,
        isErasing,
        isMoving,
    };
}
