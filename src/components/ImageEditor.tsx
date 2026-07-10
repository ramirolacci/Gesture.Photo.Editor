import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { useCanvasManipulation } from '../hooks/useCanvasManipulation';
import { useGestureCommands } from '../hooks/useGestureCommands';
import { RadialMenu } from './RadialMenu';
import { ColorWheel } from './ColorWheel';
import { MiniMap } from './MiniMap';
import { useTwoHandGestures } from '../hooks/useTwoHandGestures';
import { useZoomPan } from '../hooks/useZoomPan';
import { playSelectSound } from '../utils/audioFeedback';

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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);

    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [toolFeedback, setToolFeedback] = useState<string | null>(null);
    const [toolBadgeVisible, setToolBadgeVisible] = useState(false);
    const [pinchSensitivity, setPinchSensitivity] = useState(0.05);
    const [swipeSensitivity, setSwipeSensitivity] = useState(0.15);
    const [minPinchDistance, setMinPinchDistance] = useState(0.08);
    const [maxPinchDistance, setMaxPinchDistance] = useState(0.45);

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
        brushSize,
        setBrushColor,
        setBrushSize,
        loadImage,
        saveProject,
        loadProject,
        loadAutoSave,
    } = useCanvasManipulation({
        canvasRef,
        onActionCompleted,
        hands,
        gestures,
        isGesturePaused,
        onToggleGesturePause,
        showToast,
        pinchSensitivity,
        swipeSensitivity,
        minPinchDistance,
        maxPinchDistance,
        virtualPointerPos: handCursorPosition,
    });

    const { activeCommand, radialMenuVisible, clearRadialMenu } = useGestureCommands({
        hands,
        gestures,
        isGesturePaused,
    });

    const canvasWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const canvasHeight = typeof window !== 'undefined' ? window.innerHeight : 720;

    const { color: twoHandColor, size: twoHandSize, visible: twoHandSelectorVisible } = useTwoHandGestures({
        hands,
        gestures,
        viewportSize: { width: canvasWidth, height: canvasHeight },
    });

    const { zoomPercent, pan, viewportRect, mode, isActive } = useZoomPan({
        canvasRef,
        hands,
        gestures,
        viewportSize: { width: canvasWidth, height: canvasHeight },
    });

    useEffect(() => {
        if (currentAction && currentAction !== 'NONE' && currentAction !== currentTool) {
            selectTool(currentAction);
        }
    }, [currentAction, currentTool, selectTool]);

    useEffect(() => {
        if (!activeCommand || activeCommand === 'NONE') return;

        const commandMap: Record<string, EditorAction> = {
            PINCH: 'SELECT_BRUSH',
            PEACE: 'SELECT_ERASER',
            POINT: 'SELECT_MOVE',
            FIST: 'SELECT_ZOOM',
            THUMBS_UP: 'NONE',
        };

        if (activeCommand === 'THUMBS_UP') {
            setToolFeedback('☝️');
            return;
        }

        const nextTool = commandMap[activeCommand];
        if (nextTool && nextTool !== currentTool) {
            setToolFeedback(activeCommand === 'PINCH' ? '🖌️' : activeCommand === 'PEACE' ? '🧹' : activeCommand === 'POINT' ? '✋' : '🔍');
            selectTool(nextTool);
            playSelectSound();
        }
    }, [activeCommand, currentTool, selectTool]);

    useEffect(() => {
        if (!toolFeedback) return;
        const timeout = window.setTimeout(() => setToolFeedback(null), 1000);
        return () => window.clearTimeout(timeout);
    }, [toolFeedback]);

    useEffect(() => {
        if (hands.length === 0 || gestures.every((g) => g.type === 'NONE')) {
            setToolBadgeVisible(false);
            return;
        }

        setToolBadgeVisible(true);
        const timeout = window.setTimeout(() => setToolBadgeVisible(false), 1800);
        return () => window.clearTimeout(timeout);
    }, [currentTool, hands.length, gestures]);

    const handleLoadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) {
                loadImage(ev.target.result as string);
                showToast('Imagen cargada', 'success');
            }
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const handleLoadProject = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) {
                loadProject(ev.target.result as string);
                showToast('Proyecto restaurado', 'success');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const cursorPosition = handCursorPosition ?? pointerPos;
    const showCursor = Boolean(cursorPosition) && !isGesturePaused && (handCursorState?.isVisible ?? true);
    const cursorColor = currentTool === 'SELECT_ERASER' ? '#3b82f6' : currentTool === 'SELECT_MOVE' ? '#22c55e' : (twoHandSelectorVisible ? twoHandColor : '#ef4444');

    useEffect(() => {
        if (twoHandSelectorVisible) {
            setBrushColor(twoHandColor);
            setBrushSize(twoHandSize);
        }
    }, [setBrushColor, setBrushSize, twoHandColor, twoHandSize, twoHandSelectorVisible]);

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
                            width: currentTool === 'SELECT_ERASER' ? `${Math.max(brushSize * 4, 20)}px` : `${Math.max(brushSize + 8, 14)}px`,
                            height: currentTool === 'SELECT_ERASER' ? `${Math.max(brushSize * 4, 20)}px` : `${Math.max(brushSize + 8, 14)}px`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 100,
                            borderColor: cursorColor,
                            backgroundColor: `${cursorColor}22`,
                            boxShadow: `0 0 0 2px ${cursorColor}40`,
                        }}
                    >
                        <div
                            className="rounded-full"
                            style={{
                                width: `${Math.min(brushSize, 12)}px`,
                                height: `${Math.min(brushSize, 12)}px`,
                                backgroundColor: cursorColor,
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="pointer-events-none absolute inset-0 z-10">
                <ColorWheel color={twoHandColor} size={twoHandSize} visible={twoHandSelectorVisible} />
                <MiniMap zoom={zoomPercent / 100} pan={pan} viewportRect={viewportRect} visible={isActive} />
                {toolFeedback && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                        <div className="rounded-full border border-white/20 bg-black/70 px-4 py-3 text-3xl font-semibold text-white shadow-2xl backdrop-blur">
                            {toolFeedback}
                        </div>
                    </div>
                )}

                <div className="pointer-events-auto absolute right-4 top-4 flex gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-full border border-white/20 bg-black/50 px-3 py-2 text-sm text-white/90 backdrop-blur"
                        title="Cargar imagen"
                    >
                        ⌂
                    </button>
                    <button
                        onClick={() => setIsSettingsOpen((prev) => !prev)}
                        className="rounded-full border border-white/20 bg-black/50 px-3 py-2 text-sm text-white/90 backdrop-blur"
                        title="Ajustes"
                    >
                        ⚙
                    </button>
                </div>

                {toolBadgeVisible && (
                    <div className="pointer-events-none absolute right-4 top-14 rounded-full border border-white/15 bg-black/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70 opacity-70 backdrop-blur">
                        {currentTool === 'SELECT_BRUSH' ? '🖌️ Pincel' : currentTool === 'SELECT_ERASER' ? '🧹 Borrador' : currentTool === 'SELECT_MOVE' ? '✋ Mover' : currentTool === 'SELECT_ZOOM' ? '🔍 Zoom' : '⋯'}
                    </div>
                )}

                {twoHandSelectorVisible && (
                    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
                        Color {Math.round(twoHandSize)}px
                    </div>
                )}

                {isActive && (
                    <div className="pointer-events-none absolute left-4 top-16 z-30 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
                        {mode === 'zoom' ? `Zoom ${zoomPercent}%` : 'Pan'}
                    </div>
                )}
            </div>

            {isSettingsOpen && (
                <div className="pointer-events-auto absolute right-4 top-16 z-30 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-black/70 p-3 text-white shadow-2xl backdrop-blur">
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/70">
                        <span>Settings</span>
                        <button onClick={() => setIsSettingsOpen(false)} className="text-white/80">✕</button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto space-y-3 text-[11px]">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                            <div className="mb-1 flex justify-between">
                                <span>Sensibilidad Swipe</span>
                                <span>{swipeSensitivity.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0.05" max="0.30" step="0.01" value={swipeSensitivity} onChange={(e) => setSwipeSensitivity(Number(e.target.value))} className="w-full accent-indigo-400" />
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                            <div className="mb-1 flex justify-between">
                                <span>Pinch Sensitivity</span>
                                <span>{pinchSensitivity.toFixed(3)}</span>
                            </div>
                            <input type="range" min="0.02" max="0.10" step="0.005" value={pinchSensitivity} onChange={(e) => setPinchSensitivity(Number(e.target.value))} className="w-full accent-indigo-400" />
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                            <div className="mb-1 flex justify-between">
                                <span>Distancia opacidad</span>
                                <span>{minPinchDistance.toFixed(2)}–{maxPinchDistance.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0.02" max="0.20" step="0.01" value={minPinchDistance} onChange={(e) => setMinPinchDistance(Number(e.target.value))} className="w-full accent-indigo-400" />
                            <input type="range" min="0.30" max="0.70" step="0.01" value={maxPinchDistance} onChange={(e) => setMaxPinchDistance(Number(e.target.value))} className="w-full accent-indigo-400 mt-2" />
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                            <button onClick={() => saveProject()} className="w-full rounded-lg bg-white/10 px-3 py-2 text-left">💾 Guardar proyecto</button>
                            <button onClick={() => projectInputRef.current?.click()} className="mt-2 w-full rounded-lg bg-white/10 px-3 py-2 text-left">📂 Abrir proyecto</button>
                            <button onClick={() => loadAutoSave()} className="mt-2 w-full rounded-lg bg-white/10 px-3 py-2 text-left">⏮ Restaurar auto-guardado</button>
                        </div>
                    </div>
                </div>
            )}

            <RadialMenu
                visible={radialMenuVisible}
                cursorPosition={handCursorPosition}
                isConfirming={handCursorState?.isDrawing ?? false}
                onSelect={(toolId) => {
                    const mapped: Record<string, EditorAction> = {
                        SELECT_BRUSH: 'SELECT_BRUSH',
                        SELECT_ERASER: 'SELECT_ERASER',
                        SELECT_MOVE: 'SELECT_MOVE',
                        SELECT_ZOOM: 'SELECT_ZOOM',
                    };
                    const selected = mapped[toolId];
                    if (selected) {
                        setToolFeedback(toolId === 'SELECT_BRUSH' ? '🖌️' : toolId === 'SELECT_ERASER' ? '🧹' : toolId === 'SELECT_MOVE' ? '✋' : '🔍');
                        selectTool(selected);
                        playSelectSound();
                    }
                    clearRadialMenu();
                }}
                onClose={clearRadialMenu}
            />

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLoadImage} className="hidden" />
            <input ref={projectInputRef} type="file" accept=".gpe,.json" onChange={handleLoadProject} className="hidden" />

            <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map((t) => (
                    <div key={t.id} className={`pointer-events-auto rounded-xl border px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur ${t.type === 'success' ? 'border-emerald-500/40 bg-emerald-600/80' : t.type === 'warning' ? 'border-rose-500/40 bg-rose-600/80' : 'border-indigo-500/40 bg-indigo-600/80'}`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </div>
    );
};
