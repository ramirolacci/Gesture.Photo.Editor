import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { fabric } from 'fabric';
import { playSelectSound, playSuccessSound, playToggleSound } from '../utils/audioFeedback';
import { useProjectHistory } from './useProjectHistory';
import { exportCanvas, ExportOptions } from '../utils/canvasExporter';

const createStarPoints = (centerX: number, centerY: number, points: number, innerRadius: number, outerRadius: number) => {
    const results = [];
    const angle = Math.PI / points;
    for (let i = 0; i < 2 * points; i++) {
        const r = (i % 2 === 0) ? outerRadius : innerRadius;
        const currAngle = i * angle - Math.PI / 2;
        results.push({
            x: centerX + r * Math.cos(currAngle),
            y: centerY + r * Math.sin(currAngle)
        });
    }
    return results;
};

const createRegularPolygonPoints = (centerX: number, centerY: number, sides: number, radius: number) => {
    const results = [];
    const angle = (2 * Math.PI) / sides;
    for (let i = 0; i < sides; i++) {
        results.push({
            x: centerX + radius * Math.cos(i * angle),
            y: centerY + radius * Math.sin(i * angle)
        });
    }
    return results;
};

const toRgba = (color: string, alpha: number) => {
    const normalized = color.trim();
    if (!normalized.startsWith('#')) return normalized;

    const hex = normalized.replace('#', '');
    const fullHex = hex.length === 3
        ? hex.split('').map((char) => char + char).join('')
        : hex;

    if (fullHex.length !== 6) return normalized;

    const value = Number.parseInt(fullHex, 16);
    if (Number.isNaN(value)) return normalized;

    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const pointsToSvgPath = (points: { x: number; y: number }[]): string => {
    if (points.length === 0) return '';
    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
    }
    let pathStr = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathStr += ` L ${points[i].x} ${points[i].y}`;
    }
    return pathStr;
};

export interface LayerInfo {
    id: string;
    name: string;
    type: 'drawing' | 'image' | 'text' | 'shape';
    visible: boolean;
    opacity: number;
    active: boolean;
}

const getViewportSize = () => ({
    width: window.innerWidth || 1280,
    height: window.innerHeight || 720,
});

interface UseCanvasManipulationOptions {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    overlayCanvasRef?: React.RefObject<HTMLCanvasElement>;
    onActionCompleted?: (action: EditorAction) => void;
    hands?: HandLandmarks[];
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
    onToggleGesturePause?: () => void;
    showToast?: (message: string, type: 'success' | 'info' | 'warning') => void;
    pinchSensitivity?: number;
    swipeSensitivity?: number;
    minPinchDistance?: number;
    maxPinchDistance?: number;
    virtualPointerPos?: { x: number; y: number } | null;
}

export function useCanvasManipulation(options: UseCanvasManipulationOptions) {
    const {
        canvasRef,
        onActionCompleted,
        hands = [],
        gestures = [],
        isGesturePaused = false,
        onToggleGesturePause,
        showToast,
        pinchSensitivity = 0.08,
        swipeSensitivity: _swipeSensitivity = 0.15,
        minPinchDistance: _minPinchDistance = 0.08,
        maxPinchDistance: _maxPinchDistance = 0.45,
        virtualPointerPos = null,
    } = options;

    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

    // Tools & Properties
    const [currentTool, setCurrentTool] = useState<EditorAction>('SELECT_BRUSH');
    const currentToolRef = useRef<EditorAction>('SELECT_BRUSH');

    const [brushColor, setBrushColorState] = useState('#00F0FF');
    const brushColorRef = useRef('#00F0FF');

    const [brushSize, setBrushSizeState] = useState(6);
    const brushSizeRef = useRef(6);

    const [isHighlightMode, setIsHighlightModeState] = useState(false);
    const isHighlightModeRef = useRef(false);

    const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

    // Gesture & Pointer tracking refs
    const targetPosRef = useRef<{ x: number; y: number } | null>(null);
    const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    const virtualPointerPosRef = useRef<{ x: number; y: number } | null>(virtualPointerPos);

    const isPinchingRef = useRef(false);
    const wasPinchingRef = useRef(false);
    const isPointingRef = useRef(false);
    const wasPointingRef = useRef(false);
    const isEraserRef = useRef(false);

    // Active gesture interaction state
    const currentStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
    const activePathPreviewRef = useRef<fabric.Path | null>(null);
    const grabbedObjectRef = useRef<fabric.Object | null>(null);
    const grabOffsetRef = useRef<{ x: number; y: number } | null>(null);
    const activeDrawingShapeRef = useRef<{ shape: fabric.Object; startPt: { x: number; y: number } } | null>(null);

    const handsRef = useRef<HandLandmarks[]>([]);
    const wasThumbsUpRef = useRef(false);

    // ─── Sync Layers ────────────────────────────────────────────────────────────

    const syncLayers = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const objects = canvas.getObjects();
        objects.forEach((obj) => {
            const objAny = obj as any;
            if (!objAny.id) {
                objAny.id = 'layer_' + Math.random().toString(36).substring(2, 9);
            }
            if (!objAny.layerType) {
                let lType: 'drawing' | 'image' | 'text' | 'shape' = 'shape';
                if (obj.type === 'path') lType = 'drawing';
                else if (obj.type === 'image') lType = 'image';
                else if (obj.type === 'i-text' || obj.type === 'text') lType = 'text';
                objAny.layerType = lType;
            }
            if (!objAny.name) {
                const type = objAny.layerType;
                const idx = objects.indexOf(obj) + 1;
                objAny.name = `${type === 'drawing' ? 'Trazo' : type === 'image' ? 'Imagen' : type === 'text' ? 'Texto' : 'Forma'} ${idx}`;
            }
        });
    }, []);

    const updateActiveProperties = useCallback(() => {
        // No-op for floating presenter overlay
    }, []);

    // ─── History ──────────────────────────────────────────────────────────────

    const onRestored = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        canvas.requestRenderAll();
        syncLayers();
    }, [syncLayers]);

    const {
        pushSnapshot,
        commitHead,
        undo: historyUndo,
        redo: historyRedo,
        canUndo,
        canRedo,
        historyEntries,
    } = useProjectHistory(fabricCanvasRef as React.RefObject<fabric.Canvas | null>, onRestored);

    const withHistory = useCallback(async <T>(
        description: string,
        fn: () => T | Promise<T>
    ): Promise<T> => {
        pushSnapshot(description);
        const result = await fn();
        commitHead();
        return result;
    }, [pushSnapshot, commitHead]);

    // ─── Tool Setters ─────────────────────────────────────────────────────────

    const setBrushColor = useCallback((color: string) => {
        setBrushColorState(color);
        brushColorRef.current = color;
    }, []);

    const setBrushSize = useCallback((size: number) => {
        const clamped = Math.min(60, Math.max(1, size));
        setBrushSizeState(clamped);
        brushSizeRef.current = clamped;
    }, []);

    const setHighlightMode = useCallback((active: boolean) => {
        setIsHighlightModeState(active);
        isHighlightModeRef.current = active;
    }, []);

    const selectTool = useCallback((tool: EditorAction) => {
        setCurrentTool(tool);
        currentToolRef.current = tool;

        const canvas = fabricCanvasRef.current;
        if (canvas) {
            canvas.getObjects().forEach((obj) => {
                obj.selectable = tool === 'SELECT_MOVE' || tool === 'SELECT_BRUSH';
                obj.hoverCursor = tool === 'SELECT_MOVE' ? 'move' : 'crosshair';
            });
            canvas.requestRenderAll();
            syncLayers();
        }

        playSelectSound();
        const toolLabels: Record<EditorAction, string> = {
            SELECT_BRUSH: 'Pincel Libre Vectorial',
            SELECT_LASER: 'Puntero Láser (Temporal)',
            SELECT_ERASER: 'Borrador Vectorial',
            SELECT_MOVE: 'Mover y Agarrar',
            SELECT_ZOOM: 'Zoom',
            PAN_CANVAS: 'Desplazar',
            APPLY_FILTER: 'Filtro',
            DRAW_RECT: 'Rectángulo',
            DRAW_CIRCLE: 'Círculo / Elipse',
            DRAW_LINE: 'Línea / Flecha',
            DRAW_TRIANGLE: 'Triángulo',
            DRAW_STAR: 'Estrella',
            DRAW_POLYGON: 'Polígono',
            UNDO: 'Deshacer',
            REDO: 'Rehacer',
            NONE: 'Inactivo',
        };
        showToast?.(`Herramienta: ${toolLabels[tool] || tool}`, 'info');
        if (onActionCompleted) onActionCompleted(tool);
    }, [onActionCompleted, syncLayers, showToast]);

    // ─── Canvas Setup ─────────────────────────────────────────────────────────

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvasEl = canvasRef.current;
        const { width, height } = getViewportSize();

        const canvas = new fabric.Canvas(canvasEl, {
            width,
            height,
            backgroundColor: 'transparent',
            selection: true,
            preserveObjectStacking: true,
        });

        fabricCanvasRef.current = canvas;

        const onSync = () => {
            syncLayers();
            updateActiveProperties();
        };

        const syncEvents = ['object:added', 'object:removed', 'selection:created', 'selection:updated', 'selection:cleared', 'object:modified'];
        syncEvents.forEach((evt) => canvas.on(evt, onSync));

        const resizeCanvas = () => {
            const { width, height } = getViewportSize();
            canvas.setDimensions({ width, height });
            canvas.requestRenderAll();
        };

        window.addEventListener('resize', resizeCanvas);

        return () => {
            syncEvents.forEach((evt) => canvas.off(evt, onSync));
            window.removeEventListener('resize', resizeCanvas);
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, [canvasRef, syncLayers, updateActiveProperties]);

    // ─── Keyboard Shortcuts ────────────────────────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            const key = e.key.toLowerCase();
            const isCtrl = e.ctrlKey || e.metaKey;

            if (key === 'b') {
                e.preventDefault();
                selectTool('SELECT_BRUSH');
            } else if (key === 'l') {
                e.preventDefault();
                selectTool('SELECT_LASER');
            } else if (key === 'v' || key === 'm') {
                e.preventDefault();
                selectTool('SELECT_MOVE');
            } else if (key === 'e') {
                e.preventDefault();
                selectTool('SELECT_ERASER');
            } else if (isCtrl && key === 'z') {
                e.preventDefault();
                if (canUndo) {
                    historyUndo().then(() => {
                        playToggleSound(false);
                        showToast?.('↩ Deshacer (Ctrl+Z)', 'info');
                    });
                }
            } else if (isCtrl && (key === 'y' || (e.shiftKey && key === 'z'))) {
                e.preventDefault();
                if (canRedo) {
                    historyRedo().then(() => {
                        playToggleSound(true);
                        showToast?.('↪ Rehacer (Ctrl+Y)', 'info');
                    });
                }
            } else if (e.code === 'Space') {
                e.preventDefault();
                onToggleGesturePause?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectTool, showToast, onToggleGesturePause, canUndo, canRedo, historyUndo, historyRedo]);

    // ─── Mouse Handlers (Vector Stroke & Shapes) ──────────────────────────────

    const isMouseDrawingRef = useRef(false);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const onMouseDown = (opt: fabric.IEvent) => {
            const pointer = canvas.getPointer(opt.e);
            const tool = currentToolRef.current;

            if (tool === 'SELECT_BRUSH' || tool === 'SELECT_LASER') {
                isMouseDrawingRef.current = true;
                currentStrokePointsRef.current = [{ x: pointer.x, y: pointer.y }];
            } else if (tool === 'SELECT_ERASER') {
                isMouseDrawingRef.current = true;
                const p = new fabric.Point(pointer.x, pointer.y);
                const objects = canvas.getObjects();
                for (let i = objects.length - 1; i >= 0; i--) {
                    if (objects[i].containsPoint(p)) {
                        canvas.remove(objects[i]);
                        break;
                    }
                }
                canvas.requestRenderAll();
            } else if (['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE', 'DRAW_TRIANGLE', 'DRAW_STAR', 'DRAW_POLYGON'].includes(tool)) {
                pushSnapshot(`Nueva forma: ${tool}`);
                isMouseDrawingRef.current = true;
                const startPt = pointer;
                let shape: fabric.Object;

                const nameSuffix = canvas.getObjects().length + 1;
                const baseOptions = {
                    left: startPt.x,
                    top: startPt.y,
                    fill: 'transparent',
                    stroke: brushColorRef.current,
                    strokeWidth: brushSizeRef.current,
                    selectable: true,
                    hasControls: true
                };

                if (tool === 'DRAW_RECT') {
                    shape = new fabric.Rect({ ...baseOptions, width: 0, height: 0 });
                } else if (tool === 'DRAW_CIRCLE') {
                    shape = new fabric.Ellipse({ ...baseOptions, rx: 0, ry: 0 } as any);
                } else if (tool === 'DRAW_LINE') {
                    shape = new fabric.Line([startPt.x, startPt.y, startPt.x, startPt.y], {
                        stroke: brushColorRef.current,
                        strokeWidth: brushSizeRef.current,
                        selectable: true,
                        hasControls: true
                    });
                } else if (tool === 'DRAW_TRIANGLE') {
                    shape = new fabric.Triangle({ ...baseOptions, width: 0, height: 0 });
                } else if (tool === 'DRAW_STAR') {
                    shape = new fabric.Polygon(createStarPoints(0, 0, 5, 0, 0), baseOptions);
                } else {
                    shape = new fabric.Polygon(createRegularPolygonPoints(0, 0, 6, 0), baseOptions);
                }

                const shapeAny = shape as any;
                shapeAny.id = 'shape_' + Date.now();
                shapeAny.layerType = 'shape';
                shapeAny.name = `Forma ${nameSuffix}`;

                canvas.add(shape);
                activeDrawingShapeRef.current = { shape, startPt };
                canvas.setActiveObject(shape);
                canvas.requestRenderAll();
            }
        };

        const onMouseMove = (opt: fabric.IEvent) => {
            if (!isMouseDrawingRef.current) return;
            const pointer = canvas.getPointer(opt.e);
            const tool = currentToolRef.current;

            if (tool === 'SELECT_BRUSH' || tool === 'SELECT_LASER') {
                currentStrokePointsRef.current.push({ x: pointer.x, y: pointer.y });
                if (activePathPreviewRef.current) {
                    canvas.remove(activePathPreviewRef.current);
                }

                const pathData = pointsToSvgPath(currentStrokePointsRef.current);
                const strokeWidth = isHighlightModeRef.current ? Math.max(brushSizeRef.current + 8, 12) : brushSizeRef.current;
                const strokeColor = tool === 'SELECT_LASER' ? '#FF0055' : isHighlightModeRef.current ? toRgba(brushColorRef.current, 0.4) : brushColorRef.current;

                const preview = new fabric.Path(pathData, {
                    fill: '',
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    strokeLineCap: 'round',
                    strokeLineJoin: 'round',
                    selectable: false,
                    evented: false,
                });
                canvas.add(preview);
                activePathPreviewRef.current = preview;
                canvas.requestRenderAll();
            } else if (tool === 'SELECT_ERASER') {
                const p = new fabric.Point(pointer.x, pointer.y);
                const objects = canvas.getObjects();
                for (let i = objects.length - 1; i >= 0; i--) {
                    if (objects[i].containsPoint(p)) {
                        canvas.remove(objects[i]);
                        break;
                    }
                }
                canvas.requestRenderAll();
            } else if (activeDrawingShapeRef.current) {
                const { shape, startPt } = activeDrawingShapeRef.current;
                const dx = pointer.x - startPt.x;
                const dy = pointer.y - startPt.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (tool === 'DRAW_RECT') {
                    shape.set({ width: Math.abs(dx), height: Math.abs(dy), left: dx < 0 ? pointer.x : startPt.x, top: dy < 0 ? pointer.y : startPt.y });
                } else if (tool === 'DRAW_CIRCLE') {
                    (shape as fabric.Ellipse).set({
                        rx: dist,
                        ry: dist,
                        left: startPt.x - dist,
                        top: startPt.y - dist
                    });
                } else if (tool === 'DRAW_LINE') {
                    (shape as fabric.Line).set({ x2: pointer.x, y2: pointer.y });
                }
                canvas.requestRenderAll();
            }
        };

        const onMouseUp = () => {
            if (!isMouseDrawingRef.current) return;
            const tool = currentToolRef.current;

            if (tool === 'SELECT_BRUSH' || tool === 'SELECT_LASER') {
                if (activePathPreviewRef.current) {
                    canvas.remove(activePathPreviewRef.current);
                    activePathPreviewRef.current = null;
                }

                if (currentStrokePointsRef.current.length > 0) {
                    const pathData = pointsToSvgPath(currentStrokePointsRef.current);
                    const strokeWidth = isHighlightModeRef.current ? Math.max(brushSizeRef.current + 8, 12) : brushSizeRef.current;
                    const strokeColor = tool === 'SELECT_LASER' ? '#FF0055' : isHighlightModeRef.current ? toRgba(brushColorRef.current, 0.4) : brushColorRef.current;

                    const finalPath = new fabric.Path(pathData, {
                        fill: '',
                        stroke: strokeColor,
                        strokeWidth: strokeWidth,
                        strokeLineCap: 'round',
                        strokeLineJoin: 'round',
                        selectable: tool !== 'SELECT_LASER',
                        hasControls: tool !== 'SELECT_LASER',
                    });

                    const pathAny = finalPath as any;
                    pathAny.id = 'stroke_' + Date.now();
                    pathAny.layerType = 'drawing';
                    pathAny.name = tool === 'SELECT_LASER' ? 'Rastro Láser' : `Trazo ${canvas.getObjects().length + 1}`;

                    pushSnapshot(tool === 'SELECT_LASER' ? 'Puntero Láser' : 'Trazo Libre');
                    canvas.add(finalPath);
                    commitHead();

                    if (tool === 'SELECT_LASER') {
                        setTimeout(() => {
                            canvas.remove(finalPath);
                            canvas.requestRenderAll();
                        }, 1800);
                    }
                }
                currentStrokePointsRef.current = [];
            } else if (activeDrawingShapeRef.current) {
                activeDrawingShapeRef.current = null;
                commitHead();
            }

            isMouseDrawingRef.current = false;
            syncLayers();
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
        };
    }, [syncLayers, pushSnapshot, commitHead]);

    // ─── Hand Tracking → Flags ─────────────────────────────────────────────────

    useEffect(() => {
        virtualPointerPosRef.current = virtualPointerPos;
    }, [virtualPointerPos]);

    useEffect(() => {
        handsRef.current = hands;

        if (isGesturePaused) {
            targetPosRef.current = null;
            isPointingRef.current = false;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        if (virtualPointerPosRef.current) {
            targetPosRef.current = { ...virtualPointerPosRef.current };
        } else if (hands.length > 0 && hands[0].landmarks?.length) {
            const hand = hands[0];
            const indexTip = hand.landmarks[8];
            const canvas = fabricCanvasRef.current;
            if (indexTip && canvas) {
                targetPosRef.current = {
                    x: (1 - indexTip.x) * canvas.width!,
                    y: indexTip.y * canvas.height!,
                };
            }
        } else {
            targetPosRef.current = null;
            isPointingRef.current = false;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        if (hands.length > 0 && hands[0].landmarks) {
            const hand = hands[0];
            const indexTip = hand.landmarks[8];
            const thumbTip = hand.landmarks[4];
            const gesture = gestures.find((g) => g.hand === hand.handedness) || gestures[0];

            let localIsPinching = false;
            if (thumbTip && indexTip) {
                const dx = thumbTip.x - indexTip.x;
                const dy = thumbTip.y - indexTip.y;
                const dz = (thumbTip.z || 0) - (indexTip.z || 0);
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                localIsPinching = dist < pinchSensitivity || gesture?.type === 'PINCH';
            } else {
                localIsPinching = gesture?.type === 'PINCH';
            }

            // POINT (índice extendido solo) -> Dibujar
            isPointingRef.current = gesture?.type === 'POINT';
            // PINCH (pulgar e índice juntos) -> Agarrar y Arrastrar
            isPinchingRef.current = localIsPinching;
            // PEACE (índice y medio extendidos/juntos) -> Borrar
            isEraserRef.current = gesture?.type === 'PEACE';
        }
    }, [hands, gestures, isGesturePaused, pinchSensitivity, virtualPointerPos]);

    // ─── Two Hand Gestures & Swipe ─────────────────────────────────────────────

    useEffect(() => {
        if (isGesturePaused) return;
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const hasThumbsUp = gestures.some((g) => g.type === 'THUMBS_UP');
        if (hasThumbsUp && !wasThumbsUpRef.current) {
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                withHistory(`Visibilidad: "${(activeObj as any).name}"`, () => {
                    const newVisible = !activeObj.visible;
                    activeObj.set('visible', newVisible);
                    canvas.requestRenderAll();
                    syncLayers();
                    playToggleSound(newVisible);
                    showToast?.(`Capas: ${(activeObj as any).name} ${newVisible ? 'visible' : 'oculta'}`, 'info');
                });
            }
        }
        wasThumbsUpRef.current = hasThumbsUp;
    }, [gestures, isGesturePaused, syncLayers, showToast, withHistory]);

    // ─── Main RAF Loop (Continuous Gesture Interaction & Dragging) ────────────

    useEffect(() => {
        const LERP = 0.25;

        const loop = () => {
            const canvas = fabricCanvasRef.current;
            const target = virtualPointerPosRef.current ?? targetPosRef.current;

            if (!canvas) {
                animationFrameIdRef.current = requestAnimationFrame(loop);
                return;
            }

            if (target) {
                if (!smoothedPosRef.current) {
                    smoothedPosRef.current = { ...target };
                } else {
                    smoothedPosRef.current = {
                        x: smoothedPosRef.current.x * (1 - LERP) + target.x * LERP,
                        y: smoothedPosRef.current.y * (1 - LERP) + target.y * LERP,
                    };
                }
                setPointerPos({ ...smoothedPosRef.current });

                const pos = smoothedPosRef.current;
                const tool: EditorAction = currentToolRef.current;
                const isPointing = isPointingRef.current || (tool === 'SELECT_BRUSH' || tool === 'SELECT_LASER');
                const isPinching = isPinchingRef.current || tool === 'SELECT_MOVE';
                const isErasing = isEraserRef.current || tool === 'SELECT_ERASER';

                // 1. ERASER GESTURE (PEACE = Dedo índice + medio)
                if (isErasing) {
                    const erasePoint = new fabric.Point(pos.x, pos.y);
                    const objects = canvas.getObjects();
                    let removed = false;
                    for (let i = objects.length - 1; i >= 0; i--) {
                        const obj = objects[i];
                        if (obj.visible !== false && obj.containsPoint(erasePoint)) {
                            pushSnapshot(`Borrar objeto: ${(obj as any).name}`);
                            canvas.remove(obj);
                            commitHead();
                            removed = true;
                            break;
                        }
                    }
                    if (removed) {
                        canvas.requestRenderAll();
                        syncLayers();
                    }
                }
                // 2. DRAWING GESTURE (POINT = Solo dedo índice extendido)
                else if (isPointing && !isPinching) {
                    if (!wasPointingRef.current) {
                        // Iniciar trazo con el índice
                        currentStrokePointsRef.current = [{ x: pos.x, y: pos.y }];
                    } else {
                        // Continuar trazo con el índice
                        currentStrokePointsRef.current.push({ x: pos.x, y: pos.y });
                        if (activePathPreviewRef.current) {
                            canvas.remove(activePathPreviewRef.current);
                        }
                        const pathData = pointsToSvgPath(currentStrokePointsRef.current);
                        const strokeWidth = isHighlightModeRef.current ? Math.max(brushSizeRef.current + 8, 12) : brushSizeRef.current;
                        const strokeColor = tool === 'SELECT_LASER' ? '#FF0055' : isHighlightModeRef.current ? toRgba(brushColorRef.current, 0.4) : brushColorRef.current;

                        const preview = new fabric.Path(pathData, {
                            fill: '',
                            stroke: strokeColor,
                            strokeWidth: strokeWidth,
                            strokeLineCap: 'round',
                            strokeLineJoin: 'round',
                            selectable: false,
                            evented: false,
                        });
                        canvas.add(preview);
                        activePathPreviewRef.current = preview;
                        canvas.requestRenderAll();
                    }
                }
                // 3. GRAB & DRAG GESTURE (PINCH = Pulgar + Índice tocando/abriendo/cerrando)
                else if (isPinching) {
                    if (!wasPinchingRef.current) {
                        // Iniciar agarre sobre un objeto
                        const pointer = new fabric.Point(pos.x, pos.y);
                        const objects = canvas.getObjects();
                        let foundObj: fabric.Object | null = null;

                        for (let i = objects.length - 1; i >= 0; i--) {
                            const obj = objects[i];
                            if (obj.visible !== false && obj.containsPoint(pointer)) {
                                foundObj = obj;
                                break;
                            }
                        }

                        if (foundObj) {
                            canvas.setActiveObject(foundObj);
                            grabbedObjectRef.current = foundObj;
                            grabOffsetRef.current = { x: foundObj.left! - pos.x, y: foundObj.top! - pos.y };
                            pushSnapshot(`Agarrar: ${(foundObj as any).name}`);
                            canvas.requestRenderAll();
                        }
                    } else if (grabbedObjectRef.current && grabOffsetRef.current) {
                        // Arrastrar objeto agarrado
                        grabbedObjectRef.current.set({
                            left: pos.x + grabOffsetRef.current.x,
                            top: pos.y + grabOffsetRef.current.y,
                        });
                        canvas.requestRenderAll();
                    }
                }

                // Finalizar trazo de dibujo al soltar el índice
                if (wasPointingRef.current && !isPointing) {
                    if (activePathPreviewRef.current) {
                        canvas.remove(activePathPreviewRef.current);
                        activePathPreviewRef.current = null;
                    }

                    if (currentStrokePointsRef.current.length > 0) {
                        const pathData = pointsToSvgPath(currentStrokePointsRef.current);
                        const strokeWidth = isHighlightModeRef.current ? Math.max(brushSizeRef.current + 8, 12) : brushSizeRef.current;
                        const isLaser = (currentToolRef.current as string) === 'SELECT_LASER';
                        const strokeColor = isLaser ? '#FF0055' : isHighlightModeRef.current ? toRgba(brushColorRef.current, 0.4) : brushColorRef.current;

                        const finalPath = new fabric.Path(pathData, {
                            fill: '',
                            stroke: strokeColor,
                            strokeWidth: strokeWidth,
                            strokeLineCap: 'round',
                            strokeLineJoin: 'round',
                            selectable: !isLaser,
                            hasControls: !isLaser,
                        });

                        const pathAny = finalPath as any;
                        pathAny.id = 'stroke_' + Date.now();
                        pathAny.layerType = 'drawing';
                        pathAny.name = isLaser ? 'Rastro Láser' : `Trazo Libre ${canvas.getObjects().length + 1}`;

                        pushSnapshot(isLaser ? 'Puntero Láser' : 'Trazo Libre');
                        canvas.add(finalPath);
                        commitHead();

                        if (isLaser) {
                            setTimeout(() => {
                                canvas.remove(finalPath);
                                canvas.requestRenderAll();
                            }, 1800);
                        }
                    }
                    currentStrokePointsRef.current = [];
                    syncLayers();
                }

                // Finalizar agarre al soltar pinch
                if (wasPinchingRef.current && !isPinching) {
                    if (grabbedObjectRef.current) {
                        commitHead();
                        grabbedObjectRef.current = null;
                        grabOffsetRef.current = null;
                        syncLayers();
                    }
                }

                wasPointingRef.current = isPointing;
                wasPinchingRef.current = isPinching;
            } else {
                smoothedPosRef.current = null;
                wasPointingRef.current = false;
                wasPinchingRef.current = false;
                grabbedObjectRef.current = null;
                grabOffsetRef.current = null;
                currentStrokePointsRef.current = [];
                setPointerPos(null);
            }

            animationFrameIdRef.current = requestAnimationFrame(loop);
        };

        animationFrameIdRef.current = requestAnimationFrame(loop);
        return () => {
            if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        };
    }, [isGesturePaused, setBrushSize, pushSnapshot, commitHead, syncLayers]);

    // ─── Extra Operations ─────────────────────────────────────────────────────

    const clearCanvas = useCallback(async () => {
        await withHistory('Limpiar lienzo completo', () => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            canvas.clear();
            canvas.requestRenderAll();
            syncLayers();
            playSuccessSound();
            showToast?.('Pantalla de anotación limpia', 'success');
        });
    }, [syncLayers, showToast, withHistory]);

    const addDrawingLayer = useCallback(async () => {
        showToast?.('Modo de trazo vectorial activo', 'info');
    }, [showToast]);

    const loadImage = useCallback((url: string) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        fabric.Image.fromURL(url, (img) => {
            const { width, height } = getViewportSize();
            img.scaleToWidth(width * 0.5);
            img.set({ left: width * 0.25, top: height * 0.25 });
            const imgAny = img as any;
            imgAny.id = 'img_' + Date.now();
            imgAny.layerType = 'image';
            imgAny.name = 'Imagen Importada';
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            syncLayers();
        });
    }, [syncLayers]);

    const exportAs = useCallback(async (options?: ExportOptions) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        return exportCanvas(canvas, options ?? { format: 'png', scale: 2 });
    }, []);

    return {
        currentTool,
        selectTool,
        pointerPos,
        brushColor,
        brushSize,
        isHighlightMode,
        setBrushColor,
        setBrushSize,
        setHighlightMode,
        loadImage,
        undo: historyUndo,
        redo: historyRedo,
        historyEntries,
        exportAs,
        clearCanvas,
        addDrawingLayer,
    };
}