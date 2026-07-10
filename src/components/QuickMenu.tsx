import React from 'react';

interface QuickMenuProps {
    visible: boolean;
    actions: Array<{ id: string; label: string; icon: string }>;
}

export const QuickMenu: React.FC<QuickMenuProps> = ({ visible, actions }) => {
    if (!visible) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className="pointer-events-auto rounded-3xl border border-white/20 bg-black/70 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Acciones rápidas</div>
                <div className="flex gap-2">
                    {actions.map((action) => (
                        <div key={action.id} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-center text-xs text-white/90">
                            <div className="text-base">{action.icon}</div>
                            <div>{action.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
