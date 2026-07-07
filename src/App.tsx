import { useState, useCallback } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { ImageEditor } from './components/ImageEditor';
import { GestureIndicator } from './components/GestureIndicator';
import { Toolbar } from './components/Toolbar';
import { useGestureRecognition } from './hooks/useGestureRecognition';
import { HandLandmarks, RecognizedGesture, EditorAction } from './types/hand';

function App() {
    const [hands, setHands] = useState<HandLandmarks[]>([]);
    const [currentAction, setCurrentAction] = useState<EditorAction>('NONE');

    // Callback cuando se detectan manos
    const handleHandsDetected = useCallback((detectedHands: HandLandmarks[]) => {
        setHands(detectedHands);
    }, []);

    // Callback cuando se reconoce un gesto
    const handleGestureDetected = useCallback(
        (gesture: RecognizedGesture, action: EditorAction) => {
            setCurrentAction(action);
            console.log(`Gesto detectado: ${gesture.type} (${gesture.hand}) → Acción: ${action}`);

            // Aquí podés ejecutar acciones en el editor
            // Ejemplo: llamar a executeEditorAction desde ImageEditor
            if ((window as any).executeEditorAction) {
                (window as any).executeEditorAction(action);
            }
        },
        []
    );

    // Hook de reconocimiento de gestos
    const { gestures } = useGestureRecognition({
        hands,
        onGestureDetected: handleGestureDetected,
        debounceMs: 500, // Evitar activaciones múltiples muy rápidas
    });

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
                            <ImageEditor onActionCompleted={setCurrentAction} />
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
                        Hecho con ❤️ usando MediaPipe Hands + Fabric.js
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