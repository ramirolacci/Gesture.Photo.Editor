import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorAction, Landmark } from '../types/hand';

interface UseCanvasManipulationOptions {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    onActionCompleted?: (action: EditorAction) => void;
}

export function useCanvasManipulation(options: UseCanvasManipulationOptions) {
    const { canvasRef, onActionCompleted } = options;
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    const lastHandPosRef = useRef<{ x: number; y: number } | null>(null);
    
    const [currentTool, setCurrentTool] = useState<EditorAction>('NONE');
    const currentToolRef = useRef<EditorAction>('NONE');

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

    // Initial configuration of canvas
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

    // Programmatic drawing from hand landmark coordinates (MediaPipe)
    const drawFromLandmark = useCallback((landmark: Landmark | null, tool: EditorAction) => {
        if (!ctxRef.current || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;

        if (!landmark || (tool !== 'SELECT_BRUSH' && tool !== 'SELECT_ERASER')) {
            // Stop drawing, clear path history
            lastHandPosRef.current = null;
            ctx.beginPath();
            return;
        }

        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;

        if (tool === 'SELECT_BRUSH') {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
        } else if (tool === 'SELECT_ERASER') {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 20;
        }

        if (!lastHandPosRef.current) {
            // First point of the path
            ctx.beginPath();
            ctx.moveTo(x, y);
        } else {
            // Draw segment from previous coordinate
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        }

        lastHandPosRef.current = { x, y };
    }, []);

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
        drawFromLandmark,
        loadImage,
        exportImage,
        clearCanvas,
    };
}