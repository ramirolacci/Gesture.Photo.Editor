import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HandLandmarks, RecognizedGesture, GestureType } from '../types/hand';
import { playSuccessSound } from '../utils/audioFeedback';

interface TutorialStep {
    id: GestureType;
    title: string;
    description: string;
    icon: string;
}

interface ContextualHint {
    gestureType: GestureType;
    title: string;
    description: string;
    icon: string;
}

interface UseTutorialOptions {
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
}

const STORAGE_KEY = 'gesture_photo_tutorial_state_v1';
const TUTORIAL_STEPS: TutorialStep[] = [
    { id: 'PINCH', title: 'Dibujar', description: 'Apreta con el pulgar y el índice para usar el pincel', icon: '✍️' },
    { id: 'POINT', title: 'Mover', description: 'Señala con el índice para mover anotaciones', icon: '☝️' },
    { id: 'PEACE', title: 'Borrar', description: 'Haz la V para borrar', icon: '✌️' },
    { id: 'FIST', title: 'Zoom', description: 'Cierra el puño para acercar o alejar', icon: '✊' },
    { id: 'THUMBS_UP', title: 'Listo', description: 'Pulgar arriba para confirmar', icon: '👍' },
];

const gestureInfo: Record<GestureType, { title: string; description: string; icon: string }> = {
    PINCH: { title: 'Pincel', description: 'Dibuja sobre la pantalla', icon: '✍️' },
    POINT: { title: 'Mover', description: 'Desplaza anotaciones', icon: '☝️' },
    OPEN_PALM: { title: 'Pausa', description: 'Detén los gestos temporalmente', icon: '🖐️' },
    FIST: { title: 'Zoom', description: 'Ajusta la vista', icon: '✊' },
    THUMBS_UP: { title: 'Confirmar', description: 'Listo para seguir', icon: '👍' },
    PEACE: { title: 'Borrador', description: 'Limpia lo que quieras', icon: '✌️' },
    NONE: { title: 'Sin gesto', description: '', icon: '⋯' },
};

type TutorialStatus = 'pending' | 'completed' | 'skipped';

interface PersistedTutorialState {
    status: TutorialStatus;
    stepIndex: number;
    completedSteps: GestureType[];
}

export function useTutorial({ hands, gestures }: UseTutorialOptions) {
    const [status, setStatus] = useState<TutorialStatus>('pending');
    const [stepIndex, setStepIndex] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<GestureType[]>([]);
    const [showCheck, setShowCheck] = useState(false);
    const [contextualHint, setContextualHint] = useState<ContextualHint | null>(null);

    const holdTimerRef = useRef<number | null>(null);
    const rotateStartRef = useRef<number | null>(null);
    const replayStartRef = useRef<number | null>(null);
    const previousActiveGesturesRef = useRef<GestureType[]>([]);
    const rotationAngleRef = useRef<number | null>(null);

    const persistState = useCallback((nextStatus: TutorialStatus, nextStepIndex: number, nextCompletedSteps: GestureType[]) => {
        try {
            const payload: PersistedTutorialState = {
                status: nextStatus,
                stepIndex: nextStepIndex,
                completedSteps: nextCompletedSteps,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore storage failures
        }
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as PersistedTutorialState;
            if (parsed.status === 'completed' || parsed.status === 'skipped') {
                setStatus(parsed.status);
                setStepIndex(parsed.stepIndex ?? 0);
                setCompletedSteps(parsed.completedSteps ?? []);
                return;
            }
            setStatus(parsed.status ?? 'pending');
            setStepIndex(parsed.stepIndex ?? 0);
            setCompletedSteps(parsed.completedSteps ?? []);
        } catch {
            // Ignore invalid storage payloads
        }
    }, []);

    const currentStep = useMemo(() => TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0], [stepIndex]);
    const visible = status === 'pending';

    const completeCurrentStep = useCallback(() => {
        const nextCompletedSteps = completedSteps.includes(currentStep.id)
            ? completedSteps
            : [...completedSteps, currentStep.id];

        playSuccessSound();
        setCompletedSteps(nextCompletedSteps);
        setShowCheck(true);

        window.setTimeout(() => setShowCheck(false), 900);

        if (stepIndex < TUTORIAL_STEPS.length - 1) {
            const nextStepIndex = stepIndex + 1;
            setStepIndex(nextStepIndex);
            persistState(status, nextStepIndex, nextCompletedSteps);
        } else {
            setStatus('completed');
            persistState('completed', stepIndex, nextCompletedSteps);
        }
    }, [completedSteps, currentStep.id, persistState, status, stepIndex]);

    useEffect(() => {
        if (status !== 'pending') return;

        const activeStepGesture = currentStep.id;
        const matches = gestures.some((gesture) => gesture.type === activeStepGesture);

        if (matches) {
            if (holdTimerRef.current === null) {
                holdTimerRef.current = window.setTimeout(() => {
                    completeCurrentStep();
                    holdTimerRef.current = null;
                }, 240);
            }
        } else {
            if (holdTimerRef.current) {
                window.clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
            }
        }

        return () => {
            if (holdTimerRef.current) {
                window.clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
            }
        };
    }, [completeCurrentStep, currentStep.id, gestures, status]);

    useEffect(() => {
        if (status !== 'pending') return;

        const activeGestureTypes = gestures.filter((gesture) => gesture.type !== 'NONE').map((gesture) => gesture.type);
        const previousActive = previousActiveGesturesRef.current;

        activeGestureTypes.forEach((gestureType) => {
            if (!previousActive.includes(gestureType)) {
                const usageCount = (gestureType in ({} as Record<string, number>) ? 0 : 0);
                const count = (usageCount as number) + 1;
                if (count === 1) {
                    const hint = gestureInfo[gestureType];
                    setContextualHint({ gestureType, title: hint.title, description: hint.description, icon: hint.icon });
                }
            }
        });

        previousActiveGesturesRef.current = activeGestureTypes;
    }, [gestures, status]);

    useEffect(() => {
        if (!contextualHint) return;
        const timeout = window.setTimeout(() => setContextualHint(null), 1600);
        return () => window.clearTimeout(timeout);
    }, [contextualHint]);

    useEffect(() => {
        if (status !== 'pending') return;
        if (hands.length < 2) {
            rotateStartRef.current = null;
            rotationAngleRef.current = null;
            return;
        }

        const leftIndex = hands.find((hand) => hand.handedness === 'left')?.landmarks[8];
        const rightIndex = hands.find((hand) => hand.handedness === 'right')?.landmarks[8];
        if (!leftIndex || !rightIndex) return;

        const currentAngle = Math.atan2(rightIndex.y - leftIndex.y, rightIndex.x - leftIndex.x);
        const previousAngle = rotationAngleRef.current;

        if (previousAngle !== null) {
            const delta = Math.abs(currentAngle - previousAngle);
            const normalizedDelta = Math.min(delta, Math.PI * 2 - delta);
            if (normalizedDelta > 0.9) {
                if (rotateStartRef.current === null) {
                    rotateStartRef.current = Date.now();
                } else if (Date.now() - rotateStartRef.current > 220) {
                    setStatus('skipped');
                    persistState('skipped', stepIndex, completedSteps);
                    rotateStartRef.current = null;
                }
            } else {
                rotateStartRef.current = null;
            }
        }

        rotationAngleRef.current = currentAngle;
    }, [completedSteps, hands, persistState, status, stepIndex]);

    useEffect(() => {
        if (status === 'pending') return;
        if (!gestures.some((gesture) => gesture.type === 'PINCH')) {
            replayStartRef.current = null;
            return;
        }

        if (replayStartRef.current === null) {
            replayStartRef.current = Date.now();
        } else if (Date.now() - replayStartRef.current > 5000) {
            setStatus('pending');
            setStepIndex(0);
            setCompletedSteps([]);
            setContextualHint(null);
            persistState('pending', 0, []);
            replayStartRef.current = null;
        }
    }, [gestures, persistState, status]);

    const skipTutorial = useCallback(() => {
        setStatus('skipped');
        persistState('skipped', stepIndex, completedSteps);
    }, [completedSteps, persistState, stepIndex]);

    const restartTutorial = useCallback(() => {
        setStatus('pending');
        setStepIndex(0);
        setCompletedSteps([]);
        setContextualHint(null);
        persistState('pending', 0, []);
    }, [persistState]);

    return {
        visible,
        currentStep,
        stepIndex,
        totalSteps: TUTORIAL_STEPS.length,
        completedSteps,
        showCheck,
        contextualHint,
        status,
        skipTutorial,
        restartTutorial,
    };
}
