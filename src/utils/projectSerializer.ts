import { fabric } from 'fabric';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LayerJSON {
    id: string;
    name: string;
    type: 'drawing' | 'image' | 'text' | 'shape';
    visible: boolean;
    opacity: number;
    fabricJSON: any;
    /** Only present for drawing layers – base64 PNG of the hidden raster canvas */
    drawingDataURL?: string;
}

export interface ProjectJSON {
    version: '1.0';
    name: string;
    savedAt: string;
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
    layers: LayerJSON[];
    activeLayerId: string | null;
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize the current Fabric canvas + hidden drawing canvases into a plain JSON
 * structure that can be persisted to localStorage or downloaded as a .gpe file.
 */
export function serializeProject(
    canvas: fabric.Canvas,
    projectName = 'Mi Proyecto'
): ProjectJSON {
    const activeObj = canvas.getActiveObject();
    const activeLayerId = activeObj ? (activeObj as any).id ?? null : null;

    const layers: LayerJSON[] = canvas.getObjects().map((obj) => {
        const objAny = obj as any;

        const layerJSON: LayerJSON = {
            id: objAny.id ?? '',
            name: objAny.name ?? '',
            type: objAny.layerType ?? 'shape',
            visible: obj.visible !== false,
            opacity: obj.opacity ?? 1,
            fabricJSON: obj.toObject(['id', 'name', 'layerType']),
        };

        // Capture raster data for drawing layers
        if (objAny.layerType === 'drawing' && objAny.hiddenCanvas) {
            try {
                layerJSON.drawingDataURL = (objAny.hiddenCanvas as HTMLCanvasElement).toDataURL('image/png');
            } catch {
                // tainted canvas – skip
            }
        }

        return layerJSON;
    });

    return {
        version: '1.0',
        name: projectName,
        savedAt: new Date().toISOString(),
        canvasWidth: canvas.width ?? 800,
        canvasHeight: canvas.height ?? 600,
        backgroundColor: (canvas.backgroundColor as string) ?? '#ffffff',
        layers,
        activeLayerId,
    };
}

// ─── Deserialization ──────────────────────────────────────────────────────────

/**
 * Restore a canvas from a ProjectJSON object.
 * Returns the id of the layer that should be set active, or null.
 */
export async function deserializeProject(
    project: ProjectJSON,
    canvas: fabric.Canvas
): Promise<string | null> {
    // Clear existing content
    canvas.clear();
    canvas.setWidth(project.canvasWidth);
    canvas.setHeight(project.canvasHeight);
    canvas.setBackgroundColor(project.backgroundColor, () => {});

    for (const layer of project.layers) {
        await loadLayer(layer, canvas);
    }

    canvas.requestRenderAll();
    return project.activeLayerId;
}

async function loadLayer(layer: LayerJSON, canvas: fabric.Canvas): Promise<void> {
    if (layer.type === 'drawing') {
        await loadDrawingLayer(layer, canvas);
    } else {
        await loadFabricLayer(layer, canvas);
    }
}

function loadDrawingLayer(layer: LayerJSON, canvas: fabric.Canvas): Promise<void> {
    return new Promise((resolve) => {
        const w = canvas.width ?? 800;
        const h = canvas.height ?? 600;

        const hiddenCanvas = document.createElement('canvas');
        hiddenCanvas.width = w;
        hiddenCanvas.height = h;
        const hiddenCtx = hiddenCanvas.getContext('2d')!;

        const applyToFabric = () => {
            const img = new fabric.Image(hiddenCanvas, {
                left: layer.fabricJSON?.left ?? 0,
                top: layer.fabricJSON?.top ?? 0,
                scaleX: layer.fabricJSON?.scaleX ?? 1,
                scaleY: layer.fabricJSON?.scaleY ?? 1,
                angle: layer.fabricJSON?.angle ?? 0,
                opacity: layer.opacity,
                visible: layer.visible,
                selectable: true,
                hasControls: true,
            });

            const imgAny = img as any;
            imgAny.id = layer.id;
            imgAny.name = layer.name;
            imgAny.layerType = 'drawing';
            imgAny.hiddenCanvas = hiddenCanvas;
            imgAny.hiddenCtx = hiddenCtx;

            canvas.add(img);
            resolve();
        };

        if (layer.drawingDataURL) {
            const image = new Image();
            image.onload = () => {
                hiddenCtx.drawImage(image, 0, 0);
                applyToFabric();
            };
            image.onerror = applyToFabric;
            image.src = layer.drawingDataURL;
        } else {
            applyToFabric();
        }
    });
}

function loadFabricLayer(layer: LayerJSON, canvas: fabric.Canvas): Promise<void> {
    return new Promise((resolve) => {
        fabric.util.enlivenObjects(
            [layer.fabricJSON],
            (objects: fabric.Object[]) => {
                const obj = objects[0];
                if (!obj) { resolve(); return; }

                obj.set({
                    opacity: layer.opacity,
                    visible: layer.visible,
                    selectable: true,
                    hasControls: true,
                });

                const objAny = obj as any;
                objAny.id = layer.id;
                objAny.name = layer.name;
                objAny.layerType = layer.type;

                canvas.add(obj);
                resolve();
            },
            'fabric'
        );
    });
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateProjectJSON(data: unknown): data is ProjectJSON {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as any;
    return (
        d.version === '1.0' &&
        typeof d.name === 'string' &&
        typeof d.canvasWidth === 'number' &&
        typeof d.canvasHeight === 'number' &&
        Array.isArray(d.layers)
    );
}

// ─── Snapshot helpers (used by history) ──────────────────────────────────────

/**
 * Capture a lightweight snapshot of the canvas state.
 * For drawing layers we serialize the hiddenCanvas as a data URL.
 */
export function captureSnapshot(canvas: fabric.Canvas): string {
    const project = serializeProject(canvas, '_snapshot');
    return JSON.stringify(project);
}

/**
 * Restore a snapshot produced by captureSnapshot.
 */
export async function restoreSnapshot(
    snapshot: string,
    canvas: fabric.Canvas
): Promise<string | null> {
    try {
        const project = JSON.parse(snapshot) as ProjectJSON;
        return await deserializeProject(project, canvas);
    } catch (e) {
        console.error('Failed to restore snapshot', e);
        return null;
    }
}
