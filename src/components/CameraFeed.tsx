import React, { useEffect, useRef } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';

interface CameraFeedProps {
    onHandsDetected?: (hands: any[]) => void;
    className?: string;
    showPreview?: boolean;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
    onHandsDetected,
    className = '',
    showPreview = true,
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

    useEffect(() => {
        void startCamera();
        return () => {
            stopCamera();
        };
    }, [startCamera, stopCamera]);

    return (
        <div className={`relative h-screen w-screen overflow-hidden bg-black ${className}`}>
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas ref={canvasRef} className={showPreview ? 'h-screen w-screen block' : 'hidden'} />
            {!showPreview && (
                <div className="absolute inset-0 flex items-center justify-center bg-black text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
                    Modo pantalla
                </div>
            )}

            {state.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                </div>
            )}

            {state.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <button
                        onClick={restartCamera}
                        className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur"
                    >
                        Retry
                    </button>
                </div>
            )}
        </div>
    );
};