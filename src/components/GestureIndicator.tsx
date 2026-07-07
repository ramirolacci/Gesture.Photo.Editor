import React from 'react';
import { RecognizedGesture, GestureType } from '../types/hand';

interface GestureIndicatorProps {
    gestures: RecognizedGesture[];
    className?: string;
}

const GESTURE_ICONS: Record<GestureType, string> = {
    PINCH: '👌',
    POINT: '👆',
    OPEN_PALM: '✋',
    FIST: '✊',
    THUMBS_UP: '👍',
    PEACE: '✌️',
    NONE: '',
};

const GESTURE_NAMES: Record<GestureType, string> = {
    PINCH: 'Pinza',
    POINT: 'Señalar',
    OPEN_PALM: 'Mano abierta',
    FIST: 'Puño',
    THUMBS_UP: 'Pulgar arriba',
    PEACE: 'Paz',
    NONE: '',
};

const GESTURE_ACTIONS: Record<GestureType, string> = {
    PINCH: 'Pincel',
    POINT: 'Mover',
    OPEN_PALM: 'Desplazar',
    FIST: 'Zoom',
    THUMBS_UP: 'Aplicar filtro',
    PEACE: 'Borrador',
    NONE: '',
};

export const GestureIndicator: React.FC<GestureIndicatorProps> = ({
    gestures,
    className = '',
}) => {
    if (gestures.length === 0) {
        return (
            <div className={`text-center text-gray-500 ${className}`}>
                <p>No hay gestos detectados</p>
                <p className="text-sm">Mostrá tus manos a la cámara</p>
            </div>
        );
    }

    return (
        <div className={`space-y-2 ${className}`}>
            {gestures.map((gesture, index) => (
                <div
                    key={`${gesture.hand}-${index}`}
                    className={`
            flex items-center gap-3 p-3 rounded-lg border-2 transition-all
            ${gesture.type !== 'NONE'
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-gray-50 border-gray-200'
                        }
          `}
                >
                    {/* Icono del gesto */}
                    <div className="text-3xl">
                        {GESTURE_ICONS[gesture.type]}
                    </div>

                    {/* Información del gesto */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">
                                {GESTURE_NAMES[gesture.type]}
                            </span>
                            <span className="text-xs text-gray-500">
                                ({gesture.hand === 'left' ? 'Izquierda' : 'Derecha'})
                            </span>
                        </div>
                        {gesture.type !== 'NONE' && (
                            <p className="text-sm text-blue-700">
                                Acción: {GESTURE_ACTIONS[gesture.type]}
                            </p>
                        )}
                    </div>

                    {/* Indicador de confianza */}
                    {gesture.type !== 'NONE' && (
                        <div className="text-right">
                            <div className="text-xs text-gray-600 mb-1">Confianza</div>
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all"
                                    style={{ width: `${gesture.confidence * 100}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};