import React, { useRef, useEffect } from 'react';
import { EditorAction } from '../types/hand';

interface ImageEditorProps {
    onActionCompleted?: (action: EditorAction) => void;
    className?: string;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
    onActionCompleted,
    className = '',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Inicializar canvas
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctxRef.current = ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Configurar para dibujar
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

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
    }, []);

    const startDrawing = (e: MouseEvent) => {
        isDrawingRef.current = true;
        draw(e);
    };

    const draw = (e: MouseEvent) => {
        if (!isDrawingRef.current || !ctxRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const ctx = ctxRef.current;
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const stopDrawing = () => {
        isDrawingRef.current = false;
        if (ctxRef.current) {
            ctxRef.current.beginPath();
        }
    };

    // Cargar imagen
    const handleLoadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !ctxRef.current || !canvasRef.current) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                if (!ctxRef.current || !canvasRef.current) return;

                const ctx = ctxRef.current;
                const canvas = canvasRef.current;

                // Ajustar canvas al tamaño de la imagen
                canvas.width = img.width;
                canvas.height = img.height;

                ctx.drawImage(img, 0, 0);
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Exportar
    const handleExport = () => {
        if (!canvasRef.current) return;

        const link = document.createElement('a');
        link.download = 'edited-image.png';
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    };

    // Limpiar canvas
    const handleClear = () => {
        if (!ctxRef.current || !canvasRef.current) return;

        const ctx = ctxRef.current;
        const canvas = canvasRef.current;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const tools = [
        { id: 'SELECT_BRUSH', icon: '🖌️', label: 'Pincel' },
        { id: 'SELECT_ERASER', icon: '🧹', label: 'Borrador' },
        { id: 'SELECT_MOVE', icon: '✋', label: 'Mover' },
        { id: 'SELECT_ZOOM', icon: '🔍', label: 'Zoom' },
    ] as const;

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
                        onClick={() => onActionCompleted?.(tool.id)}
                        className="px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 text-lg"
                        title={tool.label}
                    >
                        {tool.icon}
                    </button>
                ))}

                <div className="w-px h-8 bg-gray-300" />

                <button
                    onClick={handleClear}
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

            {/* Canvas */}
            <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    className="w-full h-auto cursor-crosshair"
                />
            </div>

            <div className="text-center text-sm text-gray-600">
                <p>
                    <strong>Consejo:</strong> Usá gestos frente a la cámara para cambiar herramientas
                </p>
            </div>
        </div>
    );
};