import { useEffect, useRef, useState, useCallback } from 'react';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { HandLandmarks, HandTrackingState } from '../types/hand';

interface UseHandTrackingOptions {
    videoRef: React.RefObject<HTMLVideoElement>;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    maxHands?: number;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
    onHandsDetected?: (hands: HandLandmarks[]) => void;
}

const DEFAULT_OPTIONS: Partial<UseHandTrackingOptions> = {
    maxHands: 2,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
};

export function useHandTracking(options: UseHandTrackingOptions) {
    const {
        videoRef,
        canvasRef,
        maxHands = DEFAULT_OPTIONS.maxHands!,
        minDetectionConfidence = DEFAULT_OPTIONS.minDetectionConfidence!,
        minTrackingConfidence = DEFAULT_OPTIONS.minTrackingConfidence!,
        onHandsDetected,
    } = options;

    const [state, setState] = useState<HandTrackingState>({
        isTracking: false,
        hands: [],
        gestures: [],
        lastAction: 'NONE',
        isLoading: false,
        error: null,
    });

    const handsRef = useRef<Hands | null>(null);
    const cameraRef = useRef<Camera | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Inicializar MediaPipe Hands
    useEffect(() => {
        const initializeHands = async () => {
            setState(prev => ({ ...prev, isLoading: true }));

            try {
                const hands = new Hands({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
                    },
                });

                hands.setOptions({
                    maxNumHands: maxHands,
                    modelComplexity: 1,
                    minDetectionConfidence: minDetectionConfidence,
                    minTrackingConfidence: minTrackingConfidence,
                });

                hands.onResults((results) => {
                    if (!canvasRef.current || !videoRef.current) return;

                    // Dibujar landmarks en el canvas
                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    ctx.save();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // Dibujar imagen del video con proporción preservada en pantalla completa
                    const videoWidth = videoRef.current.videoWidth;
                    const videoHeight = videoRef.current.videoHeight;
                    const canvasRatio = canvas.width / canvas.height;
                    const videoRatio = videoWidth / videoHeight;

                    let sx = 0;
                    let sy = 0;
                    let sWidth = videoWidth;
                    let sHeight = videoHeight;

                    if (videoRatio > canvasRatio) {
                        sWidth = videoHeight * canvasRatio;
                        sx = (videoWidth - sWidth) / 2;
                    } else {
                        sHeight = videoWidth / canvasRatio;
                        sy = (videoHeight - sHeight) / 2;
                    }

                    ctx.drawImage(
                        videoRef.current,
                        sx,
                        sy,
                        sWidth,
                        sHeight,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );

                    // Procesar y dibujar cada mano detectada
                    const detectedHands: HandLandmarks[] = [];

                    if (results.multiHandLandmarks && results.multiHandedness) {
                        for (
                            let index = 0;
                            index < results.multiHandLandmarks.length;
                            index++
                        ) {
                            const landmarks = results.multiHandLandmarks[index];
                            const handedness = results.multiHandedness[index];

                            // Convertir landmarks a nuestro formato
                            const handLandmarks: HandLandmarks = {
                                landmarks: landmarks.map((landmark) => ({
                                    x: landmark.x,
                                    y: landmark.y,
                                    z: landmark.z || 0,
                                })),
                                handedness: handedness.label === 'Left' ? 'left' : 'right',
                            };

                            detectedHands.push(handLandmarks);

                            // Dibujar conexiones y landmarks
                            const handConnections = HAND_CONNECTIONS;
                            drawConnectors(ctx, landmarks, handConnections, {
                                color: '#00FF00',
                                lineWidth: 2,
                            });
                            drawLandmarks(ctx, landmarks, {
                                color: '#FF0000',
                                lineWidth: 1,
                                radius: 3,
                            });
                        }
                    }

                    ctx.restore();

                    // Actualizar estado
                    setState(prev => ({
                        ...prev,
                        hands: detectedHands,
                        isTracking: true,
                        isLoading: false,
                    }));

                    // Callback opcional
                    if (onHandsDetected) {
                        onHandsDetected(detectedHands);
                    }
                });

                handsRef.current = hands;
            } catch (error) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: `Error inicializando Hands: ${error}`,
                }));
            }
        };

        initializeHands();

        return () => {
            if (handsRef.current) {
                handsRef.current.close();
            }
        };
    }, [maxHands, minDetectionConfidence, minTrackingConfidence, onHandsDetected, canvasRef, videoRef]);

    // Iniciar cámara
    const startCamera = useCallback(async () => {
        if (!videoRef.current || !handsRef.current) return;

        try {
            setState(prev => ({ ...prev, isLoading: true }));

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user',
                },
            });

            videoRef.current.srcObject = stream;

            await new Promise<void>((resolve) => {
                if (videoRef.current) {
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();
                        resolve();
                    };
                }
            });

            // Configurar canvas con mismo tamaño que video
            if (canvasRef.current && videoRef.current) {
                const videoWidth = videoRef.current.videoWidth || 640;
                const videoHeight = videoRef.current.videoHeight || 480;
                canvasRef.current.width = videoWidth;
                canvasRef.current.height = videoHeight;
            }

            let lastProcessTime = 0;
            // Iniciar detección
            const camera = new Camera(videoRef.current, {
                onFrame: async () => {
                    const now = Date.now();
                    if (now - lastProcessTime >= 50) { // Limit to 20fps
                        lastProcessTime = now;
                        if (handsRef.current) {
                            await handsRef.current.send({
                                image: videoRef.current!,
                            });
                        }
                    }
                },
                width: 640,
                height: 480,
            });

            camera.start();
            cameraRef.current = camera;

            setState(prev => ({
                ...prev,
                isTracking: true,
                isLoading: false,
                error: null,
            }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: `Error iniciando cámara: ${error}`,
            }));
        }
    }, [videoRef, canvasRef]);

    // Detener cámara
    const stopCamera = useCallback(() => {
        if (cameraRef.current) {
            cameraRef.current.stop();
            cameraRef.current = null;
        }

        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }

        setState(prev => ({
            ...prev,
            isTracking: false,
            hands: [],
        }));
    }, [videoRef]);

    // Limpiar al desmontar
    useEffect(() => {
        return () => {
            stopCamera();
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [stopCamera]);

    return {
        state,
        startCamera,
        stopCamera,
        restartCamera: () => {
            stopCamera();
            setTimeout(() => startCamera(), 100);
        },
    };
}