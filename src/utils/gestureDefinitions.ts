import { GestureType, Landmark } from '../types/hand';
import { calculateDistance, calculateDistance2D, FingerLandmarks } from './distanceCalculator';

const PINCH_THRESHOLD = 0.16;
const PINCH_DEPTH_THRESHOLD = 0.12;

/**
 * Detecta gesto de PINCH (pulgar + índice juntos para agarrar y arrastrar)
 */
export function detectPinch(landmarks: Landmark[]): boolean {
    const thumbTip = landmarks[FingerLandmarks.THUMB_TIP];
    const indexTip = landmarks[FingerLandmarks.INDEX_TIP];

    if (!thumbTip || !indexTip) return false;

    const distance2D = calculateDistance2D(thumbTip, indexTip);
    const depthDifference = Math.abs(thumbTip.z - indexTip.z);
    return distance2D < PINCH_THRESHOLD && depthDifference < PINCH_DEPTH_THRESHOLD;
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
 * Verifica si un dedo está extendido
 */
function isFingerExtended(
    landmarks: Landmark[],
    finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
): boolean {
    const tipIndex = getFingerTipIndex(finger);
    const pipIndex = getFingerPipIndex(finger);
    const mcpIndex = getFingerMcpIndex(finger);

    if (!tipIndex || !pipIndex || !mcpIndex) return false;

    const tip = landmarks[tipIndex];
    const pip = landmarks[pipIndex];
    const mcp = landmarks[mcpIndex];

    if (finger === 'thumb') {
        const distanceTipToMCP = calculateDistance(tip, mcp);
        const distanceTipToPIP = calculateDistance(tip, pip);
        return distanceTipToMCP > distanceTipToPIP * 1.1;
    }

    const distanceTipToMCP = calculateDistance(tip, mcp);
    const distancePipToMCP = calculateDistance(pip, mcp);

    // Ajustado a 1.12 para máxima sensibilidad y reconocimiento instantáneo
    return distanceTipToMCP > distancePipToMCP * 1.12;
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
    _handedness: 'left' | 'right'
): { type: GestureType; confidence: number } {
    const gestures = [
        { name: 'PINCH' as GestureType, detect: () => detectPinch(landmarks) },
        { name: 'PEACE' as GestureType, detect: () => detectPeace(landmarks) },
        { name: 'POINT' as GestureType, detect: () => detectPoint(landmarks) },
        { name: 'OPEN_PALM' as GestureType, detect: () => detectOpenPalm(landmarks) },
        { name: 'FIST' as GestureType, detect: () => detectFist(landmarks) },
        { name: 'THUMBS_UP' as GestureType, detect: () => detectThumbsUp(landmarks) },
    ];

    for (const gesture of gestures) {
        if (gesture.detect()) {
            return { type: gesture.name, confidence: 0.9 };
        }
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