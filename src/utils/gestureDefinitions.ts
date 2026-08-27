import { GestureType, Landmark } from '../types/hand';
import { calculateDistance, FingerLandmarks } from './distanceCalculator';

/**
 * Calcula la escala general de la mano basada en la distancia Muñeca -> Base del Dedo Medio
 */
export function getHandScale(landmarks: Landmark[]): number {
    const wrist = landmarks[FingerLandmarks.WRIST];
    const middleMCP = landmarks[FingerLandmarks.MIDDLE_MCP];
    if (!wrist || !middleMCP) return 1.0;
    return Math.max(calculateDistance(wrist, middleMCP), 0.01);
}

/**
 * Detecta gesto de PINCH (pulgar + índice juntos para agarrar y arrastrar) con invariancia a escala
 */
export function detectPinch(landmarks: Landmark[], isCurrentlyPinching: boolean = false): boolean {
    const thumbTip = landmarks[FingerLandmarks.THUMB_TIP];
    const indexTip = landmarks[FingerLandmarks.INDEX_TIP];

    if (!thumbTip || !indexTip) return false;

    const handScale = getHandScale(landmarks);
    const distance3D = calculateDistance(thumbTip, indexTip);
    const normalizedDistance = distance3D / handScale;

    // Histeresis: Umbral más estricto para entrar (0.35), más holgado para salir (0.50) si ya está haciendo pinch
    const threshold = isCurrentlyPinching ? 0.50 : 0.36;
    return normalizedDistance < threshold;
}

/**
 * Detecta gesto de POINT (solo índice extendido para dibujar)
 */
export function detectPoint(landmarks: Landmark[]): boolean {
    const indexExtended = isFingerExtended(landmarks, 'index');
    const middleClosed = !isFingerExtended(landmarks, 'middle');
    const ringClosed = !isFingerExtended(landmarks, 'ring');
    const pinkyClosed = !isFingerExtended(landmarks, 'pinky');

    return indexExtended && middleClosed && ringClosed && pinkyClosed;
}

/**
 * Detecta gesto de OPEN_PALM (todos los dedos extendidos)
 */
export function detectOpenPalm(landmarks: Landmark[]): boolean {
    return (
        isFingerExtended(landmarks, 'index') &&
        isFingerExtended(landmarks, 'middle') &&
        isFingerExtended(landmarks, 'ring') &&
        isFingerExtended(landmarks, 'pinky')
    );
}

/**
 * Detecta gesto de FIST (todos los dedos cerrados)
 */
export function detectFist(landmarks: Landmark[]): boolean {
    return (
        !isFingerExtended(landmarks, 'thumb') &&
        !isFingerExtended(landmarks, 'index') &&
        !isFingerExtended(landmarks, 'middle') &&
        !isFingerExtended(landmarks, 'ring') &&
        !isFingerExtended(landmarks, 'pinky')
    );
}

/**
 * Detecta gesto de THUMBS_UP
 */
export function detectThumbsUp(landmarks: Landmark[]): boolean {
    const thumbTip = landmarks[FingerLandmarks.THUMB_TIP];
    const thumbIP = landmarks[FingerLandmarks.THUMB_IP];
    const indexMCP = landmarks[FingerLandmarks.INDEX_MCP];

    const thumbUp = thumbTip.y < thumbIP.y && thumbTip.y < indexMCP.y;
    const otherFingersClosed =
        !isFingerExtended(landmarks, 'index') &&
        !isFingerExtended(landmarks, 'middle') &&
        !isFingerExtended(landmarks, 'ring') &&
        !isFingerExtended(landmarks, 'pinky');

    return thumbUp && otherFingersClosed;
}

/**
 * Detecta gesto de PEACE (índice y medio extendidos/juntos para borrar)
 */
export function detectPeace(landmarks: Landmark[]): boolean {
    const indexExtended = isFingerExtended(landmarks, 'index');
    const middleExtended = isFingerExtended(landmarks, 'middle');
    const ringClosed = !isFingerExtended(landmarks, 'ring');
    const pinkyClosed = !isFingerExtended(landmarks, 'pinky');

    return indexExtended && middleExtended && ringClosed && pinkyClosed;
}

/**
 * Verifica si un dedo está extendido de forma robusta e invariante a la rotación 3D
 */
function isFingerExtended(
    landmarks: Landmark[],
    finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
): boolean {
    const wrist = landmarks[FingerLandmarks.WRIST];
    const tipIndex = getFingerTipIndex(finger);
    const pipIndex = getFingerPipIndex(finger);
    const mcpIndex = getFingerMcpIndex(finger);

    if (!wrist || !tipIndex || !pipIndex || !mcpIndex) return false;

    const tip = landmarks[tipIndex];
    const pip = landmarks[pipIndex];
    const mcp = landmarks[mcpIndex];

    if (finger === 'thumb') {
        const distanceTipToMCP = calculateDistance(tip, mcp);
        const distancePipToMCP = calculateDistance(pip, mcp);
        return distanceTipToMCP > distancePipToMCP * 1.15;
    }

    // Para los 4 dedos principales: la punta debe estar sensiblemente más alejada de la muñeca que la articulación PIP
    const distTipWrist = calculateDistance(tip, wrist);
    const distPipWrist = calculateDistance(pip, wrist);

    return distTipWrist > distPipWrist * 1.06;
}

function getFingerTipIndex(finger: string): number | null {
    const tips: Record<string, number> = {
        thumb: FingerLandmarks.THUMB_TIP,
        index: FingerLandmarks.INDEX_TIP,
        middle: FingerLandmarks.MIDDLE_TIP,
        ring: FingerLandmarks.RING_TIP,
        pinky: FingerLandmarks.PINKY_TIP,
    };
    return tips[finger] || null;
}

function getFingerPipIndex(finger: string): number | null {
    const pips: Record<string, number> = {
        thumb: FingerLandmarks.THUMB_IP,
        index: FingerLandmarks.INDEX_PIP,
        middle: FingerLandmarks.MIDDLE_PIP,
        ring: FingerLandmarks.RING_PIP,
        pinky: FingerLandmarks.PINKY_PIP,
    };
    return pips[finger] || null;
}

function getFingerMcpIndex(finger: string): number | null {
    const mcps: Record<string, number> = {
        thumb: FingerLandmarks.THUMB_MCP,
        index: FingerLandmarks.INDEX_MCP,
        middle: FingerLandmarks.MIDDLE_MCP,
        ring: FingerLandmarks.RING_MCP,
        pinky: FingerLandmarks.PINKY_MCP,
    };
    return mcps[finger] || null;
}

/**
 * Reconoce el gesto principal de una mano
 */
export function recognizeGesture(
    landmarks: Landmark[],
    _handedness: 'left' | 'right',
    isCurrentlyPinching: boolean = false
): { type: GestureType; confidence: number } {
    if (detectPinch(landmarks, isCurrentlyPinching)) {
        return { type: 'PINCH', confidence: 0.95 };
    }
    if (detectOpenPalm(landmarks)) {
        return { type: 'OPEN_PALM', confidence: 0.9 };
    }
    if (detectPoint(landmarks)) {
        return { type: 'POINT', confidence: 0.9 };
    }
    if (detectPeace(landmarks)) {
        return { type: 'PEACE', confidence: 0.9 };
    }
    if (detectFist(landmarks)) {
        return { type: 'FIST', confidence: 0.9 };
    }
    if (detectThumbsUp(landmarks)) {
        return { type: 'THUMBS_UP', confidence: 0.9 };
    }

    return { type: 'NONE', confidence: 0 };
}

/**
 * Mapeo de gestos a acciones del editor:
 * POINT -> Dibujar (Pincel)
 * PINCH -> Agarrar y Arrastrar (Mover)
 * PEACE -> Borrar (Borrador)
 */
export const GESTURE_TO_ACTION: Record<GestureType, string> = {
    POINT: 'SELECT_BRUSH',
    PINCH: 'SELECT_MOVE',
    PEACE: 'SELECT_ERASER',
    OPEN_PALM: 'PAN_CANVAS',
    FIST: 'SELECT_ZOOM',
    THUMBS_UP: 'NONE',
    NONE: 'NONE',
};