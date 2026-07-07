import { Landmark } from '../types/hand';

/**
 * Calcula la distancia euclidiana entre dos landmarks
 */
export function calculateDistance(point1: Landmark, point2: Landmark): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const dz = point2.z - point1.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calcula la distancia 2D (ignorando profundidad)
 */
export function calculateDistance2D(point1: Landmark, point2: Landmark): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;

    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normaliza una distancia a un rango 0-1
 */
export function normalizeDistance(
    distance: number,
    minDistance: number,
    maxDistance: number
): number {
    const normalized = (distance - minDistance) / (maxDistance - minDistance);
    return Math.max(0, Math.min(1, normalized));
}

/**
 * Obtiene el punto medio entre dos landmarks
 */
export function getMidpoint(point1: Landmark, point2: Landmark): Landmark {
    return {
        x: (point1.x + point2.x) / 2,
        y: (point1.y + point2.y) / 2,
        z: (point1.z + point2.z) / 2,
    };
}

/**
 * Mapeo de índices de landmarks de MediaPipe Hands
 * Referencia: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
 */
export const FingerLandmarks = {
    WRIST: 0,
    THUMB_CMC: 1,
    THUMB_MCP: 2,
    THUMB_IP: 3,
    THUMB_TIP: 4,
    INDEX_MCP: 5,
    INDEX_PIP: 6,
    INDEX_DIP: 7,
    INDEX_TIP: 8,
    MIDDLE_MCP: 9,
    MIDDLE_PIP: 10,
    MIDDLE_DIP: 11,
    MIDDLE_TIP: 12,
    RING_MCP: 13,
    RING_PIP: 14,
    RING_DIP: 15,
    RING_TIP: 16,
    PINKY_MCP: 17,
    PINKY_PIP: 18,
    PINKY_DIP: 19,
    PINKY_TIP: 20,
};