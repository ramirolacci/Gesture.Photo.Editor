/**
 * Herramientas de formas geométricas para canvas nativo HTML5.
 * Cada función dibuja solo el contorno (stroke), sin relleno.
 */

export interface Point {
    x: number;
    y: number;
}

/**
 * Dibuja un rectángulo entre dos puntos.
 */
export function drawRect(
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    color: string,
    lineWidth: number
): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.restore();
}

/**
 * Dibuja una elipse/círculo entre dos puntos (el área delimitada por el bounding box).
 */
export function drawEllipse(
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    color: string,
    lineWidth: number
): void {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/**
 * Dibuja una línea recta entre dos puntos.
 */
export function drawLine(
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    color: string,
    lineWidth: number
): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
}

/**
 * Limpia completamente un canvas overlay (transparente).
 */
export function clearOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Dibuja la previsualización de una forma en el overlay canvas.
 * Usa un color semitransparente y trazo discontinuo para indicar que es un preview.
 */
export function drawShapePreview(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    tool: 'DRAW_RECT' | 'DRAW_CIRCLE' | 'DRAW_LINE',
    start: Point,
    end: Point,
    color: string,
    lineWidth: number
): void {
    clearOverlay(ctx, canvas);

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([8, 4]);

    if (tool === 'DRAW_RECT') {
        drawRect(ctx, start, end, color, lineWidth);
    } else if (tool === 'DRAW_CIRCLE') {
        drawEllipse(ctx, start, end, color, lineWidth);
    } else if (tool === 'DRAW_LINE') {
        drawLine(ctx, start, end, color, lineWidth);
    }

    ctx.restore();
}
