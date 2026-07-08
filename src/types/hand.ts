// Tipos para landmarks de MediaPipe
export interface Landmark {
    x: number;
    y: number;
    z: number;
}

export interface HandLandmarks {
    landmarks: Landmark[];
    handedness: 'left' | 'right';
}

// Tipos para gestos reconocidos
export type GestureType =
    | 'PINCH'
    | 'POINT'
    | 'OPEN_PALM'
    | 'FIST'
    | 'THUMBS_UP'
    | 'PEACE'
    | 'NONE';

export interface RecognizedGesture {
    type: GestureType;
    confidence: number;
    hand: 'left' | 'right';
    timestamp: number;
}

// Tipos para acciones del editor
export type EditorAction =
    | 'SELECT_BRUSH'
    | 'SELECT_ERASER'
    | 'SELECT_MOVE'
    | 'SELECT_ZOOM'
    | 'PAN_CANVAS'
    | 'APPLY_FILTER'
    | 'DRAW_RECT'
    | 'DRAW_CIRCLE'
    | 'DRAW_LINE'
    | 'DRAW_TRIANGLE'
    | 'DRAW_STAR'
    | 'DRAW_POLYGON'
    | 'UNDO'
    | 'REDO'
    | 'NONE';

// Estado del tracking de manos
export interface HandTrackingState {
    isTracking: boolean;
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    lastAction: EditorAction;
    isLoading: boolean;
    error: string | null;
}