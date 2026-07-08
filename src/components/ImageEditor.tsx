import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { useCanvasManipulation, FilterType } from '../hooks/useCanvasManipulation';
import { playToggleSound } from '../utils/audioFeedback';

interface ImageEditorProps {
    onActionCompleted?: (action: EditorAction) => void;
    className?: string;
    hands?: HandLandmarks[];
    currentAction?: EditorAction;
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
    onToggleGesturePause?: () => void;
}

// ─── Tool groups ───────────────────────────────────────────────────────────────
const DRAW_TOOLS: { id: EditorAction; icon: string; label: string }[] = [
    { id: 'SELECT_BRUSH',  icon: '🖌️', label: 'Pincel' },
    { id: 'SELECT_ERASER', icon: '🧹', label: 'Borrador' },
    { id: 'SELECT_MOVE',   icon: '✋', label: 'Mover / Gráficos' },
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

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'info' | 'warning';
}

const TUTORIAL_SLIDES = [
    {
        title: "¡Bienvenido al Editor por Gestos! 🎨",
        description: "Esta aplicación premium te permite editar fotos e interactuar con capas usando gestos naturales de tus manos frente a la cámara. ¡Veamos cómo!",
        icon: "✨",
    },
    {
        title: "Pincel (Dibujo libre) 🖌️",
        description: "Juntá tus dedos pulgar e índice haciendo una PINZA (👌) con una mano y movela frente a la cámara para dibujar trazos libres sobre el lienzo.",
        icon: "👌",
    },
    {
        title: "Borrador (Limpieza) 🧹",
        description: "Mostrá el gesto de PAZ (dos dedos extendidos ✌️) frente a la cámara para borrar partes de la capa de dibujo activa actual.",
        icon: "✌️",
    },
    {
        title: "Mover y Seleccionar ✋",
        description: "Señalá con tu índice (gesto POINT 👆) para posicionar el puntero, y hacé PINZA (👌) para agarrar y arrastrar imágenes, textos o formas.",
        icon: "👆",
    },
    {
        title: "Ocultar/Mostrar Capa 👍",
        description: "Mostrá un PULGAR ARRIBA (👍) frente a la cámara para ocultar la capa activa de inmediato. Mostralo de nuevo para volver a activarla.",
        icon: "👍",
    },
    {
        title: "Mover Capa en el Stack ↕️",
        description: "Realizá un movimiento vertical rápido (Swipe) hacia arriba o abajo para mover la capa activa hacia adelante o hacia atrás en el stack visual.",
        icon: "↕️",
    },
    {
        title: "Ajustar Opacidad (2 Manos) 🙌",
        description: "Realizá el gesto PINZA (👌) con ambas manos simultáneamente y separalas o juntalas para regular la opacidad de la capa activa del 0 al 100%.",
        icon: "🙌",
    },
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
            ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-105 animate-pulse-pop'
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
    onToggleGesturePause,
}) => {
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Toasts state
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    // Tutorial states
    const [isTutorialOpen, setIsTutorialOpen] = useState(false);
    const [tutorialSlide, setTutorialSlide] = useState(0);

    // Collapsible settings state
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Calibration settings state
    const [pinchSensitivity, setPinchSensitivity] = useState(0.05); // default pinch threshold distance
    const [swipeSensitivity, setSwipeSensitivity] = useState(0.15); // default swipe delta Y threshold
    const [minPinchDistance, setMinPinchDistance] = useState(0.08); // default two-hand min opacity dist
    const [maxPinchDistance, setMaxPinchDistance] = useState(0.45); // default two-hand max opacity dist

    // Check tutorial first load
    useEffect(() => {
        const seen = localStorage.getItem('tutorial_seen');
        if (seen !== 'true') {
            setIsTutorialOpen(true);
        }
    }, []);

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
        
        // Capas API
        layers,
        addDrawingLayer,
        addTextLayer,
        addShapeLayer,
        toggleLayerVisibility,
        setLayerOpacity,
        selectLayer,
        deleteLayer,
        moveLayerUp,
        moveLayerDown,
        duplicateLayer,
        mergeLayerBelow,
    } = useCanvasManipulation({
        canvasRef,
        onActionCompleted,
        hands,
        gestures,
        isGesturePaused,
        onToggleGesturePause,
        showToast,
        
        // Calibrations
        pinchSensitivity,
        swipeSensitivity,
        minPinchDistance,
        maxPinchDistance,
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

    const handleCloseTutorial = () => {
        setIsTutorialOpen(false);
        localStorage.setItem('tutorial_seen', 'true');
        playToggleSound(true);
        showToast('Tutorial completado. ¡Que te diviertas editando!', 'success');
    };

    const handlePrevSlide = () => {
        if (tutorialSlide > 0) {
            setTutorialSlide(prev => prev - 1);
            playToggleSound(true);
        }
    };

    const handleNextSlide = () => {
        if (tutorialSlide < TUTORIAL_SLIDES.length - 1) {
            setTutorialSlide(prev => prev + 1);
            playToggleSound(true);
        } else {
            handleCloseTutorial();
        }
    };

    const canvasWidth  = 800;
    const canvasHeight = 600;

    const isShapeTool = ['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE'].includes(currentTool);
    const activeLayer = layers.find(l => l.active);

    return (
        <div className={`flex flex-col gap-4 ${className}`}>

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
                    <span className="text-xs text-indigo-600 animate-pulse ml-2 shrink-0 font-medium">
                        ↔️ Grosor ajustable con 2 manos
                    </span>
                )}
            </div>

            {/* ── Row 3: Filters (Apply to Selected Image Layer) ────────── */}
            <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl flex-wrap">
                <span className="text-xs text-gray-500 font-medium mr-1 shrink-0">✨ Filtros (Capa Imagen):</span>
                {FILTERS.map((f) => (
                    <ToolButton key={f.id} variant="filter" active={false} onClick={() => applyFilter(f.id)} title={f.label}>
                        {f.icon} <span className="text-xs ml-0.5">{f.label}</span>
                    </ToolButton>
                ))}
            </div>

            {/* ── Row 4: Grid Canvas + Layers Panel ────────────────────── */}
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                
                {/* Editor Canvas Area */}
                <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-inner flex flex-col justify-center items-center p-2 relative">
                    <div className="relative w-full max-w-[800px] aspect-[4/3] flex justify-center items-center">
                        {/* Main canvas managed by Fabric.js */}
                        <canvas
                            ref={canvasRef}
                            className="block"
                        />

                        {/* Hand gesture cursor dot overlaid on canvas-container parent */}
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
                                    zIndex: 100,
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
                </div>

                {/* Layers Panel Sidebar */}
                <div className="w-full lg:w-80 shrink-0 bg-gray-50 border-2 border-gray-200 rounded-xl p-4 flex flex-col gap-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
                        <span className="font-bold text-gray-800 flex items-center gap-2 text-base">
                            🥞 Capas ({layers.length})
                        </span>
                    </div>

                    {/* Quick add layers */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Añadir Capa</span>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={addDrawingLayer}
                                className="py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-all flex items-center justify-center gap-1.5"
                            >
                                🖌️ Píxeles
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-all flex items-center justify-center gap-1.5"
                            >
                                🖼️ Imagen
                            </button>
                            <button
                                onClick={addTextLayer}
                                className="py-1.5 px-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg border border-purple-200 transition-all flex items-center justify-center gap-1.5"
                            >
                                🔤 Texto
                            </button>
                            <div className="relative group w-full">
                                <button
                                    className="w-full py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg border border-amber-200 transition-all flex items-center justify-center gap-1.5"
                                >
                                    ⏹️ Forma ▾
                                </button>
                                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg hidden group-hover:block z-50 min-w-[130px] overflow-hidden">
                                    <button
                                        onClick={() => addShapeLayer('rect')}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                                    >
                                        ⬜ Rectángulo
                                    </button>
                                    <button
                                        onClick={() => addShapeLayer('circle')}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                                    >
                                        ⭕ Círculo
                                    </button>
                                    <button
                                        onClick={() => addShapeLayer('line')}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                                    >
                                        📏 Línea
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Layers scrollable stack */}
                    <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[300px] pr-1">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Pila de Capas</span>
                        
                        {layers.length === 0 ? (
                            <div className="text-center text-xs text-gray-400 py-10 bg-white border border-dashed border-gray-200 rounded-lg">
                                No hay capas disponibles.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {layers.map((layer) => (
                                    <div
                                        key={layer.id}
                                        onClick={() => selectLayer(layer.id)}
                                        className={`group flex flex-col p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                                            layer.active
                                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-[1.01]'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-indigo-50/40 hover:border-indigo-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-1.5">
                                            {/* Left: Visible check + Icon + Name */}
                                            <div className="flex items-center gap-2 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={layer.visible}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        toggleLayerVisibility(layer.id);
                                                    }}
                                                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span className="text-sm shrink-0">
                                                    {layer.type === 'drawing' ? '🖌️' : layer.type === 'image' ? '🖼️' : layer.type === 'text' ? '🔤' : '⏹️'}
                                                </span>
                                                <span className="text-xs font-semibold truncate max-w-[90px]" title={layer.name}>
                                                    {layer.name}
                                                </span>
                                            </div>

                                            {/* Right: Actions */}
                                            <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); moveLayerUp(layer.id); }}
                                                    className="p-1 rounded hover:bg-black/10 text-[10px]"
                                                    title="Subir capa"
                                                >
                                                    🔼
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); moveLayerDown(layer.id); }}
                                                    className="p-1 rounded hover:bg-black/10 text-[10px]"
                                                    title="Bajar capa"
                                                >
                                                    🔽
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); duplicateLayer(layer.id); }}
                                                    className="p-1 rounded hover:bg-black/10 text-[10px]"
                                                    title="Duplicar capa"
                                                >
                                                    👥
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); mergeLayerBelow(layer.id); }}
                                                    className="p-1 rounded hover:bg-black/10 text-[10px]"
                                                    title="Fusionar con inferior"
                                                >
                                                    🔗
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                                                    className="p-1 rounded hover:bg-red-500/20 hover:text-red-500 text-[10px]"
                                                    title="Eliminar capa"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>

                                        {/* Bottom info */}
                                        <div className="flex items-center justify-between text-[9px] mt-2 opacity-80">
                                            <span>Opacidad: {Math.round(layer.opacity * 100)}%</span>
                                            {layer.active && (
                                                <span className="font-mono text-[8px] bg-indigo-900/10 px-1 py-0.2 rounded text-indigo-500 font-semibold uppercase">
                                                    {layer.type}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Active opacity controls */}
                    {activeLayer && (
                        <div className="pt-3 border-t border-gray-200 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700">Opacidad Capa</span>
                                <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
                                    {Math.round(activeLayer.opacity * 100)}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(activeLayer.opacity * 100)}
                                onChange={(e) => setLayerOpacity(activeLayer.id, Number(e.target.value))}
                                className="w-full h-1.5 rounded accent-indigo-600 cursor-pointer"
                            />
                            {hands.length >= 2 && gestures.some((g) => g.type === 'PINCH') && (
                                <div className="text-[10px] text-center text-indigo-600 font-bold bg-indigo-50 p-2 border border-indigo-100 rounded-lg animate-pulse mt-1">
                                    🙌 Gestos: Controlando opacidad separando/juntando tus manos!
                                </div>
                            )}
                        </div>
                    )}

                    {/* Collapsible settings and calibration */}
                    <div className="border-t border-gray-200 pt-3 mt-auto flex flex-col gap-1.5">
                        <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className="w-full py-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg flex items-center justify-between transition-all"
                        >
                            <span>⚙️ Configuración & Calibración</span>
                            <span>{isSettingsOpen ? '▲' : '▼'}</span>
                        </button>

                        {isSettingsOpen && (
                            <div className="flex flex-col gap-3 p-2.5 bg-white rounded-lg border border-gray-200 mt-1 text-[11px] max-h-[220px] overflow-y-auto shadow-inner">
                                {/* Sensibilidad de Swipe */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Sensibilidad Swipe Y</span>
                                        <span className="font-mono text-indigo-600">{swipeSensitivity.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.05"
                                        max="0.30"
                                        step="0.01"
                                        value={swipeSensitivity}
                                        onChange={(e) => setSwipeSensitivity(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer"
                                    />
                                </div>

                                {/* Pinch Sensitivity */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Sensibilidad Pinch (Gesto)</span>
                                        <span className="font-mono text-indigo-600">{pinchSensitivity.toFixed(3)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.02"
                                        max="0.10"
                                        step="0.005"
                                        value={pinchSensitivity}
                                        onChange={(e) => setPinchSensitivity(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer"
                                    />
                                </div>

                                {/* Min/Max pinch distances */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Pinza Dist. Mín (0% Opacidad)</span>
                                        <span className="font-mono text-indigo-600">{minPinchDistance.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.02"
                                        max="0.20"
                                        step="0.01"
                                        value={minPinchDistance}
                                        onChange={(e) => setMinPinchDistance(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer"
                                    />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Pinza Dist. Máx (100% Opacidad)</span>
                                        <span className="font-mono text-indigo-600">{maxPinchDistance.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.30"
                                        max="0.70"
                                        step="0.01"
                                        value={maxPinchDistance}
                                        onChange={(e) => setMaxPinchDistance(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer"
                                    />
                                </div>

                                <button
                                    onClick={() => {
                                        setTutorialSlide(0);
                                        setIsTutorialOpen(true);
                                    }}
                                    className="w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg transition-all text-center border border-indigo-200 mt-1"
                                >
                                    ❔ Ver Tutorial de Gestos
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Hint bar */}
            <div className="text-center text-xs text-gray-500 pb-1">
                <span>👌 Pincel · ✌️ Borrador · 👆 Mover · ✋ Pausar ·</span>
                <span className="ml-1">Atajos: <b>B</b> Pincel · <b>E</b> Borrador · <b>Ctrl+Z</b> Deshacer · <b>Ctrl+S</b> Exportar · <b>Espacio</b> Pausa</span>
            </div>

            {/* ── Tutorial Interactive Overlay Modal ────────────────────── */}
            {isTutorialOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 border border-gray-100 animate-slide-in">
                        {/* Slide content */}
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="text-6xl p-4 bg-indigo-50 rounded-full w-24 h-24 flex items-center justify-center shadow-inner">
                                {TUTORIAL_SLIDES[tutorialSlide].icon}
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">
                                {TUTORIAL_SLIDES[tutorialSlide].title}
                            </h2>
                            <p className="text-sm text-gray-600 leading-relaxed max-w-sm">
                                {TUTORIAL_SLIDES[tutorialSlide].description}
                            </p>
                        </div>

                        {/* Slide dots */}
                        <div className="flex justify-center gap-1.5 mt-2">
                            {TUTORIAL_SLIDES.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => {
                                        setTutorialSlide(index);
                                        playToggleSound(true);
                                    }}
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                        index === tutorialSlide ? 'w-6 bg-indigo-600' : 'w-2 bg-gray-300 hover:bg-gray-400'
                                    }`}
                                />
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-4 mt-2">
                            <button
                                onClick={handleCloseTutorial}
                                className="text-sm text-gray-500 hover:text-gray-700 font-semibold px-4 py-2"
                            >
                                Saltar tutorial
                            </button>

                            <div className="flex gap-2">
                                {tutorialSlide > 0 && (
                                    <button
                                        onClick={handlePrevSlide}
                                        className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-semibold transition-all"
                                    >
                                        Atrás
                                    </button>
                                )}
                                <button
                                    onClick={handleNextSlide}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                                >
                                    {tutorialSlide === TUTORIAL_SLIDES.length - 1 ? '¡Comenzar!' : 'Siguiente'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast Notifications ───────────────────────────────────── */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`px-4 py-2.5 rounded-xl shadow-lg text-white text-xs font-semibold flex items-center gap-2 pointer-events-auto animate-slide-in border transition-all duration-300
                            ${t.type === 'success'
                                ? 'bg-emerald-600 border-emerald-500'
                                : t.type === 'warning'
                                ? 'bg-rose-600 border-rose-500'
                                : 'bg-indigo-600 border-indigo-500'
                            }`}
                    >
                        <span>
                            {t.type === 'success' ? '✅' : t.type === 'warning' ? '⚠️' : 'ℹ️'}
                        </span>
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>

        </div>
    );
};