import React, { useRef, useEffect } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { useCanvasManipulation, FilterType } from '../hooks/useCanvasManipulation';

interface ImageEditorProps {
    onActionCompleted?: (action: EditorAction) => void;
    className?: string;
    hands?: HandLandmarks[];
    currentAction?: EditorAction;
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
}

// ─── Tool groups ───────────────────────────────────────────────────────────────
const DRAW_TOOLS: { id: EditorAction; icon: string; label: string }[] = [
    { id: 'SELECT_BRUSH',  icon: '🖌️', label: 'Pincel' },
    { id: 'SELECT_ERASER', icon: '🧹', label: 'Borrador' },
    { id: 'SELECT_MOVE',   icon: '✋', label: 'Mover' },
];

const SHAPE_TOOLS: { id: EditorAction; icon: string; label: string }[] = [
    { id: 'DRAW_RECT',   icon: '⬜', label: 'Rectángulo' },
    { id: 'DRAW_CIRCLE', icon: '⭕', label: 'Círculo / Elipse' },
    { id: 'DRAW_LINE',   icon: '📏', label: 'Línea' },
];

const FILTERS: { id: FilterType; icon: string; label: string }[] = [
    { id: 'grayscale',       icon: '🌫️',  label: 'B&N' },
    { id: 'invert',          icon: '🔄',  label: 'Invertir' },
    { id: 'blur',            icon: '💭',  label: 'Blur' },
    { id: 'brightness_up',   icon: '🔆',  label: 'Brillo +' },
    { id: 'brightness_down', icon: '🔅',  label: 'Brillo -' },
    { id: 'contrast_up',     icon: '◑',   label: 'Contraste +' },
    { id: 'contrast_down',   icon: '◐',   label: 'Contraste -' },
];

// ─── Divider ──────────────────────────────────────────────────────────────────
const Divider = () => <div className="w-px h-8 bg-gray-300 mx-1 shrink-0" />;

// ─── ToolButton ───────────────────────────────────────────────────────────────
const ToolButton = ({
    active,
    onClick,
    title,
    children,
    variant = 'default',
}: {
    active?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    variant?: 'default' | 'filter' | 'danger' | 'success';
}) => {
    const base = 'px-2.5 py-1.5 rounded-lg text-sm font-medium border transition-all duration-150 shrink-0';
    const variants: Record<string, string> = {
        default: active
            ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-105'
            : 'bg-white border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 text-gray-700',
        filter:  'bg-white border-gray-200 hover:bg-purple-50 hover:border-purple-300 text-gray-700 hover:text-purple-700',
        danger:  'bg-white border-red-200 hover:bg-red-50 text-red-600 hover:border-red-400',
        success: 'bg-emerald-600 border-emerald-700 hover:bg-emerald-700 text-white shadow',
    };
    return (
        <button onClick={onClick} title={title} className={`${base} ${variants[variant]}`}>
            {children}
        </button>
    );
};

// ─── Component ────────────────────────────────────────────────────────────────
export const ImageEditor: React.FC<ImageEditorProps> = ({
    onActionCompleted,
    className = '',
    hands = [],
    currentAction = 'NONE',
    gestures = [],
    isGesturePaused = false,
}) => {
    const canvasRef        = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef     = useRef<HTMLInputElement>(null);

    const {
        currentTool,
        selectTool,
        brushColor,
        setBrushColor,
        brushSize,
        setBrushSize,
        pointerPos,
        loadImage,
        exportImage,
        clearCanvas,
        applyFilter,
    } = useCanvasManipulation({
        canvasRef,
        overlayCanvasRef,
        onActionCompleted,
        hands,
        gestures,
        isGesturePaused,
    });

    // Sync parent-driven action (e.g. gesture → action) into the hook
    useEffect(() => {
        if (currentAction && currentAction !== 'NONE' && currentAction !== currentTool) {
            selectTool(currentAction);
        }
    }, [currentAction, currentTool, selectTool]);

    const handleLoadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) loadImage(ev.target.result as string);
        };
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExport = () => {
        const dataUrl = exportImage();
        if (!dataUrl) return;
        const link = document.createElement('a');
        link.download = 'edited-image.png';
        link.href = dataUrl;
        link.click();
    };

    const canvasWidth  = canvasRef.current?.width  || 800;
    const canvasHeight = canvasRef.current?.height || 600;

    const isShapeTool = ['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE'].includes(currentTool);

    return (
        <div className={`flex flex-col gap-3 ${className}`}>

            {/* ── Row 1: File + Draw tools ─────────────────────────────── */}
            <div className="flex items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded-xl flex-wrap">
                {/* File */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow shrink-0"
                >
                    📁 Cargar
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLoadImage} className="hidden" />

                <Divider />

                {/* Draw tools */}
                {DRAW_TOOLS.map((t) => (
                    <ToolButton key={t.id} active={currentTool === t.id} onClick={() => selectTool(t.id)} title={t.label}>
                        {t.icon} <span className="hidden sm:inline text-xs ml-0.5">{t.label}</span>
                    </ToolButton>
                ))}

                <Divider />

                {/* Shape tools */}
                {SHAPE_TOOLS.map((t) => (
                    <ToolButton key={t.id} active={currentTool === t.id} onClick={() => selectTool(t.id)} title={t.label}>
                        {t.icon} <span className="hidden sm:inline text-xs ml-0.5">{t.label}</span>
                    </ToolButton>
                ))}

                <Divider />

                {/* Actions */}
                <ToolButton variant="danger" active={false} onClick={clearCanvas} title="Limpiar todo el canvas">
                    🗑️ Limpiar
                </ToolButton>
                <ToolButton variant="success" active={false} onClick={handleExport} title="Exportar como PNG">
                    💾 Exportar
                </ToolButton>
            </div>

            {/* ── Row 2: Color + Brush size ────────────────────────────── */}
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl flex-wrap">

                {/* Color picker */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 font-medium">Color</span>
                    <label className="relative cursor-pointer group" title="Cambiar color del pincel">
                        <div
                            className="w-8 h-8 rounded-lg border-2 border-gray-300 group-hover:border-indigo-400 shadow-sm transition-all"
                            style={{ backgroundColor: brushColor }}
                        />
                        <input
                            type="color"
                            value={brushColor}
                            onChange={(e) => setBrushColor(e.target.value)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                    </label>
                    <span className="text-xs font-mono text-gray-600">{brushColor.toUpperCase()}</span>
                </div>

                <Divider />

                {/* Brush size */}
                <div className="flex items-center gap-2 min-w-[180px]">
                    <span className="text-xs text-gray-500 font-medium shrink-0">Grosor</span>
                    <input
                        type="range"
                        min={1}
                        max={50}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="flex-1 h-1.5 rounded accent-indigo-600 cursor-pointer"
                    />
                    {/* Live size preview dot */}
                    <div className="flex items-center justify-center w-10 shrink-0">
                        <div
                            className="rounded-full bg-gray-800 transition-all duration-75"
                            style={{
                                width:  Math.min(brushSize, 36) + 'px',
                                height: Math.min(brushSize, 36) + 'px',
                                backgroundColor: brushColor,
                            }}
                        />
                    </div>
                    <span className="text-xs font-mono text-gray-600 w-8 shrink-0">{brushSize}px</span>
                </div>

                {hands.length >= 2 && !isGesturePaused && (
                    <span className="text-xs text-indigo-600 animate-pulse ml-2 shrink-0">
                        ↔️ Controlando grosor con 2 manos
                    </span>
                )}
            </div>

            {/* ── Row 3: Filters ───────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl flex-wrap">
                <span className="text-xs text-gray-500 font-medium mr-1 shrink-0">✨ Filtros:</span>
                {FILTERS.map((f) => (
                    <ToolButton key={f.id} variant="filter" active={false} onClick={() => applyFilter(f.id)} title={f.label}>
                        {f.icon} <span className="text-xs ml-0.5">{f.label}</span>
                    </ToolButton>
                ))}
            </div>

            {/* ── Canvas area ──────────────────────────────────────────── */}
            <div className="relative border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-inner">
                {/* Main canvas */}
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    className={`w-full h-auto block ${isShapeTool ? 'cursor-crosshair' : 'cursor-crosshair'}`}
                />

                {/* Shape preview overlay canvas — transparent, pointer-events passthrough */}
                <canvas
                    ref={overlayCanvasRef}
                    width={800}
                    height={600}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                />

                {/* Hand gesture cursor dot */}
                {pointerPos && !isGesturePaused && (
                    <div
                        className={`absolute pointer-events-none rounded-full transition-none flex items-center justify-center
                            ${currentTool === 'SELECT_ERASER'
                                ? 'border-2 border-red-500 bg-red-100/50'
                                : isShapeTool
                                ? 'border-2 border-amber-500 bg-amber-100/50'
                                : 'border-2 border-indigo-500 bg-indigo-100/50'
                            }`}
                        style={{
                            left: `${(pointerPos.x / canvasWidth) * 100}%`,
                            top:  `${(pointerPos.y / canvasHeight) * 100}%`,
                            width:  currentTool === 'SELECT_ERASER' ? `${Math.max(brushSize * 4, 20)}px` : `${Math.max(brushSize + 8, 14)}px`,
                            height: currentTool === 'SELECT_ERASER' ? `${Math.max(brushSize * 4, 20)}px` : `${Math.max(brushSize + 8, 14)}px`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 40,
                        }}
                    >
                        <div
                            className="rounded-full"
                            style={{
                                width:  Math.min(brushSize, 12) + 'px',
                                height: Math.min(brushSize, 12) + 'px',
                                backgroundColor: currentTool === 'SELECT_ERASER'
                                    ? '#ef4444'
                                    : isShapeTool ? '#f59e0b' : brushColor,
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Hint bar */}
            <div className="text-center text-xs text-gray-500 pb-1">
                <span>👌 Pinzel · ✌️ Borrador · 👆 Mover · ✋ Pausar ·</span>
                <span className="ml-1">Con <b>2 manos</b>: separalas/juntá para cambiar el grosor en tiempo real</span>
            </div>
        </div>
    );
};