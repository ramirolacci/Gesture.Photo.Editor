import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { fabric } from 'fabric';
import { playSelectSound, playSuccessSound, playToggleSound } from '../utils/audioFeedback';
import { useProjectHistory } from './useProjectHistory';
import { serializeProject, deserializeProject, validateProjectJSON } from '../utils/projectSerializer';
import { exportCanvas, ExportOptions } from '../utils/canvasExporter';
import { applyPipelineToImage } from '../utils/filterEngine';
import { FilterState } from '../types/filterTypes';

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

export type FilterType = 'grayscale' | 'invert' | 'blur' | 'brightness_up' | 'brightness_down' | 'contrast_up' | 'contrast_down';

export interface LayerInfo {
    id: string;
    name: string;
    type: 'drawing' | 'image' | 'text' | 'shape';
    visible: boolean;
    opacity: number;
    active: boolean;
}

const AUTOSAVE_KEY = 'gesture_editor_autosave';
const PROJECT_NAME_KEY = 'gesture_editor_project_name';

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

    // Sensitivity and calibration settings
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
        pinchSensitivity = 0.05,
        swipeSensitivity = 0.15,
        minPinchDistance = 0.08,
        maxPinchDistance = 0.45,
        virtualPointerPos = null,
    } = options;

    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isMouseDrawingRef = useRef(false);

    // Tool state
    const [currentTool, setCurrentTool] = useState<EditorAction>('SELECT_BRUSH');
    const currentToolRef = useRef<EditorAction>('SELECT_BRUSH');

    // Brush properties
    const [brushColor, setBrushColorState] = useState('#4f46e5');
    const brushColorRef = useRef('#4f46e5');
    const [brushSize, setBrushSizeState] = useState(5);
    const brushSizeRef = useRef(5);

    // Layers state
    const [layers, setLayers] = useState<LayerInfo[]>([]);
    const [activeObjectProperties, setActiveObjectProperties] = useState<any>(null);

    // Project name
    const [projectName, setProjectName] = useState<string>(() =>
        localStorage.getItem(PROJECT_NAME_KEY) ?? 'Mi Proyecto'
    );
    const projectNameRef = useRef(projectName);
    useEffect(() => { projectNameRef.current = projectName; }, [projectName]);

    // Auto-save state
    const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);

    // Pointer / cursor state
    const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

    // RAF smoothing refs
    const targetPosRef = useRef<{ x: number; y: number } | null>(null);
    const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    const virtualPointerPosRef = useRef<{ x: number; y: number } | null>(virtualPointerPos);

    // Gesture drawing flags
    const isPinchingRef = useRef(false);
    const wasPinchingRef = useRef(false);
    const isEraserRef = useRef(false);

    // Drawing tracking
    const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
    const activeDrawingShapeRef = useRef<{ shape: fabric.Object; startPt: { x: number; y: number } } | null>(null);
    const grabOffsetRef = useRef<{ x: number; y: number } | null>(null);

    // Hands ref readable in RAF loop
    const handsRef = useRef<HandLandmarks[]>([]);

    // Gesture trackers
    const wasThumbsUpRef = useRef(false);
    const positionHistoryRef = useRef<{ y: number; timestamp: number }[]>([]);
    const lastSwipeTimeRef = useRef(0);

    // Two-hand gestural manipulation refs
    const initialTwoHandDistRef = useRef<number | null>(null);
    const initialTwoHandAngleRef = useRef<number | null>(null);
    const initialObjScaleRef = useRef<{ x: number; y: number } | null>(null);
    const initialObjAngleRef = useRef<number | null>(null);
    const lastPinchTimeRef = useRef<number>(0);

    // ─── Layer sync ───────────────────────────────────────────────────────────

    const syncLayers = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const objects = canvas.getObjects();
        const activeObject = canvas.getActiveObject();

        const layersList: LayerInfo[] = objects.map((obj) => {
            const objAny = obj as any;
            if (!objAny.id) {
                objAny.id = 'layer_' + Math.random().toString(36).substring(2, 9);
            }
            if (!objAny.layerType) {
                let lType: 'drawing' | 'image' | 'text' | 'shape' = 'shape';
                if (obj.type === 'path' || objAny.hiddenCanvas) lType = 'drawing';
                else if (obj.type === 'image') lType = 'image';
                else if (obj.type === 'i-text' || obj.type === 'text') lType = 'text';
                objAny.layerType = lType;
            }
            if (!objAny.name) {
                const type = objAny.layerType;
                const idx = objects.indexOf(obj) + 1;
                objAny.name = `${type === 'drawing' ? 'Dibujo' : type === 'image' ? 'Imagen' : type === 'text' ? 'Texto' : 'Forma'} ${idx}`;
            }

            return {
                id: objAny.id,
                name: objAny.name,
                type: objAny.layerType,
                visible: obj.visible !== false,
                opacity: obj.opacity !== undefined ? obj.opacity : 1,
                active: activeObject === obj ||
                    (activeObject && (activeObject as any)._objects && (activeObject as any).contains(obj)),
            };
        });

        setLayers([...layersList].reverse());
    }, []);

    const updateActiveProperties = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        const active = canvas?.getActiveObject();
        if (!active) {
            setActiveObjectProperties(null);
            return;
        }

        let shadowProps = null;
        if (active.shadow && typeof active.shadow === 'object') {
            const sh = active.shadow as fabric.Shadow;
            shadowProps = {
                color: sh.color || 'rgba(0,0,0,0.3)',
                blur: sh.blur || 10,
                offsetX: sh.offsetX || 5,
                offsetY: sh.offsetY || 5
            };
        }

        let isGrad = false;
        let gradColor1 = '#4f46e5';
        let gradColor2 = '#10b981';
        if (active.fill && typeof active.fill === 'object' && (active.fill as any).type === 'linear') {
            isGrad = true;
            const stops = (active.fill as any).colorStops || [];
            if (stops.length >= 2) {
                gradColor1 = stops[0].color;
                gradColor2 = stops[1].color;
            }
        }

        const a = active as any;
        setActiveObjectProperties({
            id: a.id,
            type: a.layerType || active.type,
            fontFamily: a.fontFamily || 'Arial',
            fontSize: a.fontSize || 24,
            fill: typeof active.fill === 'string' ? active.fill : gradColor1,
            isGradient: isGrad,
            gradientColor2: gradColor2,
            fontWeight: a.fontWeight || 'normal',
            fontStyle: a.fontStyle || 'normal',
            underline: a.underline || false,
            textAlign: a.textAlign || 'left',
            stroke: a.stroke || '#000000',
            strokeWidth: a.strokeWidth || 0,
            shadow: shadowProps,
            angle: Math.round(a.angle || 0),
            opacity: a.opacity !== undefined ? a.opacity : 1,
        });
    }, []);

    // ─── History ──────────────────────────────────────────────────────────────

    const onRestored = useCallback((activeLayerId: string | null) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        if (activeLayerId) {
            const obj = canvas.getObjects().find((o) => (o as any).id === activeLayerId);
            if (obj) canvas.setActiveObject(obj);
        }
        canvas.requestRenderAll();
        syncLayers();
    }, [syncLayers]);

    const {
        pushSnapshot,
        commitHead,
        undo: historyUndo,
        redo: historyRedo,
        clearHistory,
        canUndo,
        canRedo,
        historyEntries,
    } = useProjectHistory(fabricCanvasRef as React.RefObject<fabric.Canvas | null>, onRestored);

    // Helper: wrap destructive operations with snapshot
    const withHistory = useCallback(async <T>(
        description: string,
        fn: () => T | Promise<T>
    ): Promise<T> => {
        pushSnapshot(description);
        const result = await fn();
        commitHead();
        return result;
    }, [pushSnapshot, commitHead]);

    // ─── Brush helpers ────────────────────────────────────────────────────────

    const setBrushColor = useCallback((color: string) => {
        setBrushColorState(color);
        brushColorRef.current = color;
    }, []);

    const setBrushSize = useCallback((size: number) => {
        const clamped = Math.min(50, Math.max(1, size));
        setBrushSizeState(clamped);
        brushSizeRef.current = clamped;
    }, []);

    const selectTool = useCallback((tool: EditorAction) => {
        setCurrentTool(tool);
        currentToolRef.current = tool;

        const canvas = fabricCanvasRef.current;
        if (canvas) {
            if (tool !== 'SELECT_MOVE') {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
            }
            canvas.getObjects().forEach((obj) => {
                obj.selectable = tool === 'SELECT_MOVE';
                obj.hoverCursor = tool === 'SELECT_MOVE' ? 'move' : 'crosshair';
            });
            canvas.requestRenderAll();
            syncLayers();
        }

        playSelectSound();
        const toolLabels: Record<EditorAction, string> = {
            SELECT_BRUSH: 'Pincel',
            SELECT_ERASER: 'Borrador',
            SELECT_MOVE: 'Mover y Gráficos',
            SELECT_ZOOM: 'Zoom',
            PAN_CANVAS: 'Desplazar',
            APPLY_FILTER: 'Filtro',
            DRAW_RECT: 'Rectángulo',
            DRAW_CIRCLE: 'Círculo / Elipse',
            DRAW_LINE: 'Línea',
            DRAW_TRIANGLE: 'Triángulo',
            DRAW_STAR: 'Estrella',
            DRAW_POLYGON: 'Polígono',
            UNDO: 'Deshacer',
            REDO: 'Rehacer',
            NONE: 'Inactivo',
        };
        showToast?.(`Herramienta activa: ${toolLabels[tool] || tool}`, 'info');
        if (onActionCompleted) onActionCompleted(tool);
    }, [onActionCompleted, syncLayers, showToast]);

    // ─── Canvas initialization ─────────────────────────────────────────────────

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvasEl = canvasRef.current;
        const { width, height } = getViewportSize();

        const canvas = new fabric.Canvas(canvasEl, {
            width,
            height,
            backgroundColor: 'transparent',
            selection: true,
        });

        fabricCanvasRef.current = canvas;

        // Default drawing layer
        const hiddenCanvas = document.createElement('canvas');
        hiddenCanvas.width = width;
        hiddenCanvas.height = height;
        const hiddenCtx = hiddenCanvas.getContext('2d')!;
        hiddenCtx.fillStyle = 'rgba(0,0,0,0)';
        hiddenCtx.fillRect(0, 0, width, height);

        const img = new fabric.Image(hiddenCanvas, {
            left: 0, top: 0, selectable: true, hasControls: true,
        });
        const imgAny = img as any;
        imgAny.id = 'layer_' + Date.now();
        imgAny.name = 'Capa Base (Dibujo)';
        imgAny.layerType = 'drawing';
        imgAny.hiddenCanvas = hiddenCanvas;
        imgAny.hiddenCtx = hiddenCtx;

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        syncLayers();

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

    // ─── Auto-save every 5 minutes ────────────────────────────────────────────

    useEffect(() => {
        const interval = setInterval(() => {
            const canvas = fabricCanvasRef.current;
            if (!canvas || canvas.getObjects().length === 0) return;
            try {
                const project = serializeProject(canvas, projectNameRef.current);
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
                localStorage.setItem(PROJECT_NAME_KEY, projectNameRef.current);
                setLastAutoSave(new Date());
            } catch (e) {
                console.warn('Auto-save failed:', e);
            }
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    // ─── Keyboard shortcuts ───────────────────────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            const key = e.key.toLowerCase();
            const isCtrl = e.ctrlKey || e.metaKey;

            if (key === 'b') {
                e.preventDefault();
                selectTool('SELECT_BRUSH');
            } else if (key === 'e') {
                e.preventDefault();
                selectTool('SELECT_ERASER');
            } else if (isCtrl && key === 'z') {
                e.preventDefault();
                if (canUndo) {
                    historyUndo().then(() => {
                        playToggleSound(false);
                        showToast?.('↩ Deshacer aplicado (Ctrl+Z)', 'info');
                    });
                } else {
                    showToast?.('No hay más acciones para deshacer', 'info');
                }
            } else if (isCtrl && (key === 'y' || (e.shiftKey && key === 'z'))) {
                e.preventDefault();
                if (canRedo) {
                    historyRedo().then(() => {
                        playToggleSound(true);
                        showToast?.('↪ Rehacer aplicado (Ctrl+Y)', 'info');
                    });
                } else {
                    showToast?.('No hay más acciones para rehacer', 'info');
                }
            } else if (isCtrl && key === 's') {
                e.preventDefault();
                const canvas = fabricCanvasRef.current;
                if (canvas) {
                    const active = canvas.getActiveObject();
                    canvas.discardActiveObject();
                    canvas.requestRenderAll();
                    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
                    if (active) { canvas.setActiveObject(active); canvas.requestRenderAll(); }
                    const link = document.createElement('a');
                    link.download = `${projectNameRef.current}.png`;
                    link.href = dataUrl;
                    link.click();
                    playSuccessSound();
                    showToast?.('Imagen exportada como PNG (Ctrl+S)', 'success');
                }
            } else if (e.code === 'Space') {
                e.preventDefault();
                onToggleGesturePause?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectTool, syncLayers, showToast, onToggleGesturePause, canUndo, canRedo, historyUndo, historyRedo]);

    // ─── Mouse event handlers ─────────────────────────────────────────────────

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const onMouseDown = (opt: fabric.IEvent) => {
            const pointer = canvas.getPointer(opt.e);
            const tool = currentToolRef.current;
            const activeObj = canvas.getActiveObject();

            if (tool === 'SELECT_BRUSH' || tool === 'SELECT_ERASER') {
                if (activeObj && (activeObj as any).layerType === 'drawing') {
                    // Snapshot before drawing stroke begins
                    pushSnapshot(tool === 'SELECT_ERASER' ? 'Borrador aplicado' : 'Pincelada');
                    isMouseDrawingRef.current = true;
                    const hiddenCtx = (activeObj as any).hiddenCtx;
                    if (hiddenCtx) {
                        const matrix = activeObj.calcTransformMatrix();
                        const invertMatrix = fabric.util.invertTransform(matrix);
                        const localPt = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), invertMatrix);
                        const drawX = localPt.x + activeObj.width! / 2;
                        const drawY = localPt.y + activeObj.height! / 2;

                        if (tool === 'SELECT_ERASER') {
                            hiddenCtx.globalCompositeOperation = 'destination-out';
                            hiddenCtx.lineWidth = brushSizeRef.current * 4;
                        } else {
                            hiddenCtx.globalCompositeOperation = 'source-over';
                            hiddenCtx.strokeStyle = brushColorRef.current;
                            hiddenCtx.lineWidth = brushSizeRef.current;
                        }
                        hiddenCtx.lineCap = 'round';
                        hiddenCtx.lineJoin = 'round';
                        hiddenCtx.beginPath();
                        hiddenCtx.moveTo(drawX, drawY);
                        lastDrawPosRef.current = { x: drawX, y: drawY };
                    }
                }
            } else if (['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE', 'DRAW_TRIANGLE', 'DRAW_STAR', 'DRAW_POLYGON'].includes(tool)) {
                const shapeNameMap: Record<string, string> = {
                    DRAW_RECT: 'Rectángulo',
                    DRAW_CIRCLE: 'Círculo',
                    DRAW_LINE: 'Línea',
                    DRAW_TRIANGLE: 'Triángulo',
                    DRAW_STAR: 'Estrella',
                    DRAW_POLYGON: 'Polígono'
                };
                pushSnapshot(`Nueva forma: ${shapeNameMap[tool] || 'Forma'}`);
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
                shapeAny.id = 'layer_' + Date.now();
                shapeAny.layerType = 'shape';
                shapeAny.name = `${shapeNameMap[tool]} ${nameSuffix}`;

                canvas.add(shape);
                activeDrawingShapeRef.current = { shape, startPt };
                canvas.setActiveObject(shape);
                canvas.requestRenderAll();
            }
        };

        const onMouseMove = (opt: fabric.IEvent) => {
            const pointer = canvas.getPointer(opt.e);
            const tool = currentToolRef.current;
            const activeObj = canvas.getActiveObject();

            if (isMouseDrawingRef.current) {
                if ((tool === 'SELECT_BRUSH' || tool === 'SELECT_ERASER') && lastDrawPosRef.current) {
                    if (activeObj && (activeObj as any).layerType === 'drawing') {
                        const hiddenCtx = (activeObj as any).hiddenCtx;
                        if (hiddenCtx) {
                            const matrix = activeObj.calcTransformMatrix();
                            const invertMatrix = fabric.util.invertTransform(matrix);
                            const localPt = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), invertMatrix);
                            const drawX = localPt.x + activeObj.width! / 2;
                            const drawY = localPt.y + activeObj.height! / 2;

                            hiddenCtx.lineTo(drawX, drawY);
                            hiddenCtx.stroke();
                            hiddenCtx.beginPath();
                            hiddenCtx.moveTo(drawX, drawY);
                            lastDrawPosRef.current = { x: drawX, y: drawY };
                            (activeObj as any).setElement((activeObj as any).hiddenCanvas);
                            canvas.requestRenderAll();
                        }
                    }
                } else if (['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE', 'DRAW_TRIANGLE', 'DRAW_STAR', 'DRAW_POLYGON'].includes(tool) && activeDrawingShapeRef.current) {
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
                    } else if (tool === 'DRAW_TRIANGLE') {
                        shape.set({ width: Math.abs(dx), height: Math.abs(dy), left: dx < 0 ? pointer.x : startPt.x, top: dy < 0 ? pointer.y : startPt.y });
                    } else if (tool === 'DRAW_STAR') {
                        const pts = createStarPoints(0, 0, 5, dist * 0.4, dist);
                        (shape as fabric.Polygon).set({
                            points: pts,
                            left: startPt.x - dist,
                            top: startPt.y - dist,
                            width: dist * 2,
                            height: dist * 2
                        } as any);
                    } else if (tool === 'DRAW_POLYGON') {
                        const pts = createRegularPolygonPoints(0, 0, 6, dist);
                        (shape as fabric.Polygon).set({
                            points: pts,
                            left: startPt.x - dist,
                            top: startPt.y - dist,
                            width: dist * 2,
                            height: dist * 2
                        } as any);
                    }
                    canvas.requestRenderAll();
                }
            }
        };

        const onMouseUp = () => {
            if (isMouseDrawingRef.current) {
                commitHead(); // Record post-stroke state for redo
            }
            isMouseDrawingRef.current = false;
            lastDrawPosRef.current = null;
            activeDrawingShapeRef.current = null;
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

    // ─── Hand tracking → RAF flags ────────────────────────────────────────────

    useEffect(() => {
        virtualPointerPosRef.current = virtualPointerPos;
    }, [virtualPointerPos]);

    useEffect(() => {
        handsRef.current = hands;

        if (isGesturePaused) {
            targetPosRef.current = null;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        if (virtualPointerPosRef.current) {
            targetPosRef.current = { ...virtualPointerPosRef.current };
            return;
        }

        if (hands.length === 0 || gestures.length === 0) {
            targetPosRef.current = null;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        const hand = hands[0];
        const gesture = gestures.find((g) => g.hand === hand.handedness) || gestures[0];
        const indexTip = hand.landmarks[8];
        const thumbTip = hand.landmarks[4];

        if (!indexTip) {
            targetPosRef.current = null;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        const canvas = fabricCanvasRef.current;
        if (canvas) {
            targetPosRef.current = {
                x: (1 - indexTip.x) * canvas.width!,
                y: indexTip.y * canvas.height!,
            };
        }

        let localIsPinching = false;
        if (thumbTip) {
            const dx = thumbTip.x - indexTip.x;
            const dy = thumbTip.y - indexTip.y;
            const dz = thumbTip.z - indexTip.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            localIsPinching = dist < pinchSensitivity;
        } else {
            localIsPinching = gesture.type === 'PINCH';
        }

        isPinchingRef.current = localIsPinching;
        isEraserRef.current = gesture.type === 'PEACE';
    }, [hands, gestures, isGesturePaused, pinchSensitivity, virtualPointerPos]);

    // ─── Gesture actions (Thumbs Up / Swipe / Opacity) ────────────────────────

    useEffect(() => {
        if (isGesturePaused) return;

        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // Thumbs Up → toggle visibility
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
                    showToast?.(`👍 Capa "${(activeObj as any).name}" ${newVisible ? 'visible' : 'oculta'}`, 'info');
                });
            }
        }
        wasThumbsUpRef.current = hasThumbsUp;

        // Swipe vertical → reorder layer
        if (hands.length > 0) {
            const hand = hands[0];
            const indexTip = hand.landmarks[8];
            if (indexTip) {
                const now = Date.now();
                positionHistoryRef.current.push({ y: indexTip.y, timestamp: now });
                positionHistoryRef.current = positionHistoryRef.current.filter((p) => now - p.timestamp < 300);

                if (positionHistoryRef.current.length > 3 && now - lastSwipeTimeRef.current > 1000) {
                    const first = positionHistoryRef.current[0];
                    const last = positionHistoryRef.current[positionHistoryRef.current.length - 1];
                    const deltaY = last.y - first.y;
                    const timeDiff = last.timestamp - first.timestamp;

                    if (timeDiff > 50 && Math.abs(deltaY) > swipeSensitivity) {
                        const activeObj = canvas.getActiveObject();
                        if (activeObj) {
                            const direction = deltaY < 0 ? 'arriba' : 'abajo';
                            withHistory(`Mover capa ${direction}: "${(activeObj as any).name}"`, () => {
                                if (deltaY < 0) canvas.bringForward(activeObj);
                                else canvas.sendBackwards(activeObj);
                                canvas.requestRenderAll();
                                syncLayers();
                                playSelectSound();
                                showToast?.(`↕️ Capa "${(activeObj as any).name}" movida ${direction}`, 'info');
                            });
                            lastSwipeTimeRef.current = now;
                            positionHistoryRef.current = [];
                        }
                    }
                }
            }
        } else {
            positionHistoryRef.current = [];
        }

        // Two-hand pinch → opacity
        if (hands.length >= 2) {
            const hand0Pinch = gestures.some((g) => g.hand === hands[0].handedness && g.type === 'PINCH');
            const hand1Pinch = gestures.some((g) => g.hand === hands[1].handedness && g.type === 'PINCH');

            if (hand0Pinch && hand1Pinch) {
                const p0 = hands[0].landmarks[8];
                const p1 = hands[1].landmarks[8];
                if (p0 && p1) {
                    const dx = p1.x - p0.x;
                    const dy = p1.y - p0.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const opacity = Math.min(1, Math.max(0, (dist - minPinchDistance) / (maxPinchDistance - minPinchDistance)));

                    const activeObj = canvas.getActiveObject();
                    if (activeObj) {
                        activeObj.set('opacity', Number(opacity.toFixed(2)));
                        canvas.requestRenderAll();
                        syncLayers();
                    }
                }
            }
        }
    }, [hands, gestures, isGesturePaused, syncLayers, swipeSensitivity, minPinchDistance, maxPinchDistance, showToast, withHistory]);

    // ─── RAF drawing loop ─────────────────────────────────────────────────────

    useEffect(() => {
        const LERP = 0.15;
        const BRUSH_SIZE_LERP = 0.08;
        let smoothedBrushSize = brushSizeRef.current;

        const loop = () => {
            const canvas = fabricCanvasRef.current;
            const target = virtualPointerPosRef.current ?? targetPosRef.current;

            if (!canvas) {
                animationFrameIdRef.current = requestAnimationFrame(loop);
                return;
            }

            const currentHands = handsRef.current;
            const activeObj = canvas.getActiveObject();

            // Two-hand gestural rotation and scaling
            if (!isGesturePaused && currentHands.length >= 2 && activeObj) {
                const hand0Pinch = gestures.some(g => g.hand === currentHands[0].handedness && g.type === 'PINCH');
                const hand1Pinch = gestures.some(g => g.hand === currentHands[1].handedness && g.type === 'PINCH');

                if (hand0Pinch && hand1Pinch) {
                    const p0 = currentHands[0].landmarks[8];
                    const p1 = currentHands[1].landmarks[8];
                    if (p0 && p1) {
                        const dx = p1.x - p0.x;
                        const dy = p1.y - p0.y;
                        const currentDist = Math.sqrt(dx * dx + dy * dy);
                        const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);

                        if (initialTwoHandDistRef.current === null || initialTwoHandAngleRef.current === null) {
                            initialTwoHandDistRef.current = currentDist;
                            initialTwoHandAngleRef.current = currentAngle;
                            initialObjScaleRef.current = { x: activeObj.scaleX || 1, y: activeObj.scaleY || 1 };
                            initialObjAngleRef.current = activeObj.angle || 0;
                            pushSnapshot(`Rotar/Escalar: "${(activeObj as any).name}"`);
                        } else {
                            const angleDiff = currentAngle - initialTwoHandAngleRef.current!;
                            const scaleRatio = currentDist / initialTwoHandDistRef.current!;

                            activeObj.set({
                                angle: (initialObjAngleRef.current! + angleDiff) % 360,
                                scaleX: initialObjScaleRef.current!.x * scaleRatio,
                                scaleY: initialObjScaleRef.current!.y * scaleRatio
                            });
                            canvas.requestRenderAll();
                            syncLayers();
                        }
                    }
                } else {
                    if (initialTwoHandDistRef.current !== null) commitHead();
                    initialTwoHandDistRef.current = null;
                    initialTwoHandAngleRef.current = null;
                    initialObjScaleRef.current = null;
                    initialObjAngleRef.current = null;
                }
            } else {
                if (initialTwoHandDistRef.current !== null) commitHead();
                initialTwoHandDistRef.current = null;
                initialTwoHandAngleRef.current = null;
                initialObjScaleRef.current = null;
                initialObjAngleRef.current = null;
            }

            // Brush size mapping from wrist distance if not pinching with both hands:
            if (!isGesturePaused && currentHands.length >= 2 && !activeObj) {
                const isBothPinching =
                    gestures.length >= 2 &&
                    gestures.some(g => g.hand === currentHands[0].handedness && g.type === 'PINCH') &&
                    gestures.some(g => g.hand === currentHands[1].handedness && g.type === 'PINCH');

                if (!isBothPinching) {
                    const w0 = currentHands[0].landmarks[0];
                    const w1 = currentHands[1].landmarks[0];
                    if (w0 && w1) {
                        const dist = Math.sqrt((w0.x - w1.x) ** 2 + (w0.y - w1.y) ** 2);
                        const mapped = 1 + ((dist - 0.05) / (0.8 - 0.05)) * 49;
                        const targetSize = Math.min(50, Math.max(1, mapped));
                        smoothedBrushSize += (targetSize - smoothedBrushSize) * BRUSH_SIZE_LERP;
                        const rounded = Math.round(smoothedBrushSize);
                        if (rounded !== brushSizeRef.current) setBrushSize(rounded);
                    }
                }
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
                const tool = currentToolRef.current;
                const isPinching = isPinchingRef.current;
                const isErasing = isEraserRef.current;
                const activeObj = canvas.getActiveObject();

                if (tool === 'SELECT_BRUSH' || tool === 'SELECT_ERASER') {
                    const mode = isPinching ? 'brush' : isErasing ? 'eraser' : 'none';
                    if (mode !== 'none') {
                        if (activeObj && (activeObj as any).layerType === 'drawing') {
                            const hiddenCtx = (activeObj as any).hiddenCtx;
                            if (hiddenCtx) {
                                const matrix = activeObj.calcTransformMatrix();
                                const invertMatrix = fabric.util.invertTransform(matrix);
                                const localPt = fabric.util.transformPoint(new fabric.Point(pos.x, pos.y), invertMatrix);
                                const drawX = localPt.x + activeObj.width! / 2;
                                const drawY = localPt.y + activeObj.height! / 2;

                                if (mode === 'eraser') {
                                    hiddenCtx.globalCompositeOperation = 'destination-out';
                                    hiddenCtx.lineWidth = brushSizeRef.current * 4;
                                } else {
                                    hiddenCtx.globalCompositeOperation = 'source-over';
                                    hiddenCtx.strokeStyle = brushColorRef.current;
                                    hiddenCtx.lineWidth = brushSizeRef.current;
                                }
                                hiddenCtx.lineCap = 'round';
                                hiddenCtx.lineJoin = 'round';

                                if (!lastDrawPosRef.current) {
                                    // First contact – take snapshot
                                    if (!wasPinchingRef.current) pushSnapshot(mode === 'eraser' ? 'Borrador (gesto)' : 'Pincelada (gesto)');
                                    hiddenCtx.beginPath();
                                    hiddenCtx.moveTo(drawX, drawY);
                                } else {
                                    hiddenCtx.lineTo(drawX, drawY);
                                    hiddenCtx.stroke();
                                    hiddenCtx.beginPath();
                                    hiddenCtx.moveTo(drawX, drawY);
                                }
                                lastDrawPosRef.current = { x: drawX, y: drawY };
                                (activeObj as any).setElement((activeObj as any).hiddenCanvas);
                                canvas.requestRenderAll();
                            }
                        }
                    } else {
                        if (wasPinchingRef.current) commitHead();
                        lastDrawPosRef.current = null;
                    }
                } else if (['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE', 'DRAW_TRIANGLE', 'DRAW_STAR', 'DRAW_POLYGON'].includes(tool)) {
                    if (isPinching) {
                        if (!wasPinchingRef.current) {
                            const nameSuffix = canvas.getObjects().length + 1;
                            const shapeNameMap: Record<string, string> = {
                                DRAW_RECT: 'Rectángulo',
                                DRAW_CIRCLE: 'Círculo',
                                DRAW_LINE: 'Línea',
                                DRAW_TRIANGLE: 'Triángulo',
                                DRAW_STAR: 'Estrella',
                                DRAW_POLYGON: 'Polígono'
                            };
                            pushSnapshot(`Nueva forma gestual: ${shapeNameMap[tool]}`);
                            let shape: fabric.Object;
                            const baseOptions = {
                                left: pos.x,
                                top: pos.y,
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
                                shape = new fabric.Line([pos.x, pos.y, pos.x, pos.y], {
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
                            shapeAny.id = 'layer_' + Date.now();
                            shapeAny.layerType = 'shape';
                            shapeAny.name = `${shapeNameMap[tool]} ${nameSuffix}`;

                            canvas.add(shape);
                            canvas.setActiveObject(shape);
                            activeDrawingShapeRef.current = { shape, startPt: { ...pos } };
                            canvas.requestRenderAll();
                        } else if (activeDrawingShapeRef.current) {
                            const { shape, startPt } = activeDrawingShapeRef.current;
                            const dx = pos.x - startPt.x;
                            const dy = pos.y - startPt.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);

                            if (tool === 'DRAW_RECT') {
                                shape.set({ width: Math.abs(dx), height: Math.abs(dy), left: dx < 0 ? pos.x : startPt.x, top: dy < 0 ? pos.y : startPt.y });
                            } else if (tool === 'DRAW_CIRCLE') {
                                (shape as fabric.Ellipse).set({
                                    rx: dist,
                                    ry: dist,
                                    left: startPt.x - dist,
                                    top: startPt.y - dist
                                });
                            } else if (tool === 'DRAW_LINE') {
                                (shape as fabric.Line).set({ x2: pos.x, y2: pos.y });
                            } else if (tool === 'DRAW_TRIANGLE') {
                                shape.set({ width: Math.abs(dx), height: Math.abs(dy), left: dx < 0 ? pos.x : startPt.x, top: dy < 0 ? pos.y : startPt.y });
                            } else if (tool === 'DRAW_STAR') {
                                const pts = createStarPoints(0, 0, 5, dist * 0.4, dist);
                                (shape as fabric.Polygon).set({
                                    points: pts,
                                    left: startPt.x - dist,
                                    top: startPt.y - dist,
                                    width: dist * 2,
                                    height: dist * 2
                                } as any);
                            } else if (tool === 'DRAW_POLYGON') {
                                const pts = createRegularPolygonPoints(0, 0, 6, dist);
                                (shape as fabric.Polygon).set({
                                    points: pts,
                                    left: startPt.x - dist,
                                    top: startPt.y - dist,
                                    width: dist * 2,
                                    height: dist * 2
                                } as any);
                            }
                            canvas.requestRenderAll();
                        }
                    } else if (wasPinchingRef.current) {
                        activeDrawingShapeRef.current = null;
                        commitHead();
                        syncLayers();
                    }
                } else if (tool === 'SELECT_MOVE') {
                    if (isPinching) {
                        if (!wasPinchingRef.current) {
                            const now = Date.now();
                            if (now - lastPinchTimeRef.current < 450) {
                                if (activeObj && (activeObj as any).layerType === 'text') {
                                    (activeObj as any).enterEditing();
                                    canvas.requestRenderAll();
                                    showToast?.('⌨️ Editando texto (Doble Pinch)', 'info');
                                    lastPinchTimeRef.current = 0;
                                    return;
                                }
                            }
                            lastPinchTimeRef.current = now;

                            const pointer = new fabric.Point(pos.x, pos.y);
                            const objects = canvas.getObjects();
                            let found: fabric.Object | null = null;
                            for (let i = objects.length - 1; i >= 0; i--) {
                                if (objects[i].visible && objects[i].containsPoint(pointer)) { found = objects[i]; break; }
                            }
                            if (found) {
                                canvas.setActiveObject(found);
                                canvas.requestRenderAll();
                                grabOffsetRef.current = { x: found.left! - pos.x, y: found.top! - pos.y };
                                pushSnapshot(`Mover objeto: "${(found as any).name}"`);
                            }
                        } else if (activeObj && grabOffsetRef.current) {
                            activeObj.set({ left: pos.x + grabOffsetRef.current.x, top: pos.y + grabOffsetRef.current.y });
                            canvas.requestRenderAll();
                        }
                    } else if (wasPinchingRef.current) {
                        grabOffsetRef.current = null;
                        commitHead();
                        syncLayers();
                    }
                }

                wasPinchingRef.current = isPinching;
            } else {
                smoothedPosRef.current = null;
                if (wasPinchingRef.current) { commitHead(); lastDrawPosRef.current = null; }
                wasPinchingRef.current = false;
                lastDrawPosRef.current = null;
                activeDrawingShapeRef.current = null;
                grabOffsetRef.current = null;
                setPointerPos(null);
            }

            animationFrameIdRef.current = requestAnimationFrame(loop);
        };

        animationFrameIdRef.current = requestAnimationFrame(loop);
        return () => { if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current); };
    }, [isGesturePaused, gestures, setBrushSize, pushSnapshot, commitHead, syncLayers]);

    // ─── Layer operations ─────────────────────────────────────────────────────

    const addDrawingLayer = useCallback(async () => {
        await withHistory('Agregar capa de dibujo', () => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            const { width, height } = getViewportSize();
            const hiddenCanvas = document.createElement('canvas');
            hiddenCanvas.width = width; hiddenCanvas.height = height;
            const hiddenCtx = hiddenCanvas.getContext('2d')!;
            hiddenCtx.fillStyle = 'rgba(0,0,0,0)';
            hiddenCtx.fillRect(0, 0, width, height);

            const img = new fabric.Image(hiddenCanvas, { left: 0, top: 0, selectable: true, hasControls: true });
            const imgAny = img as any;
            imgAny.id = 'layer_' + Date.now();
            imgAny.name = 'Capa Dibujo ' + (canvas.getObjects().length + 1);
            imgAny.layerType = 'drawing';
            imgAny.hiddenCanvas = hiddenCanvas;
            imgAny.hiddenCtx = hiddenCtx;

            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            syncLayers();
            playSuccessSound();
            showToast?.('🖌️ Nueva capa de dibujo creada', 'success');
        });
    }, [withHistory, syncLayers, showToast]);

    const addImageLayer = useCallback(async (imageUrl: string, name?: string) => {
        await withHistory(`Agregar imagen: "${name ?? 'Imagen'}"`, () => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            fabric.Image.fromURL(imageUrl, (img) => {
                const scaleX = canvas.width! / img.width!;
                const scaleY = canvas.height! / img.height!;
                const scale = Math.min(scaleX, scaleY, 0.8);
                img.set({ left: (canvas.width! - img.width! * scale) / 2, top: (canvas.height! - img.height! * scale) / 2, scaleX: scale, scaleY: scale, selectable: true, hasControls: true });
                const imgAny = img as any;
                imgAny.id = 'layer_' + Date.now();
                imgAny.name = name ?? 'Imagen ' + (canvas.getObjects().length + 1);
                imgAny.layerType = 'image';
                canvas.add(img);
                canvas.setActiveObject(img);
                canvas.requestRenderAll();
                syncLayers();
                playSuccessSound();
                showToast?.(`🖼️ Capa de imagen "${imgAny.name}" agregada`, 'success');
            });
        });
    }, [withHistory, syncLayers, showToast]);

    const addTextLayer = useCallback(async () => {
        await withHistory('Agregar capa de texto', () => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            const text = new fabric.IText('Doble click para editar', {
                left: canvas.width! / 2 - 120, top: canvas.height! / 2 - 20,
                fontSize: 24, fill: brushColorRef.current, selectable: true, hasControls: true,
            } as any);
            const textAny = text as any;
            textAny.id = 'layer_' + Date.now();
            textAny.name = 'Texto ' + (canvas.getObjects().length + 1);
            textAny.layerType = 'text';
            canvas.add(text); canvas.setActiveObject(text); canvas.requestRenderAll();
            syncLayers(); playSuccessSound();
            showToast?.('🔤 Nueva capa de texto agregada', 'success');
        });
    }, [withHistory, syncLayers, showToast]);

    const addShapeLayer = useCallback(async (shapeType: 'rect' | 'circle' | 'line' | 'triangle' | 'star' | 'polygon') => {
        await withHistory(`Agregar forma: ${shapeType}`, () => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            let shapeObj: fabric.Object;
            const nameSuffix = canvas.getObjects().length + 1;
            let name = '';

            const baseOptions = {
                left: canvas.width! / 2 - 50,
                top: canvas.height! / 2 - 50,
                fill: 'transparent',
                stroke: brushColorRef.current,
                strokeWidth: brushSizeRef.current,
                selectable: true,
                hasControls: true,
            };

            if (shapeType === 'rect') {
                shapeObj = new fabric.Rect({ ...baseOptions, width: 100, height: 100 });
                name = 'Rectángulo ' + nameSuffix;
            } else if (shapeType === 'circle') {
                shapeObj = new fabric.Ellipse({ ...baseOptions, rx: 50, ry: 50 } as any);
                name = 'Círculo ' + nameSuffix;
            } else if (shapeType === 'triangle') {
                shapeObj = new fabric.Triangle({ ...baseOptions, width: 100, height: 100 });
                name = 'Triángulo ' + nameSuffix;
            } else if (shapeType === 'star') {
                shapeObj = new fabric.Polygon(createStarPoints(0, 0, 5, 20, 50), baseOptions);
                name = 'Estrella ' + nameSuffix;
            } else if (shapeType === 'polygon') {
                shapeObj = new fabric.Polygon(createRegularPolygonPoints(0, 0, 6, 50), baseOptions);
                name = 'Hexágono ' + nameSuffix;
            } else {
                shapeObj = new fabric.Line([
                    canvas.width! / 2 - 50,
                    canvas.height! / 2,
                    canvas.width! / 2 + 50,
                    canvas.height! / 2
                ], {
                    stroke: brushColorRef.current,
                    strokeWidth: brushSizeRef.current,
                    selectable: true,
                    hasControls: true,
                });
                name = 'Línea ' + nameSuffix;
            }

            const shapeAny = shapeObj as any;
            shapeAny.id = 'layer_' + Date.now();
            shapeAny.name = name;
            shapeAny.layerType = 'shape';

            canvas.add(shapeObj);
            canvas.setActiveObject(shapeObj);
            canvas.requestRenderAll();
            syncLayers();
            playSuccessSound();
            showToast?.(`⏹️ Capa de forma "${name}" agregada`, 'success');
        });
    }, [withHistory, syncLayers, showToast]);

    const setTextStyle = useCallback((property: string, value: any) => {
        const canvas = fabricCanvasRef.current;
        const activeObj = canvas?.getActiveObject();
        if (canvas && activeObj && (activeObj as any).layerType === 'text') {
            activeObj.set(property as any, value);
            canvas.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

    const setShapeStyle = useCallback((property: string, value: any) => {
        const canvas = fabricCanvasRef.current;
        const activeObj = canvas?.getActiveObject();
        if (canvas && activeObj) {
            if (property === 'shadow') {
                if (value) {
                    activeObj.set('shadow', new fabric.Shadow({
                        color: value.color || 'rgba(0,0,0,0.3)',
                        blur: value.blur || 10,
                        offsetX: value.offsetX || 5,
                        offsetY: value.offsetY || 5
                    }));
                } else {
                    activeObj.set('shadow', undefined as any);
                }
            } else if (property === 'gradient') {
                if (value) {
                    const grad = new fabric.Gradient({
                        type: 'linear',
                        coords: {
                            x1: 0,
                            y1: 0,
                            x2: activeObj.width || 100,
                            y2: activeObj.height || 100,
                        },
                        colorStops: [
                            { offset: 0, color: value.color1 },
                            { offset: 1, color: value.color2 }
                        ]
                    });
                    activeObj.set('fill', grad);
                } else {
                    activeObj.set('fill', activeObj.get('stroke') || 'transparent');
                }
            } else {
                activeObj.set(property as any, value);
            }
            canvas.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

    const loadImage = useCallback((imageUrl: string) => {
        addImageLayer(imageUrl, 'Imagen Cargada');
    }, [addImageLayer]);

    const exportImage = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return '';
        const active = canvas.getActiveObject();
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
        if (active) { canvas.setActiveObject(active); canvas.requestRenderAll(); }
        return dataUrl;
    }, []);

    const exportAs = useCallback(async (opts: ExportOptions) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        try {
            await exportCanvas(canvas, opts, projectNameRef.current);
            playSuccessSound();
            const formatLabels: Record<string, string> = { png: 'PNG', jpg: 'JPG', pdf: 'PDF', 'layers-zip': 'ZIP (capas separadas)' };
            showToast?.(`💾 Exportado como ${formatLabels[opts.format] ?? opts.format}`, 'success');
        } catch (e) {
            showToast?.(`Error al exportar: ${e}`, 'warning');
        }
    }, [showToast]);

    const clearCanvas = useCallback(async () => {
        await withHistory('Limpiar canvas', () => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            canvas.clear();
            canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
            syncLayers();
            playToggleSound(false);
            showToast?.('🗑️ Canvas limpiado', 'warning');
        });
    }, [withHistory, syncLayers, showToast]);

    const applyFilter = useCallback(async (filterType: FilterType) => {
        const canvas = fabricCanvasRef.current;
        const activeObj = canvas?.getActiveObject();
        if (!canvas || !activeObj) return;

        if ((activeObj as any).layerType === 'image') {
            await withHistory(`Filtro "${filterType}" aplicado`, () => {
                const img = activeObj as fabric.Image;
                img.filters = img.filters || [];
                let filterInstance: any;
                switch (filterType) {
                    case 'grayscale': filterInstance = new fabric.Image.filters.Grayscale(); break;
                    case 'invert': filterInstance = new fabric.Image.filters.Invert(); break;
                    case 'blur': filterInstance = new fabric.Image.filters.Blur({ blur: 0.25 }); break;
                    case 'brightness_up': filterInstance = new fabric.Image.filters.Brightness({ brightness: 0.1 }); break;
                    case 'brightness_down': filterInstance = new fabric.Image.filters.Brightness({ brightness: -0.1 }); break;
                    case 'contrast_up': filterInstance = new fabric.Image.filters.Contrast({ contrast: 0.15 }); break;
                    case 'contrast_down': filterInstance = new fabric.Image.filters.Contrast({ contrast: -0.15 }); break;
                }
                if (filterInstance) { img.filters.push(filterInstance); img.applyFilters(); canvas.requestRenderAll(); }
                playSuccessSound();
                showToast?.(`✨ Filtro "${filterType}" aplicado`, 'success');
            });
        } else {
            showToast?.('Seleccioná una capa de imagen para aplicar filtros', 'warning');
        }
    }, [withHistory, showToast]);

    // ─── Advanced filter pipeline ──────────────────────────────────────────────

    const applyFilterPipeline = useCallback(async (
        pipeline: FilterState[],
        imageObj?: fabric.Image
    ) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const target = imageObj ?? (canvas.getActiveObject() as fabric.Image | null);
        if (!target) {
            showToast?.('⚠️ Seleccioná una capa de imagen para aplicar filtros', 'warning');
            return;
        }
        if ((target as any).layerType !== 'image') {
            showToast?.('⚠️ Los filtros solo se aplican a capas de imagen', 'warning');
            return;
        }

        await withHistory(`Filtros aplicados (${pipeline.length})`, () => {
            applyPipelineToImage(target, pipeline);
            canvas.requestRenderAll();
            playSuccessSound();
            showToast?.(`✨ ${pipeline.length} filtro${pipeline.length !== 1 ? 's' : ''} aplicado${pipeline.length !== 1 ? 's' : ''}`, 'success');
        });
    }, [withHistory, showToast]);

    const clearFilters = useCallback(async (imageObj?: fabric.Image) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const target = imageObj ?? (canvas.getActiveObject() as fabric.Image | null);
        if (!target || (target as any).layerType !== 'image') return;

        await withHistory('Filtros eliminados', () => {
            target.filters = [];
            target.applyFilters();
            canvas.requestRenderAll();
            showToast?.('🗑️ Filtros eliminados', 'info');
        });
    }, [withHistory, showToast]);

    // Preview without history (for real-time slider feedback)
    const previewFilterPipeline = useCallback((pipeline: FilterState[], imageObj?: fabric.Image) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const target = imageObj ?? (canvas.getActiveObject() as fabric.Image | null);
        if (!target || (target as any).layerType !== 'image') return;
        applyPipelineToImage(target, pipeline);
        canvas.requestRenderAll();
    }, []);

    // ─── Stack operations ─────────────────────────────────────────────────────

    const toggleLayerVisibility = useCallback(async (id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            await withHistory(`Visibilidad: "${(obj as any).name}"`, () => {
                const nv = !obj.visible;
                obj.set('visible', nv);
                canvas?.requestRenderAll();
                syncLayers();
                playToggleSound(nv);
                showToast?.(`👁️ Capa "${(obj as any).name}" ${nv ? 'visible' : 'oculta'}`, 'info');
            });
        }
    }, [withHistory, syncLayers, showToast]);

    const setLayerOpacity = useCallback((id: string, opacity: number) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            obj.set('opacity', opacity / 100);
            canvas?.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

    const selectLayer = useCallback((id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) { canvas?.setActiveObject(obj); canvas?.requestRenderAll(); syncLayers(); }
    }, [syncLayers]);

    const deleteLayer = useCallback(async (id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            const name = (obj as any).name;
            await withHistory(`Eliminar capa: "${name}"`, () => {
                canvas?.remove(obj);
                canvas?.discardActiveObject();
                canvas?.requestRenderAll();
                syncLayers();
                playToggleSound(false);
                showToast?.(`🗑️ Capa "${name}" eliminada`, 'warning');
            });
        }
    }, [withHistory, syncLayers, showToast]);

    const moveLayerUp = useCallback(async (id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            await withHistory(`Subir capa: "${(obj as any).name}"`, () => {
                canvas?.bringForward(obj);
                canvas?.requestRenderAll();
                syncLayers();
                playSelectSound();
            });
        }
    }, [withHistory, syncLayers]);

    const moveLayerDown = useCallback(async (id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            await withHistory(`Bajar capa: "${(obj as any).name}"`, () => {
                canvas?.sendBackwards(obj);
                canvas?.requestRenderAll();
                syncLayers();
                playSelectSound();
            });
        }
    }, [withHistory, syncLayers]);

    const duplicateLayer = useCallback(async (id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            await withHistory(`Duplicar capa: "${(obj as any).name}"`, () => {
                obj.clone((cloned: fabric.Object) => {
                    const clonedAny = cloned as any;
                    cloned.set({ left: (obj.left || 0) + 20, top: (obj.top || 0) + 20, selectable: true, hasControls: true });
                    clonedAny.id = 'layer_' + Date.now();
                    clonedAny.name = ((obj as any).name || 'Capa') + ' (Copia)';
                    clonedAny.layerType = (obj as any).layerType;

                    if ((obj as any).layerType === 'drawing' && (obj as any).hiddenCanvas) {
                        const origCanvas = (obj as any).hiddenCanvas as HTMLCanvasElement;
                        const dupCanvas = document.createElement('canvas');
                        dupCanvas.width = origCanvas.width;
                        dupCanvas.height = origCanvas.height;
                        const dupCtx = dupCanvas.getContext('2d')!;
                        dupCtx.drawImage(origCanvas, 0, 0);
                        clonedAny.hiddenCanvas = dupCanvas;
                        clonedAny.hiddenCtx = dupCtx;
                        clonedAny.setElement(dupCanvas);
                    }

                    canvas?.add(cloned);
                    canvas?.setActiveObject(cloned);
                    canvas?.requestRenderAll();
                    syncLayers();
                    playSuccessSound();
                    showToast?.(`👥 Capa "${clonedAny.name}" duplicada`, 'success');
                });
            });
        }
    }, [withHistory, syncLayers, showToast]);

    const mergeLayerBelow = useCallback(async (id: string) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const objects = canvas.getObjects();
        const idx = objects.findIndex((o) => (o as any).id === id);

        if (idx > 0) {
            await withHistory(`Fusionar: "${(objects[idx] as any).name}" + "${(objects[idx - 1] as any).name}"`, () => {
                const objBelow = objects[idx - 1];
                const objActive = objects[idx];

                objBelow.clone((clonedBelow: fabric.Object) => {
                    objActive.clone((clonedActive: fabric.Object) => {
                        const tempEl = document.createElement('canvas');
                        tempEl.width = canvas.width!; tempEl.height = canvas.height!;
                        const tempFabric = new fabric.StaticCanvas(tempEl);
                        clonedBelow.visible = true; clonedActive.visible = true;
                        tempFabric.add(clonedBelow); tempFabric.add(clonedActive);
                        tempFabric.renderAll();
                        const dataUrl = tempFabric.toDataURL({ format: 'png' });

                        fabric.Image.fromURL(dataUrl, (mergedImg) => {
                            mergedImg.set({ left: 0, top: 0, width: canvas.width, height: canvas.height, selectable: true, hasControls: true });
                            const mergedAny = mergedImg as any;
                            mergedAny.id = 'layer_' + Date.now();
                            mergedAny.name = `Fusión: ${(objActive as any).name} + ${(objBelow as any).name}`;
                            mergedAny.layerType = 'image';
                            canvas.remove(objBelow); canvas.remove(objActive);
                            canvas.add(mergedImg); canvas.moveTo(mergedImg, idx - 1);
                            canvas.setActiveObject(mergedImg); canvas.requestRenderAll();
                            tempFabric.dispose(); syncLayers();
                            playSuccessSound();
                            showToast?.('🔗 Capas fusionadas correctamente', 'success');
                        });
                    });
                });
            });
        } else {
            showToast?.('No hay capa inferior con la que fusionar', 'warning');
        }
    }, [withHistory, syncLayers, showToast]);

    // ─── Project save / load ──────────────────────────────────────────────────

    const serializeCurrentProject = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return null;
        const project = serializeProject(canvas, projectNameRef.current);
        return JSON.stringify(project, null, 2);
    }, []);

    const saveProject = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const json = serializeCurrentProject();
        if (!json) return;
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${projectNameRef.current.replace(/[^a-zA-Z0-9_-]/g, '_')}.gpe`;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        // Also save to localStorage
        try {
            localStorage.setItem(AUTOSAVE_KEY, json);
            localStorage.setItem(PROJECT_NAME_KEY, projectNameRef.current);
            setLastAutoSave(new Date());
        } catch { /* quota exceeded */ }

        playSuccessSound();
        showToast?.(`💾 Proyecto "${projectNameRef.current}" guardado`, 'success');
    }, [serializeCurrentProject, showToast]);

    const loadProject = useCallback(async (jsonString: string) => {
        try {
            const data = JSON.parse(jsonString);
            if (!validateProjectJSON(data)) {
                showToast?.('❌ Archivo de proyecto inválido o incompatible', 'warning');
                return;
            }

            const canvas = fabricCanvasRef.current;
            if (!canvas) return;

            pushSnapshot('Cargar proyecto');
            const activeId = await deserializeProject(data, canvas);
            commitHead();

            if (activeId) {
                const obj = canvas.getObjects().find((o) => (o as any).id === activeId);
                if (obj) canvas.setActiveObject(obj);
            }
            canvas.requestRenderAll();
            syncLayers();

            setProjectName(data.name);
            projectNameRef.current = data.name;
            localStorage.setItem(PROJECT_NAME_KEY, data.name);

            playSuccessSound();
            showToast?.(`📂 Proyecto "${data.name}" cargado correctamente`, 'success');
        } catch (e) {
            showToast?.(`❌ Error al cargar el proyecto: ${e}`, 'warning');
        }
    }, [pushSnapshot, commitHead, syncLayers, showToast]);

    const loadAutoSave = useCallback(async () => {
        const json = localStorage.getItem(AUTOSAVE_KEY);
        if (!json) { showToast?.('No hay auto-guardado disponible', 'info'); return; }
        await loadProject(json);
    }, [loadProject, showToast]);

    const undo = useCallback(async () => {
        if (!canUndo) return;
        await historyUndo();
        playToggleSound(false);
        showToast?.('↩ Deshacer aplicado', 'info');
    }, [canUndo, historyUndo, showToast]);

    const redo = useCallback(async () => {
        if (!canRedo) return;
        await historyRedo();
        playToggleSound(true);
        showToast?.('↪ Rehacer aplicado', 'info');
    }, [canRedo, historyRedo, showToast]);

    // ─── Return API ───────────────────────────────────────────────────────────

    return {
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
        loadImage, exportImage, exportAs,
        clearCanvas, applyFilter,

        // Project
        saveProject, loadProject, loadAutoSave, serializeCurrentProject,

        // Text/Shape Styles API
        setTextStyle, setShapeStyle,
        activeObjectProperties,

        // Advanced Filter Pipeline
        applyFilterPipeline, previewFilterPipeline, clearFilters,

        // Layers API
        layers,
        addDrawingLayer, addImageLayer, addTextLayer, addShapeLayer,
        toggleLayerVisibility, setLayerOpacity, selectLayer, deleteLayer,
        moveLayerUp, moveLayerDown, duplicateLayer, mergeLayerBelow,
    };
}