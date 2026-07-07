import { useRef, useEffect, useCallback } from 'react';
import { fabric } from 'fabric';
import { EditorAction } from '../types/hand';

interface UseCanvasManipulationOptions {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    onActionCompleted?: (action: EditorAction) => void;
}

export function useCanvasManipulation(options: UseCanvasManipulationOptions) {
    const { canvasRef, onActionCompleted } = options;
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const currentToolRef = useRef<string>('select');
    const isDrawingRef = useRef(false);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

    // Inicializar Fabric.js canvas
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = new fabric.Canvas(canvasRef.current, {
            isDrawingMode: false,
            backgroundColor: '#ffffff',
        });

        fabricCanvasRef.current = canvas;

        // Configurar herramientas
        setupBrush(canvas);

        // Event listeners
        canvas.on('mouse:down', (opt: fabric.IEvent) => {
            if (opt.pointer) {
                lastPointerRef.current = { x: opt.pointer.x, y: opt.pointer.y };
            }

            if (currentToolRef.current === 'brush') {
                isDrawingRef.current = true;
            }
        });

        canvas.on('mouse:move', (opt: fabric.IEvent) => {
            if (!opt.pointer || !lastPointerRef.current) return;

            if (currentToolRef.current === 'brush' && isDrawingRef.current) {
                // Dibujar línea
                const points = [
                    lastPointerRef.current.x,
                    lastPointerRef.current.y,
                    opt.pointer.x,
                    opt.pointer.y,
                ];
                const line = new fabric.Line(points, {
                    strokeWidth: 3,
                    fill: '#000000',
                    stroke: '#000000',
                    originX: 'center',
                    originY: 'center',
                });
                canvas.add(line);
            }

            lastPointerRef.current = { x: opt.pointer.x, y: opt.pointer.y };
        });

        canvas.on('mouse:up', () => {
            isDrawingRef.current = false;
        });

        return () => {
            canvas.dispose();
        };
    }, [canvasRef]);

    // Configurar pincel
    const setupBrush = (canvas: fabric.Canvas) => {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = '#000000';
        canvas.freeDrawingBrush.width = 3;
    };

    // ... resto del código lo dejamos igual por ahora
    // (te lo completo en el siguiente mensaje si este fix funciona)

    const selectTool = useCallback((tool: string) => {
        currentToolRef.current = tool;

        if (!fabricCanvasRef.current) return;

        const canvas = fabricCanvasRef.current;

        if (tool === 'brush') {
            canvas.isDrawingMode = true;
        } else if (tool === 'eraser') {
            canvas.isDrawingMode = true;
            const eraserBrush = new fabric.PencilBrush(canvas);
            eraserBrush.color = '#ffffff';
            eraserBrush.width = 15;
            canvas.freeDrawingBrush = eraserBrush;
        } else if (tool === 'select' || tool === 'move') {
            canvas.isDrawingMode = false;
        }
    }, []);

    const executeAction = useCallback(
        (action: EditorAction) => {
            if (!fabricCanvasRef.current) return;

            switch (action) {
                case 'SELECT_BRUSH':
                    selectTool('brush');
                    break;
                case 'SELECT_ERASER':
                    selectTool('eraser');
                    break;
                case 'SELECT_MOVE':
                    selectTool('move');
                    break;
                case 'PAN_CANVAS':
                    selectTool('pan');
                    fabricCanvasRef.current.selection = false;
                    break;
                case 'SELECT_ZOOM':
                    selectTool('zoom');
                    break;
                case 'APPLY_FILTER':
                    applyFilter('blur');
                    break;
                case 'UNDO':
                    undo();
                    break;
                case 'REDO':
                    redo();
                    break;
            }

            if (onActionCompleted) {
                onActionCompleted(action);
            }
        },
        [selectTool, onActionCompleted]
    );

    const applyFilter = useCallback((filterType: string) => {
        if (!fabricCanvasRef.current) return;
        console.log('Filtro no implementado aún:', filterType);
    }, []);

    const undo = useCallback(() => {
        if (!fabricCanvasRef.current) return;

        const canvas = fabricCanvasRef.current;
        const lastObject = canvas.item(canvas.size() - 1) as any;
        if (lastObject) {
            canvas.remove(lastObject);
        }
    }, []);

    const redo = useCallback(() => {
        console.log('Redo no implementado en esta versión');
    }, []);

    const loadImage = useCallback((imageUrl: string) => {
        if (!fabricCanvasRef.current) return;

        fabric.Image.fromURL(imageUrl, (img: fabric.Image) => {
            if (!fabricCanvasRef.current) return;

            const canvas = fabricCanvasRef.current;

            const canvasWidth = canvas.width || 800;
            const canvasHeight = canvas.height || 600;

            const scale = Math.min(
                canvasWidth / (img.width || 1),
                canvasHeight / (img.height || 1)
            );

            img.set({
                scaleX: scale,
                scaleY: scale,
                originX: 'center',
                originY: 'center',
            });

            canvas.add(img);
            canvas.centerObject(img);
            canvas.setActiveObject(img);
        });
    }, []);

    const exportImage = useCallback((format: 'png' | 'jpeg' = 'png'): string => {
        if (!fabricCanvasRef.current) return '';

        const canvas = fabricCanvasRef.current;
        return canvas.toDataURL({
            format,
            quality: 1,
        });
    }, []);

    const clearCanvas = useCallback(() => {
        if (!fabricCanvasRef.current) return;

        const canvas = fabricCanvasRef.current;
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
    }, []);

    return {
        fabricCanvasRef,
        executeAction,
        selectTool,
        loadImage,
        exportImage,
        clearCanvas,
        applyFilter,
        undo,
        redo,
    };
}