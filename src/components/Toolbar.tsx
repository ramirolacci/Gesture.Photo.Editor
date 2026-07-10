import React from 'react';
import { EditorAction } from '../types/hand';

interface ToolbarProps {
    currentAction: EditorAction;
    className?: string;
    isVisible?: boolean;
}

const ACTION_INFO: Record<EditorAction, { icon: string; label: string }> = {
    SELECT_BRUSH: { icon: '🖌️', label: 'Pincel' },
    SELECT_ERASER: { icon: '🧹', label: 'Borrador' },
    SELECT_MOVE: { icon: '✋', label: 'Mover' },
    PAN_CANVAS: { icon: '🖐️', label: 'Desplazar' },
    SELECT_ZOOM: { icon: '🔍', label: 'Zoom' },
    APPLY_FILTER: { icon: '✨', label: 'Filtro' },
    DRAW_RECT: { icon: '⬜', label: 'Rectángulo' },
    DRAW_CIRCLE: { icon: '⭕', label: 'Círculo' },
    DRAW_LINE: { icon: '📏', label: 'Línea' },
    DRAW_TRIANGLE: { icon: '🔺', label: 'Triángulo' },
    DRAW_STAR: { icon: '⭐', label: 'Estrella' },
    DRAW_POLYGON: { icon: '⬡', label: 'Polígono' },
    UNDO: { icon: '↩️', label: 'Deshacer' },
    REDO: { icon: '↪️', label: 'Rehacer' },
    NONE: { icon: '◌', label: 'Idle' },
};

export const Toolbar: React.FC<ToolbarProps> = ({
    currentAction,
    className = '',
    isVisible = true,
}) => {
    const info = ACTION_INFO[currentAction];

    if (!isVisible) return null;

    return (
        <div className={`pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2 ${className}`}>
            <div className="flex items-center gap-3 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-white shadow-2xl backdrop-blur">
                <span className="text-xl">{info.icon}</span>
                <span className="text-sm font-semibold tracking-[0.2em] uppercase">{info.label}</span>
            </div>
        </div>
    );
};