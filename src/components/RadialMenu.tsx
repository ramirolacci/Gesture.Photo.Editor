import React, { useEffect, useMemo, useRef, useState } from 'react';

interface RadialMenuProps {
    visible: boolean;
    onSelect: (tool: string) => void;
    onClose: () => void;
    cursorPosition?: { x: number; y: number } | null;
    isConfirming?: boolean;
}

const items = [
    { id: 'SELECT_BRUSH', icon: '🖌️', label: 'Pincel' },
    { id: 'SELECT_ERASER', icon: '🧹', label: 'Borrador' },
    { id: 'SELECT_MOVE', icon: '✋', label: 'Mover' },
    { id: 'SELECT_ZOOM', icon: '🔍', label: 'Zoom' },
];

export const RadialMenu: React.FC<RadialMenuProps> = ({ visible, onSelect, onClose, cursorPosition, isConfirming = false }) => {
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!visible || !cursorPosition || !menuRef.current) {
            setHoveredItem(null);
            return;
        }

        const rect = menuRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = cursorPosition.x - centerX;
        const dy = cursorPosition.y - centerY;
        const distance = Math.hypot(dx, dy);

        if (distance < 90) {
            const angle = Math.atan2(dy, dx);
            const normalized = (angle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
            const index = Math.round(normalized / ((Math.PI * 2) / items.length)) % items.length;
            setHoveredItem(items[index].id);
        } else {
            setHoveredItem(null);
        }
    }, [visible, cursorPosition]);

    useEffect(() => {
        if (!visible || !hoveredItem || !isConfirming) return;
        onSelect(hoveredItem);
    }, [visible, hoveredItem, isConfirming, onSelect]);

    const itemButtons = useMemo(() => items.map((item, index) => {
        const angle = (index / items.length) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * 72;
        const y = Math.sin(angle) * 72;
        const isActive = hoveredItem === item.id;

        return (
            <button
                key={item.id}
                type="button"
                className={`absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-lg text-white transition ${isActive ? 'scale-110 border-cyan-400 bg-cyan-500/70' : 'border-white/20 bg-white/10 hover:scale-110 hover:bg-white/20'}`}
                style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                title={item.label}
            >
                {item.icon}
            </button>
        );
    }), [hoveredItem]);

    if (!visible) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div ref={menuRef} className="pointer-events-auto relative h-56 w-56 rounded-full border border-white/20 bg-black/70 shadow-2xl backdrop-blur">
                <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-white/10 px-2 py-1 text-xs text-white/80">✕</button>
                {itemButtons}
            </div>
        </div>
    );
};
