import { useState, useCallback, useEffect, useRef } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { ImageEditor } from './components/ImageEditor';
import { GestureIndicator } from './components/GestureIndicator';
import { Toolbar } from './components/Toolbar';
import { useGestureRecognition } from './hooks/useGestureRecognition';
import { HandLandmarks, RecognizedGesture, EditorAction } from './types/hand';

function App() {
    const [hands, setHands] = useState<HandLandmarks[]>([]);
    const [currentAction, setCurrentAction] = useState<EditorAction>('NONE');
    const [isGesturePaused, setIsGesturePaused] = useState(false);
    const wasOpenPalmRef = useRef(false);

    // Callback cuando se detectan manos
    const handleHandsDetected = useCallback((detectedHands: HandLandmarks[]) => {
        setHands(detectedHands);
    }, []);

    // Callback cuando se reconoce un gesto
    const handleGestureDetected = useCallback(
        (gesture: RecognizedGesture, action: EditorAction) => {
            if (isGesturePaused) return;

            setCurrentAction(action);
            console.log(`Gesto detectado: ${gesture.type} (${gesture.hand}) → Acción: ${action}`);

            // Ejecutar acciones en el editor si existen
            if ((window as any).executeEditorAction) {
                (window as any).executeEditorAction(action);
            }
        },
        [isGesturePaused]
    );

    // Hook de reconocimiento de gestos
    const { gestures } = useGestureRecognition({
        hands,
        onGestureDetected: handleGestureDetected,
        debounceMs: 500, // Evitar activaciones múltiples muy rápidas
    });

    // Detectar transiciones al gesto OPEN_PALM (✋) para pausar/reanudar la detección
    useEffect(() => {
        const hasOpenPalm = gestures.some((g) => g.type === 'OPEN_PALM');
        if (hasOpenPalm && !wasOpenPalmRef.current) {
            setIsGesturePaused((prev) => !prev);
            console.log('Toggled gesture detection pause state due to OPEN_PALM gesture.');
        }
        wasOpenPalmRef.current = hasOpenPalm;
    }, [gestures]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <h1 className="text-2xl font-bold text-gray-900">
                        🎨 Gesture Photo Editor
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Edita imágenes con gestos de tus manos
                    </p>
                </div>
            </header>

            {/* Contenido principal */}
            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Banner de estado de los gestos */}
                <div
                    className={`mb-6 p-4 rounded-xl border-2 transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow ${
                        isGesturePaused
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-green-50 border-green-300 text-green-950'
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{isGesturePaused ? '⏸️' : '▶️'}</span>
                        <div>
                            <p className="font-semibold text-base">
                                {isGesturePaused ? 'Detección de gestos pausada' : 'Detección de gestos activa'}
                            </p>
                            <p className="text-xs opacity-80 mt-0.5">
                                {isGesturePaused
                                    ? 'Mostrá la mano abierta (✋) o hacé click en el botón para reanudar la detección.'
                                    : 'Mostrá la mano abierta (✋) para pausar temporalmente y evitar cambios accidentales.'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsGesturePaused((prev) => !prev)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow shrink-0 ${
                            isGesturePaused
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-green-700 hover:bg-green-800 text-white'
                        }`}
                    >
                        {isGesturePaused ? 'Reanudar Detección' : 'Pausar Detección'}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Columna izquierda: Cámara y gestos */}
                    <div className="space-y-6">
                        {/* Sección de cámara */}
                        <section className="bg-white rounded-lg shadow p-4">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4">
                                📷 Cámara
                            </h2>
                            <CameraFeed onHandsDetected={handleHandsDetected} />
                        </section>

                        {/* Sección de gestos detectados */}
                        <section className="bg-white rounded-lg shadow p-4">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4">
                                👋 Gestos detectados
                            </h2>
                            <GestureIndicator gestures={gestures} />
                        </section>
                    </div>

                    {/* Columna derecha: Editor y toolbar */}
                    <div className="space-y-6">
                        {/* Sección del editor */}
                        <section className="bg-white rounded-lg shadow p-4">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4">
                                🖼️ Editor de imágenes
                            </h2>
                            <ImageEditor
                                onActionCompleted={setCurrentAction}
                                hands={hands}
                                currentAction={currentAction}
                                gestures={gestures}
                                isGesturePaused={isGesturePaused}
                            />
                        </section>

                        {/* Toolbar con info */}
                        <section>
                            <Toolbar currentAction={currentAction} />
                        </section>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="mt-12 py-6 bg-white border-t border-gray-200">
                <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-600">
                    <p>
                        Hecho con ❤️ usando MediaPipe Hands + HTML5 Canvas
                    </p>
                    <p className="mt-1">
                        Mové tus manos frente a la cámara para controlar el editor
                    </p>
                </div>
            </footer>
        </div>
    );
}

export default App;