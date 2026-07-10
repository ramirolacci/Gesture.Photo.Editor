import React from 'react';

interface MiniMapProps {
    zoom: number;
    pan: { x: number; y: number };
    viewportRect: { x: number; y: number; width: number; height: number };
    visible: boolean;
}

export const MiniMap: React.FC<MiniMapProps> = ({ zoom, viewportRect, visible }) => {
    if (!visible) return null;

    const width = 140;
    const height = 90;
    const scale = Math.max(0.5, Math.min(1.5, 1 / zoom));

    const rect = {
        x: ((viewportRect.x / 1800) * width) + width * 0.1,
        y: ((viewportRect.y / 1200) * height) + height * 0.1,
        width: Math.max(20, (viewportRect.width / 1800) * width * scale),
        height: Math.max(16, (viewportRect.height / 1200) * height * scale),
    };

    return (
        <div className="pointer-events-none absolute bottom-4 right-4 z-30 rounded-2xl border border-white/15 bg-black/60 p-2 shadow-2xl backdrop-blur">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Mini-map</div>
            <div className="relative overflow-hidden rounded-xl border border-white/10" style={{ width, height }}>
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-cyan-500/10" />
                <div className="absolute left-0 top-0 h-full w-full border border-dashed border-white/20" />
                <div className="absolute rounded-sm border border-cyan-400/80 bg-cyan-400/30" style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }} />
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/60">Zoom {Math.round(zoom * 100)}%</div>
        </div>
    );
};
