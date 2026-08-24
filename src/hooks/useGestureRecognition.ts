import { useEffect, useState, useCallback, useRef } from 'react';
import { HandLandmarks, RecognizedGesture, GestureType, EditorAction } from '../types/hand';
import { recognizeGesture, GESTURE_TO_ACTION } from '../utils/gestureDefinitions';

interface UseGestureRecognitionOptions {
    hands: HandLandmarks[];
    onGestureDetected?: (gesture: RecognizedGesture, action: EditorAction) => void;
    debounceMs?: number;
}

export function useGestureRecognition(options: UseGestureRecognitionOptions) {
    const { hands, onGestureDetected, debounceMs = 100 } = options;

    const [gestures, setGestures] = useState<RecognizedGesture[]>([]);
    const [lastAction, setLastAction] = useState<EditorAction>('NONE');
    const lastGestureTime = useRef<Record<string, number>>({});
    const lastStablePerHand = useRef<Record<string, string>>({});

    useEffect(() => {
        if (hands.length === 0) {
            setGestures([]);
            return;
        }

        const now = Date.now();
        const recognizedGestures: RecognizedGesture[] = hands.map((hand) => {
            const { type, confidence } = recognizeGesture(hand.landmarks, hand.handedness);
            return {
                type,
                confidence,
                hand: hand.handedness,
                timestamp: now,
            };
        });

        setGestures(recognizedGestures);

        recognizedGestures.forEach((gesture) => {
            const key = gesture.hand;
            if (gesture.confidence < 0.4) return;

            if (lastStablePerHand.current[key] === gesture.type) return;
            lastStablePerHand.current[key] = gesture.type;

            const gestureKey = `${gesture.hand}-${gesture.type}`;
            const lastTime = lastGestureTime.current[gestureKey] || 0;

            if (now - lastTime < debounceMs) return;
            lastGestureTime.current[gestureKey] = now;

            const action = GESTURE_TO_ACTION[gesture.type] as EditorAction;
            if (action && action !== 'NONE') {
                setLastAction(action);
                if (onGestureDetected) {
                    onGestureDetected(gesture, action);
                }
            }
        });
    }, [hands, onGestureDetected, debounceMs]);

    const getGestureByHand = useCallback(
        (hand: 'left' | 'right'): RecognizedGesture | undefined => {
            return gestures.find((g) => g.hand === hand);
        },
        [gestures]
    );

    const isGestureActive = useCallback(
        (gestureType: GestureType, hand?: 'left' | 'right'): boolean => {
            if (hand) {
                const gesture = getGestureByHand(hand);
                return gesture?.type === gestureType;
            }
            return gestures.some((g) => g.type === gestureType);
        },
        [gestures, getGestureByHand]
    );

    return {
        gestures,
        lastAction,
        getGestureByHand,
        isGestureActive,
        clearLastAction: () => setLastAction('NONE'),
    };
}