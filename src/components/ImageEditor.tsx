import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { useCanvasManipulation } from '../hooks/useCanvasManipulation';
import { QuickMenu } from './QuickMenu';
import { useUndoRedo } from '../hooks/useUndoRedo';

interface ImageEditorProps {
    onActionCompleted?: (action: EditorAction) => void;
    className?: string;
    hands?: HandLandmarks[];
    currentAction?: EditorAction;
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
    onToggleGesturePause?: () => void;
    handCursorPosition?: { x: number; y: number } | null;
    handCursorState?: { isVisible: boolean; isDrawing: boolean; isErasing: boolean; isMoving: boolean };
}

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'info' | 'warning';
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
    onActionCompleted,
    className = '',
    hands = [],
    currentAction = 'NONE',
    gestures = [],
    isGesturePaused = false,
    onToggleGesturePause,
    handCursorPosition = null,
    handCursorState,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [pinchSensitivity, setPinchSensitivity] = useState(0.12);

    const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2500);
    }, []);

    const {
        currentTool,
        selectTool,
        pointerPos,
        brushColor,
        brushSize,
        setBrushColor,
        setBrushSize,
        undo,
        redo,
        historyEntries,
        clearCanvas,
    } = useCanvasManipulation({
        canvasRef,
        onActionCompleted,
        hands,
        gestures,
        isGesturePaused,
        onToggleGesturePause,
        showToast,
        pinchSensitivity,
        virtualPointerPos: handCursorPosition,
    });

    const canvasWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const canvasHeight = typeof window !== 'undefined' ? window.innerHeight : 720;

    const { toastMessage, quickMenuVisible, quickActions } = useUndoRedo({
        hands,
        gestures,
        isPaused: isGesturePaused,
        undo,
        redo,
        onToast: showToast,
        historyEntries,
    });

    useEffect(() => {
        if (currentAction && currentAction !== 'NONE' && currentAction !== currentTool) {
            selectTool(currentAction);
        }
    }, [currentAction, currentTool, selectTool]);

    const cursorPosition = handCursorPosition ?? pointerPos;
    const showCursor = Boolean(cursorPosition) && !isGesturePaused && (handCursorState?.isVisible ?? true);
    const cursorColor = currentTool === 'SELECT_ERASER' ? '#3b82f6' : currentTool === 'SELECT_LASER' ? '#FF0055' : currentTool === 'SELECT_MOVE' ? '#22c55e' : brushColor;
    const quickColors = ['#00F0FF', '#FFD700', '#FF007F', '#00FF66', '#FFFFFF', '#FF3333'];

    return (
        <div className={`relative h-screen w-screen overflow-hidden ${className}`}>
            <div className="absolute inset-0">
                <div className="absolute inset-0 overflow-hidden">
                    <canvas ref={canvasRef} className="block h-screen w-screen" />
                </div>
                {showCursor && cursorPosition && (
                    <div
                        className="pointer-events-none absolute flex items-center justify-center rounded-full border-2 transition-none"
                        style={{
                            left: `${(cursorPosition.x / canvasWidth) * 100}%`,
                            top: `${(cursorPosition.y / canvasHeight) * 100}%`,
                            width: currentTool === 'SELECT_ERASER' ? `${Math.max(brushSize * 4, 24)}px` : `${Math.max(brushSize + 10, 16)}px`,
                            height: currentTool === 'SELECT_ERASER' ? `${Math.max(brushSize * 4, 24)}px` : `${Math.max(brushSize + 10, 16)}px`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 100,
                            borderColor: cursorColor,
                            backgroundColor: `${cursorColor}33`,
                            boxShadow: `0 0 15px ${cursorColor}aa`,
                        }}
                    >
                        <div
                            className="rounded-full"
                            style={{
                                width: `${Math.min(brushSize, 10)}px`,
                                height: `${Math.min(brushSize, 10)}px`,
                                backgroundColor: cursorColor,
                            }}
                        />
                        <div
                            className="absolute left-6 top-6 whitespace-nowrap rounded-md border border-white/20 bg-black/80 px-2 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur"
                            style={{ borderColor: cursorColor }}
                        >
                            {handCursorState?.isErasing
                                ? '🧹 Borrando'
                                : handCursorState?.isDrawing
                                ? '✏️ Dibujando / Agarrando'
                                : '📍 Puntero'}
                        </div>
                    </div>
                )}
            </div>

            <div className="pointer-events-none absolute inset-0 z-10">
                {/* Top Right Controls */}
                <div className="pointer-events-auto absolute right-4 top-4 flex gap-2">
                    <button
                        onClick={() => void clearCanvas()}
                        className="rounded-full border border-white/20 bg-black/60 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur hover:bg-white/10"
                        title="Limpiar pantalla"
                    >
                        🧽 Limpiar
                    </button>
                </div>

                {/* Top Left Gestures Guide */}
                <div className="pointer-events-auto absolute left-4 top-4 z-20 flex flex-col gap-2">
                    {!isGesturePaused && (
                        <div className="flex max-w-xs flex-col gap-1.5 rounded-2xl border border-cyan-400/30 bg-black/80 p-3.5 shadow-2xl backdrop-blur text-xs text-white">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-0.5">
                                🖐️ Guía de Gestos
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-base">☝️</span>
                                <div>
                                    <span className="font-semibold text-cyan-200">Solo Índice (Señalar):</span>
                                    <p className="text-[11px] text-white/70">✏️ <b>Dibujar y escribir en vivo</b></p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-base">🤏</span>
                                <div>
                                    <span className="font-semibold text-emerald-300">Pinch (Pulgar + Índice):</span>
                                    <p className="text-[11px] text-white/70">✋ <b>Tocar / Agarrar y Arrastrar objeto</b></p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-base">✌️</span>
                                <div>
                                    <span className="font-semibold text-rose-300">Dos Dedos (Índice + Medio):</span>
                                    <p className="text-[11px] text-white/70">🧹 <b>Borrar trazos por encima</b></p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Presenter Toolbar */}
                <div className="pointer-events-auto absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/90 px-4 py-2.5 shadow-2xl backdrop-blur">
                    <button
                        onClick={() => selectTool('SELECT_BRUSH')}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${currentTool === 'SELECT_BRUSH' ? 'bg-cyan-500 text-black shadow-md' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        title="Pincel Libre (Pinch para dibujar)"
                    >
                        ✏️ Dibujar
                    </button>
                    <button
                        onClick={() => selectTool('SELECT_MOVE')}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${currentTool === 'SELECT_MOVE' ? 'bg-emerald-500 text-black shadow-md' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        title="Agarrar y Arrastrar (Pinch sobre objeto)"
                    >
                        ✋ Agarrar
                    </button>
                    <button
                        onClick={() => selectTool('SELECT_ERASER')}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${currentTool === 'SELECT_ERASER' ? 'bg-blue-500 text-white shadow-md' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        title="Borrador Vectorial"
                    >
                        🧹 Borrar
                    </button>

                    <div className="h-5 w-[1px] bg-white/20 mx-1" />

                    {/* Shapes */}
                    <button
                        onClick={() => selectTool('DRAW_CIRCLE')}
                        className={`rounded-full p-1.5 text-xs ${currentTool === 'DRAW_CIRCLE' ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/80 hover:text-white'}`}
                        title="Círculo"
                    >
                        ⭕
                    </button>
                    <button
                        onClick={() => selectTool('DRAW_RECT')}
                        className={`rounded-full p-1.5 text-xs ${currentTool === 'DRAW_RECT' ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/80 hover:text-white'}`}
                        title="Rectángulo"
                    >
                        ⬜
                    </button>

                    <div className="h-5 w-[1px] bg-white/20 mx-1" />

                    {/* Colors */}
                    <div className="flex items-center gap-1.5">
                        {quickColors.map((color) => (
                            <button
                                key={color}
                                onClick={() => setBrushColor(color)}
                                className={`h-5 w-5 rounded-full border transition-transform ${brushColor === color ? 'scale-125 border-white shadow-sm' : 'border-white/30 opacity-80 hover:opacity-100'}`}
                                style={{ backgroundColor: color }}
                                title={color}
                            />
                        ))}
                    </div>

                    <div className="h-5 w-[1px] bg-white/20 mx-1" />

                    <input
                        type="range"
                        min="2"
                        max="30"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-20 accent-cyan-400 cursor-pointer"
                        title="Grosor de trazo"
                    />

                    <button
                        onClick={() => void undo()}
                        className="rounded-full bg-white/10 p-1.5 text-xs text-white hover:bg-white/20"
                        title="Deshacer (Ctrl+Z)"
                    >
                        ↩
                    </button>
                    <button
                        onClick={() => void redo()}
                        className="rounded-full bg-white/10 p-1.5 text-xs text-white hover:bg-white/20"
                        title="Rehacer (Ctrl+Y)"
                    >
                        ↪
                    </button>
                </div>

                {quickMenuVisible && <QuickMenu visible={quickMenuVisible} actions={quickActions} />}

                {toastMessage && (
                    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
                        <div className="rounded-full border border-cyan-400/40 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur">
                            {toastMessage}
                        </div>
                    </div>
                )}
            </div>

            {isSettingsOpen && (
                <div className="pointer-events-auto absolute right-4 top-16 z-30 w-[300px] rounded-2xl border border-white/20 bg-black/85 p-4 text-white shadow-2xl backdrop-blur">
                    <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-cyan-300">
                        <span>Ajustes de Presentación</span>
                        <button onClick={() => setIsSettingsOpen(false)} className="text-white/70 hover:text-white">✕</button>
                    </div>
                    <div className="space-y-3 text-xs">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="mb-1.5 font-semibold text-white/90">Gestos de Cámara:</div>
                            <ul className="list-disc pl-4 space-y-1 text-white/70 text-[11px]">
                                <li><b>Índice:</b> Apuntar puntero en pantalla.</li>
                                <li><b>Pinch (Índice + Pulgar):</b> Si estás sobre un dibujo lo <b>agarrás y arrastrás</b>; si estás en espacio libre <b>dibujás</b>.</li>
                                <li><b>Dos Dedos (Peace):</b> Borrador rápido.</li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="mb-1 flex justify-between">
                                <span>Sensibilidad Pinch:</span>
                                <span>{pinchSensitivity.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.05"
                                max="0.20"
                                step="0.01"
                                value={pinchSensitivity}
                                onChange={(e) => setPinchSensitivity(Number(e.target.value))}
                                className="w-full accent-cyan-400 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map((t) => (
                    <div key={t.id} className={`pointer-events-auto rounded-xl border px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur ${t.type === 'success' ? 'border-emerald-500/40 bg-emerald-600/90' : t.type === 'warning' ? 'border-amber-500/40 bg-amber-600/90' : 'border-cyan-500/40 bg-cyan-600/90'}`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </div>
    );
};
