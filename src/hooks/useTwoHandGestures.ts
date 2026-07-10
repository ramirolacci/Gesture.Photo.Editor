import { useEffect, useRef, useState } from 'react';
import { HandLandmarks, RecognizedGesture } from '../types/hand';

interface UseTwoHandGesturesOptions {
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    viewportSize?: { width: number; height: number };
}

interface TwoHandGestureState {
    color: string;
    size: number;
    visible: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getPalmCenter = (hand?: HandLandmarks) => {
    if (!hand) return null;

    const points = [0, 5, 9, 13, 17].map((index) => hand.landmarks[index]).filter(Boolean);
    if (points.length === 0) return null;

    const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return {
        x: sum.x / points.length,
        y: sum.y / points.length,
    };
};

export function useTwoHandGestures({ hands, gestures, viewportSize }: UseTwoHandGesturesOptions): TwoHandGestureState {
    const [color, setColor] = useState('#4f46e5');
    const [size, setSize] = useState(5);
    const [visible, setVisible] = useState(false);
    const hideTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (hands.length < 2) {
            setVisible(false);
            if (hideTimerRef.current) {
                window.clearTimeout(hideTimerRef.current);
            }
            return;
        }

        const leftHand = hands.find((hand) => hand.handedness === 'left');
        const rightHand = hands.find((hand) => hand.handedness === 'right');
        const leftGesture = gestures.find((gesture) => gesture.hand === 'left')?.type ?? 'NONE';
        const rightGesture = gestures.find((gesture) => gesture.hand === 'right')?.type ?? 'NONE';

        const leftCenter = getPalmCenter(leftHand);
        const leftIndex = leftHand?.landmarks[8];
        const rightThumb = rightHand?.landmarks[4];
        const rightIndex = rightHand?.landmarks[8];

        let nextColor = '#4f46e5';
        let nextSize = size;

        if (leftCenter && leftIndex) {
            const dx = leftIndex.x - leftCenter.x;
            const dy = leftIndex.y - leftCenter.y;
            const distance = Math.hypot(dx, dy);
            const hue = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
            const normalizedHue = (hue + 360) % 360;
            const normalizedSat = clamp(distance * 2.2, 0.15, 1);

            if (leftGesture === 'PINCH' && leftCenter.x < 0.28) {
                nextColor = '#000000';
            } else if (rightGesture === 'PINCH' && rightHand && getPalmCenter(rightHand)?.x && getPalmCenter(rightHand)!.x > 0.72) {
                nextColor = '#ffffff';
            } else if (leftGesture === 'PEACE' && leftCenter.y < 0.28) {
                nextColor = '#ef4444';
            } else if (leftGesture === 'PEACE' && leftCenter.y > 0.72) {
                nextColor = '#3b82f6';
            } else {
                nextColor = `hsl(${Math.round(normalizedHue)} ${Math.round(normalizedSat * 100)}% 50%)`;
            }
        }

        if (rightThumb && rightIndex) {
            const dx = rightIndex.x - rightThumb.x;
            const dy = rightIndex.y - rightThumb.y;
            const distance = Math.hypot(dx, dy);
            const scale = (viewportSize?.width ?? window.innerWidth) * 0.55;
            nextSize = clamp(Math.round(distance * scale), 1, 100);
        }

        setColor(nextColor);
        setSize(nextSize);
        setVisible(true);

        if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
        }
        hideTimerRef.current = window.setTimeout(() => setVisible(false), 2000);

        return () => {
            if (hideTimerRef.current) {
                window.clearTimeout(hideTimerRef.current);
            }
        };
    }, [hands, gestures, size, viewportSize?.height, viewportSize?.width]);

    return { color, size, visible };
}
