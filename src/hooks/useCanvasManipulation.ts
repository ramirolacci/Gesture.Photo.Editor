import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { drawRect, drawEllipse, drawLine, drawShapePreview, clearOverlay, Point } from '../utils/canvasShapes';
import { applyGrayscale, applyInvert, applyBlur, applyBrightness, applyContrast } from '../utils/canvasFilters';

export type FilterType = 'grayscale' | 'invert' | 'blur' | 'brightness_up' | 'brightness_down' | 'contrast_up' | 'contrast_down';

const SHAPE_TOOLS: EditorAction[] = ['DRAW_RECT', 'DRAW_CIRCLE', 'DRAW_LINE'];

interface UseCanvasManipulationOptions {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
    onActionCompleted?: (action: EditorAction) => void;
    hands?: HandLandmarks[];
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
}

export function useCanvasManipulation(options: UseCanvasManipulationOptions) {
    const {
        canvasRef,
        overlayCanvasRef,
        onActionCompleted,
        hands = [],
        gestures = [],
        isGesturePaused = false,
    } = options;

    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isMouseDrawingRef = useRef(false);

    // Tool state (dual: React state for UI + ref for RAF loop)
    const [currentTool, setCurrentTool] = useState<EditorAction>('SELECT_BRUSH');
    const currentToolRef = useRef<EditorAction>('SELECT_BRUSH');

    // Brush properties (dual state + ref)
    const [brushColor, setBrushColorState] = useState('#000000');
    const brushColorRef = useRef('#000000');
    const [brushSize, setBrushSizeState] = useState(3);
    const brushSizeRef = useRef(3);

    // Pointer / cursor state exposed to component
    const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

    // RAF smoothing refs
    const targetPosRef = useRef<Point | null>(null);
    const smoothedPosRef = useRef<Point | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);

    // Gesture drawing flags (written by hands useEffect, read by RAF loop)
    const isPinchingRef = useRef(false);
    const wasPinchingRef = useRef(false);
    const isEraserRef = useRef(false);

    // Free-draw path tracking
    const lastDrawPosRef = useRef<Point | null>(null);

    // Shape drawing refs
    const shapeStartRef = useRef<Point | null>(null);
    const mouseShapeStartRef = useRef<Point | null>(null);

    // Hands ref readable in RAF loop
    const handsRef = useRef<HandLandmarks[]>([]);

    // ─── Helpers ─────────────────────────────────────────────────────────────

    const configureCtx = (ctx: CanvasRenderingContext2D) => {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };

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
        if (onActionCompleted) onActionCompleted(tool);
    }, [onActionCompleted]);

    // ─── Canvas initialization ────────────────────────────────────────────────

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctxRef.current = ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        configureCtx(ctx);
    }, [canvasRef]);

    // ─── Overlay canvas initialization ───────────────────────────────────────

    useEffect(() => {
        if (!overlayCanvasRef.current) return;
        const overlayCtx = overlayCanvasRef.current.getContext('2d');
        if (!overlayCtx) return;
        overlayCtxRef.current = overlayCtx;
    }, [overlayCanvasRef]);

    // ─── Mouse event handlers ─────────────────────────────────────────────────

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const getCanvasPoint = (e: MouseEvent): Point => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (canvas.width / rect.width),
                y: (e.clientY - rect.top) * (canvas.height / rect.height),
            };
        };

        const onMouseDown = (e: MouseEvent) => {
            isMouseDrawingRef.current = true;
            const pt = getCanvasPoint(e);
            const tool = currentToolRef.current;

            if (SHAPE_TOOLS.includes(tool)) {
                mouseShapeStartRef.current = pt;
            } else if (tool === 'SELECT_BRUSH' || tool === 'SELECT_ERASER') {
                const ctx = ctxRef.current;
                if (!ctx) return;
                ctx.strokeStyle = tool === 'SELECT_BRUSH' ? brushColorRef.current : '#ffffff';
                ctx.lineWidth = tool === 'SELECT_BRUSH' ? brushSizeRef.current : brushSizeRef.current * 4;
                ctx.beginPath();
                ctx.moveTo(pt.x, pt.y);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isMouseDrawingRef.current) return;
            const pt = getCanvasPoint(e);
            const tool = currentToolRef.current;

            if (SHAPE_TOOLS.includes(tool) && mouseShapeStartRef.current) {
                // Preview on overlay
                const overlayCtx = overlayCtxRef.current;
                const overlayCanvas = overlayCanvasRef.current;
                if (overlayCtx && overlayCanvas) {
                    drawShapePreview(
                        overlayCtx,
                        overlayCanvas,
                        tool as 'DRAW_RECT' | 'DRAW_CIRCLE' | 'DRAW_LINE',
                        mouseShapeStartRef.current,
                        pt,
                        brushColorRef.current,
                        brushSizeRef.current
                    );
                }
            } else if (tool === 'SELECT_BRUSH' || tool === 'SELECT_ERASER') {
                const ctx = ctxRef.current;
                if (!ctx) return;
                ctx.strokeStyle = tool === 'SELECT_BRUSH' ? brushColorRef.current : '#ffffff';
                ctx.lineWidth = tool === 'SELECT_BRUSH' ? brushSizeRef.current : brushSizeRef.current * 4;
                ctx.lineTo(pt.x, pt.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pt.x, pt.y);
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            isMouseDrawingRef.current = false;
            const pt = getCanvasPoint(e);
            const tool = currentToolRef.current;

            if (SHAPE_TOOLS.includes(tool) && mouseShapeStartRef.current) {
                const ctx = ctxRef.current;
                if (ctx) {
                    if (tool === 'DRAW_RECT') drawRect(ctx, mouseShapeStartRef.current, pt, brushColorRef.current, brushSizeRef.current);
                    if (tool === 'DRAW_CIRCLE') drawEllipse(ctx, mouseShapeStartRef.current, pt, brushColorRef.current, brushSizeRef.current);
                    if (tool === 'DRAW_LINE') drawLine(ctx, mouseShapeStartRef.current, pt, brushColorRef.current, brushSizeRef.current);
                }
                // Clear overlay
                const overlayCtx = overlayCtxRef.current;
                const overlayCanvas = overlayCanvasRef.current;
                if (overlayCtx && overlayCanvas) clearOverlay(overlayCtx, overlayCanvas);
                mouseShapeStartRef.current = null;
            } else if (tool === 'SELECT_BRUSH' || tool === 'SELECT_ERASER') {
                ctxRef.current?.beginPath();
            }
        };

        const onMouseOut = () => {
            if (isMouseDrawingRef.current) onMouseUp(new MouseEvent('mouseout'));
            isMouseDrawingRef.current = false;
            ctxRef.current?.beginPath();
        };

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseout', onMouseOut);

        return () => {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('mouseout', onMouseOut);
        };
    }, [canvasRef, overlayCanvasRef]);

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

        const canvas = canvasRef.current;
        if (canvas) {
            targetPosRef.current = {
                // Mirror X for selfie camera view
                x: (1 - indexTip.x) * canvas.width,
                y: indexTip.y * canvas.height,
            };
        }

        isPinchingRef.current = gesture.type === 'PINCH';
        isEraserRef.current = gesture.type === 'PEACE';
    }, [hands, gestures, isGesturePaused, canvasRef]);

    // ─── requestAnimationFrame loop ───────────────────────────────────────────

    useEffect(() => {
        const LERP = 0.15;
        const BRUSH_SIZE_LERP = 0.08;
        let smoothedBrushSize = brushSizeRef.current;

        const loop = () => {
            const ctx = ctxRef.current;
            const overlayCtx = overlayCtxRef.current;
            const overlayCanvas = overlayCanvasRef.current;
            const target = targetPosRef.current;

            // ── Two-hand distance → brush size ──────────────────────────
            const currentHands = handsRef.current;
            if (!isGesturePaused && currentHands.length >= 2) {
                const w0 = currentHands[0].landmarks[0]; // wrist hand 0
                const w1 = currentHands[1].landmarks[0]; // wrist hand 1
                if (w0 && w1) {
                    const dist = Math.sqrt((w0.x - w1.x) ** 2 + (w0.y - w1.y) ** 2);
                    // Map dist (0.05 … 0.8) → (1 … 50)
                    const mapped = 1 + ((dist - 0.05) / (0.8 - 0.05)) * 49;
                    const targetSize = Math.min(50, Math.max(1, mapped));
                    smoothedBrushSize += (targetSize - smoothedBrushSize) * BRUSH_SIZE_LERP;
                    const rounded = Math.round(smoothedBrushSize);
                    if (rounded !== brushSizeRef.current) {
                        setBrushSize(rounded);
                    }
                }
            }

            if (target && ctx) {
                // ── Lerp smoothing ──────────────────────────────────────
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
                const isShape = SHAPE_TOOLS.includes(tool);

                // ── Shape drawing via gesture ────────────────────────────
                if (isShape && isPinching) {
                    if (!wasPinchingRef.current) {
                        // Rising edge of pinch: save start position
                        shapeStartRef.current = { ...pos };
                    }
                    // Draw preview on overlay every frame
                    if (shapeStartRef.current && overlayCtx && overlayCanvas) {
                        drawShapePreview(
                            overlayCtx,
                            overlayCanvas,
                            tool as 'DRAW_RECT' | 'DRAW_CIRCLE' | 'DRAW_LINE',
                            shapeStartRef.current,
                            pos,
                            brushColorRef.current,
                            brushSizeRef.current
                        );
                    }
                } else if (isShape && !isPinching && wasPinchingRef.current && shapeStartRef.current) {
                    // Falling edge of pinch: commit shape to main canvas
                    if (tool === 'DRAW_RECT') drawRect(ctx, shapeStartRef.current, pos, brushColorRef.current, brushSizeRef.current);
                    if (tool === 'DRAW_CIRCLE') drawEllipse(ctx, shapeStartRef.current, pos, brushColorRef.current, brushSizeRef.current);
                    if (tool === 'DRAW_LINE') drawLine(ctx, shapeStartRef.current, pos, brushColorRef.current, brushSizeRef.current);
                    if (overlayCtx && overlayCanvas) clearOverlay(overlayCtx, overlayCanvas);
                    shapeStartRef.current = null;

                } else if (!isShape) {
                    // ── Free draw / erase ────────────────────────────────
                    if (isPinching || isErasing) {
                        ctx.strokeStyle = isPinching ? brushColorRef.current : '#ffffff';
                        ctx.lineWidth = isPinching ? brushSizeRef.current : brushSizeRef.current * 4;

                        if (!lastDrawPosRef.current) {
                            ctx.beginPath();
                            ctx.moveTo(pos.x, pos.y);
                        } else {
                            ctx.lineTo(pos.x, pos.y);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(pos.x, pos.y);
                        }
                        lastDrawPosRef.current = { ...pos };
                    } else {
                        lastDrawPosRef.current = null;
                        ctx.beginPath();
                    }
                }

                wasPinchingRef.current = isPinching;
            } else {
                // No hand → reset state
                smoothedPosRef.current = null;
                lastDrawPosRef.current = null;
                shapeStartRef.current = null;
                wasPinchingRef.current = false;
                setPointerPos(null);
                ctx?.beginPath();
            }

            animationFrameIdRef.current = requestAnimationFrame(loop);
        };

        animationFrameIdRef.current = requestAnimationFrame(loop);
        return () => {
            if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overlayCanvasRef, isGesturePaused, setBrushSize]);

    // ─── Image operations ─────────────────────────────────────────────────────

    const loadImage = useCallback((imageUrl: string) => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            // Keep overlay canvas in sync
            if (overlayCanvasRef.current) {
                overlayCanvasRef.current.width = img.width;
                overlayCanvasRef.current.height = img.height;
            }
            ctx.drawImage(img, 0, 0);
            configureCtx(ctx);
        };
        img.src = imageUrl;
    }, [canvasRef, overlayCanvasRef]);

    const exportImage = useCallback(() => {
        return canvasRef.current?.toDataURL('image/png') ?? '';
    }, [canvasRef]);

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        configureCtx(ctx);
    }, [canvasRef]);

    const applyFilter = useCallback((filterType: FilterType) => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;

        switch (filterType) {
            case 'grayscale':       applyGrayscale(ctx, canvas); break;
            case 'invert':          applyInvert(ctx, canvas); break;
            case 'blur':            applyBlur(ctx, canvas, 5); break;
            case 'brightness_up':   applyBrightness(ctx, canvas, 1.25); break;
            case 'brightness_down': applyBrightness(ctx, canvas, 0.75); break;
            case 'contrast_up':     applyContrast(ctx, canvas, 1.5); break;
            case 'contrast_down':   applyContrast(ctx, canvas, 0.6); break;
        }
    }, [canvasRef]);

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
    };
}