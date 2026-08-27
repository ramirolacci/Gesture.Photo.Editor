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

    // Búfer de estabilización de gestos por mano (FSM)
    const gestureHistoryRef = useRef<Record<string, { type: GestureType; count: number }>>({});
    const confirmedGestureRef = useRef<Record<string, GestureType>>({});

    useEffect(() => {
        if (hands.length === 0) {
            setGestures([]);
            gestureHistoryRef.current = {};
            confirmedGestureRef.current = {};
            return;
        }

        const now = Date.now();
        const recognizedGestures: RecognizedGesture[] = hands.map((hand) => {
            const handKey = hand.handedness;
            const currentConfirmed = confirmedGestureRef.current[handKey] || 'NONE';
            const isCurrentlyPinching = currentConfirmed === 'PINCH';

            const rawResult = recognizeGesture(hand.landmarks, hand.handedness, isCurrentlyPinching);
            let rawType = rawResult.type;

            // Historial de estabilidad de frames
            const history = gestureHistoryRef.current[handKey] || { type: 'NONE', count: 0 };
            if (history.type === rawType) {
                history.count += 1;
            } else {
                history.type = rawType;
                history.count = 1;
            }
            gestureHistoryRef.current[handKey] = history;

            // Requerir mínimo de frames estables para confirmar cambio de estado
            // Gestos destructivos o sensibles (PEACE, OPEN_PALM) requieren 3 frames (~60-90ms)
            const requiredFrames = (rawType === 'PEACE' || rawType === 'OPEN_PALM') ? 3 : 2;

            let confirmedType = currentConfirmed;
            if (history.count >= requiredFrames) {
                confirmedType = rawType;
                confirmedGestureRef.current[handKey] = confirmedType;
            }

            return {
                type: confirmedType,
                confidence: rawResult.confidence,
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