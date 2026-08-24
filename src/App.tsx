import { useState, useCallback, useEffect, useRef } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { ImageEditor as AnnotationCanvas } from './components/ImageEditor';
import { useGestureRecognition } from './hooks/useGestureRecognition';
import { useHandCursor } from './hooks/useHandCursor';
import { HandLandmarks, RecognizedGesture, EditorAction } from './types/hand';

function App() {
    const [hands, setHands] = useState<HandLandmarks[]>([]);
    const [currentAction, setCurrentAction] = useState<EditorAction>('NONE');
    const [isGesturePaused, setIsGesturePaused] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showCameraPreview, setShowCameraPreview] = useState(true);
    const wasOpenPalmRef = useRef(false);
    const wasSettingsGestureRef = useRef(false);

    const handleHandsDetected = useCallback((detectedHands: HandLandmarks[]) => {
        setHands(detectedHands);
    }, []);

    const handleGestureDetected = useCallback(
        (_gesture: RecognizedGesture, action: EditorAction) => {
            if (isGesturePaused) return;
            setCurrentAction(action);
        },
        [isGesturePaused]
    );

    const { gestures } = useGestureRecognition({
        hands,
        onGestureDetected: handleGestureDetected,
        debounceMs: 350,
    });

    const {
        cursorPosition: handCursorPosition,
        isVisible: isHandCursorVisible,
        isDrawing,
        isErasing,
        isMoving,
    } = useHandCursor({
        hands,
        gestures,
        isGesturePaused,
        viewportSize: { width: window.innerWidth, height: window.innerHeight },
    });

    useEffect(() => {
        const hasOpenPalm = gestures.some((g) => g.type === 'OPEN_PALM');
        if (hasOpenPalm && !wasOpenPalmRef.current) {
            setIsGesturePaused((prev) => !prev);
        }
        wasOpenPalmRef.current = hasOpenPalm;
    }, [gestures]);

    useEffect(() => {
        const specialGestureActive = hands.length >= 2 && gestures.every((g) => g.type === 'PEACE');
        if (specialGestureActive && !wasSettingsGestureRef.current) {
            setShowSettings((prev) => !prev);
        }
        wasSettingsGestureRef.current = specialGestureActive;
    }, [gestures, hands.length]);

    useEffect(() => {
        const syncFullscreenState = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        syncFullscreenState();
        document.addEventListener('fullscreenchange', syncFullscreenState);

        return () => {
            document.removeEventListener('fullscreenchange', syncFullscreenState);
        };
    }, []);

    const handleExitFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
        } catch {
            // Ignored
        }
    }, []);

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
            <CameraFeed onHandsDetected={handleHandsDetected} className="absolute inset-0 z-0" showPreview={showCameraPreview} />

            <div className="pointer-events-none absolute inset-0 z-10">
                <AnnotationCanvas
                    className="absolute inset-0 z-20"
                    onActionCompleted={setCurrentAction}
                    hands={hands}
                    currentAction={currentAction}
                    gestures={gestures}
                    isGesturePaused={isGesturePaused}
                    onToggleGesturePause={() => setIsGesturePaused((prev) => !prev)}
                    handCursorPosition={handCursorPosition}
                    handCursorState={{ isVisible: isHandCursorVisible, isDrawing, isErasing, isMoving }}
                />

                {showSettings && (
                    <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center pb-6">
                        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-2 shadow-2xl backdrop-blur">
                            <button
                                onClick={() => setIsGesturePaused((prev) => !prev)}
                                className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
                            >
                                {isGesturePaused ? '▶' : '⏸'}
                            </button>
                            <button
                                onClick={handleExitFullscreen}
                                className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
                            >
                                {isFullscreen ? '⤡' : '⤢'}
                            </button>
                            <button
                                onClick={() => setShowCameraPreview((prev) => !prev)}
                                className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
                            >
                                {showCameraPreview ? '🖥️' : '📌'}
                            </button>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;