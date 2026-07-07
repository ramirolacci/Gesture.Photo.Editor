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

    // Procesar gestos cuando cambian las manos detectadas
    useEffect(() => {
        if (hands.length === 0) {
            setGestures([]);
            return;
        }

        const recognizedGestures: RecognizedGesture[] = hands.map((hand) => {
            const { type, confidence } = recognizeGesture(hand.landmarks, hand.handedness);

            return {
                type,
                confidence,
                hand: hand.handedness,
                timestamp: Date.now(),
            };
        });

        setGestures(recognizedGestures);

        // Procesar acciones para cada gesto
        recognizedGestures.forEach((gesture) => {
            const gestureKey = `${gesture.hand}-${gesture.type}`;
            const now = Date.now();
            const lastTime = lastGestureTime.current[gestureKey] || 0;

            // Debounce: solo procesar si pasó suficiente tiempo
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