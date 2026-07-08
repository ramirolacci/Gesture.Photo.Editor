import { fabric } from 'fabric';
import JSZip from 'jszip';

export type ExportFormat = 'png' | 'jpg' | 'pdf' | 'layers-zip';

export interface ExportOptions {
    format: ExportFormat;
    jpgQuality?: number;   // 0.1 – 1.0, only for jpg
    scale?: number;        // pixel multiplier (default 1 = 800×600, 2 = 1600×1200, etc.)
}

// ─── PNG / JPG ────────────────────────────────────────────────────────────────

function getCanvasDataURL(
    canvas: fabric.Canvas,
    format: 'png' | 'jpg',
    quality: number,
    multiplier: number
): string {
    const active = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const dataURL = canvas.toDataURL({
        format: format === 'jpg' ? 'jpeg' : 'png',
        quality,
        multiplier,
    });

    if (active) {
        canvas.setActiveObject(active);
        canvas.requestRenderAll();
    }
    return dataURL;
}

function downloadDataURL(dataURL: string, filename: string) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    link.click();
}

// ─── PDF (via jsPDF) ──────────────────────────────────────────────────────────

async function exportAsPDF(
    canvas: fabric.Canvas,
    projectName: string,
    multiplier: number
): Promise<void> {
    // Dynamic import to avoid bundling issues with jspdf
    const { jsPDF } = await import('jspdf');

    const w = (canvas.width ?? 800) * multiplier;
    const h = (canvas.height ?? 600) * multiplier;

    // Landscape if wider than tall
    const orientation = w >= h ? 'l' : 'p';
    const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [w, h],
        compress: true,
    });

    const dataURL = getCanvasDataURL(canvas, 'png', 1, multiplier);
    pdf.addImage(dataURL, 'PNG', 0, 0, w, h);
    pdf.save(`${projectName}.pdf`);
}

// ─── Layers ZIP ───────────────────────────────────────────────────────────────

async function exportLayersAsZip(
    canvas: fabric.Canvas,
    projectName: string,
    multiplier: number
): Promise<void> {
    const zip = new JSZip();
    const folder = zip.folder(projectName) ?? zip;

    const objects = canvas.getObjects();

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const objAny = obj as any;
        const layerName = objAny.name ?? `layer_${i + 1}`;
        const sanitized = layerName.replace(/[^a-zA-Z0-9_-]/g, '_');

        // Create a temporary single-layer canvas
        const tempEl = document.createElement('canvas');
        const w = (canvas.width ?? 800) * multiplier;
        const h = (canvas.height ?? 600) * multiplier;
        tempEl.width = w;
        tempEl.height = h;
        const tempFabric = new fabric.StaticCanvas(tempEl, {
            width: w,
            height: h,
            backgroundColor: 'transparent',
        });

        // Clone the object
        await new Promise<void>((resolve) => {
            obj.clone((cloned: fabric.Object) => {
                cloned.set({
                    left: (cloned.left ?? 0) * multiplier,
                    top: (cloned.top ?? 0) * multiplier,
                    scaleX: (cloned.scaleX ?? 1) * multiplier,
                    scaleY: (cloned.scaleY ?? 1) * multiplier,
                });
                tempFabric.add(cloned);
                tempFabric.renderAll();

                const dataURL = tempFabric.toDataURL({ format: 'png', quality: 1 });
                const base64 = dataURL.split(',')[1];
                folder.file(`${String(i + 1).padStart(2, '0')}_${sanitized}.png`, base64, { base64: true });
                tempFabric.dispose();
                resolve();
            });
        });
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    downloadDataURL(url, `${projectName}_layers.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Main Export Function ─────────────────────────────────────────────────────

export async function exportCanvas(
    canvas: fabric.Canvas,
    opts: ExportOptions,
    projectName = 'proyecto'
): Promise<void> {
    const multiplier = opts.scale ?? 1;

    switch (opts.format) {
        case 'png': {
            const url = getCanvasDataURL(canvas, 'png', 1, multiplier);
            downloadDataURL(url, `${projectName}.png`);
            break;
        }
        case 'jpg': {
            const quality = opts.jpgQuality ?? 0.92;
            const url = getCanvasDataURL(canvas, 'jpg', quality, multiplier);
            downloadDataURL(url, `${projectName}.jpg`);
            break;
        }
        case 'pdf':
            await exportAsPDF(canvas, projectName, multiplier);
            break;
        case 'layers-zip':
            await exportLayersAsZip(canvas, projectName, multiplier);
            break;
    }
}
