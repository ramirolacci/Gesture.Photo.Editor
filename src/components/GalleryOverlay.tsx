import React from 'react';

interface GalleryOverlayProps {
    visible: boolean;
    projects: Array<{ id: string; name: string; savedAt: string }>;
    onClose: () => void;
    onOpen: (project: { id: string; name: string; savedAt: string; data: string }) => void;
}

export const GalleryOverlay: React.FC<GalleryOverlayProps> = ({ visible, projects, onClose, onOpen }) => {
    if (!visible) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-3xl border border-white/20 bg-black/70 p-4 shadow-2xl backdrop-blur">
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Galería</div>
                        <div className="text-sm font-semibold text-white">Últimos proyectos</div>
                    </div>
                    <button onClick={onClose} className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/80">✕</button>
                </div>
                <div className="space-y-2">
                    {projects.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm text-white/70">No hay proyectos aún.</div>}
                    {projects.map((project) => (
                        <button key={project.id} onClick={() => onOpen(project as any)} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-left text-sm text-white/90">
                            <span>{project.name}</span>
                            <span className="text-[10px] uppercase tracking-[0.15em] text-white/55">{new Date(project.savedAt).toLocaleString()}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
