import React from 'react';
import { EditorAction } from '../types/hand';

interface ToolbarProps {
    currentAction: EditorAction;
    className?: string;
}

const ACTION_INFO: Record<EditorAction, { icon: string; label: string; description: string }> = {
    SELECT_BRUSH: {
        icon: '🖌️',
        label: 'Pincel',
        description: 'Dibujá trazos libres',
    },
    SELECT_ERASER: {
        icon: '🧹',
        label: 'Borrador',
        description: 'Borrá partes de tu dibujo',
    },
    SELECT_MOVE: {
        icon: '✋',
        label: 'Mover',
        description: 'Seleccioná y mové objetos',
    },
    PAN_CANVAS: {
        icon: '🖐️',
        label: 'Desplazar',
        description: 'Mové el canvas',
    },
    SELECT_ZOOM: {
        icon: '🔍',
        label: 'Zoom',
        description: 'Acerca o alejá la vista',
    },
    APPLY_FILTER: {
        icon: '✨',
        label: 'Filtro',
        description: 'Aplicá efectos a la imagen',
    },
    DRAW_RECT: {
        icon: '⬜',
        label: 'Rectángulo',
        description: 'Dibujá un rectángulo',
    },
    DRAW_CIRCLE: {
        icon: '⭕',
        label: 'Círculo / Elipse',
        description: 'Dibujá un círculo o elipse',
    },
    DRAW_LINE: {
        icon: '📏',
        label: 'Línea',
        description: 'Dibujá una línea recta',
    },
    UNDO: {
        icon: '↩️',
        label: 'Deshacer',
        description: 'Volvé un paso atrás',
    },
    REDO: {
        icon: '↪️',
        label: 'Rehacer',
        description: 'Avanzá un paso',
    },
    NONE: {
        icon: '😐',
        label: 'Inactivo',
        description: 'Sin acción activa',
    },
};

export const Toolbar: React.FC<ToolbarProps> = ({
    currentAction,
    className = '',
}) => {
    const info = ACTION_INFO[currentAction];

    return (
        <div className={`bg-white border-2 border-gray-200 rounded-lg p-4 ${className}`}>
            <h3 className="font-semibold text-gray-800 mb-3">Herramienta activa</h3>

            <div className="flex items-center gap-3">
                <div className="text-4xl">{info.icon}</div>
                <div>
                    <p className="font-medium text-gray-900">{info.label}</p>
                    <p className="text-sm text-gray-600">{info.description}</p>
                </div>
            </div>

            {/* Tips de gestos */}
            <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Gestos disponibles:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                        <span>👌</span>
                        <span>Pinza → Pincel (Dibujo)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>👆</span>
                        <span>Señalar → Mover objeto</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>✋</span>
                        <span>Abierta → Pausar gestos</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>✌️</span>
                        <span>Paz → Borrador</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>👍</span>
                        <span>Thumbs Up → Activar/Desactivar capa</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>↕️</span>
                        <span>Swipe Vertical → Subir/Bajar capa</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>🙌</span>
                        <span>Doble Pinza → Opacidad (0-100%)</span>
                    </div>
                </div>
            </div>
        </div>
    );
};