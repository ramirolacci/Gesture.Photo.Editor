import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { fabric } from 'fabric';

export type FilterType = 'grayscale' | 'invert' | 'blur' | 'brightness_up' | 'brightness_down' | 'contrast_up' | 'contrast_down';

export interface LayerInfo {
    id: string;
    name: string;
    type: 'drawing' | 'image' | 'text' | 'shape';
    visible: boolean;
    opacity: number;
    active: boolean;
}

interface UseCanvasManipulationOptions {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    overlayCanvasRef?: React.RefObject<HTMLCanvasElement>;
    onActionCompleted?: (action: EditorAction) => void;
    hands?: HandLandmarks[];
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
}

export function useCanvasManipulation(options: UseCanvasManipulationOptions) {
    const {
        canvasRef,
        onActionCompleted,
        hands = [],
        gestures = [],
        isGesturePaused = false,
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

    // Pointer / cursor state exposed to component
    const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

    // RAF smoothing refs
    const targetPosRef = useRef<{ x: number; y: number } | null>(null);
    const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);

    // Gesture drawing flags (written by hands useEffect, read by RAF loop)
    const isPinchingRef = useRef(false);
    const wasPinchingRef = useRef(false);
    const isEraserRef = useRef(false);

    // Drawing tracking
    const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
    const activeDrawingShapeRef = useRef<{ shape: fabric.Object; startPt: { x: number; y: number } } | null>(null);
    const grabOffsetRef = useRef<{ x: number; y: number } | null>(null);

    // Hands ref readable in RAF loop
    const handsRef = useRef<HandLandmarks[]>([]);

    // Gestures trackers for Thumbs Up & Swipe
    const wasThumbsUpRef = useRef(false);
    const positionHistoryRef = useRef<{ y: number; timestamp: number }[]>([]);
    const lastSwipeTimeRef = useRef(0);

    // ─── Layer Sincronización ─────────────────────────────────────────────

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
                active: activeObject === obj || (activeObject && (activeObject as any)._objects && (activeObject as any).contains(obj)),
            };
        });

        // Retornar al revés para mostrar la capa más arriba en la parte superior de la lista
        setLayers([...layersList].reverse());
    }, []);

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
            // Deseleccionar al cambiar a herramientas de dibujo/formas para evitar arrastres accidentales
            if (tool !== 'SELECT_MOVE') {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
            }
            
            // Configurar interactividad
            canvas.getObjects().forEach((obj) => {
                obj.selectable = tool === 'SELECT_MOVE';
                obj.hoverCursor = tool === 'SELECT_MOVE' ? 'move' : 'crosshair';
            });
            canvas.requestRenderAll();
            syncLayers();
        }

        if (onActionCompleted) onActionCompleted(tool);
    }, [onActionCompleted, syncLayers]);

    // ─── Canvas initialization ────────────────────────────────────────────────

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvasEl = canvasRef.current;

        const canvas = new fabric.Canvas(canvasEl, {
            width: 800,
            height: 600,
            backgroundColor: '#ffffff',
            selection: true,
        });

        fabricCanvasRef.current = canvas;

        // Crear una capa de dibujo por defecto inicial para pintar
        const hiddenCanvas = document.createElement('canvas');
        hiddenCanvas.width = 800;
        hiddenCanvas.height = 600;
        const hiddenCtx = hiddenCanvas.getContext('2d');
        if (hiddenCtx) {
            hiddenCtx.fillStyle = 'rgba(0,0,0,0)';
            hiddenCtx.fillRect(0, 0, 800, 600);
        }

        const img = new fabric.Image(hiddenCanvas, {
            left: 0,
            top: 0,
            selectable: true,
            hasControls: true,
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

        // Escuchar eventos de cambio de objeto para mantener la lista al día
        const syncEvents = ['object:added', 'object:removed', 'selection:created', 'selection:updated', 'selection:cleared', 'object:modified'];
        syncEvents.forEach((evt) => canvas.on(evt, syncLayers));

        return () => {
            syncEvents.forEach((evt) => canvas.off(evt, syncLayers));
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, [canvasRef, syncLayers]);

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
            } else if (['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE'].includes(tool)) {
                isMouseDrawingRef.current = true;
                const startPt = pointer;
                let shape: fabric.Object;

                const nameSuffix = canvas.getObjects().length + 1;
                if (tool === 'DRAW_RECT') {
                    shape = new fabric.Rect({
                        left: startPt.x,
                        top: startPt.y,
                        width: 0,
                        height: 0,
                        fill: 'transparent',
                        stroke: brushColorRef.current,
                        strokeWidth: brushSizeRef.current,
                    });
                } else if (tool === 'DRAW_CIRCLE') {
                    shape = new fabric.Ellipse({
                        left: startPt.x,
                        top: startPt.y,
                        rx: 0,
                        ry: 0,
                        fill: 'transparent',
                        stroke: brushColorRef.current,
                        strokeWidth: brushSizeRef.current,
                    } as any);
                } else {
                    shape = new fabric.Line([startPt.x, startPt.y, startPt.x, startPt.y], {
                        stroke: brushColorRef.current,
                        strokeWidth: brushSizeRef.current,
                    });
                }

                const shapeAny = shape as any;
                shapeAny.id = 'layer_' + Date.now();
                shapeAny.layerType = 'shape';
                shapeAny.name = (tool === 'DRAW_RECT' ? 'Rectángulo ' : tool === 'DRAW_CIRCLE' ? 'Círculo ' : 'Línea ') + nameSuffix;

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
                } else if (['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE'].includes(tool) && activeDrawingShapeRef.current) {
                    const { shape, startPt } = activeDrawingShapeRef.current;

                    if (tool === 'DRAW_RECT') {
                        const width = pointer.x - startPt.x;
                        const height = pointer.y - startPt.y;
                        shape.set({
                            width: Math.abs(width),
                            height: Math.abs(height),
                            left: width < 0 ? pointer.x : startPt.x,
                            top: height < 0 ? pointer.y : startPt.y,
                        });
                    } else if (tool === 'DRAW_CIRCLE') {
                        const rx = Math.abs(pointer.x - startPt.x) / 2;
                        const ry = Math.abs(pointer.y - startPt.y) / 2;
                        const left = Math.min(startPt.x, pointer.x);
                        const top = Math.min(startPt.y, pointer.y);
                        (shape as fabric.Ellipse).set({
                            rx,
                            ry,
                            left,
                            top,
                        });
                    } else if (tool === 'DRAW_LINE') {
                        (shape as fabric.Line).set({
                            x2: pointer.x,
                            y2: pointer.y,
                        });
                    }

                    canvas.requestRenderAll();
                }
            }
        };

        const onMouseUp = () => {
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
    }, [syncLayers]);

    // ─── Hand tracking → RAF flags ────────────────────────────────────────────

    useEffect(() => {
        handsRef.current = hands;

        if (isGesturePaused || hands.length === 0 || gestures.length === 0) {
            targetPosRef.current = null;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        const hand = hands[0];
        const gesture = gestures.find((g) => g.hand === hand.handedness) || gestures[0];
        const indexTip = hand.landmarks[8];

        if (!indexTip) {
            targetPosRef.current = null;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        const canvas = fabricCanvasRef.current;
        if (canvas) {
            targetPosRef.current = {
                // Espejar X para visualización selfie de cámara
                x: (1 - indexTip.x) * canvas.width!,
                y: indexTip.y * canvas.height!,
            };
        }

        isPinchingRef.current = gesture.type === 'PINCH';
        isEraserRef.current = gesture.type === 'PEACE';
    }, [hands, gestures, isGesturePaused]);

    // ─── Gesture actions handler (Thumbs up, Swipe, Opacity) ───────────────────

    useEffect(() => {
        if (isGesturePaused) return;

        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // 1. Thumbs Up (👍) -> Toggle visibilidad de capa activa
        const hasThumbsUp = gestures.some((g) => g.type === 'THUMBS_UP');
        if (hasThumbsUp && !wasThumbsUpRef.current) {
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                activeObj.set('visible', !activeObj.visible);
                canvas.requestRenderAll();
                syncLayers();
                console.log('Thumbs Up -> Toggled visibility for: ', (activeObj as any).name);
            }
        }
        wasThumbsUpRef.current = hasThumbsUp;

        // 2. Swipe vertical -> Mover en el stack de capas
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
                    const deltaY = last.y - first.y; // 0 arriba, 1 abajo
                    const timeDiff = last.timestamp - first.timestamp;

                    if (timeDiff > 50 && Math.abs(deltaY) > 0.15) {
                        const activeObj = canvas.getActiveObject();
                        if (activeObj) {
                            if (deltaY < 0) {
                                // Mover arriba
                                canvas.bringForward(activeObj);
                                console.log('Swipe Up -> Mover capa arriba');
                            } else {
                                // Mover abajo
                                canvas.sendBackwards(activeObj);
                                console.log('Swipe Down -> Mover capa abajo');
                            }
                            canvas.requestRenderAll();
                            syncLayers();
                            lastSwipeTimeRef.current = now;
                            positionHistoryRef.current = [];
                        }
                    }
                }
            }
        } else {
            positionHistoryRef.current = [];
        }

        // 3. Pinza con dos manos (PINCH en ambas manos) -> Opacidad de capa activa
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

                    // Mapear distancia (0.1 a 0.5) a opacidad (0 a 1)
                    const min = 0.08;
                    const max = 0.45;
                    const opacity = Math.min(1, Math.max(0, (dist - min) / (max - min)));

                    const activeObj = canvas.getActiveObject();
                    if (activeObj) {
                        activeObj.set('opacity', Number(opacity.toFixed(2)));
                        canvas.requestRenderAll();
                        syncLayers();
                    }
                }
            }
        }
    }, [hands, gestures, isGesturePaused, syncLayers]);

    // ─── requestAnimationFrame loop ───────────────────────────────────────────

    useEffect(() => {
        const LERP = 0.15;
        const BRUSH_SIZE_LERP = 0.08;
        let smoothedBrushSize = brushSizeRef.current;

        const loop = () => {
            const canvas = fabricCanvasRef.current;
            const target = targetPosRef.current;

            if (!canvas) {
                animationFrameIdRef.current = requestAnimationFrame(loop);
                return;
            }

            // Grosor del pincel con distancia de dos manos (cuando no hacen pinza para opacidad)
            const currentHands = handsRef.current;
            if (!isGesturePaused && currentHands.length >= 2) {
                const isBothPinching = gestures.length >= 2 && 
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
                        if (rounded !== brushSizeRef.current) {
                            setBrushSize(rounded);
                        }
                    }
                }
            }

            if (target) {
                // Suavizar posición del puntero
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

                // DIBUJO O BORRADOR MEDIANTE GESTOS
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
                        lastDrawPosRef.current = null;
                    }
                }

                // DIBUJO DE FORMAS GEOMÉTRICAS MEDIANTE GESTOS
                else if (['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE'].includes(tool)) {
                    if (isPinching) {
                        if (!wasPinchingRef.current) {
                            // Crear la forma
                            let shape: fabric.Object;
                            const nameSuffix = canvas.getObjects().length + 1;

                            if (tool === 'DRAW_RECT') {
                                shape = new fabric.Rect({
                                    left: pos.x,
                                    top: pos.y,
                                    width: 0,
                                    height: 0,
                                    fill: 'transparent',
                                    stroke: brushColorRef.current,
                                    strokeWidth: brushSizeRef.current,
                                });
                            } else if (tool === 'DRAW_CIRCLE') {
                                shape = new fabric.Ellipse({
                                    left: pos.x,
                                    top: pos.y,
                                    rx: 0,
                                    ry: 0,
                                    fill: 'transparent',
                                    stroke: brushColorRef.current,
                                    strokeWidth: brushSizeRef.current,
                                } as any);
                            } else {
                                shape = new fabric.Line([pos.x, pos.y, pos.x, pos.y], {
                                    stroke: brushColorRef.current,
                                    strokeWidth: brushSizeRef.current,
                                });
                            }

                            const shapeAny = shape as any;
                            shapeAny.id = 'layer_' + Date.now();
                            shapeAny.layerType = 'shape';
                            shapeAny.name = (tool === 'DRAW_RECT' ? 'Rectángulo ' : tool === 'DRAW_CIRCLE' ? 'Círculo ' : 'Línea ') + nameSuffix;

                            canvas.add(shape);
                            canvas.setActiveObject(shape);
                            activeDrawingShapeRef.current = { shape, startPt: { ...pos } };
                            canvas.requestRenderAll();
                        } else if (activeDrawingShapeRef.current) {
                            // Arrastrando la forma
                            const { shape, startPt } = activeDrawingShapeRef.current;
                            if (tool === 'DRAW_RECT') {
                                const w = pos.x - startPt.x;
                                const h = pos.y - startPt.y;
                                shape.set({
                                    width: Math.abs(w),
                                    height: Math.abs(h),
                                    left: w < 0 ? pos.x : startPt.x,
                                    top: h < 0 ? pos.y : startPt.y,
                                });
                            } else if (tool === 'DRAW_CIRCLE') {
                                const rx = Math.abs(pos.x - startPt.x) / 2;
                                const ry = Math.abs(pos.y - startPt.y) / 2;
                                shape.set({
                                    rx,
                                    ry,
                                    left: Math.min(startPt.x, pos.x),
                                    top: Math.min(startPt.y, pos.y),
                                } as any);
                            } else if (tool === 'DRAW_LINE') {
                                (shape as fabric.Line).set({
                                    x2: pos.x,
                                    y2: pos.y,
                                });
                            }
                            canvas.requestRenderAll();
                        }
                    } else if (wasPinchingRef.current) {
                        // Soltar
                        activeDrawingShapeRef.current = null;
                        syncLayers();
                    }
                }

                // ARRASTRE DE CAPAS (SELECT_MOVE) CON GESTO
                else if (tool === 'SELECT_MOVE') {
                    if (isPinching) {
                        if (!wasPinchingRef.current) {
                            // Buscar objeto
                            const pointer = new fabric.Point(pos.x, pos.y);
                            const objects = canvas.getObjects();
                            let found: fabric.Object | null = null;
                            for (let i = objects.length - 1; i >= 0; i--) {
                                const obj = objects[i];
                                if (obj.visible && obj.containsPoint(pointer)) {
                                    found = obj;
                                    break;
                                }
                            }
                            if (found) {
                                canvas.setActiveObject(found);
                                canvas.requestRenderAll();
                                grabOffsetRef.current = {
                                    x: found.left! - pos.x,
                                    y: found.top! - pos.y,
                                };
                            }
                        } else if (activeObj && grabOffsetRef.current) {
                            activeObj.set({
                                left: pos.x + grabOffsetRef.current.x,
                                top: pos.y + grabOffsetRef.current.y,
                            });
                            canvas.requestRenderAll();
                        }
                    } else if (wasPinchingRef.current) {
                        grabOffsetRef.current = null;
                        syncLayers();
                    }
                }

                wasPinchingRef.current = isPinching;
            } else {
                smoothedPosRef.current = null;
                lastDrawPosRef.current = null;
                activeDrawingShapeRef.current = null;
                grabOffsetRef.current = null;
                wasPinchingRef.current = false;
                setPointerPos(null);
            }

            animationFrameIdRef.current = requestAnimationFrame(loop);
        };

        animationFrameIdRef.current = requestAnimationFrame(loop);
        return () => {
            if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        };
    }, [isGesturePaused, gestures, setBrushSize]);

    // ─── Image operations / Layers API ────────────────────────────────────────

    const addDrawingLayer = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const hiddenCanvas = document.createElement('canvas');
        hiddenCanvas.width = 800;
        hiddenCanvas.height = 600;
        const hiddenCtx = hiddenCanvas.getContext('2d');
        if (hiddenCtx) {
            hiddenCtx.fillStyle = 'rgba(0,0,0,0)';
            hiddenCtx.fillRect(0, 0, 800, 600);
        }

        const img = new fabric.Image(hiddenCanvas, {
            left: 0,
            top: 0,
            selectable: true,
            hasControls: true,
        });
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
    }, [syncLayers]);

    const addImageLayer = useCallback((imageUrl: string, name?: string) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        fabric.Image.fromURL(imageUrl, (img) => {
            const scaleX = canvas.width! / img.width!;
            const scaleY = canvas.height! / img.height!;
            const scale = Math.min(scaleX, scaleY, 0.8); // Escalar al 80% del canvas por defecto

            img.set({
                left: (canvas.width! - img.width! * scale) / 2,
                top: (canvas.height! - img.height! * scale) / 2,
                scaleX: scale,
                scaleY: scale,
                selectable: true,
                hasControls: true,
            });

            const imgAny = img as any;
            imgAny.id = 'layer_' + Date.now();
            imgAny.name = name || 'Imagen ' + (canvas.getObjects().length + 1);
            imgAny.layerType = 'image';

            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            syncLayers();
        });
    }, [syncLayers]);

    const addTextLayer = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const text = new fabric.IText('Doble click para editar', {
            left: canvas.width! / 2 - 120,
            top: canvas.height! / 2 - 20,
            fontSize: 24,
            fill: brushColorRef.current,
            selectable: true,
            hasControls: true,
        } as any);

        const textAny = text as any;
        textAny.id = 'layer_' + Date.now();
        textAny.name = 'Texto ' + (canvas.getObjects().length + 1);
        textAny.layerType = 'text';

        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        syncLayers();
    }, [syncLayers]);

    const addShapeLayer = useCallback((shapeType: 'rect' | 'circle' | 'line') => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        let shapeObj: fabric.Object;
        const nameSuffix = canvas.getObjects().length + 1;
        let name = '';

        if (shapeType === 'rect') {
            shapeObj = new fabric.Rect({
                left: canvas.width! / 2 - 50,
                top: canvas.height! / 2 - 50,
                width: 100,
                height: 100,
                fill: 'transparent',
                stroke: brushColorRef.current,
                strokeWidth: brushSizeRef.current,
            });
            name = 'Rectángulo ' + nameSuffix;
        } else if (shapeType === 'circle') {
            shapeObj = new fabric.Ellipse({
                left: canvas.width! / 2 - 50,
                top: canvas.height! / 2 - 50,
                rx: 50,
                ry: 50,
                fill: 'transparent',
                stroke: brushColorRef.current,
                strokeWidth: brushSizeRef.current,
            } as any);
            name = 'Círculo ' + nameSuffix;
        } else {
            shapeObj = new fabric.Line([
                canvas.width! / 2 - 50,
                canvas.height! / 2 - 50,
                canvas.width! / 2 + 50,
                canvas.height! / 2 + 50
            ], {
                stroke: brushColorRef.current,
                strokeWidth: brushSizeRef.current,
            });
            name = 'Línea ' + nameSuffix;
        }

        shapeObj.set({
            selectable: true,
            hasControls: true,
        });

        const shapeAny = shapeObj as any;
        shapeAny.id = 'layer_' + Date.now();
        shapeAny.name = name;
        shapeAny.layerType = 'shape';

        canvas.add(shapeObj);
        canvas.setActiveObject(shapeObj);
        canvas.requestRenderAll();
        syncLayers();
    }, [syncLayers]);

    const loadImage = useCallback((imageUrl: string) => {
        addImageLayer(imageUrl, 'Imagen Cargada');
    }, [addImageLayer]);

    const exportImage = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return '';

        // Deseleccionar temporalmente para no incluir bordes/controles en la exportación
        const active = canvas.getActiveObject();
        canvas.discardActiveObject();
        canvas.requestRenderAll();

        const dataUrl = canvas.toDataURL({
            format: 'png',
            quality: 1,
        });

        // Restaurar selección
        if (active) {
            canvas.setActiveObject(active);
            canvas.requestRenderAll();
        }

        return dataUrl;
    }, []);

    const clearCanvas = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        canvas.clear();
        canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
        syncLayers();
    }, [syncLayers]);

    const applyFilter = useCallback((filterType: FilterType) => {
        const canvas = fabricCanvasRef.current;
        const activeObj = canvas?.getActiveObject();
        if (!canvas || !activeObj) return;

        // Solo aplicar filtros a capas de tipo imagen
        if ((activeObj as any).layerType === 'image') {
            const img = activeObj as fabric.Image;
            img.filters = img.filters || [];

            let filterInstance: any;
            switch (filterType) {
                case 'grayscale':
                    filterInstance = new fabric.Image.filters.Grayscale();
                    break;
                case 'invert':
                    filterInstance = new fabric.Image.filters.Invert();
                    break;
                case 'blur':
                    filterInstance = new fabric.Image.filters.Blur({ blur: 0.25 });
                    break;
                case 'brightness_up':
                    filterInstance = new fabric.Image.filters.Brightness({ brightness: 0.1 });
                    break;
                case 'brightness_down':
                    filterInstance = new fabric.Image.filters.Brightness({ brightness: -0.1 });
                    break;
                case 'contrast_up':
                    filterInstance = new fabric.Image.filters.Contrast({ contrast: 0.15 });
                    break;
                case 'contrast_down':
                    filterInstance = new fabric.Image.filters.Contrast({ contrast: -0.15 });
                    break;
            }

            if (filterInstance) {
                img.filters.push(filterInstance);
                img.applyFilters();
                canvas.requestRenderAll();
                console.log(`Aplicado filtro ${filterType} a la capa ${(img as any).name}`);
            }
        } else {
            console.log('El objeto seleccionado no es una capa de imagen.');
        }
    }, []);

    // ─── Extra Layer Operations ───────────────────────────────────────────────

    const toggleLayerVisibility = useCallback((id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            obj.set('visible', !obj.visible);
            canvas?.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

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
        if (obj) {
            canvas?.setActiveObject(obj);
            canvas?.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

    const deleteLayer = useCallback((id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            canvas?.remove(obj);
            canvas?.discardActiveObject();
            canvas?.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

    const moveLayerUp = useCallback((id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            canvas?.bringForward(obj);
            canvas?.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

    const moveLayerDown = useCallback((id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            canvas?.sendBackwards(obj);
            canvas?.requestRenderAll();
            syncLayers();
        }
    }, [syncLayers]);

    const duplicateLayer = useCallback((id: string) => {
        const canvas = fabricCanvasRef.current;
        const obj = canvas?.getObjects().find((o) => (o as any).id === id);
        if (obj) {
            obj.clone((cloned: fabric.Object) => {
                const clonedAny = cloned as any;
                cloned.set({
                    left: (obj.left || 0) + 20,
                    top: (obj.top || 0) + 20,
                    selectable: true,
                    hasControls: true,
                });
                
                clonedAny.id = 'layer_' + Date.now();
                clonedAny.name = ((obj as any).name || 'Capa') + ' (Copia)';
                clonedAny.layerType = (obj as any).layerType;

                // Si es capa de dibujo de canvas oculto, duplicar el lienzo del canvas también
                if ((obj as any).layerType === 'drawing' && (obj as any).hiddenCanvas) {
                    const origCanvas = (obj as any).hiddenCanvas as HTMLCanvasElement;
                    const dupCanvas = document.createElement('canvas');
                    dupCanvas.width = origCanvas.width;
                    dupCanvas.height = origCanvas.height;
                    const dupCtx = dupCanvas.getContext('2d');
                    if (dupCtx) dupCtx.drawImage(origCanvas, 0, 0);

                    clonedAny.hiddenCanvas = dupCanvas;
                    clonedAny.hiddenCtx = dupCtx;
                    clonedAny.setElement(dupCanvas);
                }

                canvas?.add(cloned);
                canvas?.setActiveObject(cloned);
                canvas?.requestRenderAll();
                syncLayers();
            });
        }
    }, [syncLayers]);

    const mergeLayerBelow = useCallback((id: string) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const objects = canvas.getObjects();
        const idx = objects.findIndex((o) => (o as any).id === id);
        if (idx > 0) {
            const objBelow = objects[idx - 1];
            const objActive = objects[idx];

            objBelow.clone((clonedBelow: fabric.Object) => {
                objActive.clone((clonedActive: fabric.Object) => {
                    const tempCanvasEl = document.createElement('canvas');
                    tempCanvasEl.width = canvas.width!;
                    tempCanvasEl.height = canvas.height!;
                    const tempFabricCanvas = new fabric.StaticCanvas(tempCanvasEl);

                    // Asegurar que sean visibles para la exportación de fusión
                    clonedBelow.visible = true;
                    clonedActive.visible = true;

                    tempFabricCanvas.add(clonedBelow);
                    tempFabricCanvas.add(clonedActive);
                    tempFabricCanvas.renderAll();

                    const dataUrl = tempFabricCanvas.toDataURL({ format: 'png' });

                    fabric.Image.fromURL(dataUrl, (mergedImg) => {
                        mergedImg.set({
                            left: 0,
                            top: 0,
                            width: canvas.width,
                            height: canvas.height,
                            selectable: true,
                            hasControls: true,
                        });

                        const mergedAny = mergedImg as any;
                        mergedAny.id = 'layer_' + Date.now();
                        mergedAny.name = `Fusión: ${(objActive as any).name || 'Capa'} + ${(objBelow as any).name || 'Capa'}`;
                        mergedAny.layerType = 'image';

                        canvas.remove(objBelow);
                        canvas.remove(objActive);

                        canvas.add(mergedImg);
                        canvas.moveTo(mergedImg, idx - 1);
                        canvas.setActiveObject(mergedImg);
                        canvas.requestRenderAll();
                        tempFabricCanvas.dispose();
                        syncLayers();
                    });
                });
            });
        }
    }, [syncLayers]);

    // ─── Return API ───────────────────────────────────────────────────────────

    return {
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
        addImageLayer,
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
    };
}