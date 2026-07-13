import { useEffect, useState, useCallback, useRef } from 'react';
import { HandLandmarks, RecognizedGesture, GestureType, EditorAction } from '../types/hand';
import { recognizeGesture, GESTURE_TO_ACTION } from '../utils/gestureDefinitions';

interface UseGestureRecognitionOptions {
    hands: HandLandmarks[];
    onGestureDetected?: (gesture: RecognizedGesture, action: EditorAction) => void;
    debounceMs?: number;
}

export function useGestureRecognition(options: UseGestureRecognitionOptions) {
    const { hands, onGestureDetected, debounceMs = 300 } = options;

    const [gestures, setGestures] = useState<RecognizedGesture[]>([]);
    const [lastAction, setLastAction] = useState<EditorAction>('NONE');
    const lastGestureTime = useRef<Record<string, number>>({});
    const lastDetectedPerHand = useRef<Record<string, { type: string; since: number }>>({});
    const lastStablePerHand = useRef<Record<string, string>>({});
    const HOLD_MS = 400;

    // Procesar gestos cuando cambian las manos detectadas
    useEffect(() => {
        if (hands.length === 0) {
            setGestures([]);
            return;
        }

        const now = Date.now();
        const recognizedGestures: RecognizedGesture[] = hands.map((hand) => {
            const { type, confidence } = recognizeGesture(hand.landmarks, hand.handedness);

            // track when a type first appears for this hand
            const key = hand.handedness;
            const prev = lastDetectedPerHand.current[key];
            if (!prev || prev.type !== type) {
                lastDetectedPerHand.current[key] = { type, since: now };
            }

            return {
                type,
                confidence,
                hand: hand.handedness,
                timestamp: now,
            };
        });

        // always update raw gestures so UI can show immediate detections
        setGestures(recognizedGestures);

        // Now check for stable gestures per hand and only notify when held for HOLD_MS
        recognizedGestures.forEach((gesture) => {
            const key = gesture.hand;
            const detected = lastDetectedPerHand.current[key];
            if (!detected) return;
            const timeSince = now - (detected.since || now);

            // require minimal confidence and a hold time to consider stable
            if (gesture.confidence < 0.5) return;
            if (timeSince < HOLD_MS) return;

            // if already marked stable for this hand and same, debounce by gesture key
            if (lastStablePerHand.current[key] === gesture.type) return;

            lastStablePerHand.current[key] = gesture.type;

            const gestureKey = `${gesture.hand}-${gesture.type}`;
            const lastTime = lastGestureTime.current[gestureKey] || 0;

            if (now - lastTime < debounceMs) return;
            lastGestureTime.current[gestureKey] = now;

            const action = GESTURE_TO_ACTION[gesture.type] as EditorAction;
            if (action !== 'NONE') {
                setLastAction(action);
                if (onGestureDetected) {
                    onGestureDetected(gesture, action);
                }
            }
        });
    }, [hands, onGestureDetected, debounceMs]);

    // Función para obtener el gesto actual de una mano específica
    const getGestureByHand = useCallback(
        (hand: 'left' | 'right'): RecognizedGesture | undefined => {
            return gestures.find((g) => g.hand === hand);
        },
        [gestures]
    );

    // Función para verificar si un gesto específico está activo
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