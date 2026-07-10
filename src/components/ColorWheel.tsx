import React, { useEffect, useMemo, useRef } from 'react';

interface ColorWheelProps {
    color: string;
    size: number;
    visible: boolean;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({ color, size, visible }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const hueWheel = useMemo(() => {
        const steps = 72;
        const colors: string[] = [];
        for (let i = 0; i < steps; i += 1) {
            const hue = (i / steps) * 360;
            colors.push(`hsl(${hue} 100% 50%)`);
        }
        return colors;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !visible) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 12;

        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        for (let i = 0; i < hueWheel.length; i += 1) {
            const hue = (i / hueWheel.length) * 360;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, (i / hueWheel.length) * Math.PI * 2 - Math.PI / 2, ((i + 1) / hueWheel.length) * Math.PI * 2 - Math.PI / 2);
            ctx.lineWidth = 26;
            ctx.strokeStyle = `hsl(${hue} 100% 50%)`;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(centerX, centerY, size / 2 + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 3;
        ctx.stroke();
    }, [color, hueWheel, size, visible]);

    if (!visible) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="rounded-full border border-white/20 bg-black/65 p-4 shadow-2xl backdrop-blur">
                <canvas ref={canvasRef} width={220} height={220} className="block rounded-full" />
            </div>
        </div>
    );
};
