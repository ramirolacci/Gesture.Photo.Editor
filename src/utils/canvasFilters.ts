/**
 * Filtros de imagen para canvas nativo HTML5.
 * Todas las funciones operan directamente sobre el contexto 2D del canvas.
 */

/**
 * Convierte la imagen a blanco y negro usando luminancia perceptual.
 */
export function applyGrayscale(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Luminancia perceptual ponderada
        const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = luminance;     // R
        data[i + 1] = luminance; // G
        data[i + 2] = luminance; // B
        // data[i + 3] = alpha (sin cambio)
    }

    ctx.putImageData(imageData, 0, 0);
}

/**
 * Invierte los colores de la imagen (negativo fotográfico).
 */
export function applyInvert(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];         // R
        data[i + 1] = 255 - data[i + 1]; // G
        data[i + 2] = 255 - data[i + 2]; // B
        // data[i + 3] = alpha (sin cambio)
    }

    ctx.putImageData(imageData, 0, 0);
}

/**
 * Aplica un blur gaussiano usando el truco de CSS filter + redraw.
 * @param radius - Radio del blur en píxeles (default 5)
 */
export function applyBlur(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    radius = 5
): void {
    // Guardamos la imagen actual como source
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.drawImage(canvas, 0, 0);

    // Aplicar blur via CSS filter al redibujarlo
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
}

/**
 * Ajusta el brillo de la imagen.
 * @param factor - Factor multiplicativo: >1 más brillo, <1 menos brillo (0.5 = 50% brillo)
 */
export function applyBrightness(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    factor: number
): void {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, data[i] * factor));         // R
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor)); // G
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor)); // B
    }

    ctx.putImageData(imageData, 0, 0);
}

/**
 * Ajusta el contraste de la imagen.
 * @param factor - Factor de contraste: 1 = sin cambio, >1 más contraste, <1 menos contraste
 */
export function applyContrast(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    factor: number
): void {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const intercept = 128 * (1 - factor);

    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, data[i] * factor + intercept));         // R
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + intercept)); // G
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + intercept)); // B
    }

    ctx.putImageData(imageData, 0, 0);
}
