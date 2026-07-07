import React, { useRef, useEffect, useState } from 'react';
import { EditorAction, HandLandmarks, RecognizedGesture } from '../types/hand';
import { useCanvasManipulation } from '../hooks/useCanvasManipulation';

interface ImageEditorProps {
    onActionCompleted?: (action: EditorAction) => void;
    className?: string;
    hands?: HandLandmarks[];
    currentAction?: EditorAction;
    gestures?: RecognizedGesture[];
    isGesturePaused?: boolean;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
    onActionCompleted,
    className = '',
    hands = [],
    currentAction = 'NONE',
    gestures = [],
    isGesturePaused = false,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

    const {
        currentTool,
        selectTool,
        drawFromLandmark,
        loadImage,
        exportImage,
        clearCanvas,
    } = useCanvasManipulation({
        canvasRef,
        onActionCompleted,
    });

    // Synchronize parent's currentAction changes with the hook
    useEffect(() => {
        if (currentAction && currentAction !== currentTool) {
            selectTool(currentAction);
        }
    }, [currentAction, currentTool, selectTool]);

    // Handle programmatic drawing & cursor tracking from MediaPipe hand landmarks in real-time
    useEffect(() => {
        if (isGesturePaused || hands.length === 0 || gestures.length === 0) {
            drawFromLandmark(null, 'NONE');
            setCursorPos(null);
            return;
        }

        // Get the active tracking hand (first hand detected)
        const hand = hands[0];
        const gesture = gestures.find((g) => g.hand === hand.handedness) || gestures[0];

        // Track index finger tip (landmark index 8)
        const indexTip = hand.landmarks[8];
        if (!indexTip) {
            drawFromLandmark(null, 'NONE');
            setCursorPos(null);
            return;
        }

        const canvas = canvasRef.current;
        if (canvas) {
            // Map coordinates and update cursor position state
            const x = indexTip.x * canvas.width;
            const y = indexTip.y * canvas.height;
            setCursorPos({ x, y });
        }

        // Draw programmatically based on active gesture
        if (gesture.type === 'PINCH') {
            drawFromLandmark(indexTip, 'SELECT_BRUSH');
        } else if (gesture.type === 'PEACE') {
            drawFromLandmark(indexTip, 'SELECT_ERASER');
        } else {
            drawFromLandmark(null, 'NONE');
        }
    }, [hands, gestures, isGesturePaused, drawFromLandmark]);

    // Load file image
    const handleLoadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                loadImage(e.target.result as string);
            }
        };
        reader.readAsDataURL(file);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Export image as PNG
    const handleExport = () => {
        const dataUrl = exportImage();
        if (!dataUrl) return;

        const link = document.createElement('a');
        link.download = 'edited-image.png';
        link.href = dataUrl;
        link.click();
    };

    const tools = [
        { id: 'SELECT_BRUSH', icon: '🖌️', label: 'Pincel' },
        { id: 'SELECT_ERASER', icon: '🧹', label: 'Borrador' },
        { id: 'SELECT_MOVE', icon: '✋', label: 'Mover' },
        { id: 'SELECT_ZOOM', icon: '🔍', label: 'Zoom' },
    ] as const;

    const canvasWidth = canvasRef.current?.width || 800;
    const canvasHeight = canvasRef.current?.height || 600;

    return (
        <div className={`flex flex-col gap-4 ${className}`}>
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                >
                    📁 Cargar imagen
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLoadImage}
                    className="hidden"
                />

                <div className="w-px h-8 bg-gray-300" />

                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={() => selectTool(tool.id)}
                        className={`px-3 py-2 border rounded text-lg transition-all ${
                            currentTool === tool.id
                                ? 'bg-blue-600 text-white border-blue-600 shadow'
                                : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
                        }`}
                        title={tool.label}
                    >
                        {tool.icon}
                    </button>
                ))}

                <div className="w-px h-8 bg-gray-300" />

                <button
                    onClick={clearCanvas}
                    className="px-3 py-2 bg-red-50 text-red-600 border border-red-300 rounded hover:bg-red-100 text-sm"
                >
                    Limpiar
                </button>
                <button
                    onClick={handleExport}
                    className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                >
                    💾 Exportar
                </button>
            </div>

            {/* Canvas Container */}
            <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    className="w-full h-auto cursor-crosshair block"
                />

                {/* Hand Gesture Cursor Overlay */}
                {cursorPos && !isGesturePaused && (
                    <div
                        className={`absolute pointer-events-none rounded-full border-2 transition-all duration-75 shadow-lg flex items-center justify-center ${
                            currentTool === 'SELECT_ERASER'
                                ? 'border-red-500 bg-red-200/40'
                                : 'border-blue-500 bg-blue-200/40'
                        }`}
                        style={{
                            left: `${(cursorPos.x / canvasWidth) * 100}%`,
                            top: `${(cursorPos.y / canvasHeight) * 100}%`,
                            width: currentTool === 'SELECT_ERASER' ? '30px' : '16px',
                            height: currentTool === 'SELECT_ERASER' ? '30px' : '16px',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 40,
                        }}
                    >
                        {/* A tiny inner dot */}
                        <div
                            className={`rounded-full ${
                                currentTool === 'SELECT_ERASER' ? 'w-2 h-2 bg-red-600' : 'w-1.5 h-1.5 bg-blue-600'
                            }`}
                        />
                    </div>
                )}
            </div>

            <div className="text-center text-sm text-gray-600">
                <p>
                    <strong>Consejo:</strong> Usá gestos frente a la cámara para cambiar herramientas (👌 Pincel, ✌️ Borrador, 👆 Mover, ✋ Pausar)
                </p>
            </div>
        </div>
    );
};