import React, { useRef } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';

interface CameraFeedProps {
    onHandsDetected?: (hands: any[]) => void;
    className?: string;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
    onHandsDetected,
    className = '',
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const { state, startCamera, stopCamera, restartCamera } = useHandTracking({
        videoRef,
        canvasRef,
        maxHands: 2,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
        onHandsDetected,
    });

    const handleToggleCamera = async () => {
        if (state.isTracking) {
            stopCamera();
        } else {
            await startCamera();
        }
    };

    return (
        <div className={`relative ${className}`}>
            {/* Video oculto (solo para captura) */}
            <video
                ref={videoRef}
                className="hidden"
                playsInline
                muted
                autoPlay
            />

            {/* Canvas con video + landmarks */}
            <div className="relative rounded-lg overflow-hidden bg-gray-900">
                <canvas
                    ref={canvasRef}
                    className="w-full h-auto max-w-md mx-auto"
                />

                {/* Overlay de estado */}
                {state.isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <div className="text-white text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2" />
                            <p>Iniciando cámara...</p>
                        </div>
                    </div>
                )}

                {state.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <div className="text-white text-center p-4">
                            <p className="text-red-400 mb-2">Error: {state.error}</p>
                            <button
                                onClick={restartCamera}
                                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                            >
                                Reintentar
                            </button>
                        </div>
                    </div>
                )}

                {!state.isTracking && !state.isLoading && !state.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <button
                            onClick={handleToggleCamera}
                            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                        >
                            Activar Cámara
                        </button>
                    </div>
                )}

                {state.isTracking && (
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-white text-sm">Detectando manos</span>
                        <button
                            onClick={stopCamera}
                            className="ml-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                        >
                            Detener
                        </button>
                    </div>
                )}
            </div>

            {/* Info de manos detectadas */}
            {state.isTracking && (
                <div className="mt-2 text-center text-sm text-gray-600">
                    {state.hands.length} mano(s) detectada(s)
                </div>
            )}
        </div>
    );
};