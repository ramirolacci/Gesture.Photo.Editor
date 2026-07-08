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
    { id: 'DRAW_RECT',     icon: '⬜', label: 'Rectángulo' },
    { id: 'DRAW_CIRCLE',   icon: '⭕', label: 'Círculo / Elipse' },
    { id: 'DRAW_LINE',     icon: '📏', label: 'Línea' },
    { id: 'DRAW_TRIANGLE', icon: '🔺', label: 'Triángulo' },
    { id: 'DRAW_STAR',     icon: '⭐', label: 'Estrella' },
    { id: 'DRAW_POLYGON',  icon: '⬡', label: 'Hexágono' },
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
    const canvasRef       = useRef<HTMLCanvasElement>(null);
    const fileInputRef    = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);

    // Toasts state
    const [toasts, setToasts] = useState<Toast[]>([]);

    // Export panel state
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [jpgQuality, setJpgQuality] = useState(0.92);
    const [exportScale, setExportScale] = useState(2);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

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
        currentTool, selectTool,
        brushColor, setBrushColor,
        brushSize, setBrushSize,
        pointerPos,
        projectName, setProjectName,
        lastAutoSave,

        // History
        undo, redo, canUndo, canRedo,
        historyEntries, clearHistory,

        // Image/Export
        loadImage, exportAs, clearCanvas, applyFilter,

        // Project
        saveProject, loadProject, loadAutoSave,

        // Text/Shape Styles API
        setTextStyle, setShapeStyle,
        activeObjectProperties,

        // Layers API
        layers,
        addDrawingLayer, addTextLayer, addShapeLayer,
        toggleLayerVisibility, setLayerOpacity, selectLayer, deleteLayer,
        moveLayerUp, moveLayerDown, duplicateLayer, mergeLayerBelow,
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

    const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) loadProject(ev.target.result as string);
        };
        reader.readAsText(file);
        if (projectInputRef.current) projectInputRef.current.value = '';
    };

    const handleExportPNG  = () => exportAs({ format: 'png',         scale: exportScale });
    const handleExportJPG  = () => exportAs({ format: 'jpg',         scale: exportScale, jpgQuality });
    const handleExportPDF  = () => exportAs({ format: 'pdf',         scale: exportScale });
    const handleExportZIP  = () => exportAs({ format: 'layers-zip',  scale: exportScale });

    const autoSaveLabel = lastAutoSave
        ? `Auto-guardado ${Math.round((Date.now() - lastAutoSave.getTime()) / 60000)} min atrás`
        : 'Sin auto-guardado aún';

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

    const isShapeTool = ['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE', 'DRAW_TRIANGLE', 'DRAW_STAR', 'DRAW_POLYGON'].includes(currentTool);
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

                {/* Undo / Redo */}
                <ToolButton variant="default" active={false} onClick={undo}
                    title="Deshacer (Ctrl+Z)">
                    <span className={canUndo ? 'opacity-100' : 'opacity-30'}>↩ Undo</span>
                </ToolButton>
                <ToolButton variant="default" active={false} onClick={redo}
                    title="Rehacer (Ctrl+Y)">
                    <span className={canRedo ? 'opacity-100' : 'opacity-30'}>↪ Redo</span>
                </ToolButton>

                <Divider />

                {/* Actions */}
                <ToolButton variant="danger" active={false} onClick={clearCanvas} title="Limpiar todo el canvas">
                    🗑️ Limpiar
                </ToolButton>

                <Divider />

                {/* Project */}
                <ToolButton variant="default" active={false} onClick={saveProject} title="Guardar proyecto (.gpe)">
                    💾 Guardar
                </ToolButton>
                <ToolButton variant="default" active={false} onClick={() => projectInputRef.current?.click()} title="Abrir proyecto (.gpe)">
                    📂 Abrir
                </ToolButton>
                <ToolButton variant="default" active={false} onClick={loadAutoSave} title="Restaurar auto-guardado">
                    ⏮️ Auto
                </ToolButton>
                <input ref={projectInputRef} type="file" accept=".gpe,.json" onChange={handleLoadProject} className="hidden" />

                <Divider />

                {/* Export */}
                <ToolButton variant="success" active={isExportOpen} onClick={() => setIsExportOpen(p => !p)} title="Opciones de exportación">
                    📤 Exportar ▾
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

            {/* ── Export Panel (collapsible) ───────────────────────────── */}
            {isExportOpen && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex-wrap animate-slide-in">
                    <span className="text-xs font-bold text-emerald-700 shrink-0">📤 Exportar:</span>

                    <button onClick={handleExportPNG} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all">PNG (Alta res)</button>

                    <div className="flex items-center gap-1.5">
                        <button onClick={handleExportJPG} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all">JPG</button>
                        <span className="text-[10px] text-gray-500">Calidad:</span>
                        <input type="range" min="0.1" max="1" step="0.05" value={jpgQuality}
                            onChange={(e) => setJpgQuality(Number(e.target.value))}
                            className="w-16 h-1 accent-amber-500 cursor-pointer" />
                        <span className="text-[10px] font-mono text-amber-700 w-8">{Math.round(jpgQuality * 100)}%</span>
                    </div>

                    <button onClick={handleExportPDF} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all">PDF</button>
                    <button onClick={handleExportZIP} className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all">📦 Capas ZIP</button>

                    <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[10px] text-gray-500">Escala:</span>
                        <select value={exportScale} onChange={(e) => setExportScale(Number(e.target.value))}
                            className="text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 cursor-pointer">
                            <option value={1}>1x (800×600)</option>
                            <option value={2}>2x (1600×1200)</option>
                            <option value={3}>3x (2400×1800)</option>
                            <option value={4}>4x (3200×2400)</option>
                        </select>
                    </div>
                </div>
            )}

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
                                        onClick={() => addShapeLayer('triangle')}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                                    >
                                        🔺 Triángulo
                                    </button>
                                    <button
                                        onClick={() => addShapeLayer('star')}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                                    >
                                        ⭐ Estrella
                                    </button>
                                    <button
                                        onClick={() => addShapeLayer('polygon')}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                                    >
                                        ⬡ Hexágono
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

                    {/* ── Text / Shape Properties Panel ────────────────── */}
                    {activeLayer && activeObjectProperties && (
                        <div className="pt-3 border-t border-gray-200 flex flex-col gap-3">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
                                🛠️ Propiedades ({activeLayer.type === 'text' ? 'Texto' : 'Forma'})
                            </span>

                            {activeLayer.type === 'text' && (
                                <div className="flex flex-col gap-2.5 bg-white p-2.5 border border-gray-200 rounded-lg shadow-sm">
                                    {/* Font selector */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] text-gray-500 font-semibold">Fuente</span>
                                        <select
                                            value={activeObjectProperties.fontFamily}
                                            onChange={(e) => setTextStyle('fontFamily', e.target.value)}
                                            className="text-xs border border-gray-200 rounded-md p-1 bg-gray-50 cursor-pointer"
                                        >
                                            <option value="Arial">Arial</option>
                                            <option value="Georgia">Georgia</option>
                                            <option value="Courier New">Courier New</option>
                                            <option value="Times New Roman">Times New Roman</option>
                                            <option value="Impact">Impact</option>
                                            <option value="Comic Sans MS">Comic Sans MS</option>
                                        </select>
                                    </div>

                                    {/* Font size */}
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between font-semibold text-gray-600 text-[10px]">
                                            <span>Tamaño</span>
                                            <span className="font-mono text-indigo-600">{activeObjectProperties.fontSize}px</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={10}
                                            max={120}
                                            value={activeObjectProperties.fontSize}
                                            onChange={(e) => setTextStyle('fontSize', Number(e.target.value))}
                                            className="w-full h-1 rounded accent-indigo-600 cursor-pointer"
                                        />
                                    </div>

                                    {/* Color & alignment */}
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-[10px] text-gray-500 font-semibold">Color</span>
                                            <input
                                                type="color"
                                                value={activeObjectProperties.fill}
                                                onChange={(e) => setTextStyle('fill', e.target.value)}
                                                className="w-6 h-6 border-0 rounded cursor-pointer"
                                            />
                                        </div>

                                        <div className="flex gap-1 ml-auto">
                                            {['left', 'center', 'right'].map((align) => (
                                                <button
                                                    key={align}
                                                    onClick={() => setTextStyle('textAlign', align)}
                                                    className={`px-2 py-0.5 border text-xs rounded transition-all font-mono ${
                                                        activeObjectProperties.textAlign === align
                                                            ? 'bg-indigo-600 border-indigo-700 text-white font-bold'
                                                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    {align === 'left' ? '⬅️' : align === 'center' ? '⬌' : '➡️'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Text Styles (B / I / U) */}
                                    <div className="flex gap-1.5 justify-center mt-1">
                                        <button
                                            onClick={() => setTextStyle('fontWeight', activeObjectProperties.fontWeight === 'bold' ? 'normal' : 'bold')}
                                            className={`flex-1 py-1 text-xs border rounded transition-all font-bold ${
                                                activeObjectProperties.fontWeight === 'bold'
                                                    ? 'bg-indigo-600 border-indigo-700 text-white'
                                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            B
                                        </button>
                                        <button
                                            onClick={() => setTextStyle('fontStyle', activeObjectProperties.fontStyle === 'italic' ? 'normal' : 'italic')}
                                            className={`flex-1 py-1 text-xs border rounded transition-all italic font-serif ${
                                                activeObjectProperties.fontStyle === 'italic'
                                                    ? 'bg-indigo-600 border-indigo-700 text-white'
                                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            I
                                        </button>
                                        <button
                                            onClick={() => setTextStyle('underline', !activeObjectProperties.underline)}
                                            className={`flex-1 py-1 text-xs border rounded transition-all underline ${
                                                activeObjectProperties.underline
                                                    ? 'bg-indigo-600 border-indigo-700 text-white'
                                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            U
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeLayer.type === 'shape' && (
                                <div className="flex flex-col gap-2.5 bg-white p-2.5 border border-gray-200 rounded-lg shadow-sm">
                                    {/* Colors: Solid or Gradient */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="checkbox"
                                                id="chkGradient"
                                                checked={activeObjectProperties.isGradient}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setShapeStyle('gradient', {
                                                            color1: activeObjectProperties.fill,
                                                            color2: '#10b981'
                                                        });
                                                    } else {
                                                        setShapeStyle('fill', activeObjectProperties.fill);
                                                    }
                                                }}
                                                className="rounded border-gray-300 accent-indigo-600"
                                            />
                                            <label htmlFor="chkGradient" className="text-[10px] text-gray-500 font-semibold select-none cursor-pointer">
                                                Gradiente Lineal
                                            </label>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 font-semibold">Relleno</span>
                                            <input
                                                type="color"
                                                value={activeObjectProperties.fill}
                                                onChange={(e) => {
                                                    if (activeObjectProperties.isGradient) {
                                                        setShapeStyle('gradient', {
                                                            color1: e.target.value,
                                                            color2: activeObjectProperties.gradientColor2
                                                        });
                                                    } else {
                                                        setShapeStyle('fill', e.target.value);
                                                    }
                                                }}
                                                className="w-6 h-6 border-0 rounded cursor-pointer"
                                            />

                                            {activeObjectProperties.isGradient && (
                                                <>
                                                    <span className="text-[10px] text-gray-500 font-semibold">Color 2</span>
                                                    <input
                                                        type="color"
                                                        value={activeObjectProperties.gradientColor2}
                                                        onChange={(e) => {
                                                            setShapeStyle('gradient', {
                                                                color1: activeObjectProperties.fill,
                                                                color2: e.target.value
                                                            });
                                                        }}
                                                        className="w-6 h-6 border-0 rounded cursor-pointer"
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stroke / Border */}
                                    <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
                                        <span className="text-[10px] text-gray-500 font-semibold">Borde</span>
                                        <input
                                            type="color"
                                            value={activeObjectProperties.stroke}
                                            onChange={(e) => setShapeStyle('stroke', e.target.value)}
                                            className="w-5 h-5 border-0 rounded cursor-pointer"
                                        />
                                        <span className="text-[10px] text-gray-500 font-semibold ml-auto">Grosor</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={20}
                                            value={activeObjectProperties.strokeWidth}
                                            onChange={(e) => setShapeStyle('strokeWidth', Number(e.target.value))}
                                            className="w-12 text-xs border border-gray-200 rounded p-0.5 text-center bg-gray-50 font-semibold font-mono"
                                        />
                                    </div>

                                    {/* Shadow */}
                                    <div className="flex flex-col gap-1 border-t border-gray-100 pt-2">
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="checkbox"
                                                id="chkShadow"
                                                checked={!!activeObjectProperties.shadow}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setShapeStyle('shadow', {
                                                            color: 'rgba(0,0,0,0.35)',
                                                            blur: 12,
                                                            offsetX: 6,
                                                            offsetY: 6
                                                        });
                                                    } else {
                                                        setShapeStyle('shadow', null);
                                                    }
                                                }}
                                                className="rounded border-gray-300 accent-indigo-600"
                                            />
                                            <label htmlFor="chkShadow" className="text-[10px] text-gray-500 font-semibold select-none cursor-pointer">
                                                Sombra Paralela
                                            </label>
                                        </div>

                                        {!!activeObjectProperties.shadow && (
                                            <div className="grid grid-cols-2 gap-2 mt-1.5 p-1.5 bg-gray-50 border border-gray-200 rounded-md">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[9px] text-gray-400">Desenfoque</span>
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={30}
                                                        value={activeObjectProperties.shadow.blur}
                                                        onChange={(e) => setShapeStyle('shadow', {
                                                            ...activeObjectProperties.shadow,
                                                            blur: Number(e.target.value)
                                                        })}
                                                        className="w-full h-1 accent-indigo-600 cursor-pointer"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[9px] text-gray-400">Desplazamiento</span>
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={25}
                                                        value={activeObjectProperties.shadow.offsetX}
                                                        onChange={(e) => setShapeStyle('shadow', {
                                                            ...activeObjectProperties.shadow,
                                                            offsetX: Number(e.target.value),
                                                            offsetY: Number(e.target.value)
                                                        })}
                                                        className="w-full h-1 accent-indigo-600 cursor-pointer"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Rotation Angle */}
                                    <div className="flex flex-col gap-1 border-t border-gray-100 pt-2">
                                        <div className="flex justify-between font-semibold text-gray-600 text-[10px]">
                                            <span>Rotación</span>
                                            <span className="font-mono text-indigo-600">{activeObjectProperties.angle}°</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={359}
                                            value={activeObjectProperties.angle}
                                            onChange={(e) => setShapeStyle('angle', Number(e.target.value))}
                                            className="w-full h-1.5 rounded accent-indigo-600 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Project name & auto-save ─────────────────────── */}
                    <div className="border-t border-gray-200 pt-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 shrink-0">Proyecto</span>
                            <input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                className="flex-1 text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white min-w-0"
                                placeholder="Nombre del proyecto"
                            />
                        </div>
                        <div className="text-[9px] text-gray-400 text-center">
                            {autoSaveLabel} · Auto-guardado cada 5 min
                        </div>
                    </div>

                    {/* ── History panel ────────────────────────────────────── */}
                    <div className="border-t border-gray-200 pt-3 flex flex-col gap-1.5">
                        <button
                            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                            className="w-full py-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg flex items-center justify-between transition-all"
                        >
                            <span>🕐 Historial ({historyEntries.length})</span>
                            <span>{isHistoryOpen ? '▲' : '▼'}</span>
                        </button>

                        {isHistoryOpen && (
                            <div className="flex flex-col gap-1.5 p-2 bg-white rounded-lg border border-gray-200 mt-1 text-[11px] max-h-[160px] overflow-y-auto shadow-inner">
                                {historyEntries.length === 0 ? (
                                    <div className="text-center text-gray-400 py-3">Sin acciones en el historial</div>
                                ) : (
                                    historyEntries.map((entry, i) => (
                                        <div
                                            key={entry.id}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
                                                i === 0 ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50'
                                            }`}
                                        >
                                            <span className="text-gray-400 text-[9px] font-mono shrink-0">
                                                {new Date(entry.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                            <span className={`truncate ${
                                                i === 0 ? 'font-bold text-indigo-700' : 'text-gray-600'
                                            }`}>
                                                {entry.description}
                                            </span>
                                        </div>
                                    ))
                                )}
                                {historyEntries.length > 0 && (
                                    <button
                                        onClick={clearHistory}
                                        className="text-[10px] text-red-500 hover:text-red-700 text-center mt-1 font-semibold"
                                    >
                                        Limpiar historial
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

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
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Sensibilidad Swipe Y</span>
                                        <span className="font-mono text-indigo-600">{swipeSensitivity.toFixed(2)}</span>
                                    </div>
                                    <input type="range" min="0.05" max="0.30" step="0.01" value={swipeSensitivity}
                                        onChange={(e) => setSwipeSensitivity(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Sensibilidad Pinch (Gesto)</span>
                                        <span className="font-mono text-indigo-600">{pinchSensitivity.toFixed(3)}</span>
                                    </div>
                                    <input type="range" min="0.02" max="0.10" step="0.005" value={pinchSensitivity}
                                        onChange={(e) => setPinchSensitivity(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Pinza Dist. Mín (0% Opacidad)</span>
                                        <span className="font-mono text-indigo-600">{minPinchDistance.toFixed(2)}</span>
                                    </div>
                                    <input type="range" min="0.02" max="0.20" step="0.01" value={minPinchDistance}
                                        onChange={(e) => setMinPinchDistance(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between font-semibold text-gray-600">
                                        <span>Pinza Dist. Máx (100% Opacidad)</span>
                                        <span className="font-mono text-indigo-600">{maxPinchDistance.toFixed(2)}</span>
                                    </div>
                                    <input type="range" min="0.30" max="0.70" step="0.01" value={maxPinchDistance}
                                        onChange={(e) => setMaxPinchDistance(Number(e.target.value))}
                                        className="w-full h-1 rounded accent-indigo-600 cursor-pointer" />
                                </div>
                                <button
                                    onClick={() => { setTutorialSlide(0); setIsTutorialOpen(true); }}
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
                <span className="ml-1">Atajos: <b>B</b> Pincel · <b>E</b> Borrador · <b>Ctrl+Z</b> Deshacer · <b>Ctrl+Y</b> Rehacer · <b>Ctrl+S</b> Exportar · <b>Espacio</b> Pausa</span>
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