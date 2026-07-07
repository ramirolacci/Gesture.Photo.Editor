import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';

interface UseCanvasManipulationOptions {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    onActionCompleted?: (action: EditorAction) => void;
    hands?: HandLandmarks[];
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
}

export function useCanvasManipulation(options: UseCanvasManipulationOptions) {
    const { canvasRef, onActionCompleted, hands = [], gestures = [], isGesturePaused = false } = options;
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    
    const [currentTool, setCurrentTool] = useState<EditorAction>('NONE');
    const currentToolRef = useRef<EditorAction>('NONE');

    // Pointer cursor position states & refs
    const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
    const targetPosRef = useRef<{ x: number; y: number } | null>(null);
    const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);
    
    // Programmatic draw path tracing
    const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
    
    // Gesture active flags for the RAF loop
    const isPinchingRef = useRef(false);
    const isEraserRef = useRef(false);
    
    const animationFrameIdRef = useRef<number | null>(null);

    // Helper to configure stroke properties
    const configureContext = (ctx: CanvasRenderingContext2D) => {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };

    // Sync state and ref for the tool
    const selectTool = useCallback((tool: EditorAction) => {
        setCurrentTool(tool);
        currentToolRef.current = tool;
        if (onActionCompleted) {
            onActionCompleted(tool);
        }
    }, [onActionCompleted]);

    // Handle initial mouse listeners
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctxRef.current = ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        configureContext(ctx);

        const startDrawing = (e: MouseEvent) => {
            isDrawingRef.current = true;
            draw(e);
        };

        const draw = (e: MouseEvent) => {
            if (!isDrawingRef.current || !ctxRef.current || !canvasRef.current) return;
            
            const activeTool = currentToolRef.current;
            if (activeTool !== 'SELECT_BRUSH' && activeTool !== 'SELECT_ERASER') return;

            const rect = canvas.getBoundingClientRect();
            // Compensate for CSS scaling of the canvas
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);

            const context = ctxRef.current;
            
            if (activeTool === 'SELECT_BRUSH') {
                context.strokeStyle = '#000000';
                context.lineWidth = 3;
            } else if (activeTool === 'SELECT_ERASER') {
                context.strokeStyle = '#ffffff';
                context.lineWidth = 20;
            }

            context.lineTo(x, y);
            context.stroke();
            context.beginPath();
            context.moveTo(x, y);
        };

        const stopDrawing = () => {
            isDrawingRef.current = false;
            if (ctxRef.current) {
                ctxRef.current.beginPath();
            }
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        return () => {
            canvas.removeEventListener('mousedown', startDrawing);
            canvas.removeEventListener('mousemove', draw);
            canvas.removeEventListener('mouseup', stopDrawing);
            canvas.removeEventListener('mouseout', stopDrawing);
        };
    }, [canvasRef]);

    // Update target coordinates and gesture state refs on hands update
    useEffect(() => {
        if (isGesturePaused || hands.length === 0 || gestures.length === 0) {
            targetPosRef.current = null;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        const hand = hands[0];
        const gesture = gestures.find((g) => g.hand === hand.handedness) || gestures[0];

        // Track index finger tip (landmark index 8)
        const indexTip = hand.landmarks[8];
        if (!indexTip) {
            targetPosRef.current = null;
            isPinchingRef.current = false;
            isEraserRef.current = false;
            return;
        }

        const canvas = canvasRef.current;
        if (canvas) {
            // Mirror X coordinate because camera feed is visual selfie view
            targetPosRef.current = {
                x: (1 - indexTip.x) * canvas.width,
                y: indexTip.y * canvas.height,
            };
        }

        // Set action flags for drawing loop
        isPinchingRef.current = gesture.type === 'PINCH';
        isEraserRef.current = gesture.type === 'PEACE';
    }, [hands, gestures, isGesturePaused, canvasRef]);

    // requestAnimationFrame drawing loop with LERP smoothing
    useEffect(() => {
        const drawLoop = () => {
            if (!canvasRef.current || !ctxRef.current) {
                animationFrameIdRef.current = requestAnimationFrame(drawLoop);
                return;
            }

            const ctx = ctxRef.current;
            const target = targetPosRef.current;

            if (target) {
                // Initialize smoothed coordinates to target if first frame
                if (!smoothedPosRef.current) {
                    smoothedPosRef.current = { ...target };
                } else {
                    // Linear interpolation (lerp) for smooth movement (15% lerp factor)
                    const lerpFactor = 0.15;
                    smoothedPosRef.current = {
                        x: smoothedPosRef.current.x * (1 - lerpFactor) + target.x * lerpFactor,
                        y: smoothedPosRef.current.y * (1 - lerpFactor) + target.y * lerpFactor,
                    };
                }

                // Update state for cursor positioning overlay
                setPointerPos({ ...smoothedPosRef.current });

                // Draw programmatically if in PINCH or PEACE modes
                if (isPinchingRef.current || isEraserRef.current) {
                    if (isPinchingRef.current) {
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 3;
                    } else {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 20;
                    }

                    if (!lastDrawPosRef.current) {
                        // Start of the stroke path
                        ctx.beginPath();
                        ctx.moveTo(smoothedPosRef.current.x, smoothedPosRef.current.y);
                    } else {
                        // Draw segment from previous smoothed point
                        ctx.lineTo(smoothedPosRef.current.x, smoothedPosRef.current.y);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(smoothedPosRef.current.x, smoothedPosRef.current.y);
                    }

                    lastDrawPosRef.current = { ...smoothedPosRef.current };
                } else {
                    // Reset draw path history if not pinching/erasing
                    lastDrawPosRef.current = null;
                    ctx.beginPath();
                }
            } else {
                // Reset tracking states if hands are lost or paused
                smoothedPosRef.current = null;
                lastDrawPosRef.current = null;
                setPointerPos(null);
                ctx.beginPath();
            }

            animationFrameIdRef.current = requestAnimationFrame(drawLoop);
        };

        animationFrameIdRef.current = requestAnimationFrame(drawLoop);

        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
            }
        };
    }, [canvasRef]);

    // Load an image onto the canvas
    const loadImage = useCallback((imageUrl: string) => {
        if (!canvasRef.current || !ctxRef.current) return;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            configureContext(ctx);
        };
        img.src = imageUrl;
    }, []);

    // Export canvas as PNG base64
    const exportImage = useCallback(() => {
        if (!canvasRef.current) return '';
        return canvasRef.current.toDataURL('image/png');
    }, []);

    // Clear canvas to white
    const clearCanvas = useCallback(() => {
        if (!canvasRef.current || !ctxRef.current) return;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        configureContext(ctx);
    }, []);

    return {
        currentTool,
        selectTool,
        pointerPos,
        loadImage,
        exportImage,
        clearCanvas,
    };
}