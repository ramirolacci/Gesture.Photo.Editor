import React from 'react';
import { GestureType } from '../types/hand';

interface TutorialOverlayProps {
    visible: boolean;
    currentStep: { id: GestureType; title: string; description: string; icon: string };
    stepIndex: number;
    totalSteps: number;
    completedSteps: GestureType[];
    showCheck: boolean;
    contextualHint: { gestureType: GestureType; title: string; description: string; icon: string } | null;
    onSkip: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
    visible,
    currentStep,
    stepIndex,
    totalSteps,
    completedSteps,
    showCheck,
    contextualHint,
    onSkip,
}) => {
    if (!visible) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm">
            <div className="pointer-events-auto w-[min(480px,calc(100vw-2rem))] rounded-[2rem] border border-white/15 bg-black/70 p-6 text-white shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">Guía rápida</div>
                        <div className="text-2xl font-semibold">{currentStep.title}</div>
                    </div>
                    <button onClick={onSkip} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80">Saltar</button>
                </div>

                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/20 text-3xl">{currentStep.icon}</div>
                    <div>
                        <div className="text-sm text-white/90">{currentStep.description}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/55">Paso {stepIndex + 1} / {totalSteps}</div>
                    </div>
                </div>

                <div className="mb-4 flex gap-2">
                    {Array.from({ length: totalSteps }).map((_, index) => (
                        <div key={index} className={`h-2 flex-1 rounded-full ${index < completedSteps.length ? 'bg-cyan-400' : 'bg-white/20'}`} />
                    ))}
                </div>

                <div className="text-sm text-white/75">Imita el gesto para avanzar. Ideal para videollamadas, presentaciones y clases cuando querés dibujar o señalar sobre la pantalla.</div>

                {showCheck && (
                    <div className="mt-4 flex items-center justify-center text-4xl font-semibold text-emerald-400">✓</div>
                )}

                {contextualHint && (
                    <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
                            <span>{contextualHint.icon}</span>
                            <span>{contextualHint.title}</span>
                        </div>
                        <div className="mt-1 text-sm text-white/75">{contextualHint.description}</div>
                    </div>
                )}
            </div>
        </div>
    );
};
