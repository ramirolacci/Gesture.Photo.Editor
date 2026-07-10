import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HandLandmarks, RecognizedGesture } from '../types/hand';

interface UseZoomPanOptions {
    canvasRef: React.RefObject<HTMLElement>;
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    viewportSize?: { width: number; height: number };
    minZoom?: number;
    maxZoom?: number;
}

interface ZoomPanState {
    zoom: number;
    pan: { x: number; y: number };
    zoomPercent: number;
    viewportRect: { x: number; y: number; width: number; height: number };
    transformStyle: { transform: string; transformOrigin: string };
    mode: 'idle' | 'zoom' | 'pan';
    isActive: boolean;
    reset: () => void;
    setZoom: (value: number) => void;
    setPan: (value: { x: number; y: number }) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getPalmCenter = (hand?: HandLandmarks) => {
    if (!hand) return null;
    const points = [0, 5, 9, 13, 17].map((index) => hand.landmarks[index]).filter(Boolean);
    if (points.length === 0) return null;
    const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
};

export function useZoomPan({
    canvasRef,
    hands,
    gestures,
    viewportSize,
    minZoom = 0.6,
    maxZoom = 4,
}: UseZoomPanOptions): ZoomPanState {
    const [zoom, setZoomState] = useState(1);
    const [pan, setPanState] = useState({ x: 0, y: 0 });
    const [mode, setMode] = useState<'idle' | 'zoom' | 'pan'>('idle');

    const zoomRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const initialZoomDistanceRef = useRef<number | null>(null);
    const initialPinchDistanceRef = useRef<number | null>(null);
    const initialZoomRef = useRef(1);
    const initialPanPointRef = useRef<{ x: number; y: number } | null>(null);
    const initialPanOffsetRef = useRef({ x: 0, y: 0 });
    const lastTapRef = useRef(0);
    const lastTapGestureRef = useRef<'PINCH' | 'NONE'>('NONE');

    const viewport = useMemo(() => ({
        width: viewportSize?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1280),
        height: viewportSize?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 720),
    }), [viewportSize?.width, viewportSize?.height]);

    const applyTransform = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const element = canvas as HTMLElement;
        element.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
        element.style.transformOrigin = '0 0';
    }, [canvasRef]);

    const setZoom = useCallback((value: number) => {
        const nextZoom = clamp(value, minZoom, maxZoom);
        zoomRef.current = nextZoom;
        setZoomState(nextZoom);
        applyTransform();
    }, [applyTransform, maxZoom, minZoom]);

    const setPan = useCallback((value: { x: number; y: number }) => {
        panRef.current = value;
        setPanState(value);
        applyTransform();
    }, [applyTransform]);

    const reset = useCallback(() => {
        zoomRef.current = 1;
        panRef.current = { x: 0, y: 0 };
        setZoomState(1);
        setPanState({ x: 0, y: 0 });
        setMode('idle');
        initialZoomDistanceRef.current = null;
        initialPinchDistanceRef.current = null;
        initialZoomRef.current = 1;
        initialPanPointRef.current = null;
        initialPanOffsetRef.current = { x: 0, y: 0 };
        applyTransform();
    }, [applyTransform]);

    useEffect(() => {
        applyTransform();
    }, [applyTransform]);

    useEffect(() => {
        if (hands.length === 0) {
            setMode('idle');
            return;
        }

        const leftHand = hands.find((hand) => hand.handedness === 'left');
        const rightHand = hands.find((hand) => hand.handedness === 'right');
        const leftGesture = gestures.find((gesture) => gesture.hand === 'left')?.type ?? 'NONE';
        const rightGesture = gestures.find((gesture) => gesture.hand === 'right')?.type ?? 'NONE';
        const leftCenter = getPalmCenter(leftHand);
        const rightCenter = getPalmCenter(rightHand);

        if (leftCenter && rightCenter && leftGesture === 'OPEN_PALM' && rightGesture === 'OPEN_PALM') {
            reset();
            return;
        }

        const now = Date.now();
        const shouldDoubleTap = (leftGesture === 'PINCH' || rightGesture === 'PINCH') && lastTapGestureRef.current === 'PINCH' && now - lastTapRef.current < 300;
        if (shouldDoubleTap) {
            reset();
            lastTapGestureRef.current = 'NONE';
            lastTapRef.current = 0;
            return;
        }

        if (leftGesture === 'PINCH' || rightGesture === 'PINCH') {
            lastTapGestureRef.current = 'PINCH';
            lastTapRef.current = now;
        }

        if (leftCenter && rightCenter && leftGesture === 'FIST' && rightGesture === 'FIST') {
            setMode('zoom');
            const distance = Math.hypot(rightCenter.x - leftCenter.x, rightCenter.y - leftCenter.y);
            if (initialZoomDistanceRef.current === null) {
                initialZoomDistanceRef.current = distance;
                initialZoomRef.current = zoomRef.current;
            } else {
                const ratio = distance / initialZoomDistanceRef.current;
                const nextZoom = clamp(initialZoomRef.current * ratio, minZoom, maxZoom);
                if (Math.abs(nextZoom - zoomRef.current) > 0.01) {
                    setZoom(nextZoom);
                }
            }
            return;
        }

        if (leftGesture === 'PINCH' || rightGesture === 'PINCH') {
            const activeHand = leftGesture === 'PINCH' ? leftHand : rightHand;
            const thumb = activeHand?.landmarks[4];
            const index = activeHand?.landmarks[8];
            if (thumb && index) {
                setMode('zoom');
                const distance = Math.hypot(index.x - thumb.x, index.y - thumb.y);
                if (initialPinchDistanceRef.current === null) {
                    initialPinchDistanceRef.current = distance;
                    initialZoomRef.current = zoomRef.current;
                } else {
                    const ratio = distance / initialPinchDistanceRef.current;
                    const nextZoom = clamp(initialZoomRef.current * ratio, minZoom, maxZoom);
                    if (Math.abs(nextZoom - zoomRef.current) > 0.01) {
                        setZoom(nextZoom);
                    }
                }
            }
            return;
        }

        if (rightGesture === 'POINT' && rightHand) {
            setMode('pan');
            const indexTip = rightHand.landmarks[8];
            if (indexTip) {
                if (initialPanPointRef.current === null) {
                    initialPanPointRef.current = { x: indexTip.x, y: indexTip.y };
                    initialPanOffsetRef.current = { ...panRef.current };
                } else {
                    const deltaX = (indexTip.x - initialPanPointRef.current.x) * viewport.width;
                    const deltaY = (indexTip.y - initialPanPointRef.current.y) * viewport.height;
                    const nextPan = {
                        x: initialPanOffsetRef.current.x + deltaX / zoomRef.current,
                        y: initialPanOffsetRef.current.y + deltaY / zoomRef.current,
                    };
                    setPan(nextPan);
                }
            }
            return;
        }

        initialZoomDistanceRef.current = null;
        initialPinchDistanceRef.current = null;
        initialPanPointRef.current = null;
        setMode('idle');
    }, [applyTransform, gestures, hands, maxZoom, minZoom, reset, setPan, setZoom, viewport.height, viewport.width]);

    const viewportRect = useMemo(() => ({
        x: -panRef.current.x / zoomRef.current,
        y: -panRef.current.y / zoomRef.current,
        width: viewport.width / zoomRef.current,
        height: viewport.height / zoomRef.current,
    }), [viewport.height, viewport.width]);

    return {
        zoom,
        pan,
        zoomPercent: Math.round(zoom * 100),
        viewportRect,
        transformStyle: {
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
        },
        mode,
        isActive: mode !== 'idle',
        reset,
        setZoom,
        setPan,
    };
}
